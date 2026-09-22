/**
 * 控制者独立复核 —— I1（唯一改行为的一项）。
 *
 * 最终审查者就是在这条上抓到一句屏幕假话：首页那格"核查关"芯片
 * 与 composer 自己的 #{verify-toggle} 互相矛盾，勾上开关芯片也不动。
 * 修复把它接到开关上并加了 change 监听。**这一条必须我自己看着它翻。**
 *
 * 用 `el.click()` 而不是 Playwright 的 actionability 点击：这里要验的是
 * 「开关变了芯片跟不跟」，而 checkbox 的 .click() 会真的切换并派发 change，
 * 是真事件；actionability 那套（可见/不被遮挡/可滚动）另有 verify-task2-hittest.mjs 管。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

const probe = `(() => {
  const toggle = document.getElementById("verify-toggle");
  const mount = document.getElementById("composer-capability-chips");
  return {
    toggleExists: !!toggle,
    verifyChecked: toggle ? toggle.checked : null,
    chipText: mount ? (mount.textContent || "").trim().replace(/\\s+/g, " ") : "(无挂载点)",
    chipHidden: mount ? mount.hasAttribute("hidden") : null,
    // 芯片自己是不是还藏着（父 details 折叠时也算"用户看不见"）
    visible: mount ? (mount.getBoundingClientRect().width > 0) : null,
  };
})()`;

const show = async (label) => {
  const p = await page.evaluate(probe);
  const says = /核查关/.test(p.chipText) ? "说「核查关」" : (/核查/.test(p.chipText) ? "说「核查开」" : `说「${p.chipText}」`);
  console.log(`${label.padEnd(26)} 开关=${String(p.verifyChecked).padEnd(5)} 芯片=${says}`);
  return p;
};

console.log("=== 欢迎页（无 run）===");
const a = await show("初始");

await page.evaluate(() => document.getElementById("verify-toggle")?.click());
await page.waitForTimeout(600);
const b = await show("点一次开关之后");

await page.evaluate(() => document.getElementById("verify-toggle")?.click());
await page.waitForTimeout(600);
const c = await show("再点回来");

console.log("\n=== 判据 ===");
const consistent = (p) => (/核查关/.test(p.chipText) !== p.verifyChecked);
console.log(`初始    芯片与开关一致：${consistent(a) ? "✅" : "★★ 假话"}`);
console.log(`开关开  芯片与开关一致：${consistent(b) ? "✅" : "★★ 假话"}`);
console.log(`开关关  芯片与开关一致：${consistent(c) ? "✅" : "★★ 假话"}`);
console.log(`不刷新就跟着变：${a.chipText !== b.chipText ? "✅ 会" : "★★ 不会（change 监听没生效）"}`);
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
