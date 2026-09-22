/**
 * 三轮走查 · 接线点勘察（2026-09-19，只读）。
 * 回答两件事：
 *   ① #composer-scope 是开是收？装配条挂哪儿才看得见？
 *   ② deriveAssemblyBar 在当前 state 下会产出哪些 chip（决定"全复活"还是"只复活能力类"）？
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

const LAYOUT = `(() => {
  const d = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const box = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), display: cs.display }; };
  const scope = document.getElementById("composer-scope");
  const form = document.getElementById("submit-form");
  const out = {};
  if (scope) out.scope = { ...box(scope), open: scope.hasAttribute("open"), tag: "details" };
  if (form) out.formKids = [...form.children].map((e) => ({ el: d(e), ...box(e) }));
  // composer 内所有可见文字元素（看这一行到底显示什么）
  if (form) {
    out.visibleTexts = [...form.querySelectorAll("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      return own.length > 0;
    }).map((e) => ({ el: d(e), text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim().slice(0, 50), y: Math.round(e.getBoundingClientRect().y) }));
  }
  return out;
})()`;

const CHIPS = `(() => {
  // deriveAssemblyBar 是模块内函数；直接从模块里拿它的输出不可行，
  // 改用等价判据：看 state 里哪些字段会被它读（cfg.verify / workdir / supportsVision / roleModels / workspaceGit）
  // ——本探只报告"数据在不在"，chip 文本由源码判据给出。
  return typeof window.deriveAssemblyBar;
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

const out = {};
for (const [label, hash] of [["会话页", `#/run/${HEAVY}`], ["欢迎页", "#/"]]) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  out[label] = await page.evaluate(LAYOUT);
  out[label].deriveExposed = await page.evaluate(CHIPS);
  const s = out[label].scope;
  console.log(`\n######## ${label} ########`);
  console.log(`#composer-scope: ${s ? `${s.w}×${s.h} @y=${s.y}  open=${s.open}` : "(不存在)"}`);
  console.log("composer 顶层子项:");
  for (const k of out[label].formKids ?? []) console.log(`   ${String(k.w).padStart(5)}×${String(k.h).padStart(3)} @y=${String(k.y).padStart(4)} ${k.el}`);
  console.log("composer 内可见文字（按 y 排序，看输入框上方到底显示什么）:");
  for (const t of (out[label].visibleTexts ?? []).sort((a, b) => a.y - b.y).slice(0, 14))
    console.log(`   y=${String(t.y).padStart(4)} ${t.el.slice(0, 34).padEnd(36)} "${t.text}"`);
}
await writeFile(join(HERE, "composer-layout.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
