/**
 * B 组修复活页验收：split 真并排 / 收起键可点且可回 / 放大盖满主区。
 * 用法：node ux-verify-B.mjs <baseUrl> <runId> <outDir>
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const RUN_ID = process.argv[3];
const OUT = process.argv[4] ?? ".";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.removeItem("agent.ui.pref.rightRail");
  } catch { /* 忽略 */ }
});
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#right-rail", { timeout: 20000 });
await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
await page.waitForTimeout(2200);

const geo = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), visible: !!(el.offsetWidth || el.offsetHeight) };
  }, sel);

// 1) split 并排：树与预览各一列、都在、横向不重叠
const rail = await geo("#right-rail");
const tree = await geo("#workspace-file-tree");
const preview = await geo("#right-rail-preview");
const tabbed = { rail, tree, preview, railX: rail?.x };
const sideBySide =
  tree && preview && tree.visible && preview.visible &&
  Math.abs(tree.w + preview.w - rail.w) <= 4 && tree.x !== preview.x;
console.log("=== split 并排 ===");
console.log(JSON.stringify({ tabbed, sideBySide }, null, 1));
await page.screenshot({ path: `${OUT}/b-split-1600.png` });

// 2) 收起键：Playwright 真点击（actionability 会证明它没被盖住）
console.log("=== 收起键 ===");
let clickOk = true;
try {
  await page.click("#right-rail-collapse", { timeout: 8000 });
} catch (e) {
  clickOk = false;
  console.log("点击失败：", e.message.split("\n")[0]);
}
await page.waitForTimeout(400);
const afterCollapse = {
  rail: await geo("#right-rail"),
  btn: await geo("#right-rail-collapse"),
  collapsed: await page.getAttribute("#right-rail", "data-collapsed"),
  aria: await page.getAttribute("#right-rail-collapse", "aria-label"),
};
await page.screenshot({ path: `${OUT}/b-collapsed-1600.png` });
try { await page.click("#right-rail-collapse", { timeout: 8000 }); } catch { clickOk = false; }
await page.waitForTimeout(400);
const afterExpand = {
  rail: await geo("#right-rail"),
  collapsed: await page.getAttribute("#right-rail", "data-collapsed"),
};
console.log(JSON.stringify({ clickOk, afterCollapse, afterExpand }, null, 1));

// 3) 放大：坞应盖满主区（而不是只填右列），且左边界 ≈ 主区左边界
console.log("=== 放大 ===");
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);
const expandBtn = page.locator(".pd-expand:visible").first();
const expandCount = await page.locator(".pd-expand:visible").count();
console.log("可见的放大键数量:", expandCount);
if (expandCount > 0) {
  await expandBtn.click({ timeout: 8000 }).catch((e) => console.log("放大点击失败：", e.message.split("\n")[0]));
  await page.waitForTimeout(500);
}
const mainPanel = await geo("#main-panel");
const dock = await geo(".preview-dock--expanded");
const covered =
  dock && mainPanel &&
  dock.x <= mainPanel.x + 2 && dock.x + dock.w >= mainPanel.x + mainPanel.w - 2;
console.log(JSON.stringify({ mainPanel, dock, covered }, null, 1));
await page.screenshot({ path: `${OUT}/b-expanded-1440.png` });

// 4) O1：超长文件名进坞顶条——.ac-title 可收缩后，省略号必须真的触发、头不越列
console.log("=== O1 长文件名 ===");
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);
const LONG = "这是一个用于测试文本溢出行为的超长文件名-abcdefghijklmnopqrstuvwxyz-0123456789-再来一段中文字符.txt";
const clicked = await page.evaluate((name) => {
  const btn = [...document.querySelectorAll("#workspace-file-tree button")].find((b) =>
    (b.textContent || "").includes("超长文件名"),
  );
  if (!btn) return false;
  btn.click();
  return true;
}, LONG);
await page.waitForTimeout(1500);
const headFacts = await page.evaluate(() => {
  const head = document.querySelector(".right-rail-preview .ac-head") || document.querySelector(".ac-head");
  const nameEl = head?.querySelector(".ac-name");
  const rail = document.getElementById("right-rail");
  if (!head || !rail) return null;
  const hr = head.getBoundingClientRect();
  const rr = rail.getBoundingClientRect();
  return {
    headOverflow: head.scrollWidth - head.clientWidth,
    headRight: Math.round(hr.right),
    railRight: Math.round(rr.right),
    nameTruncated: nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : null,
    nameText: nameEl?.textContent?.slice(0, 40),
  };
});
console.log(JSON.stringify({ clickedLongFile: clicked, headFacts }, null, 1));
await page.screenshot({ path: `${OUT}/b-o1-longfile-1440.png` });

await browser.close();
