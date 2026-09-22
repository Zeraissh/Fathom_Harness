/**
 * 三轮走查 recon（2026-09-19）：对用户真机 4173 只读取样。
 * 纪律：只读——不点发送/审批/停止/删除；只导航、读 DOM、截图。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4173";
const HEAVY = process.env.HEAVY_RUN ?? "4ac7109c-4d36-47f7-8ac3-27e3219da60a";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));

const settle = (ms = 1600) => page.waitForTimeout(ms);

/** 可见文本清单（表达方式镜头原料） */
const TEXTS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const out = [];
  for (const el of document.querySelectorAll('button,[role=button],a[href],input,textarea,select,label,summary,[title],[aria-label],h1,h2,h3,h4,th')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    out.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className==='string'?el.className:'').split(/\s+/).filter(Boolean).slice(0,2).join('.'),
      text: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,60),
      title: el.getAttribute('title'), aria: el.getAttribute('aria-label'),
      w: Math.round(r.width), h: Math.round(r.height), disabled: el.disabled === true });
  }
  return out;
})()`;

/** 对比度扫描：文字 vs 实际背景（视觉镜头） */
const CONTRAST = `(() => {
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return null;
    const [r,g,b] = m.slice(0,3).map(Number).map(v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const bgOf = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; n = n.parentElement; } return 'rgb(255,255,255)'; };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const fg = cs.color, bg = bgOf(el);
    const lf = lum(fg), lb = lum(bg);
    if (lf === null || lb === null) continue;
    const ratio = (Math.max(lf,lb)+0.05)/(Math.min(lf,lb)+0.05);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight,10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const key = Math.round(ratio*100)+'|'+cs.fontSize+'|'+cs.color;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ ratio: Math.round(ratio*100)/100, need, pass: ratio >= need, px, weight: cs.fontWeight, color: fg, bg,
      cls: (typeof el.className==='string'?el.className:'').split(/\s+/).filter(Boolean).slice(0,2).join('.'),
      text: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,44) });
  }
  return out.filter(x => !x.pass).sort((a,b)=>a.ratio-b.ratio).slice(0, 40);
})()`;

/** 溢出扫描（沿用一轮仪器） */
const SCAN = `(() => {
  const rows = []; const seen = new Set();
  const desc = (el) => { const cls=(typeof el.className==='string'?el.className:'').split(/\s+/).filter(Boolean).slice(0,3).join('.');
    return el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (cls?'.'+cls:''); };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width<2||r.height<2) continue;
    const cs = getComputedStyle(el); const d = el.scrollWidth - el.clientWidth;
    if (d > 1 && el.clientWidth > 0 && !['auto','scroll'].includes(cs.overflowX)) {
      const k = desc(el); if (seen.has(k)) continue; seen.add(k);
      rows.push({ el: desc(el), delta: d, text: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40) });
    }
  }
  return rows.slice(0,30);
})()`;

const FACTS = `(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  return { url: location.hash, bodyScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sidebar: g('.sidebar'), main: g('#main-area'), rail: g('#right-rail'), composer: g('#composer,form'),
    railCollapsed: document.getElementById('right-rail')?.dataset.collapsed,
    railMode: document.getElementById('right-rail')?.dataset.mode,
    railLayout: document.getElementById('right-rail')?.dataset.layout };
})()`;

const steps = [];
async function snap(name, hash, widths = [1600, 1100, 390]) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
    await settle();
    const facts = await page.evaluate(FACTS);
    const overflow = await page.evaluate(SCAN);
    const texts = await page.evaluate(TEXTS);
    const contrast = w === 1600 ? await page.evaluate(CONTRAST) : [];
    await page.screenshot({ path: join(OUT, `${name}-${w}.png`) });
    steps.push({ name, w, facts, overflow, textCount: texts.length, contrastFails: contrast.length });
    if (w === 1600) await writeFile(join(HERE, `${name}-texts.json`), JSON.stringify(texts, null, 1), "utf-8");
    if (w === 1600) await writeFile(join(HERE, `${name}-contrast.json`), JSON.stringify(contrast, null, 1), "utf-8");
    if (overflow.length) console.log(`  [${name}@${w}] 溢出 ${overflow.length}:`, overflow.slice(0,3).map(o=>`${o.el}(+${o.delta}px)`).join(" "));
    if (contrast.length) console.log(`  [${name}@${w}] 对比度不合格 ${contrast.length} 处，最差:`, contrast.slice(0,3).map(c=>`${c.ratio}:1 ${c.cls} "${c.text.slice(0,20)}"`).join(" | "));
  }
}

console.log("=== ① 首页（50 份真档案 = 结构镜头）===");
await snap("home", "#/");
console.log("=== ② 你那条重 run（4ac7109c，235 轮）===");
await snap("heavy", `#/run/${HEAVY}`);
console.log("=== ③ 同一条的 loop 视图 ===");
await snap("heavy-loop", `#/run/${HEAVY}/loop`, [1600, 390]);

await writeFile(join(HERE, "recon.json"), JSON.stringify({ steps, consoleErrors: errs }, null, 1), "utf-8");
console.log("\n=== 控制台错误 ===", errs.length ? errs.slice(0,5) : "零");
console.log("shots →", OUT);
await browser.close();
