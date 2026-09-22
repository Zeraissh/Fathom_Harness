import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  DirtyWorktreeError,
  formatWorkspaceGitLine,
  isSafeGitBranchName,
  parseGithubRemote,
  probeFilePatch,
  probeWorkspaceGit,
  publicWorkspaceGit,
  switchWorkspaceBranch,
} from "../src/workspace-git.js";

/** 造一个只属于本次测试的空仓库（在系统临时目录里，跑完不必清）。 */
function mkTmpRepo() {
  const root = mkdtempSync(join(tmpdir(), "plan3-patch-"));
  git(root, "init", "-q");
  // 这两行不是可选的：CI 与干净机器上没有全局身份，git commit 会当场失败，
  // 而本机（配过）不会——"本机绿、CI 红"的经典坑。
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  return root;
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

const execFileAsync = promisify(execFile);

let temps: string[] = [];
afterEach(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
  temps = [];
});

async function gitRepo(extra: string[] = []): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ws-git-"));
  temps.push(dir);
  await execFileAsync("git", ["-c", "init.defaultBranch=main", "init"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "t@t.test"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "t"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "hi\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: dir });
  for (const name of extra) {
    await execFileAsync("git", ["branch", name], { cwd: dir });
  }
  return dir;
}

describe("parseGithubRemote / isSafeGitBranchName", () => {
  it("抽出 https / ssh 身份，丢掉 user:token", () => {
    expect(parseGithubRemote("https://user:ghp_secret@github.com/acme/app.git"))
      .toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubRemote("git@github.com:acme/app.git"))
      .toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubRemote("ssh://git@github.com/acme/app")).toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubRemote("https://gitlab.com/acme/app.git")).toBeNull();
  });

  it("拒绝路径穿越与 option 形分支名", () => {
    expect(isSafeGitBranchName("main")).toBe(true);
    expect(isSafeGitBranchName("feat/ui")).toBe(true);
    expect(isSafeGitBranchName("-bad")).toBe(false);
    expect(isSafeGitBranchName("a..b")).toBe(false);
    expect(isSafeGitBranchName("foo.lock")).toBe(false);
    expect(isSafeGitBranchName("a@{b}")).toBe(false);
  });
});

describe("probeWorkspaceGit / switchWorkspaceBranch", () => {
  it("非仓库 → present:false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ws-nogit-"));
    temps.push(dir);
    expect(await probeWorkspaceGit(dir)).toEqual({ present: false });
  });

  it("读出分支列表，带 token 的 origin 只留 owner/repo", async () => {
    const dir = await gitRepo(["feature"]);
    await execFileAsync(
      "git",
      ["remote", "add", "origin", "https://user:ghp_secret@github.com/acme/app.git"],
      { cwd: dir },
    );
    const snap = await probeWorkspaceGit(dir);
    expect(snap.present).toBe(true);
    if (!snap.present) throw new Error("expected repo");
    expect(snap.branch).toBe("main");
    expect(snap.branches).toEqual(expect.arrayContaining(["main", "feature"]));
    expect(snap.github).toEqual({ owner: "acme", repo: "app" });
    expect(JSON.stringify(publicWorkspaceGit(snap))).not.toContain("ghp_secret");
    expect(formatWorkspaceGitLine(snap)).toBe("acme/app @ main");
  });

  it("切换到已有本地分支", async () => {
    const dir = await gitRepo(["feature"]);
    const next = await switchWorkspaceBranch(dir, "feature");
    expect(next.branch).toBe("feature");
    expect(next.detached).toBe(false);
    await expect(switchWorkspaceBranch(dir, "-evil")).rejects.toThrow(/非法分支名/);
  });

  it("脏工作区无 dirtyAction 拒绝切换，不改 HEAD", async () => {
    const dir = await gitRepo(["feature"]);
    await writeFile(join(dir, "README.md"), "dirty\n");
    await expect(switchWorkspaceBranch(dir, "feature")).rejects.toBeInstanceOf(DirtyWorktreeError);
    const snap = await probeWorkspaceGit(dir);
    expect(snap.present).toBe(true);
    if (!snap.present) throw new Error("expected repo");
    expect(snap.branch).toBe("main");
    expect(snap.dirty).toBe(true);
  });

  it("stash 后切换，工作区变干净", async () => {
    const dir = await gitRepo(["feature"]);
    await writeFile(join(dir, "README.md"), "stashed\n");
    const next = await switchWorkspaceBranch(dir, "feature", { dirtyAction: "stash" });
    expect(next.branch).toBe("feature");
    expect(next.dirty).toBe(false);
  });

  it("discard 后切换，未提交改动丢掉", async () => {
    const dir = await gitRepo(["feature"]);
    await writeFile(join(dir, "README.md"), "gone\n");
    const next = await switchWorkspaceBranch(dir, "feature", { dirtyAction: "discard" });
    expect(next.branch).toBe("feature");
    expect(next.dirty).toBe(false);
  });
});

describe("probeFilePatch：工作区相对 HEAD 的真 patch（计划 3 · T4）", () => {
  it("改过的文件给出带行号与上下文行的 hunk", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "a.txt"), "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    writeFileSync(join(root, "a.txt"), "1\n2\n3\nCHANGED\n5\n6\n7\n8\n9\n10\n");

    const p = await probeFilePatch(root, "a.txt");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(true);
    expect(p.added).toBe(1);
    expect(p.deleted).toBe(1);
    expect(p.hunks.length).toBe(1);
    expect(p.hunks[0]!.header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);   // ← 有行号
    // 上下文行（sign === " "）必须存在——这正是"没有位置"那条链给不了的东西
    expect(p.hunks[0]!.lines.some((l) => l.sign === " ")).toBe(true);
    expect(p.hunks[0]!.lines.some((l) => l.sign === "-" && l.text === "4")).toBe(true);
    expect(p.hunks[0]!.lines.some((l) => l.sign === "+" && l.text === "CHANGED")).toBe(true);
  });

  /**
   * ★ 核心断言：write_file 覆盖的那种改法也给得出来。
   * 事件流那条链在这里是瞎的（edit_file 的 old/new 串拿不到覆盖前的旧版），
   * git diff 给得出——整个新内容都是 + 行。这正是这条链补上的那个洞。
   */
  it("★ write_file 覆盖的那种改法也给得出来（事件流那条链在这里是瞎的）", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "b.txt"), "old\n");
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    writeFileSync(join(root, "b.txt"), "整份换掉\n第二行\n");   // 整文件覆盖

    const p = await probeFilePatch(root, "b.txt");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(true);
    expect(p.deleted).toBe(1);
    expect(p.added).toBe(2);
    expect(p.hunks[0]!.lines.filter((l) => l.sign === "+").map((l) => l.text))
      .toEqual(["整份换掉", "第二行"]);
  });

  it("未跟踪文件：整个文件都是 + 行", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "u.txt"), "一\n二\n三\n");

    const p = await probeFilePatch(root, "u.txt");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(false);
    expect(p.added).toBe(3);
    expect(p.deleted).toBe(0);
    expect(p.hunks.length).toBe(1);
    expect(p.hunks[0]!.header).toBe("@@ -0,0 +1,3 @@");
    expect(p.hunks[0]!.lines.map((l) => l.sign)).toEqual(["+", "+", "+"]);
    expect(p.hunks[0]!.lines.map((l) => l.text)).toEqual(["一", "二", "三"]);
  });

  it("不是 git 仓库：present=false 且给一句人话", async () => {
    const dir = mkdtempSync(join(tmpdir(), "plan3-nogit-"));
    writeFileSync(join(dir, "a.txt"), "x\n");

    const p = await probeFilePatch(dir, "a.txt");
    expect(p.present).toBe(false);
    expect(p.hunks).toEqual([]);
    expect(p.note).toBe("这个目录不是 git 仓库，看不了工作区改动");
  });

  it("文件不存在：present=true 但 hunks 空、给一句人话", async () => {
    const root = mkTmpRepo();

    const p = await probeFilePatch(root, "nope.txt");
    expect(p.present).toBe(true);
    expect(p.hunks).toEqual([]);
    expect(p.note).toBe("盘上没有这个文件");
  });

  /**
   * 审查 Minor #2 的护栏：path 指向目录时，目录里若有未跟踪子文件，
   * 会先撞未跟踪分支的 readFileSync(dir) → EISDIR 漏成 500。isFile()
   * 先拦，给结构化 note，不抛。
   */
  it("目录不给逐行：isFile 先拦，不抛 EISDIR", async () => {
    const root = mkTmpRepo();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "inner.txt"), "x\n");   // 未跟踪子文件——目录的 porcelain 里有 ??

    const p = await probeFilePatch(root, "sub");
    expect(p.present).toBe(true);
    expect(p.hunks).toEqual([]);
    expect(p.note).toBe("这是个目录，看不了逐行改动");
  });

  it("二进制文件：binary=true、不给逐行", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "bin.dat"), Buffer.from([0, 1, 2, 3, 0, 255]));
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    writeFileSync(join(root, "bin.dat"), Buffer.from([9, 0, 1, 2, 3, 0, 255]));

    const p = await probeFilePatch(root, "bin.dat");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(true);
    expect(p.binary).toBe(true);
    expect(p.hunks).toEqual([]);
    expect(p.note).toBe("二进制文件，不给逐行改动");
  });

  it("超长文件：truncated=true 且留前 N 个 hunk", async () => {
    const root = mkTmpRepo();
    // 每 8 行改一行（4000 处）：U3 上下文（前后各 3 行）不会并 hunk，4000 个
    // hunk 的 patch 远超 MAX_PATCH_BYTES（262144），必然截断。
    const total = 4000;
    const lines: string[] = [];
    for (let i = 1; i <= total * 8; i++) lines.push(`line-${i}`);
    writeFileSync(join(root, "big.txt"), lines.join("\n") + "\n");
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    for (let i = 0; i < total; i++) lines[7 + i * 8] = `changed-${i}`;
    writeFileSync(join(root, "big.txt"), lines.join("\n") + "\n");

    const p = await probeFilePatch(root, "big.txt");
    expect(p.present).toBe(true);
    expect(p.truncated).toBe(true);
    expect(p.hunks.length).toBeGreaterThan(0);
    expect(p.hunks.length).toBeLessThan(total);
    // 前 N 个 hunk 按 diff 顺序保留：第一个 hunk 从第 8 行改起，罩 5..11 行。
    // 只锁位置前缀——git 2.54 会给 @@ 后追加 section heading（逐字保留的 header）。
    expect(p.hunks[0]!.header).toMatch(/^@@ -5,7 \+5,7 @@/);
    expect(p.added).toBe(p.hunks.length);
  });

  /**
   * ★ 终审 I3 的锁：未跟踪的超大文件不许 readFileSync 整读进内存
   * （workdir 里点开 node_modules 大件/构建产物时，瞬时分配数倍文件大小）。
   * 实现只读前 MAX_PATCH_BYTES 字节，truncated 必须 true。
   *
   * 红锁机关是文件尾部的 NUL（offset 远超 262144）：实现若退回整读，
   * `buf.includes(0)` 会看见它 → 判 binary、hunks 清空，下面的断言当场红。
   * 前缀读则看不见它（二进制判定只对已读前缀成立，这是实现注释里
   * 明说的代价）。不用 mock node:fs——vi.mock 会把 vitest 自己的
   * 模块加载毒化（全文件 17 条一起红）。
   */
  it("未跟踪超大文件：只读前 N 字节、truncated=true、尾部 NUL 不许被看见", async () => {
    const root = mkTmpRepo();
    // ≈318KB > MAX_PATCH_BYTES(262144)；行宽不是 262144 的因子，字节边界
    // 必落在行中间——被切掉的那半行按 parse 纪律丢弃，留下的都是完整行。
    const total = 3000;
    const contentLines = Array.from({ length: total }, (_, i) => `${"x".repeat(100)}-${i}`);
    const body = Buffer.from(contentLines.join("\n") + "\n");
    // 尾部 NUL 的位置（≈317KB）在 MAX_PATCH_BYTES 之外：整读才看得见它
    const withTailNul = Buffer.concat([body, Buffer.from([0, 0, 0])]);
    writeFileSync(join(root, "big-u.txt"), withTailNul);

    const p = await probeFilePatch(root, "big-u.txt");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(false);
    expect(p.binary).toBe(false);                          // ← 红锁本体：整读会判 binary
    expect(p.truncated).toBe(true);
    expect(p.hunks.length).toBe(1);
    const kept = p.hunks[0]!.lines.map((l) => l.text);
    expect(kept.length).toBeLessThan(total);               // 确实截了
    expect(kept).toEqual(contentLines.slice(0, kept.length));   // 留的是前缀
    expect(p.hunks[0]!.header).toBe(`@@ -0,0 +1,${kept.length} @@`);
    expect(p.added).toBe(kept.length);
  });
});
