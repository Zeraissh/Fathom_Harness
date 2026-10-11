/**
 * 共享运行预算：恢复、耗尽判定、自动 / 手动续额。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { type ArchivedCheckpoint } from "../../history.js";
import type { AgentConfig, SharedRunBudget } from "../../../src/types.js";

export function stricterLimit(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/** 重启不能成为放宽旧上限或绕过当前宿主新上限的办法。 */
export function restoredBudget(
  checkpoint: ArchivedCheckpoint,
  current: Pick<AgentConfig, "maxTotalTurns" | "maxTokensBudget">,
): SharedRunBudget {
  // 检查点里的旧上限必须跟着档案走——重启宿主（甚至不再配 env）不能洗掉旧账。
  // 旧上限不再是死路：用尽后发送会自动续一段跑道（autoExtendIfExhausted）。
  const maxTurns = stricterLimit(checkpoint.runBudget.maxTurns, current.maxTotalTurns);
  const maxTokens = stricterLimit(checkpoint.runBudget.maxTokens, current.maxTokensBudget);
  return {
    ...(maxTurns !== undefined ? { maxTurns } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    usedTurns: checkpoint.runBudget.usedTurns,
    usedTokens: checkpoint.runBudget.usedTokens,
  };
}

/**
 * 预算耗尽是会话唯一会被挡住的结构性原因，所以文案必须说清**哪个预算、怎么提**：
 * 只报"用尽"等于把人晾在那里。
 *
 * 2026-09-04：主路径改成「追加预算 / 同目录新开对话」——要求改 env 并重启宿主
 * 对长任务太狠（委托方截图：594k/500k 卡死、只能另起或重启）。env 名仍写出，
 * 但是作为**抬默认上限**的后手，不是当场续跑的唯一办法。
 */
export function exhaustedBudgetReason(budget: SharedRunBudget): string | null {
  if (budget.maxTurns !== undefined && budget.usedTurns >= budget.maxTurns) {
    return (
      `执行谱系的总轮次预算已用尽（${budget.usedTurns}/${budget.maxTurns}）。` +
      "已完成的写入不会回滚。要继续这场对话请点「追加预算」后再发指令；" +
      "或「新建对话」在同一工作目录开新会话（产物还在）。" +
      "若希望默认上限更高，设置 AGENT_TOTAL_MAX_TURNS 后重启宿主"
    );
  }
  if (budget.maxTokens !== undefined && budget.usedTokens >= budget.maxTokens) {
    return (
      `执行谱系的总 token 预算已用尽（${budget.usedTokens}/${budget.maxTokens}）。` +
      "已完成的写入不会回滚。要继续这场对话请点「追加预算」后再发指令；" +
      "或「新建对话」在同一工作目录开新会话（产物还在）。" +
      "若希望默认上限更高，设置 AGENT_TOTAL_TOKEN_BUDGET 后重启宿主"
    );
  }
  return null;
}

/**
 * 给执行谱系**当场**加一段跑道：新上限 = 已用量 + 追加量。
 * 这样无论当前 max 是否已被 used 超过，追加后一定解除 exhaustedBudgetReason。
 * 纯函数——服务端接线与单测共用。
 */
/**
 * 续跑时若谱系额度已尽，当场续一段跑道再放行——不要把「发下一条」变成
 * 先点「追加预算」的两步手续。日预算门仍是跨 run 总闸，这里只解会话卡死。
 */
export function autoExtendIfExhausted(
  budget: SharedRunBudget,
  defaults: { addTokens: number; addTurns: number },
): { budget: SharedRunBudget; extended: boolean } {
  const tokenOut = budget.maxTokens !== undefined && budget.usedTokens >= budget.maxTokens;
  const turnOut = budget.maxTurns !== undefined && budget.usedTurns >= budget.maxTurns;
  if (!tokenOut && !turnOut) return { budget, extended: false };
  return {
    budget: extendSharedRunBudget(budget, {
      ...(tokenOut ? { addTokens: defaults.addTokens } : {}),
      ...(turnOut ? { addTurns: defaults.addTurns } : {}),
    }),
    extended: true,
  };
}

export function extendSharedRunBudget(
  budget: SharedRunBudget,
  opts: { addTokens?: number; addTurns?: number },
): SharedRunBudget {
  const next: SharedRunBudget = {
    usedTurns: budget.usedTurns,
    usedTokens: budget.usedTokens,
    ...(budget.maxTurns !== undefined ? { maxTurns: budget.maxTurns } : {}),
    ...(budget.maxTokens !== undefined ? { maxTokens: budget.maxTokens } : {}),
  };
  const addTokens = opts.addTokens ?? 0;
  const addTurns = opts.addTurns ?? 0;
  if (addTokens > 0) {
    next.maxTokens = next.usedTokens + addTokens;
  }
  if (addTurns > 0) {
    next.maxTurns = next.usedTurns + addTurns;
  }
  return next;
}
