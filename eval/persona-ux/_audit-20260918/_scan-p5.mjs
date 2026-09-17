/**
 * 按**成组规则的真实定义**扫归档 run，挑 P5 取证样本。
 *
 * 上一版扫描的错误：只在"工具步子序列"里数连续，忽略了 turn_start / assistant_text
 * 这些**会把组切断**的条目。所以挑出 write_file(第1轮)+read_file(第2轮) 这种
 * 本来就不该成组的样本。这一版把完整时间线喂给同一套规则。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ?? ".agent-run-history";
const MIN = 2;

const groupable = (e) => {
  if (e.type === "tool_call") return true;
  return e.type === "tool_result" && !e.result?.isError && !e.resultIsError;
};

/** 复刻 groupToolSteps 的规则，返回组数与最大组步数。 */
function groupsOf(timeline) {
  const out = [];
  let i = 0;
  while (i < timeline.length) {
    if (timeline[i].type !== "tool_call") { i += 1; continue; }
    let j = i, calls = 0;
    while (j < timeline.length && groupable(timeline[j])) {
      if (timeline[j].type === "tool_call") calls += 1;
      j += 1;
    }
    if (calls >= MIN) out.push({ startSeq: timeline[i].seq, steps: calls });
    i = j > i ? j : i + 1;
  }
  return out;
}

const rows = [];
for (const d of await readdir(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  let lines;
  try { lines = (await readFile(path.join(root, d.name, "events.jsonl"), "utf8")).trim().split("\n"); } catch { continue; }
  const tl = [];
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      if (!o.event) continue;
      const e = { ...o.event, seq: o.seq, source: o.source };
      // 只按 main 段算（与 deriveLogEntries 的口径接近；核查时间线另算）
      if (e.source === "main") tl.push(e);
    } catch { /* 跳过坏行 */ }
  }
  tl.sort((a, b) => a.seq - b.seq);
  const toolCalls = tl.filter((e) => e.type === "tool_call").length;
  const groups = groupsOf(tl);
  const errs = tl.filter((e) => e.type === "tool_result" && (e.result?.isError || e.resultIsError)).length;
  rows.push({
    runId: d.name,
    toolCalls,
    errs,
    groupCount: groups.length,
    maxSteps: groups.reduce((m, g) => Math.max(m, g.steps), 0),
    groups: groups.slice(0, 4).map((g) => `${g.startSeq}:${g.steps}`).join(" "),
  });
}

console.log("总 run:", rows.length, "\n");
console.log("=== A. 恰好 1 组，组内恰好 2 步（两步样本）===");
for (const r of rows.filter((r) => r.groupCount === 1 && r.maxSteps === 2)) console.log(r.runId, "| calls=" + r.toolCalls, "errs=" + r.errs, "| groups:", r.groups);
console.log("\n=== B. 0 组 且 恰好 1 个 tool_call（单步样本）===");
for (const r of rows.filter((r) => r.groupCount === 0 && r.toolCalls === 1)) console.log(r.runId, "| errs=" + r.errs);
console.log("\n=== C. 0 组 且 ≥3 个 tool_call（工具之间都被切断的样本）===");
for (const r of rows.filter((r) => r.groupCount === 0 && r.toolCalls >= 3)) console.log(r.runId, "| calls=" + r.toolCalls, "errs=" + r.errs);
console.log("\n=== D. 有组 且 有失败结果（失败与组共存）===");
for (const r of rows.filter((r) => r.groupCount >= 1 && r.errs >= 1).slice(0, 8)) console.log(r.runId, "| calls=" + r.toolCalls, "errs=" + r.errs, "| groups:", r.groups);
