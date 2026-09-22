/**
 * 三轮走查：把装配条的真身倒出来（2026-09-19，只读）。
 * 上一探说条在、没隐藏、没溢出，却一个 .assembly-chip 都没有——看它到底装了什么。
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

for (const [label, hash] of [["会话页", `#/run/${HEAVY}`], ["欢迎页", "#/"]]) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  const d = await page.evaluate(`(() => {
    const bar = document.getElementById("composer-scopebar");
    return {
      barHTML: bar ? bar.outerHTML.slice(0, 420) : null,
      barText: bar ? (bar.textContent || "").trim().slice(0, 200) : null,
      barChildren: bar ? [...bar.children].map((x) => x.tagName.toLowerCase() + "." + (x.className || "").toString().slice(0, 26)) : [],
      chipsInDoc: document.querySelectorAll(".assembly-chip").length,
      assemblyClasses: [...new Set([...document.querySelectorAll("[class*=assembly]")].map((e) => e.className.toString()))].slice(0, 8),
    };
  })()`);
  console.log(`\n######## ${label} ########`);
  console.log("条内 children:", JSON.stringify(d.barChildren));
  console.log("条 visible text:", JSON.stringify(d.barText));
  console.log("全文档 .assembly-chip 数:", d.chipsInDoc);
  console.log("含 assembly 的类名:", JSON.stringify(d.assemblyClasses));
  console.log("条 outerHTML 头:", d.barHTML);
  // 顺带把 composer 顶部那一行的可见 chip 列出来
  const chips = await page.evaluate(`(() => {
    const onScreen = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== "none"; };
    return [...document.querySelectorAll("#submit-form button, #submit-form [title]")]
      .filter(onScreen)
      .map((e) => ({ t: (e.textContent || "").trim().slice(0, 34), id: e.id, cls: (e.className || "").toString().slice(0, 26), title: (e.getAttribute("title") || "").slice(0, 90) }))
      .slice(0, 14);
  })()`);
  console.log("composer 可见控件:", JSON.stringify(chips, null, 1));
}
await browser.close();
