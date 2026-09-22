/**
 * 三轮走查 · 接线点勘察 2（2026-09-19，只读）。
 * 为「装配条复活」定落点：composer 的真实 DOM 树 + 模型接口形状 + 模型选择器菜单。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const TREE = `(() => {
  const d = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const walk = (e, depth) => {
    const r = e.getBoundingClientRect();
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    const line = { d: depth, el: d(e), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), text: own.slice(0, 40) };
    const kids = depth < 3 ? [...e.children].flatMap((c) => walk(c, depth + 1)) : [];
    return [line, ...kids];
  };
  const form = document.getElementById("submit-form");
  return form ? walk(form, 0).filter((x) => x.w > 8 && x.h > 0) : [];
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2400);

console.log("=== composer DOM 树（缩进=层级）===");
for (const n of await page.evaluate(TREE)) console.log(`${"  ".repeat(n.d)}${String(n.w).padStart(5)}×${String(n.h).padStart(3)} @y=${String(n.y).padStart(4)} ${n.el.slice(0, 46).padEnd(48)} ${n.text ? `"${n.text}"` : ""}`);

// 打开模型选择器看菜单结构
const pick = await page.evaluate(`(() => {
  const t = document.getElementById("executor-model-trigger");
  if (!t) return null;
  t.click();
  return true;
})()`);
await page.waitForTimeout(800);
const MENU = `(() => {
  const d = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const onScreen = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== "none"; };
  const rows = [...document.querySelectorAll("[class*=model][class*=menu] *, .model-menu *, [role=listbox] *, [role=option]")]
    .filter(onScreen).slice(0, 24)
    .map((e) => ({ el: d(e), text: (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 64), title: (e.getAttribute("title") || "").slice(0, 60), role: e.getAttribute("role") }));
  return { clicked: true, rowCount: rows.length, rows };
})()`;
const menu = await page.evaluate(MENU);
console.log(`\n=== 模型选择器菜单（点开=${pick}）===`);
for (const r of menu.rows ?? []) console.log(`   ${r.el.slice(0, 34).padEnd(36)} role=${String(r.role).padEnd(8)} "${r.text}"`);
await page.screenshot({ path: join(OUT, "model-picker-open.png") });

// 服务端模型接口形状
const api = await page.evaluate(async () => {
  const r = await fetch("/api/models");
  const j = await r.json();
  const keys = [];
  (function w(o, p) { if (o && typeof o === "object") for (const k of Object.keys(o)) { if (keys.length < 40) keys.push(p + "." + k); w(o[k], p + "." + k); } })(j, "");
  return { top: Object.keys(j), sample: JSON.stringify(j).slice(0, 700), visionKeys: keys.filter((k) => /vision|image|see/i.test(k)) };
});
console.log("\n=== GET /api/models ===");
console.log("顶层键:", JSON.stringify(api.top));
console.log("含 vision/image 的字段:", JSON.stringify(api.visionKeys));
console.log("样本:", api.sample);
await writeFile(join(HERE, "composer-layout2.json"), JSON.stringify({ menu, api }, null, 1), "utf-8");
await browser.close();
