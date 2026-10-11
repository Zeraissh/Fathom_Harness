/**
 * HTTP 基础件：Host / Origin / CORS 判定、请求体读取、JSON 应答、访问令牌、运维日志。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { sanitizeAdmissionPayload, toBrowserApiError } from "../../api-errors.js";

/** decodeURIComponent 对畸形百分号编码会抛错——路径参数是外部输入，不能让它炸掉请求 */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function firstForwarded(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || undefined;
}

export function requestAuthority(req: IncomingMessage, trustProxy = false): string | undefined {
  return trustProxy
    ? firstForwarded(req.headers["x-forwarded-host"]) ?? req.headers.host
    : req.headers.host;
}

export function requestHostname(req: IncomingMessage, trustProxy = false): string | null {
  const authority = requestAuthority(req, trustProxy);
  if (!authority) return null;
  try {
    return new URL(`http://${authority}`).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

export function sameOriginOf(req: IncomingMessage, trustProxy = false): string | null {
  const host = requestAuthority(req, trustProxy);
  if (!host) return null;
  const encrypted = Boolean((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted);
  const forwardedProto = trustProxy ? firstForwarded(req.headers["x-forwarded-proto"]) : undefined;
  const protocol = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : encrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

export function originAllowed(
  req: IncomingMessage,
  allowedOrigins: readonly string[],
  trustProxy = false,
): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // CLI/native clients do not send Origin; token still applies separately.
  return origin === sameOriginOf(req, trustProxy)
    || allowedOrigins.includes("*")
    || allowedOrigins.includes(origin);
}

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: readonly string[],
  trustProxy = false,
): void {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(req, allowedOrigins, trustProxy)) return;
  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin !== sameOriginOf(req, trustProxy) && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Last-Event-ID, X-Agent-Token",
  );
}

export class RequestBodyTooLargeError extends Error {}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const declared = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(new RequestBodyTooLargeError(`Request body exceeds ${maxBytes} bytes`));
      return;
    }
    req.on("data", (value: Buffer | string) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maxBytes) {
        settled = true;
        chunks.length = 0;
        reject(new RequestBodyTooLargeError(`Request body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** POST /api/runs 等准入失败：正文给人话，状态码只留在 HTTP 头。 */
export function jsonAdmission(res: ServerResponse, outcome: {
  status: number;
  payload: unknown;
  headers?: Record<string, string>;
}): void {
  if (outcome.headers) {
    for (const [name, value] of Object.entries(outcome.headers)) {
      res.setHeader(name, value);
    }
  }
  const payload = outcome.status >= 400
    ? sanitizeAdmissionPayload(outcome.payload)
    : outcome.payload;
  json(res, outcome.status, payload);
}

export function notFound(res: ServerResponse, detail?: string): void {
  json(res, 404, { error: detail ?? "Not found" });
}

export function badRequest(res: ServerResponse, detail: string): void {
  json(res, 400, { error: toBrowserApiError(detail) });
}

export function requestBodyFailure(res: ServerResponse, error: unknown): void {
  if (error instanceof RequestBodyTooLargeError) {
    json(res, 413, { error: error.message });
    return;
  }
  badRequest(res, "Failed to read request body");
}

export function secureStringEqual(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function cookieValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function requestAccessToken(req: IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const explicit = req.headers["x-agent-token"];
  if (typeof explicit === "string") return explicit;
  return cookieValue(req, "agent_ui_access");
}

export function operationalLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
