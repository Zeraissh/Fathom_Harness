/**
 * 工作目录里的文件定位：系统「在文件夹中显示」命令、本地路径目标、按名唯一查找。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）。
 */
import { readdir } from "node:fs/promises";
import { join, dirname, resolve, relative, sep } from "node:path";

/**
 * "在文件管理器里选中它"的平台命令。**返回参数数组而不是命令串**——
 * 拼串就等于把文件名交给命令行解析器去解释。
 */
export function revealCommand(
  abs: string,
  kind: "file" | "directory" = "file",
): { file: string; args: string[] } | null {
  if (process.platform === "win32") {
    return kind === "directory"
      ? { file: "explorer.exe", args: [abs] }
      : { file: "explorer.exe", args: [`/select,${abs}`] };
  }
  if (process.platform === "darwin") {
    return kind === "directory" ? { file: "open", args: [abs] } : { file: "open", args: ["-R", abs] };
  }
  if (process.platform === "linux") {
    return { file: "xdg-open", args: [kind === "directory" ? abs : dirname(abs)] };
  }
  return null;
}

/** `file.ts:12:4` 这类显示引用在文件系统里仍指向 `file.ts`。 */
export function localPathTarget(value: string): string {
  return String(value ?? "").trim().replace(/:\d+(?::\d+)?$/, "");
}

export const WORKDIR_WALK_SKIP = new Set(["node_modules", ".git", ".agent-run-history"]);

/**
 * 裸文件名在工作目录里唯一时，把它解析成相对路径。
 * 两处同名就不猜——猜错比标「未找到」更糟。
 */
export async function findUniqueWorkdirFile(
  root: string,
  basename: string,
  opts: { maxDepth?: number; maxVisits?: number } = {},
): Promise<string | null> {
  const name = String(basename ?? "").trim();
  if (!name || /[\\/]/.test(name) || name === "." || name === ".." || name.includes("\0")) return null;
  const maxDepth = opts.maxDepth ?? 8;
  const maxVisits = opts.maxVisits ?? 4000;
  const rootAbs = resolve(root);
  const hits: string[] = [];
  let visits = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (hits.length > 1 || visits >= maxVisits || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (hits.length > 1 || visits >= maxVisits) return;
      visits += 1;
      if (ent.name === "." || ent.name === "..") continue;
      const next = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (WORKDIR_WALK_SKIP.has(ent.name)) continue;
        await walk(next, depth + 1);
        continue;
      }
      if (!ent.isFile() && !ent.isSymbolicLink()) continue;
      if (ent.name !== name) continue;
      const rel = relative(rootAbs, next).split(sep).join("/");
      if (!rel || rel.startsWith("..")) continue;
      hits.push(rel);
    }
  };

  await walk(rootAbs, 0);
  return hits.length === 1 ? hits[0]! : null;
}
