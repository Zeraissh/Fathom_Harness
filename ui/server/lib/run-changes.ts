/**
 * 「碰过哪些文件」：从事件流收写入路径，按需探 git 状态与增删行数。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * 能从 tool_call 入参直接读出目标路径的写盘工具 → 操作标签。
 * 与 src/tools/ 的实际注册名一一对应（write_file / write_pptx / edit_file）。
 * bash 不在其中：它的写入藏在任意命令串里，从入参读不出路径——
 * 这与 app.js deriveArtifacts 的口径一致，宁缺勿假。
 * memory_write 有自己的面板（T5），不混入"工作目录变更"。
 */
export const CHANGE_TOOL_OPS: Record<string, "write" | "edit"> = {
  write_file: "write",
  write_pptx: "write",
  edit_file: "edit",
};

/** git 子进程硬上限：不可用/超时一律静默降级为 git: null（Supervisor 视图缺了 diff 也要能开） */
export const GIT_PROBE_TIMEOUT_MS = 3000;

export interface ChangeGitInfo {
  /** porcelain 归一状态："M" 修改 / "A" 新增（含已暂存）/ "??" 未跟踪 / "D" 已删除 */
  status: string;
  /** `git diff --stat HEAD -- <path>` 的增删行数；无 diff（未跟踪/无变化）为 null */
  added: number | null;
  deleted: number | null;
}

export interface RunChangeEntry {
  /** 相对 run workdir 的正斜杠路径；越界路径保留工具入参原文 */
  path: string;
  ops: string[];
  count: number;
  /** 最后一次触碰的服务端接收时刻（事件包络 ts），无时间戳为 null */
  lastAt: number | null;
  outOfScope: boolean;
  exists: boolean;
  sizeBytes: number | null;
  mtimeMs: number | null;
  git: ChangeGitInfo | null;
}

/**
 * 来源是否属于 verifier（编排来源形如 "s1/verifier"）。
 * 与 `ui/public/app.js` 的同名内部函数逐字同义——T28 的两侧口径靠它对齐。
 */
export function isVerifierEventSource(source: unknown): boolean {
  return source === "verifier" || (typeof source === "string" && source.endsWith("/verifier"));
}

/**
 * 工具入参路径 → 归一路径（T28）。与 `deriveTouchedFiles` 同一行写法：
 * `path` 缺了认 `file_path`，反斜杠一律折成正斜杠，再 trim。
 *
 * **已知代价**：POSIX 上文件名里真带反斜杠（合法但近乎不存在）会被折成目录分隔。
 * 这是"与客户端同一口径"的必然结果——客户端一直这么折，两边要么一起折、
 * 要么两个数字继续打架。
 */
export function normalizeTouchedPath(input: unknown): string {
  const raw = (input as { path?: unknown; file_path?: unknown } | null | undefined);
  const pick = typeof raw?.path === "string" ? raw.path
    : typeof raw?.file_path === "string" ? raw.file_path
    : null;
  if (pick === null) return "";
  return pick.replace(/\\/g, "/").trim();
}

/**
 * 从事件流聚合写盘工具**成功**触碰的路径。事件形状见 pushEvent：{ seq, source, ts, event } 包络。
 *
 * ★ T28 事实源：**只收成功的调用**，且**不收 verifier 段**——与客户端
 * `app.js` 的 `deriveTouchedFiles` 逐条同义（那边是 `state.timeline` +
 * `resultIsError` 过滤，verifier 事件压根不进 `timeline`）。
 *
 * 此前本函数收下了全部 `tool_call`（含失败的、含等批准被拒的、含还没回结果的、
 * 含 verifier 段的），于是同一个 run 在 T8「变更」分区与 T7「改动」面板给出
 * 两个不同的数字（现场是 25 对 12），而两处都写着「改文件 N 个」——界面在
 * 说谎。定这一侧作事实源的理由：失败的写入**没有改变磁盘**，把它算进"碰过"
 * 会让审查者去找一个并不存在的改动；仓库里同族的三个派生函数
 * （`deriveArtifacts`「没成的不是产物」、`deriveWrittenPaths`「只信成功的
 * tool_result」、`editHunksFromTimeline`）本来就都是这个口径，服务端是唯一的异类。
 *
 * 想看"试过但失败了"是另一个概念（`deriveToolsFace` 的 errors 已经在给），
 * 不许再叫"改了 N 个文件"。
 */
export function collectTouchedPaths(
  events: unknown[],
): { input: string; ops: Set<string>; count: number; lastAt: number | null }[] {
  // 先收一遍结果：toolUseId → 这次调用成不成。没有结果的（在飞 / 等批准 / 被拒）
  // 一律不算——tool_call 只是"打算写"，磁盘上还什么都没有。
  const ok = new Map<string, boolean>();
  for (const envelope of events) {
    if (isVerifierEventSource((envelope as { source?: unknown } | null)?.source)) continue;
    const ev = (envelope as { event?: unknown } | null)?.event as
      | { type?: unknown; toolUseId?: unknown; result?: unknown }
      | undefined;
    if (!ev || ev.type !== "tool_result" || typeof ev.toolUseId !== "string") continue;
    const isError = Boolean((ev.result as { isError?: unknown } | null | undefined)?.isError);
    ok.set(ev.toolUseId, !isError);
  }

  const groups = new Map<
    string,
    { input: string; ops: Set<string>; count: number; lastAt: number | null }
  >();
  for (const envelope of events) {
    if (isVerifierEventSource((envelope as { source?: unknown } | null)?.source)) continue;
    const ev = (envelope as { event?: unknown } | null)?.event as
      | { type?: unknown; name?: unknown; input?: unknown; toolUseId?: unknown }
      | undefined;
    if (!ev || ev.type !== "tool_call" || typeof ev.name !== "string") continue;
    const op = CHANGE_TOOL_OPS[ev.name];
    if (!op) continue;
    const input = normalizeTouchedPath(ev.input);
    if (!input) continue;
    if (ok.get(typeof ev.toolUseId === "string" ? ev.toolUseId : "") !== true) continue;
    const ts = (envelope as { ts?: unknown } | null)?.ts;
    const at = typeof ts === "number" && Number.isFinite(ts) ? ts : null;
    let group = groups.get(input);
    if (!group) {
      group = { input, ops: new Set(), count: 0, lastAt: null };
      groups.set(input, group);
    }
    group.ops.add(op);
    group.count += 1;
    if (at !== null) group.lastAt = at;
  }
  return [...groups.values()];
}

/** porcelain 行首两个字符 → 归一状态。优先级：未跟踪 > 删除 > 新增 > 修改 > 其他原样首字符。 */
export function parseGitPorcelainStatus(line: string): string | null {
  if (!line || line.length < 2) return null;
  const xy = line.slice(0, 2);
  if (xy === "??") return "??";
  if (xy.includes("D")) return "D";
  if (xy.includes("A")) return "A";
  if (xy.includes("M")) return "M";
  const first = xy.trim().charAt(0);
  return first || null;
}

/** 解析 `git diff --stat` 的汇总行：「 1 file changed, 5 insertions(+), 3 deletions(-)」。 */
export function parseDiffStatSummary(text: string): { added: number | null; deleted: number | null } {
  const m = /(\d+)\s+files?\s+changed/.exec(text);
  if (!m) return { added: null, deleted: null };
  const ins = /(\d+)\s+insertions?\(\+\)/.exec(text);
  const del = /(\d+)\s+deletions?\(-\)/.exec(text);
  return {
    added: ins ? Number(ins[1]) : 0,
    deleted: del ? Number(del[1]) : 0,
  };
}

export const execFileAsync = promisify(execFile);

/** 单文件 git 探针：porcelain 状态 + diff 统计。任何失败/超时 → null（静默降级）。 */
export async function probeGitForFile(root: string, relPath: string): Promise<ChangeGitInfo | null> {
  try {
    const statusOut = await execFileAsync("git", ["status", "--porcelain", "--", relPath], {
      cwd: root,
      timeout: GIT_PROBE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      // Windows 上 execFile 不经 shell：参数按数组逐个传递，没有转义面
      windowsHide: true,
    });
    const firstLine = statusOut.stdout.split("\n").find((l) => l.trim().length > 0) ?? "";
    const status = parseGitPorcelainStatus(firstLine);
    if (!status) return null; // 干净文件（已提交且无改动）不挂徽章
    let added: number | null = null;
    let deleted: number | null = null;
    if (status !== "??") {
      // HEAD 口径同时覆盖已暂存与未暂存改动；未跟踪文件无 diff 可言
      const diffOut = await execFileAsync("git", ["diff", "--stat", "HEAD", "--", relPath], {
        cwd: root,
        timeout: GIT_PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      ({ added, deleted } = parseDiffStatSummary(diffOut.stdout));
    }
    return { status, added, deleted };
  } catch {
    return null; // git 不在 PATH、非仓库、超时、被杀——一律降级，视图照样能开
  }
}

/** workdir 是否 git 仓库（.git 存在即可，文件或目录都算——worktree 的 .git 是文件）。 */
export async function detectGitRepo(root: string): Promise<boolean> {
  try {
    await stat(join(root, ".git"));
    return true;
  } catch {
    return false;
  }
}
