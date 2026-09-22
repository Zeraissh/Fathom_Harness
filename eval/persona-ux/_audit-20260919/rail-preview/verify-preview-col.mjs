/**
 * 验收：坞收起之后，右列那条「预览」会不会自己让出来（2026-09-20 的 ③）。
 *
 * 委托方报「收起预览那个键没有作用」——核出来的实情是键好的、**列不收**。
 * 修法（计划 3）：`railPolicy` 收 `hasPreviewContent`，坞里没内容就把整列让出去。
 * 所以验收只有一条：
 *
 *   **打开产物（有内容）→ 预览槽在；点收起（没内容）→ 预览槽让掉、不再占位。**
 *
 * 计划 4 · Task 5 改写（原版红了 / 失效了，四处）：
 *   ① BASE 硬编码 `127.0.0.1:4173`（**用户的实时宿主**，本计划硬约束一禁止碰）
 *      → 参数化成 `process.env.AUDIT_BASE ?? "http://127.0.0.1:4201"`。
 *   ② 靶 run 写死 `956661ce-…`，且 boot 到 `#/run/<id>/loop`（旧路由形状）。
 *      写死的 id 一旦不在宿主上，量到的是空页 ⇒ 在宿主上解析 run。
 *   ③ 它点 `#rail-tab-tree`——**tab 行随计划 4 删除，恒 no-op**；并读
 *      `--rail-tree-w` / `--rail-preview-w`，两个变量同批删除 ⇒ **恒空字符串**。
 *      而 split 时代的"树吃满 railW"等式在新模型里**不成立**：树槽与预览槽
 *      是「一次一只」，预览面开着时树槽本就 display:none。
 *   ④ ★ 它**没有 `process.exitCode`** ⇒ 内部判据全 ★ 也退出 0 —— **假绿**。
 *      本仓最贵那一族的又一变体：这回它连"能红"都没有。已补 exitCode。
 *
 * 新世界的可证形式：内容驱动可见性的**效果** = 坞收起后预览槽不再占位。
 * 那正是原版要证的"键点了有作用"（它报的是"点了收起，那条缝纹丝不动"）。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "3221e432-9dda-42e0-b15f-377200ce96cf";
const DOCK_KEY = "#right-rail-preview > #artifact-canvas-view .pd-collapse";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 坞只住在 Code 脸的预览槽——不钉脸量到的是 0×0（probe-collapse-btn 的实测红因）。
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
  } catch {}
});
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

// ① 先核宿主服务的是改过的 rail-policy.js（静态资源没有 Cache-Control，只信服务端字节）
const served = await page.evaluate(async () => {
  const res = await fetch("/core/rail-policy.js");
  const t = res.ok ? await res.text() : "";
  return { status: res.status, plan4: t.includes("RAIL_SURFACES"), hasContent: t.includes("hasPreviewContent") };
});
console.log(`宿主 /core/rail-policy.js：HTTP ${served.status} · RAIL_SURFACES=${served.plan4} · hasPreviewContent=${served.hasContent}`);
if (!served.plan4) console.log("★★ 宿主没在服务计划 4 的代码——下面读数作废（需重启宿主或硬刷）");

const RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);
if (!RUN_ID) { console.log("★ 宿主上拿不到任何 run——验收做不了"); await browser.close(); process.exit(1); }
await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
await page.waitForTimeout(6000);
console.log(`靶 run=${RUN_ID} · 宿主 ${BASE}`);

// ② 打开一个产物 → 应当有预览列（走产物条的委托链，与 probe-collapse-btn 同一条路）
let opened = null;
await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 20000 }).catch(() => {});
const clickedCard = await page.evaluate(() => {
  const card = document.querySelectorAll(".artifact[data-artifact-path]")[0];
  if (!card) return "产物条里没有可点条目";
  const key = card.querySelector("[data-canvas-open]");
  if (!key) return "产物条上没有「打开画布」键";
  key.click();
  return null;
});
if (clickedCard) opened = clickedCard;
await page.waitForTimeout(2500);

// 召出预览面：只在需要时点（同键开着再点会收起——那是另一个判据的语义）
const needSummon = await page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  if (!rail) return false;
  return rail.dataset.surface !== "preview" || rail.dataset.collapsed === "true";
});
if (needSummon) {
  await page.click("#rail-surface-preview", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const probe = `(() => {
  const rail = document.getElementById("right-rail");
  const slot = document.getElementById("right-rail-preview");
  const canvas = document.getElementById("artifact-canvas-view");
  const b = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(e).display }; };
  const s = b(slot);
  return {
    layout: rail?.dataset.layout, surface: rail?.dataset.surface,
    collapsed: rail?.dataset.collapsed,
    railW: rail ? Math.round(rail.getBoundingClientRect().width) : null,
    preview: s,
    // 「让出来」的可证形式：列开着**且**槽有几何（收起态是细条，槽仍在 DOM 里但被裁掉）
    previewOn: rail?.dataset.collapsed === "false" && !!s && s.display !== "none" && s.w > 0 && s.h > 0,
    canvas: b(canvas),
  };
})()`;

const show = (tag, s) => {
  console.log(`\n【${tag}】档=${s.layout} 面=${s.surface} collapsed=${s.collapsed} 右列=${s.railW}`
    + `  预览槽=${s.preview ? `${s.preview.w}×${s.preview.h} display=${s.preview.display}` : "无"}`
    + `  算在=${s.previewOn}`);
};

if (opened) { console.log("\n★ 打不开产物：" + opened); }
const a = await page.evaluate(probe);
show("有内容（打开产物后）", a);

// ③ 点坞那个收起键 → 预览槽应当让掉（内容驱动可见性重算）
let clicked = null;
try { await page.click(DOCK_KEY, { timeout: 5000 }); }
catch (e) { clicked = "点不到：" + String(e).split("\n")[0].slice(0, 90); }
await page.waitForTimeout(1400);
const b2 = await page.evaluate(probe);
show(clicked ? "★ " + clicked : "没内容（点了收起之后）", b2);
await page.screenshot({ path: "eval/persona-ux/_verify-shots/rail-preview-after-collapse.png" }).catch(() => {});

// ④ 判
const beforeOK = opened === null && a.previewOn === true;
const afterOK = b2.previewOn === false;
const cErr = errs.length === 0;
console.log(`\n=== 判据 ===`);
console.log(`  打开产物时有预览列：${beforeOK ? "✅ " + a.preview.w + "px" : `★ 没有（算在=${a.previewOn}${opened ? " · " + opened : ""}）`}`);
console.log(`  收起之后预览槽让掉（不再占位）：${afterOK ? "✅ 算在=false" : `★ 仍占位 ${b2.preview ? b2.preview.w + "px display=" + b2.preview.display : "—"}`}`);
console.log(`  0 控制台错误：${cErr ? "✅" : "★ " + errs.slice(0, 4).join(" │ ")}`);
console.log(`  → ${beforeOK && afterOK && cErr ? "✅ 那个键现在**看得见效果**了" : "★★ 还没到位"}`);

await browser.close();
process.exitCode = beforeOK && afterOK && cErr ? 0 : 1;
