/**
 * 三轮走查续：回答委托方两个直接提问 + 核一处修复的语义边界（2026-09-19，只读）。
 *   ① 对话可读性：列宽 / 字号 / 行高 / 行长（字符数）
 *   ② 「页面内容少」：横向预算分给了谁
 *   ③ 能力条读的是哪份 config（选中 run 的 run_config vs 当前执行者）——截图里
 *      claude-opus-4-8 却显示「识图 未配」，要核实是不是读了旧 run 的档案
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4173";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1880, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

const out = {};
out.budget = await page.evaluate(`(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), x: Math.round(r.x) }; };
  const rail = document.getElementById("right-rail");
  const d = document.querySelector(".detail-layout");
  return {
    viewport: innerWidth,
    sidebar: b("#sidebar"),
    conversation: b(".conversation-stack") ?? b("#main-area"),
    detailRail: b("#detail-rail"),
    rightRail: b("#right-rail"),
    detailLayoutCols: d ? getComputedStyle(d).gridTemplateColumns : null,
    railDataset: rail ? { mode: rail.dataset.mode, layout: rail.dataset.layout } : null,
  };
})()`);

// 打开一条最近的 run 量排版
const runId = await page.evaluate(async () => {
  const list = await (await fetch("/api/runs")).json();
  const done = list.find((r) => r.status === "done");
  return done ? done.runId : null;
});
out.runId = runId;
if (runId) {
  await page.goto(`${BASE}/#/run/${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  out.typography = await page.evaluate(`(() => {
    const pick = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { sel, w: Math.round(r.width), fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color, maxWidth: cs.maxWidth };
    };
    const conv = document.querySelector(".conversation-stack") || document.querySelector(".conversation");
    const cw = conv ? conv.getBoundingClientRect().width : 0;
    const fs = conv ? parseFloat(getComputedStyle(conv).fontSize) : 16;
    return {
      cols: pick(".conversation-stack") ?? pick("#main-area"),
      para: pick(".chat-text p") ?? pick(".md-p") ?? pick(".chat-text"),
      userBubble: pick(".chat-bubble--user") ?? pick(".msg--user"),
      bubbleW: (() => { const b = document.querySelector(".chat-bubble--user,.msg--user"); return b ? Math.round(b.getBoundingClientRect().width) : null; })(),
      // 行长：用中文字号粗算一行的容量（中文 ≈ 1em/字）
      estimatedCJKPerLine: cw > 0 ? Math.floor(cw / fs) : null,
    };
  })()`);
  out.nextActions = await page.evaluate(`(() => {
    const el = document.querySelector(".next-actions");
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    return { box: { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) },
      chips: [...el.querySelectorAll("button")].map((b) => (b.textContent || "").trim()) };
  })()`);
  // 能力条读的是谁
  out.capability = await page.evaluate(`(() => {
    const chips = document.getElementById("composer-capability-chips");
    const h = window.__harnessProbe ?? null;
    return { chips: chips ? (chips.textContent || "").trim() : null, hidden: chips ? chips.hidden : null };
  })()`);
  const h = await page.evaluate(async () => {
    const j = await (await fetch("/api/harness")).json();
    return { model: j.model, describeImageBacking: j.describeImageBacking, supportsVision: j.supportsVision };
  });
  out.harness = h;
  out.selectedRunConfig = await page.evaluate(`(() => {
    const e = document.querySelector("#composer-scope-text");
    return (document.querySelector(".composer-scope-text") || {}).textContent || null;
  })()`);
  await page.screenshot({ path: join(OUT, "readability-1880.png") });
}
await writeFile(join(HERE, "readability.json"), JSON.stringify(out, null, 1), "utf-8");
console.log(JSON.stringify(out, null, 1));
await browser.close();
