// @ts-nocheck
/**
 * T28 ——「这次 run 碰过哪些文件」两套口径合一。
 *
 * ★ 现场证据（P0 收工时记在 docs/ui/ui-optimization-plan-20260922.md 第七节）：
 * 同一个 run，T8「变更」分区显示 25、T7「改动」面板显示 12，而两处的文案都是
 * 「改文件 N 个」/「变更 N」——界面在说谎。
 *
 * 读码复核后，两侧真实差异**有四条**（不是转述里的一条）：
 *   ① 失败的调用：服务端 `collectTouchedPaths` 收，客户端 `deriveTouchedFiles` 不收；
 *   ② 还没回结果的调用（在飞 / 等批准 / 被拒）：服务端收，客户端不收；
 *   ③ verifier 段：服务端收（它压根不看 source），客户端不收（verifier 事件
 *      被 `reduceEvent` 分流进 `verifierTimeline`，而派生只读 `timeline`）；
 *   ④ 路径形态：客户端 `input.path ?? input.file_path` 且把 `\` 折成 `/`，
 *      服务端只认 `input.path` 且按原文分组——于是 Windows 上
 *      `src\a.txt` 与 `src/a.txt` 在服务端是两条、客户端是一条，
 *      而响应里的 `path` 字段又被 `relative()` 归一，两条重复行同名。
 *
 * **事实源 = 客户端那一侧（成功才算碰过）**，理由写在 `collectTouchedPaths`
 * 的文档注释里：失败的写入没有改变磁盘；且仓库里同族的三个派生函数
 * （`deriveArtifacts` / `deriveWrittenPaths` / `editHunksFromTimeline`）本来
 * 就都是这个口径，服务端是唯一的异类。想看"试过但失败了"是另一个概念，
 * 由 Tools 面的 errors 负责，不许再叫"改了 N 个文件"。
 *
 * 本文件的锁**跨两侧**：同一份事件流，喂给服务端纯函数与客户端 reducer，
 * 两条路径必须给出同一个清单（末尾另有一条走真实 HTTP 端点的行为锁——
 * 纯函数对齐不等于那条链对齐）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUiServer, collectTouchedPaths, type UiServerHandle } from "../ui/server.js";
import { createInitialState, reduceEvents, deriveTouchedFiles } from "../ui/public/app.js";
import { FakeModelClient } from "./helpers.js";

// ---------------------------------------------------------------
// 夹具：一份事件流，四条差异轴全部踩到
// ---------------------------------------------------------------

/** pushEvent 的落盘形状 */
interface Envelope {
  seq: number;
  source: string;
  ts?: number;
  event: Record<string, unknown>;
}

function call(seq, name, input, source = "main") {
  return { seq, source, ts: 1_000 + seq, event: { type: "tool_call", toolUseId: `tu_${seq}`, name, input } };
}

function result(seq, isError, source = "main") {
  return {
    seq: seq + 1,
    source,
    ts: 1_000 + seq,
    event: {
      type: "tool_result",
      toolUseId: `tu_${seq}`,
      result: { content: isError ? "boom" : "ok", isError },
      durationMs: 3,
    },
  };
}

/**
 * 四条差异轴的流：
 *   · a.txt      成功写 + 成功改（两次）→ 两侧都该收，count/edits = 2
 *   · boom.txt   写了但失败          → 两侧都不该收（轴 ①）
 *   · pending.txt 写了但没有回执      → 两侧都不该收（轴 ②）
 *   · vonly.txt  verifier 段成功写   → 两侧都不该收（轴 ③）
 *   · src/b.txt  一次反斜杠 + 一次 file_path → 两侧都该并成一条，count = 2（轴 ④）
 *   · read_file / bash / memory_write → 一律不是"工作目录变更"
 */
function mixedStream() {
  return [
    call(0, "write_file", { path: "a.txt", content: "v1" }),
    result(0, false),
    call(2, "read_file", { path: "a.txt" }),
    result(2, false),
    call(4, "edit_file", { path: "a.txt", old_string: "v1", new_string: "v2" }),
    result(4, false),
    call(6, "write_file", { path: "boom.txt", content: "x" }),
    result(6, true), // ① 失败
    call(8, "write_file", { path: "pending.txt", content: "x" }), // ② 无回执
    call(9, "write_file", { path: "vonly.txt", content: "x" }, "verifier"),
    result(9, false, "verifier"), // ③ verifier 段
    call(11, "write_file", { path: "src\\b.txt", content: "x" }), // ④ 反斜杠
    result(11, false),
    call(13, "edit_file", { file_path: "src/b.txt" }), // ④ file_path 别名
    result(13, false),
    call(15, "bash", { command: "echo hi > sneaky.txt" }),
    result(15, false),
    call(17, "memory_write", { name: "note.md", content: "x" }),
    result(17, false),
  ];
}

/** 客户端那条链：SSE 包络 → reducer → 派生。用真实入口 reduceEvents，不手摆 timeline。 */
function clientSide(stream) {
  const state = reduceEvents(createInitialState("r1", "任务", false), stream);
  return deriveTouchedFiles(state).map((f) => ({ path: f.path, edits: f.edits }));
}

/** 服务端那条链：同一份包络 → collectTouchedPaths。 */
function serverSide(stream) {
  return collectTouchedPaths(stream).map((g) => ({ path: g.input, edits: g.count }));
}

const byPath = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));

// ---------------------------------------------------------------
// 跨两侧一致性锁
// ---------------------------------------------------------------

describe("T28 两侧「碰过的文件」同源", () => {
  it("★ 同一份事件流：服务端与客户端给出逐字段相同的清单", () => {
    const stream = mixedStream();
    expect(byPath(serverSide(stream))).toEqual(byPath(clientSide(stream)));
  });

  it("★ 而且这份清单就是「成功才算」那一份——不是两边一起错", () => {
    const stream = mixedStream();
    expect(byPath(clientSide(stream))).toEqual([
      { path: "a.txt", edits: 2 },
      { path: "src/b.txt", edits: 2 },
    ]);
  });

  it("轴 ①：失败的写入两侧都不收（曾是 25 vs 12 的主因）", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "ok.txt", content: "x" }),
      result(0, false),
      call(2, "write_file", { path: "boom.txt", content: "x" }),
      result(2, true),
    ];
    expect(serverSide(stream).map((r) => r.path)).toEqual(["ok.txt"]);
    expect(clientSide(stream).map((r) => r.path)).toEqual(["ok.txt"]);
  });

  it("轴 ②：还没回结果的调用两侧都不收（在飞 / 等批准 / 被拒）", () => {
    const stream: Envelope[] = [call(0, "write_file", { path: "pending.txt", content: "x" })];
    expect(serverSide(stream)).toEqual([]);
    expect(clientSide(stream)).toEqual([]);
  });

  it("轴 ③：verifier 段的写入两侧都不收（含编排来源 s1/verifier）", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "v.txt", content: "x" }, "verifier"),
      result(0, false, "verifier"),
      call(2, "write_file", { path: "v2.txt", content: "x" }, "s1/verifier"),
      result(2, false, "s1/verifier"),
      call(4, "write_file", { path: "m.txt", content: "x" }),
      result(4, false),
    ];
    expect(serverSide(stream).map((r) => r.path)).toEqual(["m.txt"]);
    expect(clientSide(stream).map((r) => r.path)).toEqual(["m.txt"]);
  });

  /**
   * ★ 变异验证逼出来的两条：服务端的"跳过 verifier"有**两个**落点——
   * 收结果那一遍（别让 verifier 的回执给别人盖章）与收调用那一遍
   * （verifier 自己的写入不算）。只测"verifier 调用 + verifier 回执"时
   * 两个落点互相兜底，任删一个都照样绿。下面两条把它们分开钉住：
   * 判据就是客户端 reducer 的分流规则——call 与 result **各按自己的
   * source 归段**，所以跨段的那一半在客户端必然配不上对。
   */
  it("轴 ③a：main 的调用配上 verifier 的回执 → 两侧都当没回执（收结果那一遍必须按段过滤）", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "x.txt", content: "x" }, "main"),
      result(0, false, "verifier"),
    ];
    expect(serverSide(stream)).toEqual([]);
    expect(clientSide(stream)).toEqual([]);
  });

  it("轴 ③b：verifier 的调用配上 main 的回执 → 两侧都不收（收调用那一遍必须按段过滤）", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "y.txt", content: "x" }, "verifier"),
      result(0, false, "main"),
    ];
    expect(serverSide(stream)).toEqual([]);
    expect(clientSide(stream)).toEqual([]);
  });

  it("轴 ④：反斜杠与 file_path 别名两侧都归一成同一条", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "src\\b.txt", content: "x" }),
      result(0, false),
      call(2, "edit_file", { file_path: "src/b.txt" }),
      result(2, false),
    ];
    expect(serverSide(stream)).toEqual([{ path: "src/b.txt", edits: 2 }]);
    expect(clientSide(stream)).toEqual([{ path: "src/b.txt", edits: 2 }]);
  });

  it("rework 段与并行子任务段照旧算进来——收窄的只有 verifier", () => {
    const stream: Envelope[] = [
      call(0, "write_file", { path: "r.txt", content: "x" }, "rework"),
      result(0, false, "rework"),
      call(2, "write_file", { path: "s.txt", content: "x" }, "s1/main"),
      result(2, false, "s1/main"),
      call(4, "write_file", { path: "p.txt", content: "x" }, "planner"),
      result(4, false, "planner"),
    ];
    expect(byPath(serverSide(stream)).map((r) => r.path)).toEqual(["p.txt", "r.txt", "s.txt"]);
    expect(byPath(clientSide(stream)).map((r) => r.path)).toEqual(["p.txt", "r.txt", "s.txt"]);
  });

  it("空流两侧都空（别拿兜底把空态喂绿）", () => {
    expect(serverSide([])).toEqual([]);
    expect(clientSide([])).toEqual([]);
  });
});

// ---------------------------------------------------------------
// 第二条差异轴：范围（一个 run vs 整场对话）——靠命名区分，不靠用户猜
// ---------------------------------------------------------------

/**
 * 现场读码时撞到的第二条轴：T14 把对话卡与右栏「改动」面板都改成了
 * **整条谱系**（`deriveThreadTouchedFiles`），而 T8 那个分区读的是
 * `/api/runs/:id/changes`，永远只是**选中那一个 run**。有追问的对话里
 * 两个数字本就该不同——所以它们不许都叫"改了 N 个文件"。
 *
 * 这条锁盯的是命名，不是数字：分区标签必须自带范围词。
 */
describe("T28 范围命名不含糊", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const panelSrc = readFileSync(join(here, "..", "ui", "public", "features", "changes-panel.js"), "utf8");
  const appSrc = readFileSync(join(here, "..", "ui", "public", "app.js"), "utf8");
  const serverSrc = readFileSync(join(here, "..", "ui", "server.ts"), "utf8");

  it("★ 一个 run 的那个分区标签自带范围词「本轮」，不再是光秃秃的「变更」", () => {
    expect(panelSrc).toMatch(/summaryText\.textContent\s*=\s*"\s*本轮变更\s*"/);
    expect(panelSrc, "分区标题要说清本轮 + 只算成功的").toMatch(
      /summary\.title\s*=\s*"本轮运行成功写入或修改过的文件。[^"]*不算。"/,
    );
  });

  it("整场对话那两处（卡 + 右栏面板）仍是同一句「改文件 N 个」，彼此不打架", () => {
    const heads = appSrc.match(/改文件 \$\{[^}]+\} 个/g) ?? [];
    expect(heads.length, "卡与右栏面板各一处").toBe(2);
  });

  it("服务端那份聚合把「成功才算 / 不收 verifier」写成事实源，不留第二种读法", () => {
    expect(serverSrc).toMatch(/只收成功的调用/);
    expect(serverSrc).toMatch(/不收 verifier 段/);
  });
});

// ---------------------------------------------------------------
// 走真实 HTTP 端点的行为锁
// ---------------------------------------------------------------

/**
 * 纯函数对齐 ≠ 那条链对齐：T8 面板上那个数字来自 `/api/runs/:id/changes`
 * 响应的 `changes.length`，中间还隔着归档读取、圈禁解析、stat 与 git 探针。
 * 这条锁把整条链走一遍，跟客户端派生的条数对比。
 */
describe("T28 端点条数 = 客户端派生条数", () => {
  let handle: UiServerHandle | undefined;
  let baseDir: string;
  let workdir: string;
  let historyRoot: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "ui-touched-parity-"));
    workdir = join(baseDir, "proj");
    historyRoot = join(baseDir, "history");
    await mkdir(workdir, { recursive: true });
  });

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    await rm(baseDir, { recursive: true, force: true });
  });

  it("★ 同一份档案：端点给的条数与客户端派生的条数相同（失败/在飞/verifier 都不算）", async () => {
    const stream = mixedStream();
    const dir = join(historyRoot, "run-parity");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "meta.json"),
      JSON.stringify({
        version: 1,
        runId: "run-parity",
        task: "写文件任务",
        status: "done",
        verify: false,
        createdAt: 1_000,
        finishedAt: 2_000,
        packName: null,
        mode: "single",
        effort: null,
        rubric: null,
        workdir,
        conversationTurn: 1,
        planGate: false,
        planDecision: null,
        mainStopReason: "completed",
        outcome: null,
      }),
      "utf8",
    );
    await writeFile(
      join(dir, "events.jsonl"),
      `${stream.map((e) => JSON.stringify(e)).join("\n")}\n`,
      "utf8",
    );
    await writeFile(join(workdir, "a.txt"), "v2\n", "utf8");
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(join(workdir, "src", "b.txt"), "x\n", "utf8");

    handle = createUiServer({
      modelClient: new FakeModelClient([]),
      tools: [],
      workdir,
      history: historyRoot,
      historyKeep: 10_000,
    });
    const port = await new Promise<number>((resolve, reject) => {
      handle!.server.listen(0, () => {
        const address = handle!.server.address();
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
      handle!.server.on("error", reject);
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/runs/run-parity/changes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: { path: string; count: number }[] };
    const client = clientSide(stream);

    expect(body.changes).toHaveLength(client.length);
    expect(body.changes.map((c) => c.path).sort()).toEqual(client.map((f) => f.path).sort());
    // 逐路径的次数也要对得上——条数相同而次数不同同样是"两个数字"
    const serverCounts = new Map(body.changes.map((c) => [c.path, c.count]));
    for (const f of client) expect(serverCounts.get(f.path)).toBe(f.edits);
  });
});
