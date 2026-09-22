/**
 * 可读性：在**内容密集**的一条真 run 上量排版（2026-09-19，只读）。
 * 默认那条 235 轮的 4ac7109c——短 run 量不出正文的真实排版。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
await mkdir(join(HERE, "shots"), { recursive: true });
const BASE = "http://127.0.0.1:4173";
const RUN = process.argv[2] ?? "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1880, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/#/run/${RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const out = await page.evaluate(`(() => {
  const info = (e) => {
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight);
    return {
      w: Math.round(r.width), fontSize: cs.fontSize, lineHeight: cs.lineHeight,
      ratio: +(lh / fs).toFixed(2), fontWeight: cs.fontWeight, color: cs.color, family: cs.fontFamily.slice(0, 40),
      cjkPerLine: fs > 0 ? Math.round(r.width / fs) : null,
      text: (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 50),
    };
  };
  // 正文段落：挑最宽的那一族的代表
  const paras = [...document.querySelectorAll(".md-p, .chat-text p, .chat-para")]
    .filter((e) => (e.textContent || "").trim().length > 30);
  const widest = paras.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const stack = document.querySelector(".conversation-stack") || document.querySelector(".conversation");
  const d = document.querySelector(".detail-layout");
  return {
    viewport: innerWidth,
    stack: info(stack),
    paraSample: info(widest),
    paraCount: paras.length,
    paraWidths: [...new Set(paras.map((p) => Math.round(p.getBoundingClientRect().width)))].slice(0, 6),
    detailLayout: d ? { cols: getComputedStyle(d).gridTemplateColumns, rows: getComputedStyle(d).gridTemplateRows, gap: getComputedStyle(d).gap } : null,
    sidebarW: Math.round((document.querySelector("#sidebar") || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
  };
})()`);
console.log(JSON.stringify(out, null, 1));
await browser.close();
