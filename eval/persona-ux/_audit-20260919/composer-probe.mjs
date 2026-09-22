import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });

const M = `(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { y: Math.round(r.y), h: Math.round(r.h || r.height), bot: Math.round(r.bottom), pos: cs.position, inView: r.y < innerHeight && r.bottom > 0, ovf: cs.overflowY, sticky: cs.position }; };
  const p = document.getElementById('main-panel');
  return { vh: innerHeight, panel: b('#main-panel'), panelScrollTop: p?.scrollTop, panelScrollH: p?.scrollHeight, panelClientH: p?.clientHeight,
    composer: b('#submit-form'), centerRow: b('#center-row'), mainArea: b('#main-area'), dock: b('#action-dock'),
    heroText: (document.querySelector('.brand-hero,.welcome-hero')?.textContent||'').trim().slice(0,30) };
})()`;

const out = {};
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
out.welcome = await page.evaluate(M);
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2400);
out.run = await page.evaluate(M);
for (const w of [1100, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1600);
  out["welcome" + w] = await page.evaluate(M);
}
console.log("=== 首页（1600×900）输入框在哪 ===");
console.log(JSON.stringify(out.welcome, null, 1));
console.log("\n=== 会话页（1600×900）===");
console.log(JSON.stringify(out.run, null, 1));
for (const w of [1100, 390]) { console.log(`\n=== 首页 @${w} ===`); const m = out["welcome"+w]; console.log(` 视口高 ${m.vh} | composer y=${m.composer?.y} bot=${m.composer?.bot} inView=${m.composer?.inView} | panelScrollH=${m.panelScrollH} 可滚=${(m.panelScrollH||0)-(m.panelClientH||0)}`); }
await writeFile(join(HERE, "composer-probe.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
