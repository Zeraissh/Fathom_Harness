/**
 * P4 实拍：变更面板现在给到哪一步。
 *
 * 计划里的闸门是「先实拍现状，再决定补 diff 还是删条目」。本脚本量的是**补完之后**
 * 的样子，判据：
 *   1. 右栏「变更」分区列出本 run 触碰的文件（这是补之前就有的）
 *   2. 展开那一行 → 出现「改动 N 处」与 - / + 两种行（这是补的）
 *      —— 数据来自 edit_file 入参的 old_string/new_string，不需要磁盘上的旧版本
 *
 * 用法：node p4-changes.mjs <baseUrl> <runId> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const RUN_ID = process.argv[3] ?? "46f123df-4f70-4ce7-98ee-f0d7ce5dcb28";
const OUT = process.argv[4] ?? "p4-changes.json";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.removeItem("agent.ui.pref.rightRail");
  } catch { /* 忽略 */ }
});

await page.goto(`${BASE}/#/run/${RUN_ID}/log`, { waitUntil: "commit" });
await page.waitForTimeout(2500);

// 抽屉默认收起但**入口可见**：像用户那样点 summary 展开它。
// （此前 `hidden` 把 summary 一起藏掉，事件流与「变更」两处功能一起不可达。）
const summary = page.locator("#detail-drawer > summary");
if (await summary.count()) await summary.click({ force: true }).catch(() => {});
await page.waitForTimeout(1000);

// 又是第二层：详情右栏默认收起（.detail-rail--collapsed 会把 .rail-body display:none），
// 「变更」分区就在里面。真实用户要点 #rail-toggle 才看得到。这条也记进证据。
const railToggle = page.locator("#rail-toggle");
if (await railToggle.count()) await railToggle.click({ force: true }).catch(() => {});
await page.waitForTimeout(1000);

// 等变更列表真的渲染出来再动手（这条 run 有 22 个变更，比小 run 慢）
await page.waitForSelector(".chg-row", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const railText = () =>
  page.evaluate(() => (document.querySelector(".detail-rail")?.textContent ?? "").replace(/\s+/g, " ").trim());

const before = await railText();

// 点**有逐行改动的那一行**（write+edit 的那个），不是第一条
// ——第一条多半是纯 write，本来就没有 old→new 可给。
const TARGET = process.env.P4_TARGET_PATH ?? "anhui-tv-center/_src/scene_b.js";
const head = page.locator(".chg-row").filter({ hasText: TARGET }).locator(".chg-row-head").first();
let headCount = await head.count();
if (!headCount) headCount = await page.locator(".chg-row-head").first().count(); // 回退：第一条
if (headCount) {
  const el = (await page.locator(".chg-row").filter({ hasText: TARGET }).locator(".chg-row-head").first().count())
    ? page.locator(".chg-row").filter({ hasText: TARGET }).locator(".chg-row-head").first()
    : page.locator(".chg-row-head").first();
  await el.click({ force: true }).catch(() => {});
}
await page.waitForTimeout(1800);
const rowCount = await page.locator(".chg-row").count();

const after = await page.evaluate(() => {
  const box = document.querySelector(".chg-hunks");
  const lines = box ? [...box.querySelectorAll(".chg-hunk-line")] : [];
  return {
    hunksFound: Boolean(box),
    title: box?.querySelector(".chg-hunks-title")?.textContent ?? null,
    delCount: lines.filter((n) => n.className.includes("--del")).length,
    addCount: lines.filter((n) => n.className.includes("--add")).length,
    firstDel: lines.find((n) => n.className.includes("--del"))?.textContent ?? null,
    firstAdd: lines.find((n) => n.className.includes("--add"))?.textContent ?? null,
    fullText: lines.map((n) => n.textContent).join(" | ").slice(0, 300),
  };
});

const verdict = {
  "1 右栏「变更」分区列出了本 run 触碰的文件":
    /变更/.test(before) && /\.[a-z]{2,4}/.test(before) && rowCount > 0,
  "2 展开后出现「改动 N 处」": after.hunksFound && /^改动 \d+ 处$/.test(after.title ?? ""),
  "2 有 - 行（旧文）": after.delCount > 0,
  "2 有 + 行（新文）": after.addCount > 0,
  "2 行内容确实带 +/- 前缀": /^- /m.test(after.fullText) || (after.firstDel ?? "").startsWith("- "),
};

await page.screenshot({ path: "p4-changes.png" });
await writeFile(OUT, JSON.stringify({ verdict, rowCount, target: TARGET, before: before.slice(0, 200), after, runId: RUN_ID }, null, 2), "utf-8");
console.log(JSON.stringify({ verdict, rowCount, after, railBeforeSample: before.slice(0, 200) }, null, 2));
await browser.close();
