/**
 * 产物与整站预览：MIME 判定、预览 CSP / Permissions-Policy、预览路径编解码。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { extname } from "node:path";

/**
 * 产物预览的 MIME。只列真的会被生成出来的那几类；认不出的一律
 * `application/octet-stream` + nosniff —— 让浏览器下载而不是猜着执行。
 */
export const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
};

export function contentTypeOf(name: string): string {
  const ext = extname(name).toLowerCase();
  if (CONTENT_TYPES[ext]) return CONTENT_TYPES[ext]!;
  // 源码一律按纯文本预览：按扩展名猜 MIME 容易把 .ts 之类当成别的东西
  if (/\.(ts|tsx|js|jsx|py|c|h|cpp|rs|go|java|sh|yml|yaml|toml|ini|xml)$/i.test(name)) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

/**
 * 整站预览 MIME：`.js` 必须是可执行脚本类型，不能走 contentTypeOf 的 text/plain。
 * 仅用于 `/site/*`；单文件 artifact 预览仍用 contentTypeOf（禁脚本 CSP）。
 */
export function siteContentTypeOf(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return "text/javascript; charset=utf-8";
  }
  if (ext === ".wasm") return "application/wasm";
  if (CONTENT_TYPES[ext]) return CONTENT_TYPES[ext]!;
  if (/\.(map)$/i.test(name)) return "application/json; charset=utf-8";
  return contentTypeOf(name);
}

/** 整站预览 CSP：允许同源脚本/样式/资源；仍禁外链与 form。配合 iframe 无 allow-same-origin。 */
export const SITE_PREVIEW_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

/**
 * 整站预览 Permissions-Policy：无源 iframe 对不上 `'src'`，必须 `*`。
 * 与预览 iframe 的 `allow="webgl *; xr-spatial-tracking *"` 对齐。
 */
export const SITE_PREVIEW_PERMISSIONS_POLICY = "webgl=*, xr-spatial-tracking=*";

/**
 * 把 workdir 相对路径编成整站预览 URL（路径段编码，相对引用才能解析）。
 * `demos/a/index.html` → `/api/runs/<id>/site/demos/a/index.html`
 */
export function sitePreviewUrl(runId: string, relativePath: string): string {
  const normalized = String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  if (!normalized) throw new Error("site preview path is empty");
  const segments = normalized.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `/api/runs/${encodeURIComponent(runId)}/site/${segments}`;
}

/** 解码 `/site/` 后的路径段；拒绝空段与 `.`/`..`（圈禁前先挡一层）。 */
export function decodeSitePreviewPath(encodedPath: string): string {
  const raw = String(encodedPath ?? "").replace(/^\/+/, "");
  if (!raw) throw new Error("site preview path is empty");
  const parts = raw.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw new Error("site preview path is not valid URI encoding");
    }
    if (decoded === "." || decoded === ".." || decoded.includes("\0") || /[\\/]/.test(decoded)) {
      throw new Error("site preview path contains illegal segment");
    }
    out.push(decoded);
  }
  if (out.length === 0) throw new Error("site preview path is empty");
  return out.join("/");
}
