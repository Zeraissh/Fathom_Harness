/**
 * 行尾与内容核对（字节级）。
 *
 * **为什么必须用字节而不是 `git status`**：本仓没有 `.gitattributes` 而
 * `core.autocrlf=true` —— 索引里存的是 LF，检出时转 CRLF，提交时又归一化回去。
 * 于是**工作树文件是 CRLF 还是 LF，`git status` 一律显示干净**。
 * 任何"我用 sed / 编辑工具改过它，行尾还行吗"的问题，问 git 是问不出来的。
 *
 * 起因：计划 1 的某轮里，有人用 `sed -i` 把 `index.html` 写成了 LF，
 * 而当时唯一的核验手段 `git status` 报了"干净"。此后本仓把这条写成纪律。
 *
 * 用法：
 *   node check-eol.mjs                      # 默认核对四个热点文件
 *   node check-eol.mjs ui/public/app.js …   # 核对指定文件
 *
 * 判据：工作树内容（CRLF 形态）与 `HEAD:路径`（LF 形态归一化成 CRLF）
 * **逐字节相同**，且裸 LF 计数为 0。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CRLF = String.fromCharCode(13, 10);
const DEFAULT_FILES = [
  "ui/public/index.html",
  "ui/public/app.js",
  "ui/public/styles.css",
  "test/ui-layout.test.ts",
];
const FILES = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;

/** 从 git 里取出该文件的原始内容（LF 形态），归一化成工作树应有的 CRLF 形态 */
function expected(rev, path) {
  const blob = execFileSync("git", ["show", `${rev}:${path}`], { maxBuffer: 1 << 28 }).toString("utf8");
  return blob.replace(/\r?\n/g, CRLF);
}

let allOk = true;
for (const f of FILES) {
  let have;
  try {
    have = readFileSync(f, "utf8");
  } catch {
    console.log(`★ 读不到 ${f}（新文件？那它不在 HEAD 里，用下面的自检替代）`);
    allOk = false;
    continue;
  }
  let want;
  try {
    want = expected("HEAD", f);
  } catch {
    // HEAD 里没有它（刚新建、未提交）——那就只能查行尾一致性
    const crlf = (have.match(/\r\n/g) ?? []).length;
    const loneLf = (have.match(/(?<!\r)\n/g) ?? []).length;
    console.log(`${loneLf === 0 ? "✅" : "★ 有裸 LF"}  ${f.padEnd(26)} 未在 HEAD 里 · CRLF=${crlf} 裸LF=${loneLf}`);
    if (loneLf !== 0) allOk = false;
    continue;
  }
  const crlf = (have.match(/\r\n/g) ?? []).length;
  const loneLf = (have.match(/(?<!\r)\n/g) ?? []).length;
  const same = have === want;
  console.log(
    `${same && loneLf === 0 ? "✅" : "★★ 不一致"}  ${f.padEnd(26)} ` +
      `CRLF=${String(crlf).padStart(5)} 裸LF=${String(loneLf).padStart(4)} ` +
      `字节 ${have.length}/${want.length}${same ? "" : "  ← 与 HEAD 不逐字节相同"}`,
  );
  if (!same || loneLf !== 0) allOk = false;
}

if (!allOk) process.exitCode = 1;
