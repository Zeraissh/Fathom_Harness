import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
const out = {};

// ① 首页滚动空白：滚到底截一张
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
const mp = await page.$('#main-panel');
const before = await page.evaluate(() => document.getElementById('main-panel').scrollTop);
await page.evaluate(() => { document.getElementById('main-panel').scrollTop = 99999; });
await page.waitForTimeout(600);
const after = await page.evaluate(() => document.getElementById('main-panel').scrollTop);
await page.screenshot({ path: join(OUT, "welcome-scrolled-bottom-1600.png") });
out.welcomeScroll = { before, after, maxScroll: await page.evaluate(() => { const e=document.getElementById('main-panel'); return e.scrollHeight - e.clientHeight; }) };

// ② 会话页 detail-layout 的栅格
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2400);
out.detail = await page.evaluate(`(() => {
  const d = document.querySelector('.detail-layout'); if (!d) return {none:true};
  const cs = getComputedStyle(d);
  const b = (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  return { cols: cs.gridTemplateColumns, rows: cs.gridTemplateRows, gap: cs.gap, self: b(d),
    kids: [...d.children].map(e => ({ el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+'.'+(e.className||'').toString().trim().split(/\s+/).slice(0,3).join('.'),
      ...b(e), display: getComputedStyle(e).display, sticky: getComputedStyle(e).position })) };
})()`);
await page.screenshot({ path: join(OUT, "run-detail-1600.png") });

// ③ 有没有"全部项目/全部会话"的入口
out.entries = await page.evaluate(`(() => {
  const hits = [];
  for (const e of document.querySelectorAll('button,a,[role=button],option')) {
    const t = (e.textContent||'').trim().replace(/\s+/g,' ');
    if (/全部|所有|历史|归档|更多|项目/.test(t) && t.length < 24) hits.push({ t, id: e.id, cls: (e.className||'').toString().slice(0,30) });
  }
  const sel = [...document.querySelectorAll('select')].map(s => ({ id: s.id, opts: [...s.options].map(o=>o.text).slice(0,8) }));
  return { hits, selects: sel };
})()`);
await writeFile(join(HERE, "final-probe.json"), JSON.stringify(out, null, 1), "utf-8");
console.log("=== ① 首页滚动 ===", JSON.stringify(out.welcomeScroll));
console.log("\n=== ② detail-layout 栅格 ===");
console.log("cols:", out.detail.cols, "| gap:", out.detail.gap, "| self:", JSON.stringify(out.detail.self));
for (const k of out.detail.kids || []) console.log(`   ${String(k.w).padStart(5)}×${String(k.h).padStart(5)} @x=${String(k.x).padStart(4)} ${k.sticky.padEnd(8)} ${k.el.slice(0,58)}`);
console.log("\n=== ③ 全部项目/归档入口 ===");
console.log(JSON.stringify(out.entries, null, 1).slice(0, 1200));
await browser.close();
