/**
 * 历史运行全文检索（/api/search）：扫存档 meta 与 transcript，出片段。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { readFile, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type ArchivedMeta } from "../../history.js";

/** 查询词最短长度：单字符子串匹配信噪比太低（一个汉字几乎命中所有档案） */
export const SEARCH_MIN_QUERY_CHARS = 2;

/** 结果 run 数默认上限与硬上限 */
export const SEARCH_DEFAULT_LIMIT = 20;

export const SEARCH_MAX_LIMIT = 100;

/** 扫描 run 数上限：兜底总耗时，超出截断并在响应里标注 truncatedRuns */
export const SEARCH_RUN_SCAN_CAP = 500;

/** 每个 run 最多返回的正文命中条数 */
export const SEARCH_SNIPPETS_PER_RUN = 3;

/** 命中片段前后各带的上下文字符数 */
export const SEARCH_SNIPPET_CONTEXT_CHARS = 60;

/** 单条 transcript 只搜前 10MB：超大档案不拖垮整次搜索 */
export const SEARCH_TRANSCRIPT_MAX_BYTES = 10 * 1024 * 1024;

export interface SearchSnippet {
  text: string;
  lineHint: string;
}

export interface SearchRunResult {
  runId: string;
  title: string;
  workdir: string | null;
  status: string;
  updatedAt: number;
  titleHit: boolean;
  snippets: SearchSnippet[];
}

export interface SearchHistoryResponse {
  query: string;
  results: SearchRunResult[];
  truncatedRuns: boolean;
}

/**
 * 只读文件前 maxBytes 字节并解码 UTF-8。截断点可能落在多字节字符中间，
 * toString 会在末尾留下替换符——替换符不可能匹配任何查询词，于搜索无害。
 * 文件不存在/读失败返回空串（档案坏一条不该拖垮整次搜索，同 loadArchivedMetas 纪律）。
 */
export async function readFileHeadUtf8(file: string, maxBytes: number): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(file, "r");
    const size = (await handle.stat()).size;
    const length = Math.min(size, maxBytes);
    if (length <= 0) return "";
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, 0);
    return buf.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * 从一行 transcript.jsonl 提取可搜索正文。
 * 段形状：{ index, source, messages: [{ role, content }] }——content 是字符串
 * （user）或块数组（assistant 的 text/thinking 块）。坏行返回空串（追加中断
 * 可能留下半行，同 readJsonLines 的跳行纪律）。
 */
export function transcriptLineSearchText(line: string): string {
  let segment: unknown;
  try {
    segment = JSON.parse(line);
  } catch {
    return "";
  }
  if (!segment || typeof segment !== "object") return "";
  const messages = (segment as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return "";
  const parts: string[] = [];
  for (const message of messages) {
    const content = (message as { content?: unknown } | null)?.content;
    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        const b = block as { text?: unknown; thinking?: unknown } | null;
        if (typeof b?.text === "string") parts.push(b.text);
        else if (typeof b?.thinking === "string") parts.push(b.thinking);
      }
    }
  }
  return parts.join("\n");
}

/** 在 text 里取一条命中片段：命中词前后各约 CONTEXT 字符，截断处加省略号 */
export function makeSnippet(text: string, hitAt: number, queryLength: number): string {
  const start = Math.max(0, hitAt - SEARCH_SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, hitAt + queryLength + SEARCH_SNIPPET_CONTEXT_CHARS);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * T6 全局搜索主体。只读、串行读盘；圈禁在历史根目录**平铺**的 run 目录内——
 * 目录名来自 readdir 而非客户端输入，且含分隔符/点号的异常条目直接跳过，
 * 没有任何路径参数能把读取引出 root。
 */
export async function searchRunHistory(
  root: string,
  query: string,
  limit: number,
): Promise<SearchHistoryResponse> {
  const queryLower = query.toLowerCase();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return { query, results: [], truncatedRuns: false }; // 根目录不存在 = 还没有历史
  }
  const truncatedRuns = entries.length > SEARCH_RUN_SCAN_CAP;
  const results: SearchRunResult[] = [];
  let scanned = 0;
  for (const name of entries) {
    if (scanned >= SEARCH_RUN_SCAN_CAP) break;
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) continue;
    scanned += 1;
    const dir = join(root, name);
    let meta: ArchivedMeta;
    try {
      meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as ArchivedMeta;
      if (!meta || meta.version !== 1 || typeof meta.runId !== "string" || meta.runId === "") continue;
    } catch {
      continue; // 半写目录/损坏 meta/无关文件：逐条跳过
    }
    const title = typeof meta.task === "string" ? meta.task : "";
    const titleHit = title.toLowerCase().includes(queryLower);
    const snippets: SearchSnippet[] = [];
    const transcript = await readFileHeadUtf8(join(dir, "transcript.jsonl"), SEARCH_TRANSCRIPT_MAX_BYTES);
    if (transcript) {
      const lines = transcript.split("\n");
      for (let i = 0; i < lines.length && snippets.length < SEARCH_SNIPPETS_PER_RUN; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;
        const text = transcriptLineSearchText(line);
        const hitAt = text.toLowerCase().indexOf(queryLower);
        if (hitAt < 0) continue;
        snippets.push({
          text: makeSnippet(text, hitAt, query.length),
          lineHint: `transcript.jsonl 第 ${i + 1} 行`,
        });
      }
    }
    if (!titleHit && snippets.length === 0) continue;
    results.push({
      runId: meta.runId,
      title,
      workdir: typeof meta.workdir === "string" ? meta.workdir : null,
      status: typeof meta.status === "string" ? meta.status : "done",
      updatedAt:
        typeof meta.finishedAt === "number"
          ? meta.finishedAt
          : typeof meta.createdAt === "number"
            ? meta.createdAt
            : 0,
      titleHit,
      snippets,
    });
  }
  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return { query, results: results.slice(0, limit), truncatedRuns };
}
