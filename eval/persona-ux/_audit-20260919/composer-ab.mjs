import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = "http://127.0.0.1:4173";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });

const M = `(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
    return { y: Math.round(r.y), bot: Math.round(r.bottom), inView: r.y < innerHeight && r.bottom > 0 }; };
  const p = document.getElementById('main-panel');
  const rail = document.getElementById('right-rail');
  return { composer: b('#submit-form'), centerRow: b('#center-row'), rail: rail ? { w: Math.round(rail.getBoundingClientRect().width), h: Math.round(rail.getBoundingClientRect().height), display: getComputedStyle(rail).display } : null,
    railTreeH: (() => { const t = document.getElementById('workspace-file-tree'); return t ? Math.round(t.getBoundingClientRect().height) : null; })(),
    railTreeW: (() => { const t = document.getElementById('workspace-file-tree'); return t ? Math.round(t.getBoundingClientRect().width) : null; })(),
    panelScroll: (p?.scrollHeight||0) - (p?.clientHeight||0) };
})()`;

await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
const A = await page.evaluate(M);
await page.screenshot({ path: join(OUT, "welcome-A-current-1600.png") });

// 注入：把收起态右列的高度也收掉（模拟"收成 0 就该是 0 高"）
const B = await page.evaluate(`(() => {
  const rail = document.getElementById('right-rail');
  if (rail) { rail.style.height = '0'; rail.style.overflow = 'hidden'; }
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
    return { y: Math.round(r.y), bot: Math.round(r.bottom), inView: r.y < innerHeight && r.bottom > 0 }; };
  const p = document.getElementById('main-panel');
  return { composer: b('#submit-form'), centerRow: b('#center-row'), rail: (() => { const r=document.getElementById('right-rail').getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)}; })(),
    panelScroll: (p?.scrollHeight||0) - (p?.clientHeight||0) };
})()`);
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "welcome-B-railheight0-1600.png") });

console.log("A 现状        :", JSON.stringify(A));
console.log("B 右列高度归零:", JSON.stringify(B));
console.log("\n输入框 y:", A.composer.y, "→", B.composer.y, " | 首屏可见:", A.composer.inView, "→", B.composer.inView);
console.log("面板可滚:", A.panelScroll, "→", B.panelScroll);
await writeFile(join(HERE, "composer-ab.json"), JSON.stringify({ A, B }, null, 1), "utf-8");
await browser.close();
