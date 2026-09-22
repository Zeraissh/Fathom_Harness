/**
 * 折叠的 composer scope 到底还画不画那个幽灵控件（计划 3 · T1）。
 *
 * 为什么必须有它：这一条的**单元测试锁不住**。`block()` 能证明"规则在"，
 * 但证明不了"盒子真的没了"——那要靠布局。计划 1 与计划 2 各有一条
 * "纯函数绿 + 接线锁绿而真实路径走不通"的洞（`.workspace-git-chip`、
 * `stripAttachmentLine`），所以这里**真去量**。
 *
 * 判据（三条）：
 *   ① 收起态：scopebar 的布局盒是空的（display:none / rect 全 0）
 *   ② 展开态：scopebar 有盒，且触发钮中心点**真的命中它自己或它的后代**
 *      —— 这一条是老 bug 的直接反证（老 bug 时那里命中的是 textarea）
 *   ③ 全程 0 条控制台错误
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
// 欢迎页就够：这条缺陷在欢迎页与 run 页都成立，而欢迎页不需要 run id
const URL = `${BASE}/#/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));

console.log(`靶：${URL}`);
await page.addInitScript(() => {
  try {
    // 逼到"从未展开过"的初始态——展开态是记在 localStorage 里的
    localStorage.removeItem("agent.ui.pref.composerScope");
    // 欢迎页首访会盖 onboarding 遮罩（#onboarding-overlay）挡住点击——
    // 本探针只关心 composer scope，与引导无关，跳过（同 verify-ab.mjs 的做法）
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
  } catch {}
});
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const geom = `(() => {
  const details = document.getElementById("composer-scope");
  const bar = document.getElementById("composer-scopebar");
  const trig = document.getElementById("workdir-trigger");
  if (!details || !bar || !trig) return { missing: true };
  const cs = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  const tr = trig.getBoundingClientRect();
  const cx = Math.round(tr.x + tr.width / 2);
  const cy = Math.round(tr.y + tr.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    open: details.open,
    barDisplay: cs.display,
    barW: Math.round(r.width), barH: Math.round(r.height),
    barY: Math.round(r.y),
    trigW: Math.round(tr.width), trigH: Math.round(tr.height),
    trigY: Math.round(tr.y),
    hitTag: hit ? hit.tagName : null,
    hitIsTrigger: Boolean(hit && (hit === trig || trig.contains(hit))),
    hitIsTextarea: Boolean(hit && hit.tagName === "TEXTAREA"),
  };
})()`;

console.log("\n=== ① 收起态（默认）===");
const g0 = await page.evaluate(geom);
if (g0.missing) { console.log("★ 找不到 composer-scope / scopebar / workdir-trigger"); await browser.close(); process.exit(1); }
console.log(`  details.open=${g0.open} · scopebar display=${g0.barDisplay} · 盒 ${g0.barW}×${g0.barH} @y=${g0.barY}`);
console.log(`  触发钮盒 ${g0.trigW}×${g0.trigH} @y=${g0.trigY}`);
const c1 = g0.barDisplay === "none" && g0.barW === 0 && g0.barH === 0;
console.log(`  ${c1 ? "✅ scopebar 真的不渲染（盒子是空的）" : "★ 还有盒子——幽灵控件还在"}`);

console.log("\n=== ② 展开态（点 summary）===");
await page.click("#composer-scope > summary");
await page.waitForSelector("#composer-scope[open]", { timeout: 5000 });
await page.waitForTimeout(300);
const g1 = await page.evaluate(geom);
console.log(`  details.open=${g1.open} · scopebar display=${g1.barDisplay} · 盒 ${g1.barW}×${g1.barH} @y=${g1.barY}`);
console.log(`  触发钮中心命中：<${g1.hitTag}> · 命中触发钮本身=${g1.hitIsTrigger} · 命中 textarea=${g1.hitIsTextarea}`);
const c2 = g1.open && g1.barH > 0 && g1.hitIsTrigger;
console.log(`  ${c2 ? "✅ 展开后触发钮真的点得到（老 bug 时这里命中的是 textarea）" : "★ 展开了还是点不到"}`);

console.log("\n=== ③ 控制台 ===");
console.log(errs.length ? errs.slice(0, 5) : "零");

await page.screenshot({ path: join(OUT, "composer-scope.png"), fullPage: false });
await browser.close();

if (c1 && c2 && errs.length === 0) {
  console.log("\n✅ 三条全成立：① 收起态无盒 ② 展开态可点 ③ 0 控制台错误");
  process.exit(0);
}
console.log("\n★ 有判据没成立，见上。");
process.exit(1);
