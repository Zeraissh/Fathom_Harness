/**
 * UX 走查：档位梯子 + 全页溢出扫描（2026-09-18 晚）。
 *
 * 对象：fathom-audit 隔离宿主（127.0.0.1:4201），工作态 = 打开一条已完成的 run。
 * 仪器纪律：窄屏用真实视口（setViewportSize）；截图全分辨率；DOM 事实落 JSON。
 *
 * 梯子先量左栏实测宽再算预算边界 = 左栏宽 + 416 + 240（spec §6.3 纪律）。
 *
 * 用法：node ux-ladder-scan.mjs <baseUrl> <runId> <outDir>
 */
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const RUN_ID = process.argv[3] ?? "";
const OUT = process.argv[4] ?? ".";
const HEIGHT = 900;

await mkdir(OUT, { recursive: true });

/** 在页面里跑的溢出扫描器。返回命中的元素（选择器、文本、差值、关键样式）。 */
const SCAN = `(() => {
  const rows = [];
  const seen = new Set();
  const desc = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const chain = (el) => { const parts = []; let n = el.parentElement, d = 0; while (n && d < 4) { parts.push(desc(n)); n = n.parentElement; d++; } return parts.join(' < '); };
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    const hDelta = el.scrollWidth - el.clientWidth;
    const vDelta = el.scrollHeight - el.clientHeight;
    const key = desc(el) + '|' + Math.round(r.width);
    if (seen.has(key)) continue;
    // 横向：内容比盒子宽（截断或撑破）
    if (hDelta > 1 && el.clientWidth > 0) {
      const scrollable = ['auto','scroll'].includes(cs.overflowX);
      seen.add(key);
      rows.push({
        kind: 'h', el: desc(el), w: Math.round(r.width), delta: hDelta,
        overflowX: cs.overflowX, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
        minWidth: cs.minWidth, flex: cs.flex,
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48),
        scrollable, parent: chain(el)
      });
    }
    // 纵向：内容比盒子高而被裁
    if (vDelta > 1 && el.clientHeight > 0 && ['hidden','clip'].includes(cs.overflowY)) {
      seen.add(key);
      rows.push({ kind: 'v', el: desc(el), h: Math.round(r.height), delta: vDelta,
        overflowY: cs.overflowY, text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), parent: chain(el) });
    }
    // 撑破父级右缘：子元素右边界超出父盒子
    const p = el.parentElement;
    const pSrOnly = p && (typeof p.className === 'string' && p.className.includes('sr-only'));
    const pTiny = p && p.getBoundingClientRect().width <= 2;
    if (p && p !== document.body && !pSrOnly && !pTiny && r.right > p.getBoundingClientRect().right + 1 && cs.position !== 'fixed') {
      const pk = 'bloat|' + desc(el);
      if (!seen.has(pk)) {
        seen.add(pk);
        rows.push({ kind: 'bloat', el: desc(el), over: Math.round(r.right - p.getBoundingClientRect().right),
          parent: desc(p), text: (el.textContent || '').trim().slice(0, 40) });
      }
    }
  }
  return rows.slice(0, 60);
})()`;

const FACTS = `(() => {
  const rail = document.getElementById('right-rail');
  const center = document.querySelector('#main-area');
  const sidebar = document.querySelector('.sidebar');
  const rr = rail?.getBoundingClientRect();
  const cr = center?.getBoundingClientRect();
  return {
    mode: rail?.dataset.mode, layout: rail?.dataset.layout, collapsed: rail?.dataset.collapsed, panel: rail?.dataset.panel,
    railW: rr ? Math.round(rr.width) : null, railX: rr ? Math.round(rr.x) : null,
    centerW: cr ? Math.round(cr.width) : null, centerMin: center ? getComputedStyle(center).minWidth : null,
    sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
    rightRailVisible: rail ? !!(rail.offsetWidth || rail.offsetHeight) : false,
    tabsVisible: (() => { const g = document.querySelector('[aria-label="右列面板"]'); return g ? !!(g.offsetWidth || g.offsetHeight) : false; })(),
    bodyScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: HEIGHT } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.removeItem("agent.ui.pref.rightRail");
    localStorage.removeItem("agent.ui.pref.filesRailCollapsed");
    localStorage.removeItem("agent-ui-preview-dock-width");
    localStorage.removeItem("agent.ui.pref.composerScope");
  } catch { /* 忽略 */ }
});

await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#right-rail", { timeout: 20000 });
await page.waitForTimeout(1200);

// 工作态：打开已完成的 run（欢迎态有既有的地板归零规则，不是本次要量的）
if (RUN_ID) {
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
  await page.waitForTimeout(2200);
}
const welcomeGone = await page.evaluate(() => !document.getElementById('main-panel')?.classList.contains('is-welcome'));
console.log(`工作态(is-welcome 已消失): ${welcomeGone}`);

const sidebarAt1100 = await page.evaluate(() => Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0));
const BOUNDARY = sidebarAt1100 + 416 + 240;
console.log(`左栏实测(1100)=${sidebarAt1100}px → 预算边界=${BOUNDARY}`);

const ladder = [
  { width: 700, tier: "窄档内部" },
  { width: BOUNDARY - 1, tier: "窄档最后1px(★预算边界)" },
  { width: BOUNDARY, tier: "中档第1px(★预算边界)" },
  { width: 1100, tier: "中档内部" },
  { width: 1439, tier: "中档最后1px(★产品边界)" },
  { width: 1440, tier: "宽档第1px(★产品边界)" },
  { width: 1600, tier: "宽档内部" },
].filter((s, i, a) => s.width > 0 && a.findIndex(x => x.width === s.width) === i);

const out = { sidebarAt1100, boundary: BOUNDARY, rows: [] };

for (const step of ladder) {
  await page.setViewportSize({ width: step.width, height: HEIGHT });
  await page.waitForTimeout(450);
  const facts = await page.evaluate(FACTS);
  const overflow = await page.evaluate(SCAN);
  out.rows.push({ ...step, facts, overflowCount: overflow.length, overflow });
  await page.screenshot({ path: `${OUT}/ladder-${step.width}.png` });

  // 每个宽度也把右列收起再拍一张（展开/隐藏的对照）
  const collapseBtn = await page.$('#right-rail-collapse');
  if (collapseBtn) {
    await collapseBtn.click().catch(() => {});
    await page.waitForTimeout(350);
    const collapsedFacts = await page.evaluate(FACTS);
    await page.screenshot({ path: `${OUT}/ladder-${step.width}-collapsed.png` });
    out.rows[out.rows.length - 1].collapsedFacts = collapsedFacts;
    // 恢复
    const expandBtn = await page.$('#right-rail-collapse');
    if (expandBtn) await expandBtn.click().catch(() => {});
    await page.waitForTimeout(350);
  }
}

await writeFile(`${OUT}/ux-ladder-scan.json`, JSON.stringify(out, null, 2), "utf-8");

// 控制台汇总
console.log("\n宽度 | 档位 | mode | layout | 右列px | 对话px | 左栏px | 溢出命中");
for (const r of out.rows) {
  console.log(`${String(r.width).padStart(4)} | ${r.tier.padEnd(18)} | ${r.facts.mode?.padEnd(7)} | ${r.facts.layout?.padEnd(6)} | ${String(r.facts.railW).padStart(6)} | ${String(r.facts.centerW).padStart(6)} | ${String(r.facts.sidebarW).padStart(6)} | ${r.overflowCount}${r.tier.includes('★') ? '  ★' : ''}`);
}
const total = out.rows.reduce((n, r) => n + r.overflowCount, 0);
console.log(`\n溢出命中合计: ${total}`);
// 跨宽度去重的 top 命中
const tally = new Map();
for (const r of out.rows) for (const o of r.overflow) {
  const k = `${o.kind}|${o.el}`;
  if (!tally.has(k)) tally.set(k, { ...o, widths: [] });
  tally.get(k).widths.push(r.width);
}
const top = [...tally.values()].sort((a, b) => b.widths.length - a.widths.length).slice(0, 20);
console.log("\n=== 跨宽度最稳定的溢出命中 ===");
for (const t of top) console.log(`[${t.kind}] ${t.el} ×${t.widths.length}宽 ${t.delta ? 'delta=' + t.delta : t.over ? 'over=' + t.over : ''} "${t.text || ''}"`);

await browser.close();
