/**
 * Task 2 复核的**盲点**补测：命中测试。
 *
 * 我上一轮的验收集 `verify-task2-sidebar.mjs` 判"按钮可见"用的是
 * `getBoundingClientRect()` —— 纯几何：宽高大于 2px、右/下边在屏内。
 * 但**几何可见 ≠ 点得到**：一个元素可以摆得漂漂亮亮，却被另一个元素
 * 盖在上面吃掉点击。发现路径很偶然：写缝检查时 Playwright 报
 * `#sidebar-expand` 拦住了对 `#sidebar-collapse` 的指针事件——
 * 收起态那个浮动展开键，位置和 48px 图标条是重叠的。
 *
 * 这条只有真浏览器 + elementFromPoint 量得出来，是仓库里记过的
 * 「浏览器实测才抓得到的缺陷类型」的正中靶心。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
await mkdir(join(HERE, "shots"), { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

// 收起：用真事件。force 只用来绕过"被同类元素压住"的动作性检查——
// 这里要的是"进入收起态"这个状态，不是测这个键本身好不好点。
await page.click("#sidebar-collapse", { force: true }).catch(async () => {
  await page.evaluate(() => document.getElementById("sidebar-collapse")?.click());
});
await page.waitForTimeout(900);

const report = await page.evaluate(() => {
  const IDS = ["new-chat-btn", "board-open-btn", "artifacts-open-btn", "schedules-open-btn",
    "memory-btn", "settings-open-btn", "notifications-btn", "theme-picker"];
  const sb = document.getElementById("sidebar");
  const sr = sb.getBoundingClientRect();
  const rows = IDS.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, state: "★缺失" };
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const reachable = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    // 谁吃掉了这次点击
    const blocker = reachable ? null : (() => {
      const b = hit?.closest?.("button, [role=button], a, input, select") ?? hit;
      return b ? { tag: b.tagName, id: b.id || null, cls: (b.className || "").toString().slice(0, 60),
        label: b.getAttribute?.("aria-label") || b.getAttribute?.("title") || null } : null;
    })();
    return { id, state: reachable ? "✓点得到" : "✗被盖住", cx, cy,
      w: Math.round(r.width), h: Math.round(r.height), insideSidebar: r.right <= sr.right + 1, blocker };
  });
  const ex = document.getElementById("sidebar-expand");
  const exr = ex?.getBoundingClientRect();
  return {
    collapsed: document.body.classList.contains("sidebar-collapsed"),
    sidebarW: Math.round(sr.width),
    expandBtn: ex ? { x: Math.round(exr.x), y: Math.round(exr.y), w: Math.round(exr.width), h: Math.round(exr.height),
      display: getComputedStyle(ex).display, z: getComputedStyle(ex).zIndex, pos: getComputedStyle(ex).position,
      coversSidebar: exr.x < sr.right && exr.right > sr.x } : null,
    rows,
  };
});

console.log(`收起态=${report.collapsed} · 侧栏宽=${report.sidebarW}px`);
if (report.expandBtn) {
  const e = report.expandBtn;
  console.log(`#sidebar-expand：@(${e.x},${e.y}) ${e.w}×${e.h} position=${e.pos} z=${e.z} display=${e.display}` +
    `${e.coversSidebar ? "  ★与侧栏横向重叠" : ""}`);
}
console.log("\n按钮命中测试（elementFromPoint 打在每个按钮中心）：");
for (const r of report.rows) {
  if (r.state === "★缺失") { console.log(`  ★缺失  ${r.id}`); continue; }
  const extra = r.blocker ? `  ← 被 ${r.blocker.tag}${r.blocker.id ? "#" + r.blocker.id : ""}${r.blocker.label ? `「${r.blocker.label}」` : ""} 吃掉` : "";
  console.log(`  ${r.state}  ${r.id.padEnd(20)} @(${r.cx},${r.cy}) ${r.w}×${r.h}${r.insideSidebar ? "" : " ★在侧栏外"}${extra}`);
}
const bad = report.rows.filter((r) => r.state === "✗被盖住").length;
console.log(`\n结论：${bad === 0 ? "八个按钮全部真的点得到" : `★ ${bad} 个按钮几何可见但点不到`}`);
await page.screenshot({ path: join(HERE, "shots", "hit-test-task2.png"), clip: { x: 0, y: 0, width: 300, height: 900 } });
console.log("控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
