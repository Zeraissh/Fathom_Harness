import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const HERO = `(() => {
  const ma = document.getElementById('main-area');
  const cr = document.getElementById('center-row');
  const rail = document.getElementById('right-rail');
  const b = (e) => e ? { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), y: Math.round(e.getBoundingClientRect().y) } : null;
  const brand = document.querySelector('.brand-hero, .welcome-hero, #main-area');
  return { centerRow: b(cr), mainArea: b(ma), rail: b(rail),
    railKids: rail ? [...rail.children].map(c => ({ el: (c.className||'').toString().slice(0,26), ...b(c), display: getComputedStyle(c).display })) : [],
    panelScrollH: document.getElementById('main-panel')?.scrollHeight };
})()`;

const PROGRESS = `(() => {
  const ma = document.getElementById('main-area'); if (!ma) return {none:true};
  const kids = [...ma.children].map(e => { const r = e.getBoundingClientRect();
    return { el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+'.'+(e.className||'').toString().trim().split(/\s+/).slice(0,3).join('.'),
      w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), display: getComputedStyle(e).display }; });
  const prog = document.querySelector('#detail-rail, .detail-rail, [aria-label*="Progress"], .progress-rail');
  return { mainAreaKids: kids, progress: prog ? { el: (prog.className||'').toString().slice(0,40), w: Math.round(prog.getBoundingClientRect().width),
    x: Math.round(prog.getBoundingClientRect().x), h: Math.round(prog.getBoundingClientRect().height),
    label: prog.getAttribute('aria-label'), open: prog.getAttribute('aria-expanded') ?? prog.dataset.open } : null,
    headText: prog ? (prog.querySelector('header,h3,.rail-title')?.textContent||'').trim().replace(/\s+/g,' ').slice(0,50) : null };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
const out = {};

await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
out.homeBefore = await page.evaluate(HERO);
console.log("=== 首页 A/B：把右列整个摘掉，看 hero 归不归位 ===");
console.log("A(现状) centerRow=", JSON.stringify(out.homeBefore.centerRow), "mainArea=", JSON.stringify(out.homeBefore.mainArea), "rail=", JSON.stringify(out.homeBefore.rail));
console.log("        rail 子项:", JSON.stringify(out.homeBefore.railKids));
console.log("        #main-panel.scrollHeight =", out.homeBefore.panelScrollH, "(视口 900)");
out.homeAfter = await page.evaluate(`(() => {
  const rail = document.getElementById('right-rail');
  if (rail) rail.style.display = 'none';
  const b = (e) => e ? { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), y: Math.round(e.getBoundingClientRect().y) } : null;
  return { centerRow: b(document.getElementById('center-row')), mainArea: b(document.getElementById('main-area')) };
})()`);
console.log("B(摘掉右列) centerRow=", JSON.stringify(out.homeAfter.centerRow), "mainArea=", JSON.stringify(out.homeAfter.mainArea));
console.log("   → mainArea y: ", out.homeBefore.mainArea.y, "→", out.homeAfter.mainArea.y, " (差", out.homeAfter.mainArea.y - out.homeBefore.mainArea.y, "px)");

await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
out.progress = await page.evaluate(PROGRESS);
console.log("\n=== 会话页 #main-area 内部（Progress 是谁）===");
console.log(JSON.stringify(out.progress, null, 1));
await writeFile(join(HERE, "chain-probe.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
