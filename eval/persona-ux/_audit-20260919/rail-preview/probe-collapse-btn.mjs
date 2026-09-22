/**
 * 精确问那一个键：`#right-rail-preview > #artifact-canvas-view .pd-collapse`
 * ——委托方元素路径逐字（`div#right-rail-preview > section#artifact-canvas-view
 * > header.ac-head > button.pd-collapse`）。
 *
 * 前两版探针都找错了对象（槽里有两个 `.pd-collapse`，`.find()` 取了隐藏浮层
 * 那个 0×0 的）。这一版**只认委托方那条路径**，并分两问：
 *   问一：点得到吗（动作性 + 中心命中）
 *   问二：点了有没有用（量 canvas / 坞 / 列 的前后）
 *
 * 计划 4 · Task 5 改写（原版红了，两处）：
 *   ① BASE 硬编码 4173 → 参数化（本计划硬约束一）。
 *   ② 原版 boot 到 `#/run/<RUN>/loop` 后直接量——split 时代 preview 列常在。
 *      新世界坞只住在 Code 脸的预览槽（`#right-rail-preview`），**不召出预览面
 *      槽就是 display:none，键 0×0 点不到**（Task 5 实测红因）。现在：开画布后
 *      先看列状态，面不是 preview / 列收着时才点召出钮（同键开着再点会收起——
 *      那是另一个判据的语义，别在这里误触）。
 *   「预览列只有 122px、canvas 121×5483」那条 split 时代的量已随 split 作废，删。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "3221e432-9dda-42e0-b15f-377200ce96cf";
const SEL = "#right-rail-preview > #artifact-canvas-view .pd-collapse";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
  } catch {}
});
await page.goto(`${BASE}/#/run/${RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);

// 开画布：产物条上的 data-canvas-open 走委托链（与 verify-dock-tabs 同一条路）
await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 20000 }).catch(() => {});
await page.evaluate(() => {
  const card = document.querySelectorAll(".artifact[data-artifact-path]")[0];
  card?.querySelector("[data-canvas-open]")?.click();
});
await page.waitForTimeout(2500);

// 召出预览面：只在需要时点（同键开着再点会收起——那是收起判据的语义）
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
  const slot = document.getElementById("right-rail-preview");
  const canvas = document.getElementById("artifact-canvas-view");
  const rail = document.getElementById("right-rail");
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y),
             display: getComputedStyle(e).display, hidden: e.hasAttribute("hidden") }; };
  const btn = document.querySelector(${JSON.stringify(SEL)});
  return {
    railSurface: rail?.dataset.surface, railLayout: rail?.dataset.layout, railCollapsed: rail?.dataset.collapsed,
    slot: r(slot),
    canvas: r(canvas),
    btn: btn ? { ...r(btn), expanded: btn.getAttribute("aria-expanded"), title: btn.title } : null,
    // 收起之后应当出现的那个浮出钮（rail 宿主下恒让位隐藏）
    expandBtn: (() => { const e = document.querySelector(".preview-expand"); return e ? { hidden: e.hidden, ...r(e) } : null; })(),
  };
})()`;

const show = (tag, s) => {
  console.log(`\n【${tag}】`);
  console.log(`  右列 surface=${s.railSurface}/${s.railLayout}/collapsed=${s.railCollapsed} · 槽=${s.slot ? s.slot.w + "×" + s.slot.h + " display=" + s.slot.display : "无"}`);
  console.log(`  canvas=${s.canvas ? s.canvas.w + "×" + s.canvas.h + " hidden=" + s.canvas.hidden + " display=" + s.canvas.display : "无"}`);
  console.log(`  收起键=${s.btn ? `${s.btn.w}×${s.btn.h} @(${s.btn.x},${s.btn.y}) expanded=${s.btn.expanded}` : "★ 找不到"}`);
  console.log(`  浮出钮=${s.expandBtn ? `hidden=${s.expandBtn.hidden} ${s.expandBtn.w}×${s.expandBtn.h} display=${s.expandBtn.display}` : "（不存在）"}`);
};

show("按之前", await page.evaluate(probe));

const n = await page.locator(SEL).count();
console.log(`\n该选择器命中 ${n} 个`);
let clickable = "未试";
try { await page.click(SEL, { timeout: 4000 }); clickable = "✅ 点得到（动作性通过）"; }
catch (e) { clickable = "★ 点不到：" + String(e).split("\n")[0].slice(0, 90); }
console.log("问一 · " + clickable);
await page.waitForTimeout(1200);

show("按之后", await page.evaluate(probe));

// 问二判读：点了之后坞得真收起来（hidden 或 0×0），列随内容驱动收到细条
const after = await page.evaluate(`(() => {
  const canvas = document.getElementById("artifact-canvas-view");
  const rail = document.getElementById("right-rail");
  const b = canvas ? canvas.getBoundingClientRect() : null;
  return {
    dockGone: !canvas || canvas.hidden === true || (b && b.width === 0 && b.height === 0),
    railCollapsed: rail?.dataset.collapsed === "true",
  };
})()`);
const effect = after.dockGone || after.railCollapsed;
console.log(`问二 · ${effect ? "✅ 生效（坞 " + (after.dockGone ? "已藏" : "仍在") + "，列 " + (after.railCollapsed ? "收到细条" : "未收") + "）" : "★ 没生效：坞还在、列也没收"}`);
console.log("\n控制台错误：", errs.length ? errs.slice(0, 4) : "零");
const cErr = errs.length === 0;
await browser.close();
console.log((clickable.startsWith("✅") && effect && cErr) ? "\n✅ 两问全过 + 0 控制台错误" : "\n★ 有问没过——看上面");
process.exitCode = clickable.startsWith("✅") && effect && cErr ? 0 : 1;
