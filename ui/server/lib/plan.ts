/**
 * 运行结局与计划：stop reason → outcome、计划门结局、计划节点 / 摘要的组装。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import type { PlanNodeState, SubTask } from "../../../src/planner.js";
import type { RunEndInfo } from "./run-types.js";

/**
 * outcome 值域的唯一事实源（B1 的教训：同一枚举写两处必漂移）。
 * RunEndInfo.outcome 从这里派生；/metrics 按它逐值输出 outcome 标签——
 * 新增一个 outcome 值时这里不加，赋值处直接类型报错，指标不会静默漏一档。
 */
export const RUN_OUTCOMES = ["completed", "partial", "blocked", "error", "closed", "rejected"] as const;

/** 计划被否决的哨兵——不是错误，是决定，所以要与 error 路径区分开 */
export class PlanRejectedError extends Error {
  constructor(readonly cause_: "rejected" | "expired" | "stopped") {
    super(
      cause_ === "rejected"
        ? "计划被委托方否决"
        : cause_ === "stopped"
          ? "委托方已停止这次运行"
          : "计划确认门未应答即结束",
    );
    this.name = "PlanRejectedError";
  }
}

/**
 * 计划门两种收场的 stopReason：否决与未应答必须分开——没人拒绝过的计划
 * 不能写成"未获批准"（把宿主收尾说成委托方的决定，V-04 同族）。
 * 提成纯函数是因为 expired 的唯一触发路径是宿主关停：SSE 已断、HTTP 已关，
 * 集成测试观测不到那条缓冲事件，只能在这一层钉住映射（B2 落盘后它会浮出水面）。
 */
export function planGateStopReason(
  cause: "rejected" | "expired" | "stopped",
): "plan_rejected" | "plan_gate_expired" | "aborted" {
  if (cause === "expired") return "plan_gate_expired";
  if (cause === "stopped") return "aborted";
  return "plan_rejected";
}

/**
 * stopReason → run 级结果必须 fail-closed。只有明确的 completed 才能标绿；新增
 * stopReason 若尚未在这里分类，会安全地落到 error，而不是被默认冒充完成。
 */
export function runOutcomeForStopReason(reason?: string): RunEndInfo["outcome"] {
  switch (reason) {
    case "completed":
      return "completed";
    case "partial":
      return "partial";
    case "blocked":
      return "blocked";
    case "aborted":
    case "plan_gate_expired":
      return "closed";
    case "plan_rejected":
      return "rejected";
    default:
      return "error";
  }
}

export function evidenceFromVerifiedStep(result: {
  finalPassed: boolean;
  main: { completion?: { summary?: string; artifacts?: string[] } | null };
  verifications: Array<{ verdict?: { summary?: string; issues?: string[] } | null }>;
}): string | undefined {
  const parts: string[] = [];
  const completion = result.main.completion;
  if (completion?.summary) parts.push(completion.summary);
  if (completion?.artifacts?.length) parts.push(`产物：${completion.artifacts.join("、")}`);
  const verdict = result.verifications.at(-1)?.verdict;
  if (verdict?.summary) parts.push(`裁决：${verdict.summary}`);
  if (verdict?.issues?.length) parts.push(`问题：${verdict.issues.join("；")}`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** plan_result 步骤 → PlanNodeState（重规划种子） */
export function planNodesFromOutcome(input: {
  subtasks: SubTask[];
  steps: Array<{
    id: string;
    passed: boolean;
    completion?: { summary?: string; artifacts?: string[] } | null;
    verdict?: { summary?: string; issues?: string[] } | null;
  }>;
  skipped: { id: string }[];
}): { nodes: PlanNodeState[]; handoffs: Record<string, string> } {
  const stepById = new Map(input.steps.map((s) => [s.id, s]));
  const skipped = new Set(input.skipped.map((s) => s.id));
  const handoffs: Record<string, string> = {};
  const nodes: PlanNodeState[] = input.subtasks.map((t) => {
    const st = stepById.get(t.id);
    let status: PlanNodeState["status"] = "pending";
    if (skipped.has(t.id)) status = "skipped";
    else if (st) status = st.passed ? "passed" : "failed";
    const evidenceParts: string[] = [];
    if (st?.completion?.summary) evidenceParts.push(st.completion.summary);
    if (st?.completion?.artifacts?.length) evidenceParts.push(`产物：${st.completion.artifacts.join("、")}`);
    if (st?.verdict?.summary) evidenceParts.push(`裁决：${st.verdict.summary}`);
    if (st?.verdict?.issues?.length) evidenceParts.push(`问题：${st.verdict.issues.join("；")}`);
    const evidenceSummary = evidenceParts.length ? evidenceParts.join(" · ") : undefined;
    if (st?.passed && st.completion?.summary) {
      handoffs[t.id] = st.completion.summary;
    } else if (st?.passed && evidenceSummary) {
      handoffs[t.id] = evidenceSummary;
    }
    return {
      id: t.id,
      title: t.title,
      pack: t.pack ?? null,
      description: t.description,
      acceptance: [...t.acceptance],
      dependsOn: [...t.dependsOn],
      ...(t.resources ? { resources: [...t.resources] } : {}),
      status,
      ...(evidenceSummary ? { evidenceSummary } : {}),
    };
  });
  return { nodes, handoffs };
}

export interface PlanSummarySubtask {
  id: string;
  title?: string;
  pack?: string | null;
  description?: string;
}

export interface PlanSummaryStep {
  id: string;
  title?: string;
  pack?: string | null;
  passed?: boolean;
  reworks?: number;
  stopReason?: string;
  completion?: { summary?: string; artifacts?: string[] } | null;
  verdict?: { passed?: boolean; summary?: string; issues?: string[] } | null;
}

/**
 * 计划编排的对话种子（会话中心化语义 B）。plan run 没有单一执行者正史可续——
 * 续的是**对话**，不是 DAG：下一轮以这份结构化摘要开局，按单执行者执行。
 * 只放事实（子任务 / 结局 / 交接摘要 / 裁决 / 未执行项），不替执行者下结论。
 * 纯函数：活 run 收尾时与归档重建时共用，两边看到的是同一份文本。
 */
export function buildPlanSummary(input: {
  task: string;
  stopReason?: string | undefined;
  subtasks: PlanSummarySubtask[];
  steps: PlanSummaryStep[];
  skipped: { id: string; title?: string }[];
  completed: boolean;
  plannerFailure?: string | undefined;
}): string {
  const byId = new Map(input.subtasks.map((s) => [s.id, s]));
  const lines: string[] = [
    `【本对话此前是一次计划编排】原任务：${input.task}`,
    `编排结局：${input.completed ? "全部子任务执行并通过核查" : "未全部完成"}` +
      (input.stopReason ? `（终止原因 ${input.stopReason}）` : ""),
  ];
  if (input.plannerFailure) lines.push(`拆解未产出可执行计划：${input.plannerFailure}`);
  if (input.steps.length > 0) {
    lines.push("已执行的子任务：");
    for (const st of input.steps) {
      const sub = byId.get(st.id);
      const title = st.title ?? sub?.title ?? "";
      const pack = st.pack ?? sub?.pack;
      const head =
        `- ${st.id}${title ? ` ${title}` : ""}${pack ? `（包 ${pack}）` : ""}：` +
        `${st.passed ? "核查通过" : "核查未通过"}` +
        `${st.reworks ? ` · 返工 ${st.reworks} 轮` : ""}` +
        `${st.stopReason ? ` · 执行终止 ${st.stopReason}` : ""}`;
      lines.push(head);
      if (st.completion?.summary) lines.push(`  交接摘要：${st.completion.summary}`);
      if (st.completion?.artifacts?.length) lines.push(`  产物：${st.completion.artifacts.join("、")}`);
      if (st.verdict?.summary) lines.push(`  裁决：${st.verdict.summary}`);
      if (st.verdict?.issues?.length) lines.push(`  裁决列出的问题：${st.verdict.issues.join("；")}`);
    }
  }
  if (input.skipped.length > 0) {
    lines.push(`未执行的子任务：${input.skipped.map((s) => `${s.id}${s.title ? ` ${s.title}` : ""}`).join("、")}`);
  }
  lines.push(
    "从本轮起你以单一执行者继续这场对话；上述子任务的产物就在工作目录里，请据实核对后再动手，不要凭摘要臆断。",
  );
  return lines.join("\n");
}
