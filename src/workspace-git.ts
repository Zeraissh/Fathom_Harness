/**
 * 工作区 git 身份：仓库根、当前分支、GitHub owner/repo。
 * 这是宿主事实，不是领域包能力——换包不该让「我在哪个仓库」消失。
 */
import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 8_000;
const BRANCH_NAME_RE = /^(?!.*(?:\.\.|@{))[A-Za-z0-9._][A-Za-z0-9._/-]{0,199}$/;

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

export interface WorkspaceGitSnapshot {
  present: true;
  root: string;
  branch: string | null;
  detached: boolean;
  dirty: boolean;
  github: GithubRepoRef | null;
  branches: string[];
}

export type WorkspaceGit = WorkspaceGitSnapshot | { present: false };

export type WorkspaceDirtyAction = "stash" | "discard";

export const DIRTY_WORKTREE_CODE = "dirty_worktree";

export class DirtyWorktreeError extends Error {
  readonly code = DIRTY_WORKTREE_CODE;
  constructor(message = "工作区有未提交改动，切换前需要先选择如何处理") {
    super(message);
    this.name = "DirtyWorktreeError";
  }
}

export function isSafeGitBranchName(name: string): boolean {
  const branch = String(name ?? "").trim();
  if (!BRANCH_NAME_RE.test(branch)) return false;
  if (branch.startsWith("-") || branch.endsWith(".lock")) return false;
  return true;
}

/** 从 origin URL 抽出 github.com owner/repo；带 user:token 的 URL 只留身份、不回传原文。 */
export function parseGithubRemote(url: string): GithubRepoRef | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  const stripped = raw.replace(/\.git$/i, "");
  const https = stripped.match(/^https?:\/\/(?:[^/@]+@)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i);
  if (https) return { owner: https[1]!, repo: https[2]! };
  const ssh = stripped.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/#?]+)$/i);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  return null;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function probeWorkspaceGit(workdir: string): Promise<WorkspaceGit> {
  const cwd = resolve(workdir);
  let root: string;
  try {
    root = resolve(await git(cwd, ["rev-parse", "--show-toplevel"]));
  } catch {
    return { present: false };
  }

  let branch: string | null = null;
  let detached = false;
  try {
    const current = await git(root, ["branch", "--show-current"]);
    if (current) {
      branch = current;
    } else {
      detached = true;
      branch = (await git(root, ["rev-parse", "--short", "HEAD"])) || null;
    }
  } catch {
    detached = true;
  }

  let dirty = false;
  try {
    dirty = Boolean(await git(root, ["status", "--porcelain"]));
  } catch {
    dirty = false;
  }

  let github: GithubRepoRef | null = null;
  try {
    const remotes = await git(root, ["remote", "-v"]);
    for (const line of remotes.split(/\r?\n/)) {
      const match = line.match(/^origin\s+(\S+)/);
      if (!match) continue;
      github = parseGithubRemote(match[1]!);
      if (github) break;
    }
    if (!github) {
      for (const line of remotes.split(/\r?\n/)) {
        const match = line.match(/^\S+\s+(\S+)/);
        if (!match) continue;
        github = parseGithubRemote(match[1]!);
        if (github) break;
      }
    }
  } catch {
    github = null;
  }

  let branches: string[] = [];
  try {
    const listed = await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"]);
    branches = listed
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter((name) => name && isSafeGitBranchName(name));
  } catch {
    branches = branch && !detached ? [branch] : [];
  }

  return { present: true, root, branch, detached, dirty, github, branches };
}

export interface PatchLine { sign: " " | "-" | "+" | "\\"; text: string }
export interface PatchHunk { header: string; lines: PatchLine[] }
export interface FilePatch {
  present: boolean;          // 这个目录是不是 git 仓库
  path: string;              // 相对 root 的正斜杠路径
  tracked: boolean;          // 是不是被 git 跟踪（未跟踪走合成路径）
  binary: boolean;
  added: number;             // 计入 patch 的 + 行数
  deleted: number;
  hunks: PatchHunk[];
  truncated: boolean;        // 超过上限被截断
  note?: string;             // 给用户看的一句人话（非 git / 文件不存在 / 二进制…）
}

/** patch 文本上限（字节）：超了只保留已解析完整的前若干个 hunk。 */
const MAX_PATCH_BYTES = 262144;

/** git 失败时的降级人话（本文件的纪律：git 不可用一律降级，不抛）。 */
const GIT_FAIL_NOTE = "git 读不出这个文件的改动";

/** 逐行扫 patch 文本：遇 `@@ ` 开新 hunk（header 逐字保留），hunk 体内按首字符分 ` `/`-`/`+`，`\` 记 `\\`。 */
function parsePatchHunks(patchText: string): { hunks: PatchHunk[]; truncated: boolean } {
  const hunks: PatchHunk[] = [];
  let current: PatchHunk | null = null;
  let used = 0;
  let truncated = false;
  for (const raw of patchText.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const bytes = Buffer.byteLength(line, "utf8") + 1;
    if (line.startsWith("@@ ")) {
      if (used + bytes > MAX_PATCH_BYTES) {
        truncated = true;
        break;
      }
      current = { header: line, lines: [] };
      hunks.push(current);
      used += bytes;
      continue;
    }
    if (!current) continue; // hunk 之外的 diff 头部行（diff --git / index / --- / +++）不采
    const first = line[0];
    if (first !== " " && first !== "-" && first !== "+" && first !== "\\") continue;
    if (used + bytes > MAX_PATCH_BYTES) {
      hunks.pop(); // 半个 hunk 不算数——只留已解析完整的前若干个
      truncated = true;
      break;
    }
    current.lines.push({ sign: first, text: line.slice(1) });
    used += bytes;
  }
  return { hunks, truncated };
}

/** 未跟踪文件自己合成：逐行 `+`、header `@@ -0,0 +1,N @@`（不用 --no-index /dev/null，Windows 上不可靠）。 */
function synthesizeUntrackedHunks(content: string): { hunks: PatchHunk[]; truncated: boolean } {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop(); // 尾部换行不产生空行
  const kept: string[] = [];
  let used = 0;
  let truncated = false;
  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const bytes = Buffer.byteLength(line, "utf8") + 1;
    if (used + bytes > MAX_PATCH_BYTES) {
      truncated = true;
      break;
    }
    kept.push(line);
    used += bytes;
  }
  if (kept.length === 0) return { hunks: [], truncated };
  return {
    hunks: [{ header: `@@ -0,0 +1,${kept.length} @@`, lines: kept.map((text) => ({ sign: "+" as const, text })) }],
    truncated,
  };
}

/**
 * 单个文件「工作区相对 HEAD」的真 patch：有行号、有上下文行（计划 3 · T4）。
 *
 * 语义如实：这份 patch 是「工作区相对 HEAD」，**不是「本场 run 专属」**——
 * 它混着用户自己的未提交改动与上一场 run 的改动。「这场 run 碰过哪些路径」
 * 由事件流那条链（collectTouchedPaths / editHunksFromTimeline）给，两条链
 * 各有各的活，谁也不替谁：
 * - 事件流：本场改了哪些路径、改了什么内容（edit_file 的 old/new 串，字节
 *   精确），但没有位置（哪一行），且 write_file 覆盖场景根本拿不到旧版；
 * - git diff（这里）：有行号、有上下文行，但没有 run 归属，非 git 目录
 *   完全没有。
 * 这条链补上的正是那个洞：write_file 覆盖的文件在事件流里没有旧版可比，
 * 但在 git diff 里整个新内容都是 + 行。
 *
 * 契约：`relPath` 是**相对 root（仓库根）**的路径，不是相对 workdir——
 * workdir 可能是仓库的子目录。圈禁由宿主 handler 做（root 与 workdir
 * 双检），本函数只信拿到的 rel 已在仓库内。
 *
 * 与 probeWorkspaceGit 同一纪律：git 不可用一律降级、不抛。
 */
export async function probeFilePatch(root: string, relPath: string): Promise<FilePatch> {
  const cwd = resolve(root);
  const rel = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\/+/, "");

  const empty = (note?: string): FilePatch => ({
    present: true,
    path: rel,
    tracked: false,
    binary: false,
    added: 0,
    deleted: 0,
    hunks: [],
    truncated: false,
    ...(note ? { note } : {}),
  });

  try {
    await git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return { ...empty(), present: false, note: "这个目录不是 git 仓库，看不了工作区改动" };
  }

  if (!existsSync(join(cwd, rel))) return empty("盘上没有这个文件");

  // 目录先拦：目录里若有未跟踪子文件会撞未跟踪分支的 readFileSync → EISDIR
  // 漏成 500（审查 Minor #2）。existsSync 与 statSync 之间的竞态按"文件没了"降级。
  let fileSize = 0;
  try {
    const st = statSync(join(cwd, rel));
    if (!st.isFile()) return empty("这是个目录，看不了逐行改动");
    fileSize = st.size;
  } catch {
    return empty("盘上没有这个文件");
  }

  // 未跟踪判定：status --porcelain 首两字符是 ??（git diff 对未跟踪文件没有输出，
  // 未跟踪走合成路径）。git 本身会拒绝越出仓库的路径，所以拿到的 rel 必在仓库内。
  let porcelain: string;
  try {
    porcelain = await git(cwd, ["status", "--porcelain", "--", rel]);
  } catch {
    return empty(GIT_FAIL_NOTE);
  }
  const untracked = porcelain.split(/\r?\n/).some((line) => line.startsWith("??"));

  let hunks: PatchHunk[] = [];
  let truncated = false;
  if (untracked) {
    // ★ 未跟踪文件不许整读进内存（终审 I3）：workdir 里的大未跟踪件
    // （node_modules/**、构建产物、数据集）被点开时，readFileSync 会瞬时吃下
    // 数倍于文件大小的分配。对照：GET /api/file-preview 有 FILE_PREVIEW_MAX_BYTES
    // 超了返 413。这里与 tracked 截断同一把尺：只读前 MAX_PATCH_BYTES 字节。
    // 代价如实记：二进制判定只对已读前缀成立——超长文件里藏在后面的 NUL
    // 判不出来，按文本合成（与 parsePatchHunks 超长截断同口径）。
    let buf: Buffer;
    if (fileSize > MAX_PATCH_BYTES) {
      const fd = openSync(join(cwd, rel), "r");
      try {
        buf = Buffer.alloc(MAX_PATCH_BYTES);
        buf = buf.subarray(0, readSync(fd, buf, 0, MAX_PATCH_BYTES, 0));
      } finally {
        closeSync(fd);
      }
    } else {
      buf = readFileSync(join(cwd, rel));
    }
    if (buf.includes(0)) return { ...empty("二进制文件，不给逐行改动"), binary: true };
    ({ hunks, truncated } = synthesizeUntrackedHunks(buf.toString("utf8")));
    truncated = truncated || fileSize > MAX_PATCH_BYTES;
  } else {
    let patchText: string;
    try {
      patchText = await git(cwd, ["diff", "-U3", "--no-color", "HEAD", "--", rel]);
    } catch {
      return empty(GIT_FAIL_NOTE);
    }
    if (patchText.includes("Binary files") || patchText.includes("GIT binary patch")) {
      return { ...empty("二进制文件，不给逐行改动"), binary: true, tracked: true };
    }
    ({ hunks, truncated } = parsePatchHunks(patchText));
  }

  const added = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.sign === "+").length, 0);
  const deleted = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.sign === "-").length, 0);
  return {
    present: true,
    path: rel,
    tracked: !untracked,
    binary: false,
    added,
    deleted,
    hunks,
    truncated,
  };
}

export async function switchWorkspaceBranch(
  workdir: string,
  branch: string,
  opts: { dirtyAction?: WorkspaceDirtyAction } = {},
): Promise<WorkspaceGitSnapshot> {
  const name = String(branch ?? "").trim();
  if (!isSafeGitBranchName(name)) {
    throw new Error(`非法分支名：${name}`);
  }
  const current = await probeWorkspaceGit(workdir);
  if (!current.present) throw new Error("当前工作目录不是 git 仓库");
  if (current.branch === name && !current.detached) return current;
  if (current.dirty) {
    if (opts.dirtyAction === "stash") {
      await git(current.root, [
        "stash",
        "push",
        "--include-untracked",
        "-m",
        `fathom-host: switch to ${name}`,
      ]);
    } else if (opts.dirtyAction === "discard") {
      await git(current.root, ["reset", "--hard", "HEAD"]);
    } else {
      throw new DirtyWorktreeError();
    }
  }
  try {
    await git(current.root, ["switch", "--", name]);
  } catch (err) {
    if (err instanceof DirtyWorktreeError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (/local changes|would be overwritten|uncommitted/i.test(message)) {
      throw new DirtyWorktreeError();
    }
    throw new Error(`无法切换到 ${name}：${message}`);
  }
  const next = await probeWorkspaceGit(current.root);
  if (!next.present) throw new Error("切换后读不到仓库状态");
  return next;
}

export type PublicWorkspaceGit = {
  present: boolean;
  root?: string;
  branch?: string | null;
  detached?: boolean;
  dirty?: boolean;
  github?: GithubRepoRef | null;
  branches?: string[];
};

export function publicWorkspaceGit(git: WorkspaceGit): PublicWorkspaceGit {
  if (!git.present) return { present: false };
  return {
    present: true,
    root: git.root,
    branch: git.branch,
    detached: git.detached,
    dirty: git.dirty,
    github: git.github,
    branches: git.branches,
  };
}

/** 给启动行 / dynamicContext：不带 remote URL。 */
export function formatWorkspaceGitLine(git: WorkspaceGit | PublicWorkspaceGit): string {
  if (!git.present) return "not a git repository";
  const repo = git.github ? `${git.github.owner}/${git.github.repo}` : "local";
  const head = git.detached ? `detached ${git.branch ?? "HEAD"}` : (git.branch ?? "HEAD");
  return `${repo} @ ${head}${git.dirty ? " (dirty)" : ""}`;
}
