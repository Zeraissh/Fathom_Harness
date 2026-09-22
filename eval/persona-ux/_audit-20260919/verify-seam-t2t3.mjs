/**
 * 跨任务缝检查（方案 A · 计划 1）：Task 2 × Task 3。
 *
 * 每个任务的 reviewer 只看自己那段 diff，看不到缝。这条缝是真的：
 * Task 2 把左栏收起态从「整个消失」改成 48px，而 Task 3 的 `railPolicy()`
 * 吃 `sidebarWidth`（index.html:5215 `railSidebarWidth()`，其来源是
 * index.html:1324 `lastSidebarWidth = measured` 的**实测值**）。
 * 于是「收起左栏」会**减少**右栏算到的占用量 → 右栏可能从 tabbed 档
 * 自己升到 split 档。这未必是坏事（地方大了），但没人量过，
 * 而两个任务各自的测试都锁在自己的层里、看不见对方。
 *
 * 量法：先量展开态（新载入即展开），再**点真收起键**量收起态。
 * 不点展开键——收起态刷新后仍收起（偏好持久化），所以只走一个方向就够。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
await mkdir(join(HERE, "shots"), { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "94f58b8a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
const RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);

const probe = `(() => {
  const rail = document.getElementById("right-rail");
  const sb = document.getElementById("sidebar");
  const tree = document.querySelector(".files-rail");
  const prev = document.getElementById("right-rail-preview");
  const w = (e) => e ? Math.round(e.getBoundingClientRect().width) : null;
  return {
    sidebarCollapsed: document.body.classList.contains("sidebar-collapsed"),
    sidebarW: w(sb),
    railLayout: rail?.dataset.layout ?? null,
    railMode: rail?.dataset.mode ?? null,
    railW: w(rail),
    treeW: w(tree),
    previewW: w(prev),
    previewDisplay: prev ? getComputedStyle(prev).display : null,
    mainW: w(document.querySelector(".main")),
  };
})()`;

console.log("视口  左栏态  侧栏宽  右栏档   右栏宽  树      preview   主区宽");

/** 收起态下 #sidebar-expand（fixed @8,10, z=40）会压住 #sidebar-collapse 的位置，
 *  普通 click 会被 Playwright 判为"被拦截"而重试到超时。这里要的是**状态**，
 *  不是测那个键好不好点（那个键另有 verify-task2-hittest.mjs 专测），所以 force。 */
const clickState = async (sel) => {
  try { await page.click(sel, { timeout: 3000 }); }
  catch { await page.click(sel, { force: true, timeout: 3000 }).catch(() =>
    page.evaluate((s) => document.querySelector(s)?.click(), sel)); }
  await page.waitForTimeout(900);
};

for (const vw of [1440, 1100]) {
  await page.setViewportSize({ width: vw, height: 900 });
  await page.goto(`${BASE}/#/run/${RUN_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);

  // 新上下文默认展开；万一偏好里记着收起，点真展开键复位
  let open = await page.evaluate(probe);
  if (open.sidebarCollapsed) { await clickState("#sidebar-expand"); open = await page.evaluate(probe); }
  console.log(`${vw}  展开     ${String(open.sidebarW).padStart(4)}  ${String(open.railLayout).padEnd(6)} ${String(open.railW).padStart(5)}  ${String(open.treeW).padStart(4)}  ${String(open.previewW).padStart(4)} ${String(open.previewDisplay).padEnd(4)} ${String(open.mainW).padStart(5)}`);

  await clickState("#sidebar-collapse");
  const shut = await page.evaluate(probe);
  console.log(`${vw}  收起     ${String(shut.sidebarW).padStart(4)}  ${String(shut.railLayout).padEnd(6)} ${String(shut.railW).padStart(5)}  ${String(shut.treeW).padStart(4)}  ${String(shut.previewW).padStart(4)} ${String(shut.previewDisplay).padEnd(4)} ${String(shut.mainW).padStart(5)}`);
  if (!shut.sidebarCollapsed) console.log(`     ★ 没进收起态（侧栏宽 ${shut.sidebarW}）——下面这行不算数`);

  if (open.railLayout !== shut.railLayout) {
    console.log(`     ★ 缝：收起左栏让右栏从 ${open.railLayout} 变成了 ${shut.railLayout}`);
  } else {
    console.log(`     缝检查：收起左栏不影响右栏档位（都是 ${open.railLayout}）`);
  }
  // 复位成展开，免得影响下一档
  await page.evaluate(() => { try { localStorage.removeItem("agent.ui.pref.sidebarCollapsed"); } catch {} });
}
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
