/**
 * 三轮走查 · 修复活页验收（2026-09-19）。
 *
 * 靶子：隔离宿主 4201（跑新代码，执行者 kimi-k3 → describeImageBacking=none）。
 * 用全新 browser context = 干净缓存——预览面板的标签页按启发式缓存住了旧 app.js
 * （服务端静态资源不发 Cache-Control），location.reload() 拿不回来。
 *
 * 只读：只导航、读 DOM、点自己的能力条（不碰会话/审批）。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.VERIFY_BASE ?? "http://127.0.0.1:4201";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 180)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 180)));
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

const out = {};
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

// —— ① 能力条（Fix 1）——
out.capability = await page.evaluate(`(() => {
  const chips = document.getElementById("composer-capability-chips");
  const why = document.getElementById("composer-capability-why");
  if (!chips) return { missing: true };
  const cr = chips.getBoundingClientRect();
  const txt = document.querySelector(".composer-scope-text").getBoundingClientRect();
  const sum = document.getElementById("composer-scope-summary");
  return {
    hidden: chips.hidden,
    labels: [...chips.querySelectorAll(".assembly-chip")].map((b) => (b.textContent || "").trim()),
    inSummary: sum.contains(chips),
    onScreen: cr.width > 2 && cr.height > 2 && cr.y >= 0 && cr.bottom <= innerHeight,
    rightOfText: Math.round(cr.x) >= Math.round(txt.right) - 2,
    box: { w: Math.round(cr.width), h: Math.round(cr.height), x: Math.round(cr.x), y: Math.round(cr.y) },
    summaryText: (document.querySelector(".composer-scope-text") || {}).textContent || "",
    detailsOpen: document.getElementById("composer-scope").hasAttribute("open"),
  };
})()`);
await page.screenshot({ path: join(OUT, "verify-A-capability-bar.png"), clip: await page.evaluate(() => {
  const r = document.getElementById("submit-form").getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.max(0, Math.round(r.y) - 16), width: Math.round(r.width), height: Math.round(r.height) + 32 };
}) });

// 点开理由
const chipBtn = await page.$("#composer-capability-chips .assembly-chip");
if (chipBtn) {
  await chipBtn.click();
  await page.waitForTimeout(350);
  out.why = await page.evaluate(`(() => {
    const why = document.getElementById("composer-capability-why");
    const r = why.getBoundingClientRect();
    return { hidden: why.hidden, w: Math.round(r.width), h: Math.round(r.height), onScreen: r.height > 2 && r.bottom <= innerHeight, text: (why.textContent || "").trim().slice(0, 140) };
  })()`);
  await page.screenshot({ path: join(OUT, "verify-B-capability-why.png"), clip: await page.evaluate(() => {
    const a = document.getElementById("composer-capability-why").getBoundingClientRect();
    const b = document.getElementById("submit-form").getBoundingClientRect();
    const top = Math.max(0, Math.min(a.top, b.top) - 12);
    return { x: Math.round(Math.min(a.x, b.x)) - 12, y: Math.round(top), width: Math.round(b.width) + 24, height: Math.round(Math.max(a.bottom, b.bottom) - top) + 24 };
  }) });
  await chipBtn.click();
  await page.waitForTimeout(250);
  out.whyClosedAgain = await page.evaluate(() => document.getElementById("composer-capability-why").hidden);
}

// —— ② 模型选择器标（Fix 2）——
// 选择器在收起的 details 里（display 上被输入行盖住），先展开才点得到
await page.click("#composer-scope-summary");
await page.waitForTimeout(400);
await page.click("#executor-model-trigger");
await page.waitForTimeout(500);
out.picker = await page.evaluate(`(() => {
  const items = [...document.querySelectorAll(".model-picker-item")];
  const t = document.getElementById("executor-model-trigger");
  const d = document.getElementById("executor-model-detail");
  const dr = d ? d.getBoundingClientRect() : null;
  return {
    items: items.map((li) => {
      const f = li.querySelector(".model-picker-item-flag");
      return { id: li.dataset.id, sub: (li.querySelector(".model-picker-item-sub") || {}).textContent || "", flag: f && !f.hidden ? (f.textContent || "").trim() : null };
    }),
    triggerTitleHasCaveat: (t.getAttribute("title") || "").includes("看不见图"),
    detailOnScreen: dr ? dr.width > 2 && dr.height > 2 : false,
    detailHasCaveat: d ? (d.textContent || "").includes("看不见图") : false,
  };
})()`);
await page.screenshot({ path: join(OUT, "verify-C-picker-flag.png") });

out.consoleErrors = errs;
await writeFile(join(HERE, "verify-fix.json"), JSON.stringify(out, null, 1), "utf-8");
console.log(JSON.stringify(out, null, 1));
await browser.close();
