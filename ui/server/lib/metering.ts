/**
 * token 计量：角色 / 种类词表、本地日键、给模型客户端套计量壳。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import type { ModelClient } from "../../../src/types.js";

/**
 * token 计数的角色与档位全集（与 RUN_OUTCOMES 同款纪律：唯一事实源 +
 * /metrics 稳定序列集）。role 按事件来源归并：verifier（含 sN/verifier）→
 * verification，planner → planner，describe_image 的视觉调用 → vision，
 * 其余（main / 子任务 / clarifier）→ execution。
 */
export const TOKEN_ROLES = ["execution", "verification", "planner", "vision"] as const;

export const TOKEN_KINDS = ["input", "output", "cache_read", "cache_creation"] as const;

/** 本地日界（操作员心智里的"今天"），YYYY-MM-DD。日预算的翻页判据 */
export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 把 ModelClient 包成"每次调用把 usage 交给回调"的版本（评审 2026-08-24
 * real-bug：describe_image 拿到 turn 只取文本，usage 原地丢弃——视觉调用发生
 * 在工具执行内部，不经 done/verification 任何记账路径，带 base64 图片的
 * input 动辄数千上万 token，恰是成本告警要抓的对象，却全程隐形）。
 */
export function meterModelClient(
  client: ModelClient,
  onUsage: (u: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }) => void,
): ModelClient {
  return {
    // 三个参数必须原样透传。此前这里只接 `req`：`onDelta` 被吞掉等于 Web 上
    // 没有流式（直播条与对话末尾的实时段全空），`signal` 被吞掉等于停止按钮
    // 掐不掉在飞的那个请求——ModelClient 的签名注释里写得很清楚"没有它，
    // 停止就只是句空话"。装饰器最容易犯的错就是收窄被装饰者的契约。
    send: async (req, onDelta, signal) => {
      const turn = await client.send(req, onDelta, signal);
      onUsage({
        inputTokens: turn.usage.input_tokens,
        outputTokens: turn.usage.output_tokens,
        cacheReadTokens: turn.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: turn.usage.cache_creation_input_tokens ?? 0,
      });
      return turn;
    },
  };
}
