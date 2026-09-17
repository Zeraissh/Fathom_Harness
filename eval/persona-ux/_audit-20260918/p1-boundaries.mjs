/**
 * P1 取证：右列空间契约的边界。
 *
 * 判据来自 docs/superpowers/specs/2026-09-18-ui-center-contract-design.md §6.3
 * （走查当时定的梯子已按"探边界"修正——旧档案的 1280/1100/900/700 探不到新契约的边界）：
 *
 *   700    窄档内部
 *   935    窄档最后 1px        ★预算边界：必须与 936 是两种形态
 *   936    中档第 1px
 *   1100   中档内部
 *   1439   中档最后 1px        ★产品边界：必须与 1440 是两种形态
 *   1440   宽档第 1px
 *   1600   宽档内部
 *
 * 量的都是 DOM 事实：data-mode / data-layout / 右列实际像素 / 对话列实际像素。
 * 不读 JS 变量，因为要证的正是"算出来的东西有没有真的落在屏幕上"。
 *
 * 用法：node p1-boundaries.mjs <baseUrl> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const OUT = process.argv[3] ?? "p1-boundaries.json";

const LADDER = [
  { width: 700, tier: "窄档内部" },
  { width: 935, tier: "窄档最后 1px（★边界）" },
  { width: 936, tier: "中档第 1px（★边界）" },
  { width: 1100, tier: "中档内部" },
  { width: 1439, tier: "中档最后 1px（★边界）" },
  { width: 1440, tier: "宽档第 1px（★边界）" },
  { width: 1600, tier: "宽档内部" },
];

const HEIGHT = 900;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: HEIGHT } });
const page = await ctx.newPage();
// 无新手卡；清掉偏好，量的是冷启动的契约而非残留偏好
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.removeItem("agent.ui.pref.rightRail");
    localStorage.removeItem("agent.ui.pref.filesRailCollapsed");
    localStorage.removeItem("agent-ui-preview-dock-width");
  } catch { /* 忽略 */ }
});

await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#right-rail", { timeout: 20000 });
await page.waitForTimeout(1200);

// 先脱离「欢迎态」再量：欢迎态下有一条既有规则
//   #main-panel.is-welcome #center-row:has(.files-rail) #main-area { min-width: 0 }
// （styles.css:3771）会刻意把地板归零——那是设计（空态要居中）。地板要证的
// 是**工作态**下的行为，第一版在欢迎态里量，量到 0px 是测错了状态。
const RUN_ID = process.env.P1_RUN_ID ?? "5d6a3212-1716-4be7-99db-0dbfb20228e5";
await page.evaluate((id) => { location.hash = `#/run/${id}/log`; }, RUN_ID);
await page.waitForTimeout(2200);
const welcomeGone = await page.evaluate(() =>
  !document.getElementById("main-panel")?.classList.contains("is-welcome"));
console.log(`已脱离欢迎态: ${welcomeGone}`);

// 先量左栏：边界 = 左栏实测 + 对话地板 416 + 右列下限 240。
// 不硬编码 936（那是"假设左栏 280"的算例），因为活页上左栏会随宽度变。
const readSidebar = () =>
  page.evaluate(() => {
    const el = document.querySelector(".sidebar");
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
await page.setViewportSize({ width: 1100, height: HEIGHT });
await page.waitForTimeout(400);
const sidebarAt1100 = await readSidebar();
const BOUNDARY = sidebarAt1100 + 416 + 240;

const ladder = [
  { width: 700, tier: "窄档内部" },
  { width: BOUNDARY - 1, tier: `窄档最后 1px（★预算边界 ${BOUNDARY}）` },
  { width: BOUNDARY, tier: `中档第 1px（★预算边界 ${BOUNDARY}）` },
  { width: 1100, tier: "中档内部" },
  { width: 1439, tier: "中档最后 1px（★产品边界）" },
  { width: 1440, tier: "宽档第 1px（★产品边界）" },
  { width: 1600, tier: "宽档内部" },
].filter((s, i, a) => s.width > 0 && a.findIndex((x) => x.width === s.width) === i);

console.log(`左栏实测（1100 宽处）= ${sidebarAt1100}px → 预算边界 = ${sidebarAt1100}+416+240 = ${BOUNDARY}\n`);

const rows = [];
for (const step of ladder) {
  await page.setViewportSize({ width: step.width, height: HEIGHT });
  // 等 rAF 里的 repaint 落地
  await page.waitForTimeout(450);
  const fact = await page.evaluate(() => {
    const rail = document.getElementById("right-rail");
    const center = document.querySelector("#main-area");
    const sidebar = document.querySelector(".sidebar");
    const rect = rail.getBoundingClientRect();
    return {
      mode: rail.dataset.mode,
      layout: rail.dataset.layout,
      collapsed: rail.dataset.collapsed,
      panel: rail.dataset.panel,
      railWidth: Math.round(rect.width),
      railOffsetLeft: Math.round(rect.left),
      centerWidth: center ? Math.round(center.getBoundingClientRect().width) : null,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      centerMinWidth: getComputedStyle(center).minWidth,
      // 覆盖档：右列不该占 flex 位——对话列右边界应接近主区右边界
      centerRight: center ? Math.round(center.getBoundingClientRect().right) : null,
      railRight: Math.round(rect.right),
    };
  });
  rows.push({ ...step, ...fact });
  await page.screenshot({ path: `p1-${step.width}.png` });
}

const at = (w) => rows.find((r) => r.width === w);
const narrow = at(700);
const wide = at(1600);
const sample = at(1100);

const verdict = {
  // 我 spec 里写的 936 是"假设左栏 280"的算例；活页实测左栏是 292（CSS 写的 280
  // 只是 width，实测含边框/滚动条）。这条守的是"边界用实测值算，不用魔法数"。
  [`★预算边界用实测左栏算（实测 ${sample.sidebarWidth}px ≠ CSS 里的 280）`]:
    sample.sidebarWidth !== 280 && sample.sidebarWidth === sidebarAt1100,
  [`★边界两侧是两个形态：${BOUNDARY - 1} 是 overlay、${BOUNDARY} 是 side`]:
    at(BOUNDARY - 1)?.mode === "overlay" && at(BOUNDARY)?.mode === "side",
  "★产品边界：1439 与 1440 是两种形态":
    at(1439).layout === "tabbed" && at(1440).layout === "split",
  // 第一版把变量设在 rail 上（与 #main-area 是兄弟，继承不到），活页量出 0px；
  // 第二版修好了变量位置，但仍在欢迎态里量——欢迎态有既有规则刻意归零。
  // 现在这条在**工作态**下量侧，并且明确记下欢迎态是特例。
  "★对话地板生效：工作态 side 档 #main-area 的 computed min-width = 416px":
    welcomeGone && at(1100).centerMinWidth === "416px" && at(BOUNDARY).centerMinWidth === "416px",
  "★覆盖档撤掉地板：窄档 computed min-width = 0px（不挤压对话）":
    narrow.centerMinWidth === "0px",
  "窄档不占位：700 处对话列右边界 ≈ 右列右边界（覆盖，不挤压）":
    narrow.mode === "overlay" && Math.abs(narrow.centerRight - narrow.railRight) <= 2,
  "中档占位：三列宽度之和 = 视口宽（谁都没多占）":
    Math.abs(sample.sidebarWidth + sample.centerWidth + sample.railWidth - 1100) <= 2,
  "宽档并排：1600 处 layout=split": wide.layout === "split",
  "全程右列宽度不越界 [240, 360]（side 档未收起）":
    rows
      .filter((r) => r.mode === "side" && r.collapsed === "false")
      .every((r) => r.railWidth >= 240 && r.railWidth <= 360),
  "全程对话列 ≥ 416（side 档）":
    rows.filter((r) => r.mode === "side").every((r) => r.centerWidth >= 416),
};

await writeFile(OUT, JSON.stringify({ verdict, rows }, null, 2), "utf-8");
console.log("宽度 | 档位 | mode | layout | 右列px | 对话px | 左栏px | 对话min-width");
for (const r of rows) {
  const star = r.tier.includes("★") ? " ★" : "";
  console.log(
    `${String(r.width).padStart(4)} | ${r.tier.padEnd(20)} | ${r.mode.padEnd(7)} | ${r.layout.padEnd(6)} | ${String(r.railWidth).padStart(6)} | ${String(r.centerWidth).padStart(6)} | ${String(r.sidebarWidth).padStart(6)} | ${r.centerMinWidth}${star}`,
  );
}
console.log("\n=== 判据 ===");
for (const [k, v] of Object.entries(verdict)) console.log((v ? "PASS" : "FAIL") + "  " + k);

await browser.close();
