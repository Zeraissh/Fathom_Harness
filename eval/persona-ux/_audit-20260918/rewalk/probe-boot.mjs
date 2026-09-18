/**
 * 回走取证：启动期位移归因（CLS 是谁在跳）+ 从列表打开 run 的耗时 —— 只读。
 * 用法：node probe-boot.mjs <baseUrl> [runTitleKeyword]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4173";
const KEYWORD = process.argv[3] ?? "";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
  window.__m = { shifts: [], longtasks: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__m.shifts.push({
          at: Math.round(e.startTime), v: +e.value.toFixed(4),
          sources: (e.sources ?? []).slice(0, 2).map((s) => {
            const n = s.node;
            return n ? `${n.tagName ?? "?"}${n.id ? "#" + n.id : ""}.${String(n.className ?? "").split(/\s+/).slice(0, 2).join(".")}` : `prev:${s.previousRect?.y}->cur:${s.currentRect?.y}`;
          }),
        });
      }
    }).observe({ entryTypes: ["layout-shift"], buffered: true });
  } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longtasks.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ entryTypes: ["longtask"], buffered: true }); } catch {}
});

const t0 = Date.now();
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector(".sidebar", { timeout: 20000 });
const msToSidebar = Date.now() - t0;
await page.waitForTimeout(2500);

const boot = await page.evaluate(() => ({
  paint: performance.getEntriesByType("paint").map((p) => ({ n: p.name, at: Math.round(p.startTime) })),
  nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; })(),
  runsInList: document.querySelectorAll(".run-item, .conv-item, [class*='run-item'], [class*='conv-item']").length,
  shifts: window.__m.shifts,
  shiftSum: +window.__m.shifts.reduce((a, b) => a + b.v, 0).toFixed(3),
  longtasks: window.__m.longtasks,
}));

let openRun = null;
if (KEYWORD) {
  const t1 = Date.now();
  const item = page.locator("[class*='run-item'], .conv-item, li, a").filter({ hasText: KEYWORD }).first();
  try {
    await item.click({ timeout: 8000 });
    await page.waitForSelector(".conversation", { timeout: 20000 });
    openRun = { msToListedRun: Date.now() - t1, clicked: true };
  } catch (e) {
    openRun = { clicked: false, error: String(e).slice(0, 160) };
  }
}

console.log(JSON.stringify({ msToSidebar, boot, openRun }, null, 2));
await browser.close();
