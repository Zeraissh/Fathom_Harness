/**
 * 审批：输入规范化与指纹、授权常量、重放标注、来源判定。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { createHash } from "node:crypto";
import type { Tool } from "../../../src/types.js";
import type { Verdict } from "../../../src/verifier.js";

export const APPROVAL_CANONICALIZATION_VERSION = 1 as const;

export const APPROVAL_GRANT_POLICY_VERSION = 1 as const;

export const DEFAULT_APPROVAL_GRANT_TTL_MS = 15 * 60_000;

export const MAX_APPROVAL_GRANT_TTL_MS = 60 * 60_000;

export const DEFAULT_APPROVAL_GRANT_MAX_USES = 5;

export const MAX_APPROVAL_GRANT_MAX_USES = 100;

export const MAX_APPROVAL_GRANTS_PER_RUN = 100;

/** 审批唯一键：同一 toolUseId 在返工轮再次出现时，靠 requestSeq 区分 */
export function approvalId(toolUseId: string, requestSeq: number): string {
  return `${toolUseId}#${requestSeq}`;
}

/**
 * 递归规范化 JSON：对象键逐层排序，数组顺序保持不变。
 *
 * 先走一次原生 JSON 序列化/解析，是为了继承 JSON 对 undefined、稀疏数组、
 * -0 等边界的既有语义；循环引用、BigInt 等非 JSON 输入继续抛错并 fail closed。
 * 工具输入来自模型 JSON 协议，正常路径不会包含这些非 JSON 值。
 */
export function canonicalizeApprovalInput(input: unknown): string {
  const json = JSON.stringify(input);
  if (json === undefined) throw new TypeError("Approval input must be JSON-serializable");
  const normalized = JSON.parse(json) as unknown;

  const encode = (value: unknown): string => {
    if (value === null || typeof value !== "object") {
      const primitive = JSON.stringify(value);
      if (primitive === undefined) throw new TypeError("Approval input must contain JSON values only");
      return primitive;
    }
    if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
      .join(",")}}`;
  };

  return encode(normalized);
}

/** 审计字段只哈希输入；运行期规则键另行绑定工具名，避免同参数跨工具串权。 */
export function approvalInputHash(input: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeApprovalInput(input)).digest("hex")}`;
}

/** 长度前缀避免工具名与 hash 的字符串拼接出现边界歧义。 */
export function exactInputApprovalKey(name: string, inputHash: string): string {
  return `${name.length}:${name}:${inputHash}`;
}

/**
 * SSE 重放时：档案里还没标 autoResolved 的 request，只要后面已有
 * resolved/expired，就在出站帧上补上。客户端即使被 500ms 超时切批，
 * 也不会先画出一张已决的幽灵卡。不回写 run.events。
 */
export function annotateApprovalReplay<T extends { seq: number; event: Record<string, unknown> }>(
  events: readonly T[],
): T[] {
  const resolved = new Map<string, Record<string, unknown>>();
  const byTool = new Map<string, Record<string, unknown>[]>();
  for (const item of events) {
    const ev = item.event;
    if (ev.type !== "approval_resolved" && ev.type !== "approval_expired") continue;
    const toolUseId = String(ev.toolUseId ?? "");
    if (!toolUseId) continue;
    const requestSeq = Number(ev.requestSeq);
    if (Number.isFinite(requestSeq)) resolved.set(`${toolUseId}#${requestSeq}`, ev);
    else {
      const list = byTool.get(toolUseId) ?? [];
      list.push(ev);
      byTool.set(toolUseId, list);
    }
  }
  if (resolved.size === 0 && byTool.size === 0) return events.slice();
  return events.map((item) => {
    const ev = item.event;
    if (ev.type !== "approval_request" || ev.autoResolved === true) return item;
    const toolUseId = String(ev.toolUseId ?? "");
    const exact = resolved.get(`${toolUseId}#${item.seq}`);
    const fallback = byTool.get(toolUseId);
    const hit = exact ?? (fallback?.length === 1 ? fallback[0] : undefined);
    if (!hit) return item;
    return {
      ...item,
      event: {
        ...ev,
        autoResolved: true,
        decision: hit.type === "approval_expired" ? "deny" : (hit.decision ?? "allow"),
        actor: hit.actor,
        ...(hit.type === "approval_expired" ? { expired: true } : {}),
      },
    };
  });
}

/** 工具定义变化后旧 grant 必须失效；摘要不包含 execute 函数或任何 secret。 */
export function approvalToolFingerprint(tool: Tool): string {
  const definition = canonicalizeApprovalInput({
    policyVersion: APPROVAL_GRANT_POLICY_VERSION,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    permission: tool.permission,
    parallelSafe: tool.parallelSafe,
    approvalPolicy: tool.approvalPolicy ?? { maxScope: "once" },
  });
  return `sha256:${createHash("sha256").update(definition).digest("hex")}`;
}

/**
 * verifier 来源判定。写成前缀/后缀两用是为并行编排预留——那里的来源形如
 * "s1/verifier"，若只比对字面量 "verifier"，子任务的 verifier 审批会被
 * 错误地挂进待办表，而它内部已自答 → 双响。
 */
export function isVerifierSource(source: string): boolean {
  return source === "verifier" || source.endsWith("/verifier");
}

/**
 * 执行者谱系（会话中心化的核心概念）：main 与 rework 段——含续跑段，它们也以
 * main 发出——构成**对话**；verifier / planner / 计划子任务（sN/…）不属于对话。
 * 会话正史与检查点只从这些段捕获：返工段的正史此前根本没被记，返工后再续跑
 * 接的是陈旧正史。
 */
export function isExecutorLineageSource(source: string): boolean {
  return source === "main" || source === "rework";
}

/**
 * meta.json 里的裁决是落盘再读回的 unknown（restoreArchivedRuns 只做了类型断言）。
 * 拿它给执行者写摘要之前先验形状：坏档案该让派生少一段话，不该炸掉派生本身。
 */
export function isVerdictShape(value: unknown): value is Verdict {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.passed === "boolean" && typeof v.summary === "string" && Array.isArray(v.issues);
}

/** planner/verifier 都在各自 drain 循环里自答 deny；宿主不得抢答或为其建 grant。 */
export function isInternallyResolvedApprovalSource(source: string): boolean {
  return isVerifierSource(source) || source === "planner" || source.endsWith("/planner");
}
