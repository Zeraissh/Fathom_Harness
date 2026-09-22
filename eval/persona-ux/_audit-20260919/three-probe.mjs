import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const A = `(() => {
  const rl = document.getElementById('run-list'); if (!rl) return {none:true};
  const cs = getComputedStyle(rl);
  const kids = [...rl.children].map(e => { const r = e.getBoundingClientRect();
    return { el: (e.className||'').toString().slice(0,28), h: Math.round(r.height), y: Math.round(r.y), ovf: getComputedStyle(e).overflowY }; });
  return { runList: { h: Math.round(rl.getBoundingClientRect().height), scrollH: rl.scrollHeight, clientH: rl.clientHeight, ovf: cs.overflowY },
    childCount: rl.children.length, kids: kids.slice(0,12) };
})()`;

const B = `(() => {
  const cr = document.getElementById('center-row');
  const mp = document.getElementById('main-panel');
  if (!cr) return {none:true};
  const kids = [...cr.children].map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className?'.'+(e.className||'').toString().trim().split(/\s+/).slice(0,2).join('.'):''),
      w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
      display: cs.display, flex: cs.flex, minH: cs.minHeight, h100: cs.height, pos: cs.position }; });
  const csC = getComputedStyle(cr), csM = getComputedStyle(mp);
  return { centerRow: { w: Math.round(cr.getBoundingClientRect().width), h: Math.round(cr.getBoundingClientRect().height),
      scrollH: cr.scrollHeight, clientH: cr.clientHeight, flex: csC.flex, h100: csC.height, minH: csC.minHeight, alignItems: csC.alignItems },
    mainPanel: { h: Math.round(mp.getBoundingClientRect().height), ovf: csM.overflow, ovfY: csM.overflowY },
    doc: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, canScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2 },
    kids };
})()`;

const C = `(() => {
  const rail = document.getElementById('right-rail'); if (!rail) return {none:true};
  const prev = document.getElementById('right-rail-preview');
  const tree = document.getElementById('workspace-file-tree');
  const info = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), display: cs.display, hidden: e.hidden,
      flex: cs.flex, flexBasis: cs.flexBasis, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, minW: cs.minWidth }; };
  return { layout: rail.dataset.layout, mode: rail.dataset.mode, flexDir: getComputedStyle(rail).flexDirection,
    preview: info(prev), tree: info(tree), previewHasContent: prev ? prev.children.length : -1,
    previewHTML: prev ? prev.outerHTML.slice(0,150) : null };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
const out = {};
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
out.home = { runs: await page.evaluate(A), center: await page.evaluate(B) };
console.log("=== ① 侧栏 #run-list ===");
console.log(JSON.stringify(out.home.runs, null, 1));
console.log("\n=== ② 首页 #center-row vs #main-panel ===");
console.log(JSON.stringify(out.home.center, null, 1));
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2200);
out.run = { center: await page.evaluate(B) };
for (const w of [1920, 1600, 1440]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(500); out["rail" + w] = await page.evaluate(C); }
console.log("\n=== ③ 右列 split 档：preview 为什么是 0 ===");
for (const w of [1920,1600,1440]) console.log(`[${w}] ` + JSON.stringify(out["rail"+w]));
console.log("\n=== ④ 会话页 #center-row ===");
console.log(JSON.stringify(out.run.center, null, 1).slice(0, 1200));
await writeFile(join(HERE, "three-probe.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
