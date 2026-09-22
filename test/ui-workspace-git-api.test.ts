/**
 * /api/workspace/git 契约：白名单 workdir、不回传 remote URL、切分支仅 loopback。
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createUiServer, type UiServerHandle } from "../ui/server.js";
import { resetObservabilityMetrics } from "../src/metrics.js";
import { clearCapabilityCache } from "../src/model-capability.js";
import { FakeModelClient, fakeMessage, makeTool, textBlock } from "./helpers.js";

const execFileAsync = promisify(execFile);

let handle: UiServerHandle | undefined;
let temps: string[] = [];

afterEach(async () => {
  await handle?.close();
  handle = undefined;
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
  temps = [];
  resetObservabilityMetrics();
  clearCapabilityCache();
});

async function gitRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ws-git-api-"));
  temps.push(dir);
  await execFileAsync("git", ["-c", "init.defaultBranch=main", "init"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "t@t.test"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "t"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "hi\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: dir });
  await execFileAsync("git", ["branch", "feature"], { cwd: dir });
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "https://user:ghp_secret@github.com/acme/app.git"],
    { cwd: dir },
  );
  return resolve(dir);
}

/** 仓库 + src/app.js（已提交 42，工作区改成 43 的未提交 M）。 */
async function repoWithSrc(): Promise<{ repo: string; src: string }> {
  const repo = await gitRepo();
  await mkdir(join(repo, "src"));
  await writeFile(join(repo, "src", "app.js"), "const answer = 42;\n");
  await execFileAsync("git", ["add", "src/app.js"], { cwd: repo });
  await execFileAsync("git", ["commit", "-m", "add src/app.js"], { cwd: repo });
  await writeFile(join(repo, "src", "app.js"), "const answer = 43;\n");
  return { repo, src: resolve(join(repo, "src")) };
}

async function startHost(workdir: string): Promise<string> {
  handle = createUiServer({
    modelClient: new FakeModelClient([fakeMessage([textBlock("ok")], "end_turn")]),
    tools: [makeTool({ name: "noop", permission: "auto", parallelSafe: true })],
    workdir,
  });
  const port = await new Promise<number>((ok, fail) => {
    handle!.server.listen(0, () => {
      const addr = handle!.server.address();
      if (addr && typeof addr === "object") ok(addr.port);
      else fail(new Error("no address"));
    });
  });
  return `http://127.0.0.1:${port}`;
}

async function rawRequest(
  base: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  payload: string | null = null,
): Promise<{ status: number; body: any }> {
  const { request } = await import("node:http");
  return new Promise((resolvePromise, reject) => {
    const req = request(`${base}${path}`, {
      method,
      headers: payload
        ? { ...headers, "Content-Length": String(Buffer.byteLength(payload)) }
        : headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* 非 JSON */ }
        resolvePromise({ status: res.statusCode ?? 0, body });
      });
    });
    req.on("error", reject);
    req.end(payload ?? undefined);
  });
}

describe("/api/workspace/git", () => {
  it("缺 workdir → 400；不在白名单 → 403；非仓库 → present:false", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ws-git-empty-"));
    temps.push(empty);
    const base = await startHost(resolve(empty));
    expect((await fetch(`${base}/api/workspace/git`)).status).toBe(400);
    expect((await fetch(`${base}/api/workspace/git?workdir=${encodeURIComponent(resolve(tmpdir()))}`)).status)
      .toBe(403);
    const body = await (await fetch(`${base}/api/workspace/git?workdir=${encodeURIComponent(resolve(empty))}`)).json();
    expect(body).toEqual({ present: false });
  });

  it("读出分支与 GitHub 身份，正文不含 token", async () => {
    const repo = await gitRepo();
    const base = await startHost(repo);
    const body = await (await fetch(`${base}/api/workspace/git?workdir=${encodeURIComponent(repo)}`)).json() as any;
    expect(body.present).toBe(true);
    expect(body.branch).toBe("main");
    expect(body.github).toEqual({ owner: "acme", repo: "app" });
    expect(body.branches).toEqual(expect.arrayContaining(["main", "feature"]));
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
    expect(JSON.stringify(body)).not.toContain("user:");
  });

  it("loopback 可切到本地分支；未知分支 400", async () => {
    const repo = await gitRepo();
    const base = await startHost(repo);
    const bad = await fetch(`${base}/api/workspace/git/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdir: repo, branch: "no-such" }),
    });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/api/workspace/git/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdir: repo, branch: "feature" }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json() as any;
    expect(body.branch).toBe("feature");
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
  });

  it("脏工作区 409 dirty_worktree；stash 后可切", async () => {
    const repo = await gitRepo();
    await writeFile(join(repo, "README.md"), "dirty\n");
    const base = await startHost(repo);
    const blocked = await fetch(`${base}/api/workspace/git/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdir: repo, branch: "feature" }),
    });
    expect(blocked.status).toBe(409);
    const blockedBody = await blocked.json() as any;
    expect(blockedBody.code).toBe("dirty_worktree");
    expect(blockedBody.dirty).toBe(true);
    const ok = await fetch(`${base}/api/workspace/git/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdir: repo, branch: "feature", dirtyAction: "stash" }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json() as any;
    expect(body.branch).toBe("feature");
    expect(body.dirty).toBe(false);
  });

  it("非 loopback Host 切分支 403", async () => {
    const repo = await gitRepo();
    handle = createUiServer({
      modelClient: new FakeModelClient([fakeMessage([textBlock("ok")], "end_turn")]),
      tools: [makeTool({ name: "noop", permission: "auto", parallelSafe: true })],
      workdir: repo,
      allowedHosts: ["example.com"],
    });
    const port = await new Promise<number>((ok, fail) => {
      handle!.server.listen(0, () => {
        const addr = handle!.server.address();
        if (addr && typeof addr === "object") ok(addr.port);
        else fail(new Error("no address"));
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const remote = await rawRequest(
      base,
      "POST",
      "/api/workspace/git/checkout",
      { Host: "example.com", "Content-Type": "application/json" },
      JSON.stringify({ workdir: repo, branch: "feature" }),
    );
    expect(remote.status).toBe(403);
    expect(remote.body.error).toContain("loopback");
  });
});

/**
 * 终审 I2：/api/workspace/git/diff 的圈禁是双检（path 按 root 相对，
 * 但必须同时落在 root 与 workdir 之内）。第一道管越界（../../x），
 * 第二道管「workdir 是仓库子目录」时的出界（README.md 在 root 内、
 * 在 workdir 外）。删掉第二道，下面第一条当场红——第一道拦不住它。
 */
describe("/api/workspace/git/diff 圈禁双检（终审 I2）", () => {
  it("workdir 是仓库子目录时，子目录之外的路径 400（圈禁第二道活着）", async () => {
    const { src } = await repoWithSrc();
    const base = await startHost(src);
    const res = await fetch(
      `${base}/api/workspace/git/diff?workdir=${encodeURIComponent(src)}&path=${encodeURIComponent("README.md")}`,
    );
    expect(res.status).toBe(400);
  });

  it("workdir=子目录 + path=src/app.js：path 仍按 root 相对，拿到 repo/src/app.js 的 patch", async () => {
    const { src } = await repoWithSrc();
    const base = await startHost(src);
    const res = await fetch(
      `${base}/api/workspace/git/diff?workdir=${encodeURIComponent(src)}&path=${encodeURIComponent("src/app.js")}`,
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as any;
    expect(d.present).toBe(true);
    expect(d.tracked).toBe(true);
    expect(d.path).toBe("src/app.js");
    expect(d.hunks.length).toBeGreaterThanOrEqual(1);
  });

  it("workdir=仓库根时 src/app.js 的 M 拿到 +43 的 hunk（基线）", async () => {
    const { repo } = await repoWithSrc();
    const base = await startHost(repo);
    const res = await fetch(
      `${base}/api/workspace/git/diff?workdir=${encodeURIComponent(repo)}&path=${encodeURIComponent("src/app.js")}`,
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as any;
    const plus = d.hunks.flatMap((h: any) =>
      h.lines.filter((l: any) => l.sign === "+").map((l: any) => l.text),
    );
    expect(plus).toContain("const answer = 43;");
    expect(plus).not.toContain("const answer = 42;");
  });

  it("路径越界（../../x）被第一道 400 挡住", async () => {
    const { repo } = await repoWithSrc();
    const base = await startHost(repo);
    const res = await fetch(
      `${base}/api/workspace/git/diff?workdir=${encodeURIComponent(repo)}&path=${encodeURIComponent("../../etc/passwd")}`,
    );
    expect(res.status).toBe(400);
  });
});
