import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

/** 顶层骨架：谁占了多少横向空间 */
const SKELETON = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const desc = (e) => e.tagName.toLowerCase() + (e.id?'#'+e.id:'') + (typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/).join('.'):'');
  const walk = (e, d, max) => {
    if (d > max) return [];
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    const self = vis(e) ? [{ d, el: desc(e), w: Math.round(r.width), x: Math.round(r.x), h: Math.round(r.height),
      flexDir: cs.flexDirection, pos: cs.position, bg: cs.backgroundColor }] : [];
    const kids = (cs.display.includes('flex') || r.width > 400) && d < max
      ? [...e.children].flatMap(c => walk(c, d+1, max)) : [];
    return [...self, ...kids];
  };
  const body = document.body;
  return walk(body, 0, 3).filter(r => r.w > 24).slice(0, 26);
})()`;

/** 侧栏会话列表：只取可见项，并找出标题的真实元素 */
const RUNS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const sb = document.querySelector('.sidebar'); if (!sb) return { none: true };
  // 按可见性筛
  const all = [...document.querySelectorAll('[data-run-id], .run-item')];
  const visItems = all.filter(vis);
  const sample = visItems.slice(0, 3).map(e => {
    const r = e.getBoundingClientRect();
    const kids = [...e.querySelectorAll('*')].filter(vis).map(k => ({
      el: k.tagName.toLowerCase() + (typeof k.className==='string'&&k.className?'.'+k.className.trim().split(/\s+/).slice(0,2).join('.'):''),
      text: (k.textContent||'').trim().replace(/\s+/g,' ').slice(0,46), w: Math.round(k.getBoundingClientRect().width) }));
    return { w: Math.round(r.width), h: Math.round(r.height), kids: kids.slice(-14) };
  });
  const groups = [...sb.querySelectorAll('*')].filter(e => vis(e) && /project|group/i.test(e.className||'') && e.getBoundingClientRect().width > 100)
    .map(e => ({ el: (e.className||'').toString().slice(0,40), text: (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,50), h: Math.round(e.getBoundingClientRect().height), expanded: e.getAttribute('aria-expanded') }));
  return { total: all.length, visible: visItems.length, sbScrollH: sb.scrollHeight, sbClientH: sb.clientHeight,
    sample, groups: groups.slice(0, 8) };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
const out = {};
for (const [name, hash] of [["run", `#/run/${HEAVY}`], ["home", "#/"]]) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  out[name] = { skeleton: await page.evaluate(SKELETON), runs: await page.evaluate(RUNS) };
}
console.log("=== 【会话页 1600】顶层骨架（缩进=层级）===");
for (const r of out.run.skeleton) console.log(`${"  ".repeat(r.d)}${String(r.w).padStart(5)}×${String(r.h).padStart(4)} @x=${String(r.x).padStart(5)} ${r.flexDir.padEnd(7)} ${r.el.slice(0,72)}`);
console.log("\n=== 【会话页】侧栏会话列表 ===");
console.log(`DOM 总项=${out.run.runs.total}  可见=${out.run.runs.visible}  侧栏 scrollH=${out.run.runs.sbScrollH} clientH=${out.run.runs.sbClientH}`);
console.log("\n-- 可见项的元素构成（看标题真身）--");
for (const s of out.run.runs.sample) { console.log(`  项 ${s.w}×${s.h}:`); for (const k of s.kids) console.log(`      ${String(k.w).padStart(4)}  ${k.el.padEnd(30)} "${k.text}"`); }
console.log("\n-- 分组 --");
for (const g of out.run.runs.groups) console.log(`  ${String(g.h).padStart(4)}h ${g.expanded===null?'-':g.expanded} ${g.el.padEnd(28)} "${g.text}"`);
console.log("\n=== 【首页 1600】顶层骨架 ===");
for (const r of out.home.skeleton) console.log(`${"  ".repeat(r.d)}${String(r.w).padStart(5)}×${String(r.h).padStart(4)} @x=${String(r.x).padStart(5)} ${r.flexDir.padEnd(7)} ${r.el.slice(0,72)}`);
console.log(`\n首页侧栏: DOM总=${out.home.runs.total} 可见=${out.home.runs.visible}`);
await writeFile(join(HERE, "layout-probe.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
