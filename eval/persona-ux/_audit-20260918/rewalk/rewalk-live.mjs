/**
 * 回走取证（2026-09-18）：真实长会话的「打开 + 滚动 + 运行日志」——只读。
 * 不点发送、不写盘、不触审批；只 GET 页面与事件流。
 *
 * 用法：node rewalk-live.mjs <baseUrl> <runId> <out.json> <shotPrefix>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4173";
const RUN_ID = process.argv[3];
const OUT = process.argv[4] ?? "rewalk-live.json";
const SHOT = process.argv[5] ?? "rewalk-live";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
  window.__m = { longtasks: [], shifts: [] };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longtasks.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) }); })
      .observe({ entryTypes: ["longtask"], buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.shifts.push({ at: Math.round(e.startTime), v: +e.value.toFixed(4) }); })
      .observe({ entryTypes: ["layout-shift"], buffered: true });
  } catch {}
});

const out = {};
const t0 = Date.now();
await page.goto(`${BASE}/#/run/${RUN_ID}`, { waitUntil: "commit" });
await page.waitForSelector(".conversation, .chat-item", { timeout: 30000 });
out.msToConversation = Date.now() - t0;
await page.waitForTimeout(2500);

// ---- 1. 长会话的渲染成本 ----
out.render = await page.evaluate(() => {
  const conv = document.querySelector(".conversation");
  const stack = document.querySelector(".conversation-stack");
  let scroller = null;
  for (const el of document.querySelectorAll(".conversation-stack, .conversation, .detail-layout, #main-area")) {
    if (el.scrollHeight > el.clientHeight + 40) { scroller = el; break; }
  }
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    chatItems: conv ? conv.querySelectorAll(".chat-item").length : 0,
    domNodes: conv ? conv.querySelectorAll("*").length : 0,
    textLen: conv ? conv.textContent.length : 0,
    stackHeight: stack ? Math.round(stack.getBoundingClientRect().height) : null,
    thinkingFolds: conv ? conv.querySelectorAll(".chat-thinking").length : 0,
    scroller: scroller ? {
      sel: scroller.id ? `#${scroller.id}` : (scroller.className ? `.${String(scroller.className).split(/\s+/)[0]}` : scroller.tagName),
      scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight,
    } : null,
    paint: performance.getEntriesByType("paint").map((p) => ({ n: p.name, at: Math.round(p.startTime) })),
    nav: nav ? { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null,
    longtasksInPage: window.__m.longtasks.length,
  };
});

// ---- 2. 滚动：分步下滚 + 直接到底，记 >33ms 的帧缝 ----
out.scroll = out.render.scroller ? await page.evaluate(async (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  el.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 400));
  const gaps = [];
  let last = performance.now();
  let on = true;
  (function loop() { const now = performance.now(); const d = now - last; last = now; if (d > 33) gaps.push(Math.round(d)); if (on) requestAnimationFrame(loop); })();
  const step = Math.max(200, Math.floor(el.scrollHeight / 12));
  const tStart = performance.now();
  for (let i = 0; i < 12; i++) { el.scrollTop += step; await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => setTimeout(r, 60)); }
  el.scrollTop = el.scrollHeight; // 极端跳：直到底
  await new Promise((r) => setTimeout(r, 400));
  on = false;
  const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4;
  return { gapsOver33: gaps.length, maxGap: Math.max(0, ...gaps), gaps: gaps.slice(0, 12), durationMs: Math.round(performance.now() - tStart), landedAtBottom: atBottom };
}, out.render.scroller.sel) : null;

await page.screenshot({ path: `${SHOT}-run.png` });

// ---- 3. 运行日志：展开详情抽屉，数条目与分组 ----
out.log = await page.evaluate(async () => {
  const toggle = document.getElementById("rail-toggle");
  if (toggle && toggle.getAttribute("aria-expanded") === "false") toggle.click();
  const drawer = document.getElementById("detail-drawer");
  if (drawer && drawer.tagName === "DETAILS" && !drawer.open) drawer.open = true;
  await new Promise((r) => setTimeout(r, 800));
  const entries = Array.from(document.querySelectorAll(".log-entry"));
  const groups = Array.from(document.querySelectorAll(".log-entry--group"));
  const firstGroup = groups[0];
  if (firstGroup?.tagName === "DETAILS") firstGroup.open = true;
  await new Promise((r) => setTimeout(r, 400));
  return {
    logEntries: entries.length,
    groupCount: groups.length,
    groupText: groups.slice(0, 4).map((g) => g.textContent.replace(/\s+/g, " ").trim().slice(0, 120)),
    firstGroupExpanded: firstGroup ? firstGroup.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null,
    entryKinds: (() => { const m = {}; for (const e of entries) { const k = String(e.className).split(/\s+/).filter((c) => c.startsWith("log-entry--"))[0] ?? "plain"; m[k] = (m[k] ?? 0) + 1; } return m; })(),
  };
});
await page.screenshot({ path: `${SHOT}-log.png` });

out.monitor = await page.evaluate(() => ({ longtasks: window.__m.longtasks.slice(0, 20), longtaskCount: window.__m.longtasks.length, shifts: window.__m.shifts.length, shiftSum: +window.__m.shifts.reduce((a, b) => a + b.v, 0).toFixed(3) }));

await writeFile(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(JSON.stringify(out, null, 2));
await browser.close();
