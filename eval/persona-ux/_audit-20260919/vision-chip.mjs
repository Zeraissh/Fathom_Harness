/**
 * 三轮走查：识图能力在界面上到底露不露（2026-09-19）。
 * 只读。查 .app.js:5995 那段「没配就明说没配」的 chip 是否真的在屏上。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4173";

const FIND = `(() => {
  const onScreen = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.display !== "none" && cs.visibility !== "hidden";
  };
  const hits = [];
  for (const e of document.querySelectorAll("body *")) {
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
    if (!own.trim()) continue;
    if (!/识图|看图|图像|vision/i.test(own)) continue;
    const r = e.getBoundingClientRect();
    hits.push({
      text: own.trim().slice(0, 90),
      cls: typeof e.className === "string" ? e.className.slice(0, 40) : "",
      onScreen: onScreen(e),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
      title: (e.getAttribute("title") || "").slice(0, 160),
    });
  }
  return { count: hits.length, onScreenCount: hits.filter((h) => h.onScreen).length, hits: hits.slice(0, 12) };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);
const onRun = await page.evaluate(FIND);
console.log("=== 会话页上的识图字样 ===");
console.log(JSON.stringify(onRun, null, 1));
await page.screenshot({ path: join(OUT, "vision-chip-run.png") });

// 打开模型选择器看它写什么
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const opened = await page.evaluate(`(() => {
  const onScreen = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== "none"; };
  const t = document.getElementById("executor-model-trigger") || [...document.querySelectorAll("button")].find((b) => onScreen(b) && /kimi|模型/.test(b.textContent || ""));
  if (!t) return null;
  t.click();
  return (t.textContent || "").trim().slice(0, 60);
})()`);
await page.waitForTimeout(900);
const onPicker = await page.evaluate(FIND);
console.log("\n=== 模型选择器打开后（触发键:", JSON.stringify(opened), "）===");
console.log(JSON.stringify(onPicker, null, 1));
await page.screenshot({ path: join(OUT, "vision-chip-picker.png") });

await browser.close();
