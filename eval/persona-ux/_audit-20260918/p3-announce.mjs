/**
 * P3 取证：选中不播报 + 静态标题。
 *
 * 判据来自 docs/superpowers/specs/2026-09-18-ui-center-contract-design.md §P3：
 *   1. 仅仅**选中**产物 → 不 announce（#status-announcer 里不许出现「产物画布已打开」）
 *   2. 坞的可及名称是静态的「预览 · X」（读屏用户照样知道在看哪个文件，
 *      但不会把一次点击听成一次事件）
 *
 * 三分类（还没写到磁盘 / 文件不在了 / 读不动）**不在本脚本**：
 * 活页上构造「打算写但没写成」需要一个停在写盘审批上的真实 run（要真模型调用），
 * 代价与不确定性都不划算。那一支由纯函数与 canvas 层单测覆盖，见证据文档 §4。
 *
 * 用法：node p3-announce.mjs <baseUrl> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const OUT = process.argv[3] ?? "p3-announce.json";
const RUN_ID = process.argv[4] ?? "5d6a3212-1716-4be7-99db-0dbfb20228e5";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ }
});

await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#right-rail", { timeout: 20000 });
await page.waitForTimeout(1200);

// 先清掉播报区，确保后面读到的不是上一次的残留
await page.evaluate(() => { const a = document.getElementById("status-announcer"); if (a) a.textContent = ""; });

// 走用户的路径：打开这个 run 的产物（深链就是点开产物的那条路由）
await page.evaluate((id) => { location.hash = `#/run/${id}/artifact/0`; }, RUN_ID);
await page.waitForTimeout(2500);

const after = await page.evaluate(() => {
  const announcer = document.getElementById("status-announcer");
  const dock = document.getElementById("artifact-canvas-view");
  return {
    announcerText: (announcer?.textContent ?? "").trim(),
    dockExists: Boolean(dock),
    dockAriaLabel: dock?.getAttribute("aria-label") ?? null,
    dockHidden: dock?.hasAttribute("hidden") ?? null,
    tabs: [...document.querySelectorAll(".ac-tabs .ac-tab-label")].map((n) => n.textContent.trim()),
  };
});

const verdict = {
  "判据1 选中不播报：播报区不含「产物画布已打开」": !/产物画布已打开/.test(after.announcerText),
  "判据1 播报区不含视图事件字样（画布/已打开）": !/画布|已打开/.test(after.announcerText),
  "判据2 坞的可及名称是静态「预览 · X」": /^预览 · /.test(after.dockAriaLabel ?? ""),
  "判据2 名称里带的是真实文件名": (after.dockAriaLabel ?? "").includes("devin-dir-note.txt"),
};

await page.screenshot({ path: "p3-announce.png" });
await writeFile(OUT, JSON.stringify({ verdict, after, runId: RUN_ID }, null, 2), "utf-8");
console.log(JSON.stringify({ verdict, after }, null, 2));
await browser.close();
