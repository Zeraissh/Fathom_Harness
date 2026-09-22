/**
 * A+B 活页验收（2026-09-19，只读 + 一次 Tab 按键，不发送）。
 *
 * 计划 4 · Task 5 改动（三处）：
 *   ① ★ BASE 默认写的是 `127.0.0.1:4173`——**用户的实时宿主**（本计划硬约束一
 *      明令不许碰）。探针要打 4173 就永远量的是"另一台机器上的两份代码"，
 *      与工作树无关。改成 `process.env.AUDIT_BASE ?? "http://127.0.0.1:4201"`。
 *   ② 靶 run 写死 `4ac7109c-…` ⇒ 在宿主上解析（死 id 会静默量到空页）。
 *   ③ ⑤ 那一步的注释写「重载后」，可代码是 `page.goto` 到**同一个 hash**——
 *      那是**同文档导航、不是重载**：init 不重跑、幽灵状态还在 ⇒ "重载后幽灵
 *      让位"这条从来没被真正验过。改成先回 `${BASE}/`（换文档 ⇒ 真重载）再进 run。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
// 235 轮那条：partial + blockers 非空（收尾清单里写着"未实测"）
const RUN = process.env.AUDIT_RUN ?? process.argv[2] ?? "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

const out = {};
/** 真·重载到靶 run：先回 `${BASE}/` 换文档（重跑 init），再进 hash */
async function land(runId) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, runId);
  await page.waitForTimeout(3200);
}

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);
if (!RUN_ID) { console.log("★ 宿主上拿不到任何 run——验收做不了"); await browser.close(); process.exit(1); }
console.log(`靶 run=${RUN_ID}${RUN_ID.startsWith(RUN) ? "" : `（写死的 ${RUN} 在宿主上不存在，回落到列表首条）`} · 宿主 ${BASE}`);
await land(RUN_ID);

// ① A：那排 chip 没了
out.nextActionsGone = await page.evaluate(`(() => ({
  host: document.querySelector(".next-actions"),
  chips: document.querySelectorAll("[data-next-id]").length,
  kicker: document.querySelector(".next-actions-kicker"),
}))()`);

// ② B：幽灵出现在 placeholder
out.ghost = await page.evaluate(`(() => {
  const t = document.getElementById("task-input");
  return { placeholder: t.placeholder, title: t.title, value: t.value };
})()`);

// ③ Tab 采纳
await page.focus("#task-input");
await page.keyboard.press("Tab");
await page.waitForTimeout(400);
out.afterTab = await page.evaluate(`(() => {
  const t = document.getElementById("task-input");
  return { value: t.value, placeholder: t.placeholder, focused: document.activeElement === t,
    selStart: t.selectionStart, selEnd: t.selectionEnd, len: t.value.length };
})()`);
await page.screenshot({ path: join(OUT, "next-ghost-accepted.png"), clip: await page.evaluate(() => {
  const r = document.getElementById("submit-form").getBoundingClientRect();
  return { x: Math.round(r.x) - 8, y: Math.max(0, Math.round(r.y) - 8), width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
}) });

// ④ 采纳后幽灵消失 + 再按 Tab 不劫持（该走焦点切换）
await page.keyboard.press("Tab");
await page.waitForTimeout(250);
out.tabAgain = await page.evaluate(`(() => ({
  stillFocused: document.activeElement === document.getElementById("task-input"),
  value: document.getElementById("task-input").value,
}))()`);

// ⑤ 重载后打字 → 幽灵立刻让位
await land(RUN_ID);
const ghostBefore = await page.evaluate(() => document.getElementById("task-input").placeholder);
await page.fill("#task-input", "我自己写的");
await page.waitForTimeout(500);
out.typing = await page.evaluate(`(() => {
  const t = document.getElementById("task-input");
  return { ghostBefore: ${JSON.stringify(ghostBefore)}, placeholderNow: t.placeholder, value: t.value };
})()`);

out.consoleErrors = errs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
