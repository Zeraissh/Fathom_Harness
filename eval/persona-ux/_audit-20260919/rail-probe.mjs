/**
 * 右列几何采样器（一次性走查工具，无断言——跑完只打印 + 落 rail-probe.json）。
 *
 * 计划 4 · Task 5 改动（原版红了/失效了，两处）：
 *   ① BASE 硬编码 `127.0.0.1:4173`（**用户的实时宿主**，本计划硬约束一禁止碰）
 *      → 参数化成 `process.env.AUDIT_BASE ?? "http://127.0.0.1:4201"`；
 *      靶 run 同样参数化，并在宿主上解析（死 id 会静默量到空页）。
 *   ② 它读 `--rail-tree-w` / `--rail-preview-w`——两个变量随 split 删除，
 *      **读它恒得空字符串**：探针"绿"，可它量的是一个不存在的东西（"量的比
 *      它以为的少"）。改成量仍在用的 `--rail-width` + 三只槽的几何。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const HEAVY = process.env.AUDIT_RUN ?? "4ac7109c-4d36-47f7-8ac3-27e3219da60a";
await mkdir(OUT, { recursive: true });

const RAIL = `(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
      display: cs.display, flexDir: cs.flexDirection, flex: cs.flex, pos: cs.position, ovf: cs.overflow }; };
  const desc = (e) => e.tagName.toLowerCase() + (e.id?'#'+e.id:'') + (typeof e.className==='string'&&e.className?'.'+e.className.split(/\s+/).filter(Boolean).slice(0,2).join('.'):'');
  const rail = document.getElementById('right-rail');
  if (!rail) return { none: true };
  const direct = [...rail.children].map(c => ({ el: desc(c), ...box(c), hidden: c.hidden === true, text: (c.textContent||'').trim().replace(/\s+/g,' ').slice(0,40) }));
  return { rail: box(rail), dataset: {...rail.dataset}, directChildren: direct,
    // ★ 计划 4 · Task 5：【--rail-tree-w】/【--rail-preview-w】随 split 删除——
    //   继续读它们**恒得空字符串**（"量的比它以为的少"，本仓最贵那一族），
    //   不但白量，还会让下一个人以为"两列宽度还在"。改成量仍在用的
    //   【--rail-width】，并补三只槽的几何——那才是"一次一只"的直接证据。
    //   （注：本行在模板串里，不能出现反引号——首版写了，把模板串截断了。）
    railWidthVar: getComputedStyle(rail).getPropertyValue('--rail-width').trim(),
    slots: ['workspace-file-tree', 'right-rail-preview', 'right-rail-review'].map((id) => {
      const e = document.getElementById(id);
      if (!e) return { id, none: true };
      const b = box(e);
      return { id, ...b, on: rail.dataset.collapsed === 'false' && !e.hidden && b.display !== 'none' && b.w > 0 && b.h > 0 };
    }) };
})()`;

const TREE = `(() => {
  const t = document.querySelector('#workspace-file-tree') || document.querySelector('.file-tree');
  if (!t) return { none: true };
  const rows = [...t.querySelectorAll('button,[role=treeitem],li,.ft-row')].slice(0, 40).map(e => {
    const r = e.getBoundingClientRect();
    const nameEl = e.querySelector('.ft-name,span,code') || e;
    const cs = getComputedStyle(nameEl);
    return { name: (nameEl.textContent||'').trim().slice(0,40), full: nameEl.getAttribute('title'),
      w: Math.round(r.width), nameClientW: nameEl.clientWidth, nameScrollW: nameEl.scrollWidth,
      truncated: nameEl.scrollWidth > nameEl.clientWidth + 1, ellipsis: cs.textOverflow, indent: Math.round(r.x) };
  });
  return { count: rows.length, rows };
})()`;

const SIDEBAR = `(() => {
  const sb = document.querySelector('.sidebar'); if (!sb) return { none: true };
  const items = [...document.querySelectorAll('.run-item, [data-run-id]')].map(e => {
    const r = e.getBoundingClientRect();
    const t = e.querySelector('.run-item-ta, .run-title') || e;
    const time = e.querySelector('.run-time, time, .relative-time');
    return { title: (t.textContent||'').trim().replace(/\s+/g,' ').slice(0,42), w: Math.round(r.width),
      timeRaw: time ? (time.textContent||'').trim() : null, timeTitle: time?.getAttribute('title') ?? null,
      timeDatetime: time?.getAttribute('datetime') ?? null, y: Math.round(r.y), h: Math.round(r.h) };
  });
  const groups = [...document.querySelectorAll('.project-group,[data-project],.sb-group')].map(e => (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,40));
  return { runItemCount: items.length, items: items.slice(0,14), groupCount: groups.length, groups: groups.slice(0,8),
    scrollH: sb.scrollHeight, clientH: sb.clientHeight };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
// 靶 run 在宿主上解析：写死的 id 一旦不在（本探针原版就是），`#/run/<死id>`
// 会静默渲染空页、量到的几何全是 0——"绿而什么都没量到"。
const HEAVY_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, HEAVY);
if (!HEAVY_ID) { console.log("★ 宿主上拿不到任何 run——采样做不了"); await browser.close(); process.exit(1); }
console.log(`靶 run=${HEAVY_ID}${HEAVY_ID.startsWith(HEAVY) ? "" : `（写死的 ${HEAVY} 在宿主上不存在，回落到列表首条）`} · 宿主 ${BASE}`);
await page.evaluate((id) => { location.hash = `#/run/${id}`; }, HEAVY_ID);
await page.waitForTimeout(2200);

const out = {};
for (const w of [1920, 1600, 1440, 1100, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(600);
  out[w] = { rail: await page.evaluate(RAIL), sidebar: await page.evaluate(SIDEBAR) };
}
await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(600);
out.tree = await page.evaluate(TREE);

console.log("=== 右列各档几何 ===");
for (const w of [1920,1600,1440,1100,390]) {
  const r = out[w].rail;
  if (r.none) { console.log(`${w}: 无右列`); continue; }
  console.log(`\n[${w}] rail ${r.rail.w}×${r.rail.h} @x=${r.rail.x} mode=${r.dataset.mode} layout=${r.dataset.layout} surface=${r.dataset.surface} collapsed=${r.dataset.collapsed} flexDir=${r.rail.flexDir}`);
  for (const c of r.directChildren) console.log(`     ${String(c.w).padStart(4)}×${String(c.h).padStart(3)} @x=${String(c.x).padStart(4)} ${c.hidden?'[hidden]':'        '} ${c.el}  "${c.text.slice(0,30)}"`);
  console.log(`     --rail-width=${r.railWidthVar || "（未设）"} · 槽 ${r.slots.map((s) => `${s.id}=${s.none ? "无" : `${s.on ? "开" : "关"} ${s.w}×${s.h} ${s.display}`}`).join(" · ")}`);
}
console.log("\n=== 侧栏 run 列表 ===");
console.log(JSON.stringify(out[1600].sidebar, null, 1).slice(0, 1800));
console.log("\n=== 文件树 ===");
console.log(JSON.stringify(out.tree, null, 1).slice(0, 2200));
await writeFile(join(HERE, "rail-probe.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
