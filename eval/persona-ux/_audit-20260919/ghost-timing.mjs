/**
 * 幽灵出现的时机（2026-09-19，只读）。
 * 上一轮验收里首次加载有幽灵、重载 3.0s 时没有——查是竞态还是真丢。
 */
import { chromium } from "playwright";
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

await page.goto(`${BASE}/#/run/${RUN}`, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
const seen = [];
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(`(() => {
    const t = document.getElementById("task-input");
    if (!t) return null;
    return { ph: t.placeholder, hasValue: t.value.length > 0 };
  })()`).catch(() => null);
  if (s) seen.push({ ms: Date.now() - t0, ph: s.ph });
  if (s && s.ph && s.ph !== "接着说…" && s.ph !== "说要做什么…") break;
  await page.waitForTimeout(200);
}
console.log("=== 幽灵出现时间线 ===");
for (const s of seen) console.log(`  ${String(s.ms).padStart(5)}ms  ${s.ph.slice(0, 46)}`);
const first = seen.find((s) => s.ph !== "接着说…" && s.ph !== "说要做什么…");
console.log(first ? `\n幽灵在 ${first.ms}ms 出现` : "\n★ 30 次采样内始终没有幽灵");

// 再验一次：稳定后是否长留
await page.waitForTimeout(2500);
const late = await page.evaluate(() => document.getElementById("task-input").placeholder);
console.log("稳定后 placeholder:", late.slice(0, 50));
await browser.close();
