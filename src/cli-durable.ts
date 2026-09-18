/**
 * CLI 对等 durable（RUN-01 / SAFE-06 残余）：把 CLI run 的 state.json + toolTx
 * 落到与 Web 相同的 `.agent-run-history/<runId>/` 布局。
 *
 * 默认开启；`AGENT_CLI_DURABLE=0` 可关（仪器/确定性 eval 用）。
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import {
  canRestorePlanGate,
  canSameRunResume,
  durableBudgetExhausted,
  initialRunState,
  planResumeFacts,
  recoverDurableStateOnCrash,
  snapshotDurableBudget,
  transitionRunState,
  type DurableBudgetSnapshot,
  type DurablePlanNode,
  type DurableRunState,
  type RunStateEvent,
} from "./run-state.js";
import { isEphemeralTurnEvent, serializeTurnEventForArchive } from "./archive-event.js";
import type { AgentRunResult } from "./types.js";
import {
  upsertToolTx,
  type DurableToolTx,
  type ToolTxController,
} from "./tool-tx.js";
import {
  RunHistoryWriter,
  archiveOwnerLiveness,
  loadArchivedMetas,
  pidIsAlive,
  readArchivedState,
  type ArchivedCheckpoint,
  type ArchivedMeta,
} from "../ui/history.js";
import { CLI_VERSION } from "./cli-args.js";
import {
  endSpan,
  hashToolSchemas,
  projectTurnEventToSpans,
  resolveGitCommit,
  startSpan,
  type TraceSpan,
} from "./trace.js";
import type { TurnEvent } from "./types.js";

export interface CliArchiveInfo {
  task: string;
  mode: "single" | "plan";
  verify: boolean;
  packName?: string | null;
  effort?: string | null;
  workdir?: string | null;
  askUser?: boolean;
  contextTokenLimit?: number | null;
  rubric?: string | null;
}

/** state 游标 + 谱系账 → Web 认得的 meta.checkpoint；缺任一端则 null。 */
export function cliMetaCheckpoint(state: DurableRunState): ArchivedCheckpoint | null {
  if (!state.checkpoint || !state.budget) return null;
  return {
    segmentIndex: state.checkpoint.segmentIndex,
    conversationTurn: Math.max(1, state.checkpoint.segmentIndex + 1),
    contextInputTokens: state.checkpoint.contextInputTokens,
    runBudget: snapshotDurableBudget(state.budget),
  };
}

/** 续跑时接着已有 events.jsonl 的最大 seq，不从 0 重开（否则撞号）。 */
export function nextArchiveEventSeq(dir: string): number {
  try {
    if (!existsSync(join(dir, "events.jsonl"))) return 0;
    const raw = readFileSync(join(dir, "events.jsonl"), "utf8");
    let max = -1;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { seq?: unknown };
        if (typeof row.seq === "number" && Number.isFinite(row.seq) && row.seq > max) {
          max = row.seq;
        }
      } catch {
        // 坏行跳过；用已解析到的最大 seq 接着写
      }
    }
    return max + 1;
  } catch {
    return 0;
  }
}

export function readCliArchiveTask(dir: string): string {
  const task = readExistingMeta(dir)?.task;
  return typeof task === "string" ? task.trim() : "";
}

function readExistingMeta(dir: string): ArchivedMeta | null {
  try {
    if (!existsSync(join(dir, "meta.json"))) return null;
    const raw = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1 || typeof o.runId !== "string" || o.runId === "") return null;
    if (o.status !== "running" && o.status !== "done") return null;
    return raw as ArchivedMeta;
  } catch {
    return null;
  }
}

function initialCliMeta(opts: {
  runId: string;
  createdAt: number;
  archive?: CliArchiveInfo;
  existing?: ArchivedMeta | null;
  state: DurableRunState;
}): ArchivedMeta {
  const prev = opts.existing;
  const archive = opts.archive;
  const mode =
    archive?.mode ??
    prev?.mode ??
    (opts.state.plan && opts.state.plan.taskIds.length > 0 ? "plan" : "single");
  return {
    version: 1,
    runId: opts.runId,
    task: archive?.task || prev?.task || "",
    status: "running",
    verify: archive?.verify ?? prev?.verify ?? false,
    createdAt: prev?.createdAt ?? opts.createdAt,
    finishedAt: null,
    packName: archive?.packName ?? prev?.packName ?? null,
    mode,
    effort: archive?.effort ?? prev?.effort ?? null,
    rubric: archive?.rubric ?? prev?.rubric ?? null,
    workdir: archive?.workdir ?? prev?.workdir ?? null,
    conversationTurn: prev?.conversationTurn && prev.conversationTurn >= 1 ? prev.conversationTurn : 1,
    planGate: prev?.planGate ?? false,
    planDecision: prev?.planDecision ?? null,
    mainStopReason: null,
    askUser: archive?.askUser ?? prev?.askUser ?? false,
    contextTokenLimit: archive?.contextTokenLimit ?? prev?.contextTokenLimit ?? null,
    checkpoint: cliMetaCheckpoint(opts.state),
    host: "cli",
    continuedFrom: prev?.continuedFrom ?? opts.state.continuedFrom ?? null,
    rootRunId: prev?.rootRunId ?? opts.state.rootRunId ?? null,
    recap: prev?.recap ?? null,
    outcome: prev?.outcome ?? null,
  };
}

export function cliDurableEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env["AGENT_CLI_DURABLE"]?.trim();
  if (raw === "0" || raw === "false") return false;
  return true;
}

export interface CliDurableHandle {
  runId: string;
  writer: RunHistoryWriter;
  toolTx: ToolTxController;
  getState(): DurableRunState;
  apply(event: RunStateEvent): boolean;
  noteExecutorCheckpoint(input: {
    messages: unknown[];
    contextInputTokens: number;
    budget?: DurableBudgetSnapshot | null;
  }): void;
  persist(): void;
  beginTrace(info: {
    tools?: ReadonlyArray<{ name: string; inputSchema?: unknown }>;
    packName?: string | null;
    model?: string | null;
  }): void;
  noteTrace(source: string, event: TurnEvent): void;
  noteEvent(source: string, event: TurnEvent): void;
  noteHostEvent(event: Record<string, unknown>): void;
  markInterrupted(): void;
  markCompleted(): void;
  markFailed(): void;
  /** 终态口径（走查 U1/H3）：按 stopReason 写真话的 run_end——phase、outcome、原因三处一致。 */
  markEnded(stopReason: string): void;
}

/** run_end 的 outcome 词表（对齐 ui/server.ts 的 RunEndInfo.outcome）。 */
export type CliRunEndOutcome = "completed" | "partial" | "blocked" | "closed" | "rejected" | "error";

/**
 * stopReason → CLI 归档终态（phase 迁移 + run_end outcome）。fail-closed：
 * 未登记的原因不冒充 completed，落 error。
 *
 * 两条口径来源，别按"看着更顺"改：
 * - outcome 镜像 ui/server.ts 的 runOutcomeForStopReason（那份注释就是纪律）；
 * - 相位里只有 error 与 Web 不同（Web 落 failed）：CLI 的同 run 热续
 *   （canSameRunResume）只认 interrupted——"端点挂了→修好→--resume-run"
 *   是同一条链，error 落 failed 会把这条路断掉。真话由 outcome/mainStopReason
 *   承担，消费方读 meta 就能分清"网络错"与"人按停"。
 */
export function cliRunEndForStopReason(reason: string): {
  transition: "complete" | "fail" | "interrupt" | "close";
  outcome: CliRunEndOutcome;
} {
  switch (reason) {
    case "completed":
      return { transition: "complete", outcome: "completed" };
    case "partial":
      return { transition: "complete", outcome: "partial" };
    case "blocked":
      return { transition: "complete", outcome: "blocked" };
    case "aborted":
    case "plan_gate_expired":
      return { transition: "interrupt", outcome: "closed" };
    case "error":
      return { transition: "interrupt", outcome: "error" };
    case "plan_rejected":
      return { transition: "close", outcome: "rejected" };
    default:
      // max_tokens / max_turns / budget_exhausted / incomplete / stalled / refusal…
      // 轮子停了但结果不是"完成"——相位按既有语义落在完成态（热续由各自的门管），
      // outcome 不许再冒充 completed。
      return { transition: "complete", outcome: "error" };
  }
}

const CLI_CRASH_PHASES = new Set([
  "executing",
  "planning",
  "verifying",
  "reworking",
]);

export type CliPlanResumeDecision =
  | { ok: true; state: DurableRunState; nodes: DurablePlanNode[]; kind?: "hot" }
  | { ok: false; reason: string };

/** 读不到热续检查点：停，印原任务/终态，不当新任务重开。 */
export function formatCliResumeStop(input: {
  runId: string;
  reason: string;
  task?: string;
  phase?: string;
}): string {
  const task = input.task?.trim() ? input.task.trim() : "（档案未写任务）";
  const phase = input.phase?.trim() ? input.phase.trim() : "unknown";
  return [
    `不能续跑 ${input.runId}：${input.reason}`,
    `原任务：${task}`,
    `终态：${phase}`,
    "飞行中杀掉不能接着工具。读不到热续检查点会停，不会当新任务重开。",
  ].join("\n");
}

/**
 * CLI 半截 DAG 续跑准入。Ctrl+C / 硬杀常把 phase 留在 executing——
 * 先 interrupt 再套 canSameRunResume（与 Web 崩溃收口同口径）。
 */
export function prepareCliPlanResume(
  state: DurableRunState | null,
  _opts?: { hasTask?: boolean },
): CliPlanResumeDecision {
  if (!state) return { ok: false, reason: "没有 state.json，不能续跑" };
  let current = state;
  if (CLI_CRASH_PHASES.has(current.phase)) {
    const interrupted = transitionRunState(current, { type: "interrupt" });
    if (interrupted) current = interrupted;
  }
  const facts = planResumeFacts(current.plan);
  const budgetExhausted = durableBudgetExhausted(current.budget);
  if (
    canRestorePlanGate({
      phase: current.phase,
      plan: current.plan,
      budgetExhausted,
    })
  ) {
    return {
      ok: false,
      reason:
        "计划门未批，同 run 仍停在确认门上。请用 Web 宿主打开该对话批准；CLI --resume-run 不会替你签字。",
    };
  }
  const allowed = canSameRunResume({
    phase: current.phase,
    hasCheckpoint: false,
    verify: true,
    mode: "plan",
    budgetExhausted,
    plan: facts,
  });
  if (allowed) return { ok: true, state: current, nodes: current.plan?.nodes ?? [], kind: "hot" };
  return { ok: false, reason: explainCliPlanResumeRefusal(current) };
}

export type CliSingleResumeDecision =
  | { ok: true; state: DurableRunState; kind?: "hot" }
  | { ok: false; reason: string };

/**
 * CLI 单执行者同 run 热恢复准入。
 * 须已提交 main 检查点 + 正史；飞行中崩溃 / --verify / 编排档案都拒。
 */
export function prepareCliSingleResume(
  state: DurableRunState | null,
  opts: { hasHistory: boolean; verify?: boolean; hasTask?: boolean },
): CliSingleResumeDecision {
  if (!state) return { ok: false, reason: "没有 state.json，不能续跑" };
  if (opts.verify) return { ok: false, reason: "同 run 热恢复不接 --verify" };
  if (state.plan && state.plan.taskIds.length > 0) {
    return { ok: false, reason: "这是编排档案，请加 --plan" };
  }
  let current = state;
  if (CLI_CRASH_PHASES.has(current.phase)) {
    const interrupted = transitionRunState(current, { type: "interrupt" });
    if (interrupted) current = interrupted;
  }
  const hasCheckpoint = Boolean(current.checkpoint) && opts.hasHistory;
  const budgetExhausted = durableBudgetExhausted(current.budget);
  const allowed = canSameRunResume({
    phase: current.phase,
    hasCheckpoint,
    verify: false,
    mode: "single",
    budgetExhausted,
  });
  if (allowed) return { ok: true, state: current, kind: "hot" };
  return { ok: false, reason: explainCliSingleResumeRefusal(current, hasCheckpoint) };
}

function explainCliBudgetRefusal(state: DurableRunState): string | null {
  if (!durableBudgetExhausted(state.budget)) return null;
  const b = state.budget!;
  if (b.maxTurns !== undefined && b.usedTurns >= b.maxTurns) {
    return (
      `执行谱系轮次预算已用尽（${b.usedTurns}/${b.maxTurns}）。` +
      "已完成的写入不会回滚。抬 AGENT_TOTAL_MAX_TURNS 后请新开，不要 --resume-run"
    );
  }
  return (
    `执行谱系 token 预算已用尽（${b.usedTokens}/${b.maxTokens}）。` +
    "已完成的写入不会回滚。抬 AGENT_TOTAL_TOKEN_BUDGET 后请新开，不要 --resume-run"
  );
}

export function explainCliPlanResumeRefusal(state: DurableRunState): string {
  if (state.phase === "plan_gated") {
    return "计划门未批，同 run 仍停在确认门上。请用 Web 宿主打开该对话批准；CLI --resume-run 不会替你签字。";
  }
  if (state.phase === "completed" || state.phase === "failed" || state.phase === "closed") {
    return `终态 ${state.phase} 不能同 run 热续 DAG`;
  }
  const budget = explainCliBudgetRefusal(state);
  if (budget) return budget;
  const facts = planResumeFacts(state.plan);
  if (!facts) return "没有已批准的计划快照";
  if (!facts.hasPassedNode) {
    return "零进度（没有 passed 节点）不能接着半截 DAG";
  }
  if (facts.hasFailedNode) return "已有 failed 节点，不能同 run 续跑";
  if (!facts.hasRemainingNode) return "没有剩余的 pending/running 节点";
  return "不满足半截 DAG 续跑条件";
}

export function explainCliSingleResumeRefusal(
  state: DurableRunState,
  hasCheckpoint: boolean,
): string {
  if (state.phase === "completed" || state.phase === "failed" || state.phase === "closed") {
    return `终态 ${state.phase} 没有可热续的检查点`;
  }
  const budget = explainCliBudgetRefusal(state);
  if (budget) return budget;
  if (!hasCheckpoint) return "没有已提交的 main 检查点（飞行中崩溃不能热续）";
  return "不满足单执行者同 run 热续条件";
}

/** 取最后一段执行者谱系正史；末段形状坏了整份拒（不能偷偷用更早的段）。 */
export function lastExecutorTranscriptMessages(
  segments: unknown[],
): AgentRunResult["messages"] | null {
  if (!Array.isArray(segments)) return null;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const raw = segments[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const seg = raw as { source?: unknown; messages?: unknown };
    if (seg.source !== "main" && seg.source !== "rework") continue;
    if (!Array.isArray(seg.messages) || seg.messages.length === 0) continue;
    const out: AgentRunResult["messages"] = [];
    for (const item of seg.messages) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const msg = item as { role?: unknown; content?: unknown };
      if (msg.role !== "user" && msg.role !== "assistant") return null;
      if (!("content" in msg)) return null;
      out.push({ role: msg.role, content: msg.content } as AgentRunResult["messages"][number]);
    }
    return out;
  }
  return null;
}

export function createCliDurable(opts: {
  runId: string;
  cwd?: string;
  historyRoot?: string;
  /** 打开已有档案（续跑）；不发 start */
  existing?: DurableRunState;
  /** 列表用 meta.json；缺省也能写出合法形状 */
  archive?: CliArchiveInfo;
}): CliDurableHandle {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const root = opts.historyRoot
    ? resolve(opts.historyRoot)
    : resolve(cwd, ".agent-run-history");
  const dir = join(root, opts.runId);
  const writer = new RunHistoryWriter(dir);
  let state: DurableRunState;
  if (opts.existing) {
    state = opts.existing;
  } else {
    state = initialRunState(opts.runId);
    const started = transitionRunState(state, { type: "start" });
    if (started) state = started;
  }

  const store = new Map<string, DurableToolTx>();
  for (const tx of state.toolTx) store.set(tx.idempotencyKey, tx);
  const toolTx: ToolTxController = {
    runId: opts.runId,
    get(key) {
      return store.get(key);
    },
    async notify(_phase, tx) {
      store.set(tx.idempotencyKey, tx);
      const next = transitionRunState(state, { type: "tool_tx", tx });
      if (next) state = next;
      else {
        state = {
          ...state,
          updatedAt: Date.now(),
          toolTx: upsertToolTx(state.toolTx, tx),
        };
      }
      writer.writeState(state);
    },
  };

  writer.writeState(state);

  let meta = initialCliMeta({
    runId: opts.runId,
    createdAt: Date.now(),
    archive: opts.archive,
    existing: readExistingMeta(dir),
    state,
  });
  writer.writeMeta(meta);

  function flushMeta(patch: Partial<ArchivedMeta> = {}): void {
    const checkpoint = cliMetaCheckpoint(state) ?? (patch.checkpoint !== undefined ? patch.checkpoint : meta.checkpoint) ?? null;
    meta = {
      ...meta,
      ...patch,
      checkpoint,
      conversationTurn: checkpoint?.conversationTurn ?? meta.conversationTurn,
    };
    writer.writeMeta(meta);
  }

  let eventSeq = nextArchiveEventSeq(dir);
  let archiveSegmentIndex = state.checkpoint ? state.checkpoint.segmentIndex + 1 : 0;

  function appendHostEnd(outcome: CliRunEndOutcome, mainStopReason: string): void {
    const finishedAt = Date.now();
    writer.appendEvent({
      seq: eventSeq++,
      source: "host",
      ts: finishedAt,
      event: {
        type: "run_end",
        outcome,
        mainStopReason,
        finishedAt,
        host: "cli",
      },
    });
    flushMeta({
      status: "done",
      finishedAt,
      mainStopReason,
    });
  }

  const openTools = new Map<string, TraceSpan>();
  const openModels = new Map<string, TraceSpan>();
  let rootSpan: TraceSpan | null = null;

  function closeTrace(status: "ok" | "error"): void {
    if (!rootSpan) return;
    writer.appendTraceSpan(endSpan(rootSpan, status));
    rootSpan = null;
  }

  return {
    runId: opts.runId,
    writer,
    toolTx,
    getState: () => state,
    apply(event) {
      const next = transitionRunState(state, event);
      if (!next) return false;
      state = next;
      writer.writeState(state);
      return true;
    },
    noteExecutorCheckpoint(input) {
      const index = (state.checkpoint?.segmentIndex ?? -1) + 1;
      writer.appendTranscriptSegment({
        index,
        source: "main",
        messages: input.messages,
      });
      if (input.budget) {
        const nextBudget = transitionRunState(state, {
          type: "budget_snapshot",
          budget: snapshotDurableBudget(input.budget),
        });
        if (nextBudget) {
          state = nextBudget;
          writer.writeState(state);
        }
      }
      const next = transitionRunState(state, {
        type: "executor_checkpoint",
        checkpoint: { segmentIndex: index, contextInputTokens: input.contextInputTokens },
      });
      if (!next) return;
      state = next;
      writer.writeState(state);
      flushMeta();
    },
    persist() {
      writer.writeState(state);
    },
    beginTrace(info) {
      if (rootSpan) return;
      try {
        rootSpan = startSpan({
          kind: "run",
          name: "cli_run",
          runId: opts.runId,
          attrs: {
            harnessVersion: CLI_VERSION,
            gitCommit: resolveGitCommit(),
            packName: info.packName ?? null,
            model: info.model ?? null,
            toolSchemaHash: info.tools ? hashToolSchemas(info.tools) : null,
            host: "cli",
          },
        });
        writer.appendTraceSpan(rootSpan);
      } catch {
        rootSpan = null;
      }
    },
    noteTrace(source, event) {
      if (!rootSpan) return;
      try {
        const spans = projectTurnEventToSpans({
          runId: opts.runId,
          source,
          event,
          parentSpanId: rootSpan.spanId,
          openTools,
          openModels,
        });
        for (const span of spans) writer.appendTraceSpan(span);
      } catch {
        // 仪器纪律：trace 投影失败不得影响执行
      }
    },
    noteEvent(source, event) {
      if (isEphemeralTurnEvent(event)) return;
      const payload = serializeTurnEventForArchive(source, event, archiveSegmentIndex);
      writer.appendEvent({
        seq: eventSeq++,
        source,
        ts: Date.now(),
        event: payload,
      });
      if (event.type === "done") archiveSegmentIndex += 1;
    },
    noteHostEvent(event) {
      if (!event || typeof event.type !== "string" || event.type === "") return;
      writer.appendEvent({
        seq: eventSeq++,
        source: "host",
        ts: Date.now(),
        event,
      });
    },
    markInterrupted() {
      const next = transitionRunState(state, { type: "interrupt" });
      if (next) state = next;
      writer.writeState(state);
      appendHostEnd("closed", "aborted");
      closeTrace("error");
    },
    markCompleted() {
      const next = transitionRunState(state, { type: "complete" });
      if (next) state = next;
      writer.writeState(state);
      appendHostEnd("completed", "completed");
      closeTrace("ok");
    },
    markFailed() {
      const next = transitionRunState(state, { type: "fail" });
      if (next) state = next;
      writer.writeState(state);
      appendHostEnd("error", "error");
      closeTrace("error");
    },
    markEnded(stopReason) {
      const { transition, outcome } = cliRunEndForStopReason(stopReason);
      const next = transitionRunState(state, { type: transition });
      if (next) state = next;
      writer.writeState(state);
      appendHostEnd(outcome, stopReason);
      // 正常交付三档（completed/partial/blocked）收 ok；closed（人工停止等）与 error 仍记 error
      closeTrace(outcome === "completed" || outcome === "partial" || outcome === "blocked" ? "ok" : "error");
    },
  };
}

/** 确保历史根存在（CLI 启动时调用一次）。 */
export async function ensureCliHistoryRoot(cwd = process.cwd()): Promise<string> {
  const root = resolve(cwd, ".agent-run-history");
  await mkdir(root, { recursive: true });
  return root;
}

/**
 * 僵尸档案收殓（2026-09-18 走查 F4-B）：硬杀/断电过的 run 在盘上永远
 * status=running、phase=executing——堆积、且任何直读档案的工具都被骗。
 * 收殓**只看「可证已死」**：同机 + owner pid 不在（见 archiveOwnerLiveness）。
 * 并行 CLI 的活档案、他机的共享目录、无章老档案一律不碰（fail-safe：只漏收，
 * 不误收）。返回被收殓的 runId，调用方决定要不要打印。
 */
export async function reconcileCliHistoryRoot(
  root: string,
  deps: { host: string; alive: (pid: number) => boolean } = {
    host: hostname(),
    alive: pidIsAlive,
  },
): Promise<string[]> {
  const reaped: string[] = [];
  let metas: Awaited<ReturnType<typeof loadArchivedMetas>>;
  try {
    metas = await loadArchivedMetas(root);
  } catch {
    return reaped; // 档案目录不可读：不阻断启动
  }
  for (const a of metas) {
    if (a.meta.status !== "running") continue;
    if (archiveOwnerLiveness(a.meta, deps) !== "self-dead") continue;
    try {
      await reapDeadArchive(a.dir, a.meta);
      reaped.push(a.meta.runId);
    } catch {
      // 单条收殓失败不阻断启动；下次启动再来
    }
  }
  return reaped;
}

/**
 * 把一条「确死」档案收成终态：state 按 ADR 表迁移、meta 落 done/aborted、
 * events.jsonl 补一条 run_end——与信号中断（markInterrupted）同形，
 * 口径是"被中断"，不是"跑完了"。
 */
async function reapDeadArchive(dir: string, meta: ArchivedMeta): Promise<void> {
  const writer = new RunHistoryWriter(dir, () => {});
  const at = Date.now();
  const state = await readArchivedState(dir);
  if (state) writer.writeState(recoverDurableStateOnCrash(state, at));
  writer.writeMeta({ ...meta, status: "done", finishedAt: at, mainStopReason: "aborted" });
  writer.appendEvent({
    seq: nextArchiveEventSeq(dir),
    source: "host",
    ts: at,
    event: {
      type: "run_end",
      outcome: "closed",
      mainStopReason: "aborted",
      finishedAt: at,
      host: "cli",
    },
  });
  await writer.flush();
}
