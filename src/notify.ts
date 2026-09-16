/**
 * 办公 IM 宿主：出站门禁卡片 + 飞书入站开 run。
 *
 * 出站：看板（project_status）变更，或入站开的 run 收尾，POST 飞书自定义机器人 /
 * 企业微信群机器人 / 通用 JSON webhook。
 *
 * 入站（仅飞书事件订阅）：校验 X-Lark-Signature，把 im.message.receive_v1
 * 里用户 @机器人 的文本变成一次 run（不是机器人自己的回声）。群消息必须
 * 带 mention；私聊文本照收。同一 chat 同时只开一轮，忙则 429。
 * 回写：配了 APP_ID + APP_SECRET 用 tenant_access_token 回同一会话；
 * 没配应用则走原出站 webhook，启动行照实说。密钥不进 stdout。
 * 无 ENCRYPT_KEY 不启入站。飞书云到不了 127.0.0.1：武装入站时启动行
 * 印回调路径 /api/im/feishu 以及「需要公网 HTTPS」。隧道写
 * AGENT_IM_PUBLIC_BASE（可印拼好的回调，不印 encrypt key / webhook /
 * app secret）。签名不因隧道关掉。多维表格 / 审批 / 云文档不是这条切片。
 *
 * 企业微信：本仓只做群机器人出站。个微 / 公众号入站需要调用方自己的 App
 * 凭证与公网回调，这里不伪造、不假装能收私聊。
 *
 * Token / webhook / encrypt key 只活在服务端；sanitize 之后的地址才允许进日志。
 */
import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { ProjectStatus } from "./project-status.js";

export const FEISHU_WEBHOOK_ENV = "AGENT_FEISHU_WEBHOOK";
export const NOTIFY_WEBHOOK_ENV = "AGENT_NOTIFY_WEBHOOK";
export const WECOM_WEBHOOK_ENV = "AGENT_WECOM_WEBHOOK";
export const FEISHU_ENCRYPT_KEY_ENV = "AGENT_FEISHU_ENCRYPT_KEY";
export const FEISHU_VERIFICATION_TOKEN_ENV = "AGENT_FEISHU_VERIFICATION_TOKEN";
export const FEISHU_APP_ID_ENV = "AGENT_FEISHU_APP_ID";
export const FEISHU_APP_SECRET_ENV = "AGENT_FEISHU_APP_SECRET";
/** 可选。群 @ 核对是不是本机器人；不设则有 mention 即开跑（请在开放平台只推 @机器人）。 */
export const FEISHU_BOT_OPEN_ID_ENV = "AGENT_FEISHU_BOT_OPEN_ID";
/** 操作员自己的公网 HTTPS 根（隧道/反代）。只用于启动行拼回调，不启入站。 */
export const IM_PUBLIC_BASE_ENV = "AGENT_IM_PUBLIC_BASE";
export const FEISHU_OPEN_API_BASE = "https://open.feishu.cn";

export const IM_STATUS_PATH = "/api/im";
export const IM_FEISHU_PATH = "/api/im/feishu";
export const IM_WECOM_PATH = "/api/im/wecom";
export const IM_INBOUND_REACH_NOTE = "飞书云到不了 127.0.0.1，需要公网 HTTPS";

export const FEISHU_TIMESTAMP_MAX_SKEW_MS = 60 * 60 * 1000;
const IM_BODY_MAX_BYTES = 256 * 1024;
const SEEN_EVENT_CAP = 200;

export type OfficeNotifyKind = "feishu" | "wecom" | "webhook";

export type GateNotifyPayload = {
  project: string;
  summary: string;
  nextGate: string;
  waiting: string[];
  decisions?: string[];
  runId?: string | null;
  title?: string | null;
};

export type ImRunResultPayload = {
  task: string;
  runId: string;
  status: string;
  stopReason?: string | null;
  summary?: string;
};

export type OfficeNotifyConfig = {
  kind?: OfficeNotifyKind;
  webhookUrl?: string;
  fetchFn?: typeof fetch;
  enabled?: boolean;
};

export type OfficeNotifier = {
  kind: OfficeNotifyKind;
  armed: boolean;
  notify(payload: GateNotifyPayload): Promise<void>;
  notifyText(text: string): Promise<void>;
};

export type OfficeNotifySnapshot = {
  kind: OfficeNotifyKind;
  armed: boolean;
};

/** 飞书自定义机器人接受的 text 体。v1 不绑 interactive card schema。 */
export type FeishuTextBody = {
  msg_type: "text";
  content: { text: string };
};

/** 企业微信群机器人 text 体。不是个微 / 公众号。 */
export type WecomTextBody = {
  msgtype: "text";
  text: { content: string };
};

export type ImHostStatus = {
  feishuOutbound: boolean;
  feishuInbound: boolean;
  /** APP_ID + APP_SECRET 齐了才能用开放平台回同一会话。 */
  feishuAppReply: boolean;
  wecomOutbound: boolean;
  genericOutbound: boolean;
};

export type ImStartRunRequest = {
  task: string;
  source: "feishu";
  messageId?: string;
};

export type ImStartRunFn = (input: ImStartRunRequest) => Promise<{ runId: string }>;
export type ImWaitRunFn = (runId: string) => Promise<ImRunResultPayload>;

export type FeishuAppCredentials = {
  appId: string;
  appSecret: string;
  botOpenId: string;
};

export type FeishuAppReply = {
  armed: boolean;
  sendToChat(input: { chatId: string; text: string }): Promise<void>;
  getBotOpenId(): Promise<string>;
};

export type ImChatGate = {
  tryEnter(chatId: string): boolean;
  leave(chatId: string): void;
};

export type ImInboundAttachOptions = {
  env?: NodeJS.ProcessEnv;
  startRun?: ImStartRunFn;
  waitForRun?: ImWaitRunFn;
  notifier?: OfficeNotifier;
  appReply?: FeishuAppReply;
  chatGate?: ImChatGate;
  botOpenId?: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  seen?: Set<string>;
};

export type FeishuMention = {
  key?: string;
  openId?: string;
  name?: string;
};

export type FeishuInboundParse =
  | { kind: "challenge"; challenge: string }
  | { kind: "message"; task: string; messageId?: string; chatId?: string; chatType?: "p2p" | "group" }
  | { kind: "ignored"; reason: string };

export function resolveOfficeNotifyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OfficeNotifyConfig | null {
  const feishu = env[FEISHU_WEBHOOK_ENV]?.trim() ?? "";
  const wecom = env[WECOM_WEBHOOK_ENV]?.trim() ?? "";
  const generic = env[NOTIFY_WEBHOOK_ENV]?.trim() ?? "";
  if (feishu) return { kind: "feishu", webhookUrl: feishu };
  if (wecom) return { kind: "wecom", webhookUrl: wecom };
  if (generic) return { kind: "webhook", webhookUrl: generic };
  return null;
}

export function resolveFeishuInboundFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { encryptKey: string; verificationToken: string } | null {
  const encryptKey = env[FEISHU_ENCRYPT_KEY_ENV]?.trim() ?? "";
  if (!encryptKey) return null;
  return {
    encryptKey,
    verificationToken: env[FEISHU_VERIFICATION_TOKEN_ENV]?.trim() ?? "",
  };
}

export function resolveFeishuAppFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FeishuAppCredentials | null {
  const appId = env[FEISHU_APP_ID_ENV]?.trim() ?? "";
  const appSecret = env[FEISHU_APP_SECRET_ENV]?.trim() ?? "";
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    botOpenId: env[FEISHU_BOT_OPEN_ID_ENV]?.trim() ?? "",
  };
}

export function resolveImHostStatus(env: NodeJS.ProcessEnv = process.env): ImHostStatus {
  const feishu = Boolean(env[FEISHU_WEBHOOK_ENV]?.trim());
  const wecom = Boolean(env[WECOM_WEBHOOK_ENV]?.trim());
  const generic = Boolean(env[NOTIFY_WEBHOOK_ENV]?.trim());
  return {
    feishuOutbound: feishu,
    feishuInbound: Boolean(resolveFeishuInboundFromEnv(env)),
    feishuAppReply: Boolean(resolveFeishuAppFromEnv(env)),
    wecomOutbound: wecom,
    genericOutbound: generic && !feishu && !wecom,
  };
}

/**
 * 启动行 / CLI 横幅。boolean 旧口径保留：armed →「飞书门禁通知已开」，未开 → undefined。
 * 传入 ImHostStatus 时无配置也诚实写「未开」。永不带 encrypt key / webhook。
 * 入站已武装时附回调路径与「飞书云到不了 127.0.0.1」。可再传入 env 印
 * AGENT_IM_PUBLIC_BASE 拼好的 HTTPS 回调；未配或非法不炸、不印。
 */
export function notifyArmedHint(armed: boolean | ImHostStatus): string | undefined {
  if (typeof armed === "boolean") {
    return armed ? "飞书门禁通知已开" : undefined;
  }
  return formatImHostHint(armed);
}

const BANNED_IM_PUBLIC_BASE = /open\.feishu\.cn\/open-apis\/bot|qyapi\.weixin\.qq\.com|hooks\.slack/i;

/**
 * 读 AGENT_IM_PUBLIC_BASE。空 / 非 https / 带用户信息 / 像出站 webhook → null。
 * 剥 query/hash，避免把误贴的 token 打进启动行。未配不抛。
 */
export function resolveImPublicBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[IM_PUBLIC_BASE_ENV]?.trim() ?? "";
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (BANNED_IM_PUBLIC_BASE.test(url.href)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path === "" || path === "/" ? "" : path}`;
}

/** 把公网根拼成飞书「请求网址」。已带 /api/im/feishu 的不叠。 */
export function formatImPublicCallbackUrl(publicBase: string): string {
  const base = publicBase.replace(/\/+$/, "");
  if (base.endsWith(IM_FEISHU_PATH)) return base;
  return `${base}${IM_FEISHU_PATH}`;
}

/** 入站已武装时的可达性一句。publicBase 可空。 */
export function formatImInboundReachHint(publicBase?: string | null): string {
  const cleaned = publicBase?.trim() ? publicBase.trim() : "";
  if (cleaned) {
    return `回调路径 ${IM_FEISHU_PATH} → ${formatImPublicCallbackUrl(cleaned)}。${IM_INBOUND_REACH_NOTE}`;
  }
  return `回调路径 ${IM_FEISHU_PATH}。${IM_INBOUND_REACH_NOTE}`;
}

export function formatImHostHint(status: ImHostStatus, env?: NodeJS.ProcessEnv): string {
  const bits: string[] = [];
  const webhookReply = status.feishuOutbound || status.genericOutbound;
  if (status.feishuInbound && (webhookReply || status.feishuAppReply)) {
    if (status.feishuAppReply) {
      bits.push(webhookReply
        ? "飞书宿主已开（入站收消息 + 应用回同一会话；看板仍走 webhook）"
        : "飞书宿主已开（入站收消息 + 应用回同一会话）");
    } else {
      bits.push("飞书宿主已开（入站收消息 + 出站 webhook 回结果；未配应用，不能回同一会话）");
    }
  } else if (status.feishuInbound) {
    bits.push("飞书入站已开（出站未配，结果只在本机 UI）");
  } else if (status.feishuOutbound) {
    bits.push("飞书门禁通知已开");
    bits.push("飞书入站未开");
  }
  if (status.wecomOutbound && !status.feishuOutbound) {
    bits.push("企业微信群机器人出站已开");
  } else if (status.wecomOutbound && status.feishuOutbound) {
    bits.push("企业微信群机器人出站已开");
  }
  if (status.genericOutbound && !status.feishuOutbound && !status.wecomOutbound) {
    bits.push("通用 webhook 门禁通知已开");
  }
  if (status.feishuInbound) {
    bits.push(formatImInboundReachHint(env ? resolveImPublicBase(env) : null));
  }
  if (bits.length === 0) return "飞书/微信宿主未开";
  return bits.join("；");
}

/** 启动行入口：status + 可选公网根，一次拼完。 */
export function formatImStartupBanner(env: NodeJS.ProcessEnv = process.env): string {
  return formatImHostHint(resolveImHostStatus(env), env);
}

/**
 * `npm run im:tunnel` 正文。只打印命令，不 spawn cloudflared，不暴露无签名整站。
 * 不接收、不回显 encrypt key / webhook。
 */
export function formatImTunnelInstructions(opts?: {
  port?: number;
  publicBase?: string | null;
}): string {
  const port = Number.isInteger(opts?.port) && (opts?.port ?? 0) >= 1 && (opts?.port ?? 0) <= 65_535
    ? opts!.port!
    : 4173;
  const publicBase = opts?.publicBase?.trim() ? opts.publicBase.trim() : null;
  const callback = publicBase
    ? formatImPublicCallbackUrl(publicBase)
    : `https://<隧道主机>${IM_FEISHU_PATH}`;
  return [
    "飞书入站隧道：只打印命令，不会拉起 cloudflared，也不会裸开整站。",
    `本机回调路径：${IM_FEISHU_PATH}`,
    `${IM_INBOUND_REACH_NOTE}。`,
    "",
    "1. 先在本机起 UI（默认只绑 127.0.0.1）：",
    "   npm run ui",
    "",
    "2. 另开终端，把本机端口映到临时 HTTPS（需已安装 cloudflared）：",
    `   cloudflared tunnel --url http://127.0.0.1:${port}`,
    "",
    "3. 把 cloudflared 印出的 https://xxxx.trycloudflare.com 写入 .env：",
    "   AGENT_IM_PUBLIC_BASE=https://xxxx.trycloudflare.com",
    "   Encrypt Key / webhook 只写 .env，不要贴进终端。",
    "",
    "4. 飞书开放平台 → 事件与回调 → 请求网址：",
    `   ${callback}`,
    "",
    "注意：这条 quick tunnel 会把整个端口暴露到该主机名。",
    `${IM_FEISHU_PATH} 仍校验 X-Lark-Signature，不会因隧道关掉签名。`,
    "UI 页面没有飞书签名。远程访问请设 AGENT_UI_ACCESS_TOKEN（至少 32 字符）。",
    `更好：反代只转发 POST ${IM_FEISHU_PATH}，不要把整站推上网。`,
    "",
  ].join("\n");
}

export function imHostStatusSnapshot(status: ImHostStatus): {
  feishuInbound: boolean;
  feishuOutbound: boolean;
  feishuAppReply: boolean;
  wecomOutbound: boolean;
  wechatPersonalInbound: false;
  note: string;
} {
  const bits: string[] = [];
  if (status.feishuInbound) {
    bits.push("群 @ → 本仓 run → 回消息。多维表格 / 审批 / 云文档要另开、管理员授权。");
  }
  if (status.feishuInbound || status.feishuOutbound || status.wecomOutbound) {
    bits.push("企业微信只做群机器人出站；个微/公众号入站需要你们自己的 App 凭证，本仓不伪造。");
  }
  if (bits.length === 0) bits.push("飞书/微信宿主未开。");
  return {
    feishuInbound: status.feishuInbound,
    feishuOutbound: status.feishuOutbound,
    feishuAppReply: status.feishuAppReply,
    wecomOutbound: status.wecomOutbound,
    wechatPersonalInbound: false,
    note: bits.join(" "),
  };
}

export function gateNotifyPayloadFromBoard(
  status: ProjectStatus | null,
  project = "",
): GateNotifyPayload {
  if (!status) {
    return {
      project,
      summary: "看板已清除",
      nextGate: "",
      waiting: [],
    };
  }
  return {
    project: status.project || project,
    summary: status.summary,
    nextGate: status.nextGate,
    waiting: status.waiting,
    ...(status.decisions.length ? { decisions: status.decisions } : {}),
  };
}

/**
 * 卡片正文。测试锁的是这些字段进了文本，不锁飞书 card JSON 的移动 schema。
 * 谁在等为空时必须印「无」（不是空白、不是「（无）」）。
 */
export function formatGateCardText(payload: GateNotifyPayload): string {
  const waiting = payload.waiting.length ? payload.waiting.join("；") : "无";
  const decisions = payload.decisions?.length ? payload.decisions.join("；") : "无";
  const title = payload.title?.trim();
  const runHint = payload.runId
    ? `打开本 run：${payload.runId}`
    : "打开本机宿主查看该 run";
  return [
    title || "门禁看板",
    `项目：${payload.project}`,
    `摘要：${payload.summary}`,
    `下一门：${payload.nextGate}`,
    `谁在等：${waiting}`,
    `未决：${decisions}`,
    runHint,
  ].join("\n");
}

export function formatFeishuGateCard(payload: GateNotifyPayload): FeishuTextBody {
  return {
    msg_type: "text",
    content: { text: formatGateCardText(payload) },
  };
}

export function formatWecomText(text: string): WecomTextBody {
  return { msgtype: "text", text: { content: text } };
}

export function formatImRunResultText(payload: ImRunResultPayload): string {
  const reason = payload.stopReason?.trim() || "无";
  const summary = payload.summary?.trim() || payload.task;
  return [
    "任务已结束",
    `任务：${payload.task}`,
    `状态：${payload.status}`,
    `终止原因：${reason}`,
    `摘要：${summary}`,
    `打开本 run：${payload.runId}`,
  ].join("\n");
}

export function encodeOfficeNotifyBody(kind: OfficeNotifyKind, text: string): string {
  if (kind === "wecom") return JSON.stringify(formatWecomText(text));
  return JSON.stringify({ msg_type: "text", content: { text } });
}

/**
 * 日志用：剥 query / hash，并把末段 path（hook token）打码。
 * 真实启动横幅不应调用这个去打印地址——armed 时只印「已开 / 未开」。
 */
export function sanitizeNotifyUrlForLog(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "(invalid-notify-url)";
  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts[parts.length - 1] = "***";
      parsed.pathname = `/${parts.join("/")}`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "(invalid-notify-url)";
  }
}

export function officeNotifySnapshot(notifier: Pick<OfficeNotifier, "kind" | "armed">): OfficeNotifySnapshot {
  return { kind: notifier.kind, armed: notifier.armed };
}

export function createOfficeNotifier(opts: OfficeNotifyConfig = {}): OfficeNotifier {
  const webhookUrl = String(opts.webhookUrl ?? "").trim();
  const enabled = opts.enabled !== false && webhookUrl.length > 0;
  const kind: OfficeNotifyKind = opts.kind === "wecom"
    ? "wecom"
    : opts.kind === "webhook"
      ? "webhook"
      : "feishu";
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);

  const postText = async (text: string): Promise<void> => {
    if (!enabled) return;
    await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: encodeOfficeNotifyBody(kind, text),
    });
  };

  return {
    kind,
    armed: enabled,
    async notify(payload: GateNotifyPayload): Promise<void> {
      await postText(formatGateCardText(payload));
    },
    async notifyText(text: string): Promise<void> {
      await postText(text);
    },
  };
}

export function createImChatGate(): ImChatGate {
  const busy = new Set<string>();
  return {
    tryEnter(chatId: string): boolean {
      const key = chatId.trim();
      if (!key) return true;
      if (busy.has(key)) return false;
      busy.add(key);
      return true;
    },
    leave(chatId: string): void {
      const key = chatId.trim();
      if (key) busy.delete(key);
    },
  };
}

/**
 * 用 tenant_access_token 回同一会话。密钥只进这次 POST，不写日志、不进 snapshot。
 * 没配齐 APP_ID/SECRET 时 armed=false，调用空操作。
 */
export function createFeishuAppReply(opts: {
  appId: string;
  appSecret: string;
  botOpenId?: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  apiBase?: string;
}): FeishuAppReply {
  const appId = opts.appId.trim();
  const appSecret = opts.appSecret.trim();
  const armed = appId.length > 0 && appSecret.length > 0;
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  const nowMs = opts.nowMs ?? Date.now;
  const apiBase = (opts.apiBase ?? FEISHU_OPEN_API_BASE).replace(/\/+$/, "");
  let cachedToken: { token: string; expMs: number } | null = null;
  let cachedBotOpenId = opts.botOpenId?.trim() ?? "";

  const getToken = async (): Promise<string> => {
    if (!armed) throw new Error("feishu_app_unarmed");
    if (cachedToken && nowMs() < cachedToken.expMs) return cachedToken.token;
    const res = await fetchFn(`${apiBase}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const json = await res.json() as {
      code?: unknown;
      tenant_access_token?: unknown;
      expire?: unknown;
    };
    if (json.code !== 0 || typeof json.tenant_access_token !== "string" || !json.tenant_access_token) {
      throw new Error("feishu_tenant_token_failed");
    }
    const expireSec = typeof json.expire === "number" && json.expire > 120 ? json.expire : 7200;
    cachedToken = {
      token: json.tenant_access_token,
      expMs: nowMs() + (expireSec - 60) * 1000,
    };
    return cachedToken.token;
  };

  return {
    armed,
    async getBotOpenId(): Promise<string> {
      if (!armed) return "";
      if (cachedBotOpenId) return cachedBotOpenId;
      const token = await getToken();
      const res = await fetchFn(`${apiBase}/open-apis/bot/v3/info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { bot?: { open_id?: unknown } };
      const id = typeof json.bot?.open_id === "string" ? json.bot.open_id.trim() : "";
      if (id) cachedBotOpenId = id;
      return cachedBotOpenId;
    },
    async sendToChat(input: { chatId: string; text: string }): Promise<void> {
      if (!armed) return;
      const chatId = input.chatId.trim();
      if (!chatId || !input.text) return;
      const token = await getToken();
      const res = await fetchFn(`${apiBase}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: input.text }),
        }),
      });
      const json = await res.json() as { code?: unknown };
      if (json.code !== 0) throw new Error("feishu_send_failed");
    },
  };
}

export function feishuSignatureHex(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
): string {
  return createHash("sha256").update(`${timestamp}${nonce}${encryptKey}${body}`).digest("hex");
}

export function verifyFeishuSignature(opts: {
  timestamp: string;
  nonce: string;
  body: string;
  encryptKey: string;
  signature: string;
}): boolean {
  const key = opts.encryptKey.trim();
  const sig = opts.signature.trim();
  if (!key || !sig || !opts.timestamp || !opts.nonce) return false;
  const expected = feishuSignatureHex(opts.timestamp, opts.nonce, key, opts.body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isFeishuTimestampFresh(
  timestamp: string,
  nowMs: number = Date.now(),
  maxSkewMs: number = FEISHU_TIMESTAMP_MAX_SKEW_MS,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const eventMs = ts < 1e12 ? ts * 1000 : ts;
  return Math.abs(nowMs - eventMs) <= maxSkewMs;
}

/**
 * 飞书 Encrypt Key 解密。密文 = Base64(iv[16] + ciphertext)。
 * key 材料 = SHA256(encrypt_key)。解不开返回 null，不抛。
 */
export function decryptFeishuEncrypt(encrypt: string, encryptKey: string): string | null {
  try {
    const key = createHash("sha256").update(encryptKey).digest();
    const buf = Buffer.from(encrypt, "base64");
    if (buf.length < 17) return null;
    const iv = buf.subarray(0, 16);
    const data = buf.subarray(16);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function stripFeishuMentions(text: string): string {
  return text
    .replace(/<at\b[^>]*>[\s\S]*?<\/at>/gi, " ")
    .replace(/@_user_\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function postBodyOf(content: unknown): Record<string, unknown> | null {
  const rec = asRecord(content);
  if (!rec) return null;
  if (Array.isArray(rec.content)) return rec;
  const zh = asRecord(rec.zh_cn);
  if (zh && Array.isArray(zh.content)) return zh;
  return null;
}

/** 开放平台 post 富文本：抽出用户可见字，丢掉 at / 图片。 */
export function extractFeishuPostText(content: unknown): string {
  const parsed = typeof content === "string" ? tryParseJson(content) : content;
  const body = postBodyOf(parsed);
  if (!body) return "";
  const parts: string[] = [];
  if (typeof body.title === "string" && body.title.trim()) parts.push(body.title);
  const rows = body.content;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const item = asRecord(cell);
        if (!item) continue;
        const tag = typeof item.tag === "string" ? item.tag : "";
        if ((tag === "text" || tag === "a") && typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
  }
  return stripFeishuMentions(parts.join(" "));
}

export function collectFeishuAtUserIds(content: unknown): string[] {
  const parsed = typeof content === "string" ? tryParseJson(content) : content;
  const body = postBodyOf(parsed);
  if (!body || !Array.isArray(body.content)) return [];
  const ids: string[] = [];
  for (const row of body.content) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const item = asRecord(cell);
      if (!item || item.tag !== "at") continue;
      if (typeof item.user_id === "string" && item.user_id && item.user_id !== "all") {
        ids.push(item.user_id);
      }
    }
  }
  return ids;
}

export function extractFeishuMessageText(content: unknown): string {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("{")) {
      const parsed = tryParseJson(trimmed);
      const rec = asRecord(parsed);
      if (rec && typeof rec.text === "string") return stripFeishuMentions(rec.text);
      const post = extractFeishuPostText(parsed);
      if (post) return post;
      if (parsed == null) return stripFeishuMentions(trimmed);
      return "";
    }
    return stripFeishuMentions(trimmed);
  }
  if (content && typeof content === "object") {
    const rec = content as { text?: unknown };
    if (typeof rec.text === "string") return stripFeishuMentions(rec.text);
    return extractFeishuPostText(content);
  }
  return "";
}

export function extractFeishuMentions(message: unknown): FeishuMention[] {
  const rec = asRecord(message);
  const raw = rec?.mentions;
  if (!Array.isArray(raw)) return [];
  const out: FeishuMention[] = [];
  for (const item of raw) {
    const mention = asRecord(item);
    if (!mention) continue;
    const id = asRecord(mention.id);
    const openId = typeof id?.open_id === "string"
      ? id.open_id
      : typeof mention.open_id === "string"
        ? mention.open_id
        : "";
    const key = typeof mention.key === "string" ? mention.key : undefined;
    const name = typeof mention.name === "string" ? mention.name : undefined;
    out.push({
      ...(key ? { key } : {}),
      ...(openId ? { openId } : {}),
      ...(name ? { name } : {}),
    });
  }
  return out;
}

/** 群消息：有 botOpenId 必须点名本机器人；否则有 mention / at 标记即可。 */
export function feishuMentionsBot(opts: {
  mentions: FeishuMention[];
  rawText: string;
  postAtUserIds?: string[];
  botOpenId?: string;
}): boolean {
  const bot = opts.botOpenId?.trim() ?? "";
  const atIds = opts.postAtUserIds ?? [];
  if (bot) {
    return opts.mentions.some((m) => m.openId === bot) || atIds.includes(bot);
  }
  if (opts.mentions.length > 0 || atIds.length > 0) return true;
  return /<at\b|@_user_\d+/i.test(opts.rawText);
}

export function parseFeishuInboundEvent(
  raw: unknown,
  opts: { verificationToken?: string; botOpenId?: string } = {},
): FeishuInboundParse {
  const root = asRecord(raw);
  if (!root) return { kind: "ignored", reason: "not_object" };

  if (root.type === "url_verification" && typeof root.challenge === "string") {
    const token = opts.verificationToken?.trim() ?? "";
    if (token && root.token !== token) return { kind: "ignored", reason: "token_mismatch" };
    return { kind: "challenge", challenge: root.challenge };
  }

  const header = asRecord(root.header);
  const expectedToken = opts.verificationToken?.trim() ?? "";
  if (expectedToken) {
    const got = (typeof header?.token === "string" ? header.token : undefined)
      ?? (typeof root.token === "string" ? root.token : undefined);
    if (got !== expectedToken) return { kind: "ignored", reason: "token_mismatch" };
  }

  const eventType = typeof header?.event_type === "string"
    ? header.event_type
    : typeof root.type === "string"
      ? root.type
      : "";
  if (eventType && eventType !== "im.message.receive_v1" && eventType !== "message") {
    return { kind: "ignored", reason: "not_message" };
  }

  const event = asRecord(root.event) ?? root;
  const sender = asRecord(event.sender);
  const senderId = asRecord(sender?.sender_id);
  const senderOpenId = typeof senderId?.open_id === "string" ? senderId.open_id : "";
  const botOpenId = opts.botOpenId?.trim() ?? "";
  if (sender?.sender_type === "app") return { kind: "ignored", reason: "bot_echo" };
  if (botOpenId && senderOpenId && senderOpenId === botOpenId) {
    return { kind: "ignored", reason: "bot_echo" };
  }

  const message = asRecord(event.message) ?? event;
  const messageType = typeof message.message_type === "string"
    ? message.message_type
    : typeof message.msg_type === "string"
      ? message.msg_type
      : "text";
  if (messageType !== "text" && messageType !== "post") {
    return { kind: "ignored", reason: "not_text" };
  }

  const rawContent = message.content ?? message.text;
  const rawText = typeof rawContent === "string"
    ? rawContent
    : rawContent == null
      ? ""
      : JSON.stringify(rawContent);
  const mentions = extractFeishuMentions(message);
  const postAtUserIds = messageType === "post" ? collectFeishuAtUserIds(rawContent) : [];
  const rawChatType = typeof message.chat_type === "string" ? message.chat_type : "";
  const chatType = rawChatType === "group"
    ? "group"
    : rawChatType === "p2p" || rawChatType === "private"
      ? "p2p"
      : undefined;
  if (chatType === "group") {
    if (!feishuMentionsBot({ mentions, rawText, postAtUserIds, botOpenId })) {
      return { kind: "ignored", reason: "not_mentioned" };
    }
  }

  const task = extractFeishuMessageText(rawContent);
  if (!task) return { kind: "ignored", reason: "empty" };

  const messageId = typeof message.message_id === "string"
    ? message.message_id
    : typeof header?.event_id === "string"
      ? header.event_id
      : undefined;
  const chatId = typeof message.chat_id === "string" && message.chat_id
    ? message.chat_id
    : undefined;
  return {
    kind: "message",
    task,
    ...(messageId ? { messageId } : {}),
    ...(chatId ? { chatId } : {}),
    ...(chatType ? { chatType } : {}),
  };
}

export function unwrapFeishuInboundBody(
  rawText: string,
  encryptKey: string,
): { ok: true; value: unknown } | { ok: false; reason: "invalid_json" | "decrypt_failed" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const rec = asRecord(parsed);
  if (rec && typeof rec.encrypt === "string" && !rec.type && !rec.schema && !rec.header && !rec.event) {
    const plain = decryptFeishuEncrypt(rec.encrypt, encryptKey);
    if (plain == null) return { ok: false, reason: "decrypt_failed" };
    try {
      return { ok: true, value: JSON.parse(plain) };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }
  return { ok: true, value: parsed };
}

function headerValue(req: IncomingMessage, name: string): string {
  const raw = req.headers[name.toLowerCase()];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
}

function pathnameOf(url: string | undefined): string {
  const raw = url ?? "";
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

export function isImInboundPath(url: string | undefined): boolean {
  const path = pathnameOf(url);
  return path === IM_STATUS_PATH || path === IM_FEISHU_PATH || path === IM_WECOM_PATH;
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(json);
}

async function deliverImRunResult(opts: {
  text: string;
  chatId?: string;
  appReply?: FeishuAppReply;
  notifier?: OfficeNotifier;
}): Promise<void> {
  if (opts.appReply?.armed && opts.chatId) {
    try {
      await opts.appReply.sendToChat({ chatId: opts.chatId, text: opts.text });
      return;
    } catch {
      /* 应用回写失败再走 webhook；两边都没有则只留本机 UI */
    }
  }
  if (opts.notifier?.armed) {
    await opts.notifier.notifyText(opts.text);
  }
}

function bindImInbound(opts: ImInboundAttachOptions): ImInboundAttachOptions {
  const env = opts.env ?? process.env;
  const creds = resolveFeishuAppFromEnv(env);
  return {
    ...opts,
    env,
    seen: opts.seen ?? new Set<string>(),
    chatGate: opts.chatGate ?? createImChatGate(),
    appReply: opts.appReply ?? (creds
      ? createFeishuAppReply({
          appId: creds.appId,
          appSecret: creds.appSecret,
          botOpenId: creds.botOpenId || undefined,
          fetchFn: opts.fetchFn,
          nowMs: opts.nowMs,
        })
      : undefined),
  };
}

function readIncomingBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function handleImInboundRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ImInboundAttachOptions = {},
): Promise<void> {
  const env = opts.env ?? process.env;
  const path = pathnameOf(req.url);
  const method = (req.method ?? "GET").toUpperCase();
  const status = resolveImHostStatus(env);

  if (path === IM_STATUS_PATH && method === "GET") {
    writeJson(res, 200, imHostStatusSnapshot(status));
    return;
  }

  if (path === IM_WECOM_PATH) {
    writeJson(res, 501, {
      error: "企业微信入站未实现。个微/公众号需要你们自己的 App 凭证，本仓不伪造。出站请配 AGENT_WECOM_WEBHOOK（群机器人）。",
      enabled: false,
    });
    return;
  }

  if (path !== IM_FEISHU_PATH) {
    writeJson(res, 404, { error: "not found" });
    return;
  }

  if (method === "GET") {
    writeJson(res, status.feishuInbound ? 200 : 503, {
      enabled: status.feishuInbound,
      error: status.feishuInbound ? undefined : "飞书入站未开",
    });
    return;
  }

  if (method !== "POST") {
    writeJson(res, 405, { error: "method not allowed" });
    return;
  }

  const inbound = resolveFeishuInboundFromEnv(env);
  if (!inbound) {
    writeJson(res, 503, { error: "飞书入站未开", enabled: false });
    return;
  }

  let body: string;
  try {
    body = await readIncomingBody(req, IM_BODY_MAX_BYTES);
  } catch {
    writeJson(res, 413, { error: "payload too large" });
    return;
  }

  const timestamp = headerValue(req, "x-lark-request-timestamp");
  const nonce = headerValue(req, "x-lark-request-nonce");
  const signature = headerValue(req, "x-lark-signature");
  const nowMs = opts.nowMs?.() ?? Date.now();

  if (!verifyFeishuSignature({
    timestamp,
    nonce,
    body,
    encryptKey: inbound.encryptKey,
    signature,
  })) {
    writeJson(res, 401, { error: "签名无效" });
    return;
  }
  if (!isFeishuTimestampFresh(timestamp, nowMs)) {
    writeJson(res, 401, { error: "签名无效" });
    return;
  }

  const unwrapped = unwrapFeishuInboundBody(body, inbound.encryptKey);
  if (!unwrapped.ok) {
    writeJson(res, 400, { error: "无法解析事件" });
    return;
  }

  let botOpenId = opts.botOpenId?.trim() || env[FEISHU_BOT_OPEN_ID_ENV]?.trim() || "";
  if (!botOpenId && opts.appReply?.armed) {
    try {
      botOpenId = (await opts.appReply.getBotOpenId()).trim();
    } catch {
      botOpenId = "";
    }
  }

  const parsed = parseFeishuInboundEvent(unwrapped.value, {
    verificationToken: inbound.verificationToken,
    botOpenId,
  });

  if (parsed.kind === "challenge") {
    writeJson(res, 200, { challenge: parsed.challenge });
    return;
  }
  if (parsed.kind === "ignored") {
    if (parsed.reason === "token_mismatch") {
      writeJson(res, 401, { error: "事件无效" });
      return;
    }
    writeJson(res, 200, { ok: true, ignored: parsed.reason });
    return;
  }

  const seen = opts.seen;
  if (parsed.messageId && seen?.has(parsed.messageId)) {
    writeJson(res, 200, { ok: true, ignored: "duplicate" });
    return;
  }

  const chatId = parsed.chatId;
  const chatGate = opts.chatGate;
  if (chatId && chatGate && !chatGate.tryEnter(chatId)) {
    writeJson(res, 429, { error: "同一会话上一轮还在跑" }, { "Retry-After": "5" });
    return;
  }

  if (parsed.messageId && seen) {
    seen.add(parsed.messageId);
    if (seen.size > SEEN_EVENT_CAP) {
      const first = seen.values().next().value;
      if (first !== undefined) seen.delete(first);
    }
  }

  const releaseChat = (): void => {
    if (chatId && chatGate) chatGate.leave(chatId);
  };

  if (!opts.startRun) {
    releaseChat();
    writeJson(res, 503, { error: "飞书入站已开但未接线" });
    return;
  }

  let runId: string;
  try {
    const started = await opts.startRun({
      task: parsed.task,
      source: "feishu",
      ...(parsed.messageId ? { messageId: parsed.messageId } : {}),
    });
    runId = started.runId;
  } catch {
    releaseChat();
    writeJson(res, 500, { error: "未能开跑" });
    return;
  }

  writeJson(res, 200, { ok: true, runId });

  const wait = opts.waitForRun;
  if (!wait) {
    releaseChat();
    return;
  }
  void wait(runId)
    .then((result) => deliverImRunResult({
      text: formatImRunResultText(result),
      chatId,
      appReply: opts.appReply,
      notifier: opts.notifier,
    }))
    .catch(() => {
      /* 出站失败不回打飞书；结果仍在本机 UI */
    })
    .finally(releaseChat);
}

/**
 * 把飞书/企微入站接到已有 http.Server 上，不改 ui/server.ts 的路由表。
 * IM 路径先于原 handler 吃掉，因而也不走 AGENT_UI_ACCESS_TOKEN（签名即凭证）。
 */
export function attachImInbound(server: Server, opts: ImInboundAttachOptions = {}): () => void {
  const existing = server.listeners("request").slice() as Array<
    (req: IncomingMessage, res: ServerResponse) => void
  >;
  server.removeAllListeners("request");
  const bound = bindImInbound(opts);
  const wrapped = (req: IncomingMessage, res: ServerResponse): void => {
    if (isImInboundPath(req.url)) {
      void handleImInboundRequest(req, res, bound).catch(() => {
        if (!res.headersSent) writeJson(res, 500, { error: "Internal server error" });
      });
      return;
    }
    for (const listener of existing) listener.call(server, req, res);
  };
  server.on("request", wrapped);
  return () => {
    server.removeListener("request", wrapped);
    for (const listener of existing) server.on("request", listener);
  };
}

export function createLocalImStartRun(opts: {
  port: () => number;
  accessToken?: string | null;
  fetchFn?: typeof fetch;
}): ImStartRunFn {
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  return async (input) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = opts.accessToken?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchFn(`http://127.0.0.1:${opts.port()}/api/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ task: input.task }),
    });
    const body = await res.json() as { runId?: string; error?: string };
    if (!res.ok || typeof body.runId !== "string") {
      throw new Error("start_run_failed");
    }
    return { runId: body.runId };
  };
}

export function createLocalImWaitRun(opts: {
  port: () => number;
  accessToken?: string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  intervalMs?: number;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): ImWaitRunFn {
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 400;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  return async (runId) => {
    const headers: Record<string, string> = {};
    const token = opts.accessToken?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const started = opts.nowMs?.() ?? Date.now();
    while ((opts.nowMs?.() ?? Date.now()) - started <= timeoutMs) {
      const res = await fetchFn(`http://127.0.0.1:${opts.port()}/api/runs`, { headers });
      const list = await res.json() as Array<{
        runId: string;
        task?: string;
        title?: string;
        status?: string;
        stopReason?: string | null;
      }>;
      const entry = Array.isArray(list) ? list.find((r) => r.runId === runId) : undefined;
      if (entry?.status === "done") {
        return {
          task: String(entry.task ?? ""),
          runId,
          status: "done",
          stopReason: entry.stopReason ?? null,
          summary: String(entry.title ?? entry.task ?? ""),
        };
      }
      await sleep(intervalMs);
    }
    return {
      task: "",
      runId,
      status: "timeout",
      summary: "等待超时，请打开本机宿主查看",
    };
  };
}
