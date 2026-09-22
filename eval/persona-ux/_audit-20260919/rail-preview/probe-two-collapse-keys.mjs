/**
 * 两个"收起"键的位置关系 + 预览面的「切回文件」路径。
 *
 * 委托方问："主要是不是本来就有收起整列的按键了吗，会不会重复了"——
 * 答：是，`#right-rail-collapse` 就是。所以问题变成：坞自己那个 `pd-collapse`
 * 与它**重不重复**、以及「切回文件面」现在走哪条路。
 *
 * 本探针量三件：
 *   ① 两个键的实际矩形（离多近、像不像同一件事）
 *   ② 预览面开着时「切回文件面」的路：plan 4 删了 tab 行，换成对话头部
 *      back-bar 的召出钮——真点 `#rail-surface-work-tree`，断言树槽真的可见
 *   ③ 坞收起之后，那一列会不会自己收掉（树空时应当会——内容驱动可见性；
 *      plan 4 后坞收起经 preview:content 重算，这是 probe-collapse-btn 问二
 *      顺带看到的，这里正面量）
 *
 * 计划 4 · Task 5 改写（原版红了，三处）：
 *   ① BASE 硬编码 4173 → 参数化（本计划硬约束一）。
 *   ② 原版量 `.right-rail-tabs`——tab 行已删（死标记），量到恒 null。
 *   ③ 原版不召出预览面，dockKey 0×0；且头注释许的第三问从没实现。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "3221e432-9dda-42e0-b15f-377200ce96cf";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
  } catch {}
});
await page.goto(`${BASE}/#/run/${RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);

// 开画布 → 召出预览面（同 probe-collapse-btn 的路）
await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 20000 }).catch(() => {});
await page.evaluate(() => {
  const card = document.querySelectorAll(".artifact[data-artifact-path]")[0];
  card?.querySelector("[data-canvas-open]")?.click();
});
await page.waitForTimeout(2500);
const needSummon = await page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  return !rail || rail.dataset.surface !== "preview" || rail.dataset.collapsed === "true";
});
if (needSummon) {
  await page.click("#rail-surface-preview", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const probe = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
             display: getComputedStyle(e).display, visible: b.width > 0 && b.height > 0 }; };
  const rail = document.getElementById("right-rail");
  const railKey = document.getElementById("right-rail-collapse");
  const dockKey = document.querySelector("#right-rail-preview > #artifact-canvas-view .pd-collapse");
  const codeBtns = [...document.querySelectorAll(".rail-surface-btn--code")].map((b) => ({
    id: b.id, ...r(b), pressed: b.getAttribute("aria-pressed"),
  }));
  const treeSlot = document.querySelector("#right-rail > #workspace-file-tree");
  return {
    layout: rail?.dataset.layout, surface: rail?.dataset.surface, collapsed: rail?.dataset.collapsed,
    railRect: r(rail),
    railKey: r(railKey), railKeyTitle: railKey?.title,
    dockKey: dockKey ? { ...r(dockKey), title: dockKey.title } : null,
    gap: (railKey && dockKey) ? Math.round(Math.abs(railKey.getBoundingClientRect().x - dockKey.getBoundingClientRect().x)) : null,
    codeBtns,
    treeSlot: r(treeSlot),
    treeRows: document.querySelectorAll("#workspace-file-tree .ft-row").length,
    slotW: (() => { const s = document.getElementById("right-rail-preview"); return s ? Math.round(s.getBoundingClientRect().width) : null; })(),
  };
})()`;

const s1 = await page.evaluate(probe);
console.log(`档位 ${s1.layout} / 面 ${s1.surface} / collapsed=${s1.collapsed} · 右列 ${s1.railRect?.w}px（预览槽 ${s1.slotW}）\n`);
console.log(`① #right-rail-collapse（收起右列）  ${s1.railKey?.w}×${s1.railKey?.h} @(${s1.railKey?.x},${s1.railKey?.y})  title=「${s1.railKeyTitle}」`);
console.log(`   坞自己的 .pd-collapse（收起预览） ${s1.dockKey?.w}×${s1.dockKey?.h} @(${s1.dockKey?.x},${s1.dockKey?.y})  title=「${s1.dockKey?.title}」`);
console.log(`   两者横距 = ${s1.gap}px  ${s1.gap != null && s1.gap < 60 ? "★ 挨得很近，确实像两个同义键" : "（离得开，不是肉眼混淆的那种重复）"}`);
console.log(`\n② Code 脸四只召出钮：${s1.codeBtns.map((b) => `${b.id.replace("rail-surface-", "")}=${b.visible ? b.w + "×" + b.h : "藏"}`).join(" · ")}`);

// ② 真点「切回文件面」的路：⋮ 菜单 → 「文件」（Code 脸没有直挂树钮，Work 脸那只
// 在 Code 脸 display:none——设计稿如此，不是缺陷）
let switchPath = "未试";
try {
  await page.click("#rail-surface-more", { timeout: 4000 });
  await page.waitForTimeout(400);
  await page.click(".rail-more-item[data-rail-surface='tree']", { timeout: 4000 });
  await page.waitForTimeout(1200);
  const s2 = await page.evaluate(probe);
  const treeVisible = s2.treeSlot ? s2.treeSlot.visible && s2.treeSlot.display !== "none" : false;
  switchPath = s2.surface === "tree" && (treeVisible || s2.treeRows === 0)
    ? "✅"
    : `★（surface=${s2.surface} 树槽 ${s2.treeSlot ? `${s2.treeSlot.w}×${s2.treeSlot.h} display=${s2.treeSlot.display}` : "无"} 树行数=${s2.treeRows}）`;
  console.log(`   点「文件」后：surface=${s2.surface} · 树槽 ${s2.treeSlot ? `${s2.treeSlot.w}×${s2.treeSlot.h} display=${s2.treeSlot.display}` : "（无）"}（树行 ${s2.treeRows}）→ ${switchPath}`);
} catch (e) {
  console.log("   ★ 切回文件的点击失败：" + String(e).split("\n")[0].slice(0, 90));
}

// ③ 坞收起 → 列会不会自己收掉（树空时应会：内容驱动可见性）。
// 先回预览面（surface 现在是 tree ≠ preview，普通切换不会误触同键收起）
await page.click("#rail-surface-preview", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1200);
try {
  await page.click("#right-rail-preview > #artifact-canvas-view .pd-collapse", { timeout: 4000 });
  await page.waitForTimeout(1200);
  const s3 = await page.evaluate(probe);
  const slotHidden = await page.evaluate(() => {
    const el = document.getElementById("right-rail-preview");
    return !el || getComputedStyle(el).display === "none";
  });
  console.log(`\n③ 点坞收起后：预览槽 ${slotHidden ? "已藏" : "仍可见"} · 右列 collapsed=${s3.collapsed} ${s3.railRect?.w}px`);
  console.log(`   → ${slotHidden || s3.collapsed === "true" ? "✅ 列自己收掉了（树空 → 内容驱动可见性生效）" : "★ 列没收——与内容驱动可见性不符"}`);
} catch (e) {
  console.log("★ ③ 点击失败：" + String(e).split("\n")[0].slice(0, 90));
}

console.log("\n控制台错误：", errs.length ? errs.slice(0, 4) : "零");
await browser.close();
