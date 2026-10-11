/**
 * 存档读回：把磁盘上的 unknown 形状校验成授权 / 检查点 / 消息历史 / 事件。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import type Anthropic from "@anthropic-ai/sdk";
import { type ArchivedApprovalGrant, type ArchivedCheckpoint } from "../../history.js";
import { serializeTurnEventForArchive } from "../../../src/archive-event.js";
import type { TurnEvent } from "../../../src/types.js";
import {
  APPROVAL_CANONICALIZATION_VERSION,
  APPROVAL_GRANT_POLICY_VERSION,
  MAX_APPROVAL_GRANTS_PER_RUN,
  MAX_APPROVAL_GRANT_MAX_USES,
} from "./approval.js";

export function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export const SHA256_FIELD = /^sha256:[0-9a-f]{64}$/;

/** meta/checkpoint 是外部输入；坏 grant 逐条丢弃，绝不影响普通会话恢复。 */
export function archivedApprovalGrantFromUnknown(value: unknown): ArchivedApprovalGrant | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (
    raw.version !== 1 ||
    raw.canonicalizationVersion !== APPROVAL_CANONICALIZATION_VERSION ||
    raw.policyVersion !== APPROVAL_GRANT_POLICY_VERSION ||
    typeof raw.grantId !== "string" || raw.grantId.length < 1 || raw.grantId.length > 128 ||
    typeof raw.approvalId !== "string" || raw.approvalId.length < 1 || raw.approvalId.length > 512 ||
    typeof raw.boundRunId !== "string" || raw.boundRunId.length < 1 || raw.boundRunId.length > 128 ||
    raw.scope !== "run" ||
    typeof raw.name !== "string" || raw.name.length < 1 || raw.name.length > 512 ||
    raw.inputScope !== "exact-input" ||
    typeof raw.inputHash !== "string" || !SHA256_FIELD.test(raw.inputHash) ||
    typeof raw.toolFingerprint !== "string" || !SHA256_FIELD.test(raw.toolFingerprint) ||
    !nonNegativeInteger(raw.issuedAt) ||
    !nonNegativeInteger(raw.expiresAt) ||
    raw.expiresAt <= raw.issuedAt ||
    !nonNegativeInteger(raw.maxUses) || raw.maxUses < 1 || raw.maxUses > MAX_APPROVAL_GRANT_MAX_USES ||
    !nonNegativeInteger(raw.usedUses) || raw.usedUses > raw.maxUses
  ) {
    return undefined;
  }
  return {
    version: 1,
    canonicalizationVersion: APPROVAL_CANONICALIZATION_VERSION,
    policyVersion: APPROVAL_GRANT_POLICY_VERSION,
    grantId: raw.grantId,
    approvalId: raw.approvalId,
    boundRunId: raw.boundRunId,
    scope: "run",
    name: raw.name,
    inputScope: "exact-input",
    inputHash: raw.inputHash,
    toolFingerprint: raw.toolFingerprint,
    issuedAt: raw.issuedAt,
    expiresAt: raw.expiresAt,
    maxUses: raw.maxUses,
    usedUses: raw.usedUses,
  };
}

/** meta.json 是可被手工修改的外部输入；恢复前不能只信 TypeScript cast。 */
export function checkpointFromUnknown(value: unknown): ArchivedCheckpoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const budget = raw.runBudget;
  if (!budget || typeof budget !== "object" || Array.isArray(budget)) return undefined;
  const b = budget as Record<string, unknown>;
  if (
    !nonNegativeInteger(raw.segmentIndex) ||
    !nonNegativeInteger(raw.conversationTurn) ||
    raw.conversationTurn < 1 ||
    !nonNegativeInteger(raw.contextInputTokens) ||
    !nonNegativeInteger(b.usedTurns) ||
    !nonNegativeInteger(b.usedTokens) ||
    (b.maxTurns !== undefined && (!nonNegativeInteger(b.maxTurns) || b.maxTurns < 1)) ||
    (b.maxTokens !== undefined && (!nonNegativeInteger(b.maxTokens) || b.maxTokens < 1))
  ) {
    return undefined;
  }
  const approvalGrants = Array.isArray(raw.approvalGrants)
    ? raw.approvalGrants
        .slice(0, MAX_APPROVAL_GRANTS_PER_RUN)
        .map(archivedApprovalGrantFromUnknown)
        .filter((grant): grant is ArchivedApprovalGrant => Boolean(grant))
    : [];
  return {
    segmentIndex: raw.segmentIndex,
    conversationTurn: raw.conversationTurn,
    contextInputTokens: raw.contextInputTokens,
    runBudget: {
      ...(b.maxTurns !== undefined ? { maxTurns: b.maxTurns as number } : {}),
      ...(b.maxTokens !== undefined ? { maxTokens: b.maxTokens as number } : {}),
      usedTurns: b.usedTurns,
      usedTokens: b.usedTokens,
    },
    ...(approvalGrants.length ? { approvalGrants } : {}),
  };
}

export function isMessageHistory(value: unknown): value is Anthropic.MessageParam[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return false;
      const raw = message as Record<string, unknown>;
      if (raw.role !== "user" && raw.role !== "assistant") return false;
      if (typeof raw.content === "string") return true;
      return (
        Array.isArray(raw.content) &&
        raw.content.every(
          (block) =>
            Boolean(block) &&
            typeof block === "object" &&
            !Array.isArray(block) &&
            typeof (block as Record<string, unknown>).type === "string",
        )
      );
    })
  );
}

/** 把 TurnEvent 投影为可序列化对象，approval_request 去掉 respond 回调 */
/** 档案投影与 CLI 共用（delta 不占 seq；done 不带正史）。 */
export function serializeEvent(
  _source: string,
  event: TurnEvent,
  segmentIndex: number,
): Record<string, unknown> {
  return serializeTurnEventForArchive(_source, event, segmentIndex);
}

/**
 * 信息队列的崩溃恢复重建：message_queued(mode:"queue") 追加、
 * message_queue_updated 整表替换（含自动续跑成功后的清空）——重放结束的
 * pending 就是崩溃那一刻仍排队的消息。steer 已注入正史的不可撤，不在此重建。
 */
export function rebuildMessageQueue(events: ReadonlyArray<{ event: unknown }>): string[] {
  const pending: string[] = [];
  for (const e of events) {
    const ev = e.event as { type?: string; mode?: string; text?: unknown; pending?: unknown } | undefined;
    if (ev?.type === "message_queued" && ev.mode === "queue" && typeof ev.text === "string") {
      pending.push(ev.text);
    } else if (ev?.type === "message_queue_updated" && Array.isArray(ev.pending)) {
      pending.length = 0;
      pending.push(...ev.pending.map(String));
    }
  }
  return pending;
}
