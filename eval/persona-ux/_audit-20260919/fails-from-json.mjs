/** vitest json 报告 → 失败用例清单（本轮基线对照用） */
import { readFileSync } from "node:fs";

const j = JSON.parse(readFileSync(process.argv[2], "utf8"));
const root = process.cwd().replace(/\\/g, "/");
const fails = [];
for (const f of j.testResults ?? []) {
  const file = String(f.name ?? "").replace(/\\/g, "/").replace(`${root}/`, "");
  for (const a of f.assertionResults ?? []) {
    if (a.status === "failed") fails.push(`${file} :: ${a.fullName ?? a.title}`);
  }
}
fails.sort();
console.log(`失败数: ${fails.length}`);
for (const x of fails) console.log("  " + x);
