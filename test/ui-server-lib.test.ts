/**
 * ui/server/lib/* 的直接单测。
 *
 * 这些函数原是 server.ts 的模块级私有件，只能经 HTTP 间接测到，几条降级 / 拒绝
 * 分支从没被走过。拆分阶段 1 把它们迁成独立模块后可以直接喂输入——这里补的
 * 正是那些分支：错误输入怎么拒、外部失败怎么降级、代理头怎么认。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotateApprovalReplay } from "../ui/server/lib/approval.js";
import { archivedApprovalGrantFromUnknown, checkpointFromUnknown } from "../ui/server/lib/archive-parse.js";
import { stricterLimit } from "../ui/server/lib/budget.js";
import {
  applyCors,
  cookieValue,
  firstForwarded,
  operationalLog,
  readBody,
  RequestBodyTooLargeError,
  requestAccessToken,
  requestBodyFailure,
  requestHostname,
  safeDecode,
  sameOriginOf,
} from "../ui/server/lib/http.js";
import { parseGitPorcelainStatus, probeGitForFile } from "../ui/server/lib/run-changes.js";
import { searchRunHistory, transcriptLineSearchText } from "../ui/server/lib/search.js";
import { decodeSitePreviewPath, siteContentTypeOf } from "../ui/server/lib/site-preview.js";
import { findUniqueWorkdirFile, revealCommand } from "../ui/server/lib/workdir-files.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** 只带 headers / socket 的请求替身；readBody 用的要能流，另造 */
function fakeReq(headers: Record<string, string | string[] | undefined>, encrypted = false): IncomingMessage {
  return { headers, socket: { encrypted } } as unknown as IncomingMessage;
}

/** 记下 setHeader / writeHead / end 的应答替身 */
function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    status: 0,
    body: "",
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    writeHead(status: number, h: Record<string, string>) {
      res.status = status;
      Object.assign(headers, h);
    },
    end(body: string) {
      res.body = body;
    },
  };
  return res;
}

describe("http：代理头与来源", () => {
  it("firstForwarded 取逗号列表的第一跳，数组取首项，空串当没有", () => {
    expect(firstForwarded("a.example, b.example")).toBe("a.example");
    expect(firstForwarded(["c.example", "d.example"])).toBe("c.example");
    expect(firstForwarded(" ")).toBeUndefined();
    expect(firstForwarded(undefined)).toBeUndefined();
  });

  it("trustProxy 时 Host 认 X-Forwarded-Host，缺了回落到 Host；不信代理时忽略它", () => {
    const req = fakeReq({ host: "inner:4173", "x-forwarded-host": "Public.Example, hop" });
    expect(requestHostname(req, true)).toBe("public.example");
    expect(requestHostname(req, false)).toBe("inner");
    expect(requestHostname(fakeReq({ host: "inner:4173" }), true)).toBe("inner");
  });

  it("Host 头解析不出主机名 → null（不抛）", () => {
    expect(requestHostname(fakeReq({ host: "bad host" }))).toBeNull();
    expect(requestHostname(fakeReq({}))).toBeNull();
  });

  it("sameOriginOf：trustProxy 时认 X-Forwarded-Proto（只认 http/https），否则看 socket 是否加密", () => {
    expect(sameOriginOf(fakeReq({ host: "h", "x-forwarded-proto": "https" }), true)).toBe("https://h");
    expect(sameOriginOf(fakeReq({ host: "h", "x-forwarded-proto": "gopher" }), true)).toBe("http://h");
    expect(sameOriginOf(fakeReq({ host: "h", "x-forwarded-proto": "https" }), false)).toBe("http://h");
    expect(sameOriginOf(fakeReq({ host: "h" }, true))).toBe("https://h");
  });

  it("applyCors：通配给 *；白名单内的跨源回显 Origin 并带 Vary；同源不回显", () => {
    const wildcard = fakeRes();
    applyCors(fakeReq({ host: "h", origin: "https://x.example" }), wildcard as unknown as ServerResponse, ["*"]);
    expect(wildcard.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(wildcard.headers["Access-Control-Allow-Headers"]).toContain("X-Agent-Token");

    const listed = fakeRes();
    applyCors(
      fakeReq({ host: "h", origin: "https://x.example" }),
      listed as unknown as ServerResponse,
      ["https://x.example"],
    );
    expect(listed.headers["Access-Control-Allow-Origin"]).toBe("https://x.example");
    expect(listed.headers.Vary).toBe("Origin");

    const same = fakeRes();
    applyCors(fakeReq({ host: "h", origin: "http://h" }), same as unknown as ServerResponse, ["https://x.example"]);
    expect(same.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(same.headers["Access-Control-Allow-Methods"]).toBe("GET,POST,OPTIONS");

    const denied = fakeRes();
    applyCors(fakeReq({ host: "h", origin: "https://evil.example" }), denied as unknown as ServerResponse, []);
    expect(denied.headers).toEqual({});
  });
});

describe("http：请求体与令牌", () => {
  function streamReq(headers: Record<string, string> = {}) {
    return Object.assign(new PassThrough(), { headers }) as unknown as IncomingMessage & PassThrough;
  }

  it("没有 Content-Length 时，边读边数，越过上限立刻 413 类错误", async () => {
    const req = streamReq();
    const pending = readBody(req, 4);
    req.write("abc");
    req.write("de");
    await expect(pending).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    req.end("more"); // 已经判定过的请求后续数据被忽略，不二次 settle
  });

  it("流出错 → 原样 reject；之后的 end 不再改结果", async () => {
    const req = streamReq();
    const pending = readBody(req, 1024);
    req.emit("error", new Error("socket reset"));
    req.emit("end");
    await expect(pending).rejects.toThrow("socket reset");
  });

  it("requestBodyFailure：超限给 413，其余读失败给 400", () => {
    const tooLarge = fakeRes();
    requestBodyFailure(tooLarge as unknown as ServerResponse, new RequestBodyTooLargeError("too big"));
    expect(tooLarge.status).toBe(413);
    const other = fakeRes();
    requestBodyFailure(other as unknown as ServerResponse, new Error("boom"));
    expect(other.status).toBe(400);
  });

  it("cookieValue：畸形编码当没有，不抛；不在场返回 undefined", () => {
    expect(cookieValue(fakeReq({ cookie: "a=1; agent_ui_access=%E0%A4%A" }), "agent_ui_access")).toBeUndefined();
    expect(cookieValue(fakeReq({ cookie: "a=1; b=2" }), "agent_ui_access")).toBeUndefined();
    expect(cookieValue(fakeReq({ cookie: "a=1; agent_ui_access=t%3D1" }), "agent_ui_access")).toBe("t=1");
  });

  it("requestAccessToken 优先级：Bearer > X-Agent-Token > cookie", () => {
    expect(requestAccessToken(fakeReq({ authorization: "Bearer b", "x-agent-token": "x" }))).toBe("b");
    expect(requestAccessToken(fakeReq({ "x-agent-token": "x", cookie: "agent_ui_access=c" }))).toBe("x");
    expect(requestAccessToken(fakeReq({ cookie: "agent_ui_access=c" }))).toBe("c");
  });

  it("safeDecode：畸形百分号编码原样返回而不是让请求炸掉", () => {
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
    expect(safeDecode("a%20b")).toBe("a b");
  });

  it("operationalLog 按级别分流，info 走 stdout，一行一条 JSON", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    operationalLog("info", "started", { port: 1 });
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ level: "info", event: "started", port: 1 });
  });
});

describe("approval：重放标注", () => {
  const request = (seq: number, toolUseId: string) => ({
    seq,
    event: { type: "approval_request", toolUseId } as Record<string, unknown>,
  });

  it("resolved 没带 requestSeq 时按工具认领：同一工具只有一条才认", () => {
    const out = annotateApprovalReplay([
      request(1, "tu_a"),
      { seq: 2, event: { type: "approval_resolved", toolUseId: "tu_a", decision: "deny", actor: "user" } },
    ]);
    expect(out[0]!.event).toMatchObject({ autoResolved: true, decision: "deny", actor: "user" });
  });

  it("同一工具有两条无 requestSeq 的结论 → 不猜，原样放出", () => {
    const events = [
      request(1, "tu_a"),
      { seq: 2, event: { type: "approval_resolved", toolUseId: "tu_a", decision: "allow" } },
      { seq: 3, event: { type: "approval_expired", toolUseId: "tu_a" } },
    ];
    expect(annotateApprovalReplay(events)[0]).toEqual(events[0]);
  });
});

describe("archive-parse：磁盘上的手改 / 坏档案", () => {
  it("授权形状不对（版本、范围、计数）一律拒绝，不半信", () => {
    expect(archivedApprovalGrantFromUnknown({ version: 2 })).toBeUndefined();
    expect(archivedApprovalGrantFromUnknown({ version: 1, scope: "global" })).toBeUndefined();
  });

  it("检查点：预算字段越界（turn 从 0 起、上限为 0）→ 拒绝恢复", () => {
    const base = {
      segmentIndex: 0,
      conversationTurn: 1,
      contextInputTokens: 0,
      runBudget: { usedTurns: 0, usedTokens: 0 },
    };
    expect(checkpointFromUnknown(base)).toBeDefined();
    expect(checkpointFromUnknown({ ...base, conversationTurn: 0 })).toBeUndefined();
    expect(checkpointFromUnknown({ ...base, runBudget: { usedTurns: 0, usedTokens: 0, maxTurns: 0 } })).toBeUndefined();
  });
});

describe("budget", () => {
  it("stricterLimit 两边都有时取更严的那个", () => {
    expect(stricterLimit(10, 3)).toBe(3);
    expect(stricterLimit(undefined, 3)).toBe(3);
    expect(stricterLimit(10, undefined)).toBe(10);
  });
});

describe("run-changes：git 探针降级", () => {
  it("porcelain 认不出的状态码（如重命名 R）原样取首字符", () => {
    expect(parseGitPorcelainStatus("R  old -> new")).toBe("R");
    expect(parseGitPorcelainStatus(" R x")).toBe("R");
  });

  it("不是 git 仓库 → null，视图照样能开", async () => {
    const dir = tempDir("probe-nogit-");
    writeFileSync(join(dir, "a.txt"), "x");
    // 防止 tmpdir 恰好落在某个仓库里：显式把 git 的仓库发现截在这层之上
    vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
    expect(await probeGitForFile(dir, "a.txt")).toBeNull();
  });

  it("真仓库里的修改文件 → M 与增删行数", async () => {
    const dir = tempDir("probe-git-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(dir, "a.txt"), "one\n");
    git("add", ".");
    git("commit", "-qm", "base");
    writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
    expect(await probeGitForFile(dir, "a.txt")).toEqual({ status: "M", added: 1, deleted: 0 });
  });
});

describe("search：transcript 解析与历史扫描", () => {
  it("半行（追加中断）与非对象段 → 空串；thinking 块也算正文", () => {
    expect(transcriptLineSearchText('{"index":0,"messages":[{"role":"user","con')).toBe("");
    expect(transcriptLineSearchText("42")).toBe("");
    expect(transcriptLineSearchText("null")).toBe("");
    expect(
      transcriptLineSearchText(JSON.stringify({ messages: [{ role: "assistant", content: [{ thinking: "想一想" }] }] })),
    ).toBe("想一想");
  });

  it("坏 meta 的目录跳过；updatedAt 回落 createdAt，再回落 0", async () => {
    const root = tempDir("search-root-");
    const run = (name: string, meta: unknown) => {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "meta.json"), typeof meta === "string" ? meta : JSON.stringify(meta));
    };
    run("broken", "{not json");
    run("created", { version: 1, runId: "r-created", task: "needle a", createdAt: 5 });
    run("bare", { version: 1, runId: "r-bare", task: "needle b" });
    const out = await searchRunHistory(root, "needle", 10);
    expect(out.results.map((r) => [r.runId, r.updatedAt])).toEqual([
      ["r-created", 5],
      ["r-bare", 0],
    ]);
  });
});

describe("site-preview", () => {
  it("source map 给 JSON；认不出的扩展名回落到单文件预览的口径", () => {
    expect(siteContentTypeOf("app.js.map")).toBe("application/json; charset=utf-8");
    expect(siteContentTypeOf("main.ts")).toBe("text/plain; charset=utf-8");
    expect(siteContentTypeOf("blob.bin")).toBe("application/octet-stream");
  });

  it("畸形百分号编码 → 明确报错，不当成合法路径", () => {
    expect(() => decodeSitePreviewPath("a/%E0%A4%A")).toThrow("not valid URI encoding");
  });
});

describe("workdir-files", () => {
  it("Windows 上打开目录不带 /select（那是选中文件用的）", () => {
    const desc = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      expect(revealCommand("C:\\w\\dir", "directory")).toEqual({ file: "explorer.exe", args: ["C:\\w\\dir"] });
    } finally {
      Object.defineProperty(process, "platform", desc);
    }
  });

  it("根目录读不了 → null（不抛）", async () => {
    expect(await findUniqueWorkdirFile(join(tmpdir(), "no-such-root-for-find-unique"), "a.ts")).toBeNull();
  });
});
