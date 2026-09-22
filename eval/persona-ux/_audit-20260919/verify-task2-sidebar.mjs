/**
 * Task 2 独立活页复核（方案 A · 计划 1）。
 *
 * 为什么由控制者复跑：Task 2 的测试是**结构性**的（只读 CSS 文本），
 * reviewer 明确指出它抓不到 DOM 漂移。所以这一条必须真浏览器量——
 * 收起态到底是不是"可用的 48px 图标条"。
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
await page.waitForTimeout(2500);

const probe = `(() => {
  const onScreen = (e) => { if (!e) return false; const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0;
  };
  const sb = document.getElementById("sidebar");
  const r = sb.getBoundingClientRect();
  const ids = ["new-chat-btn","board-open-btn","artifacts-open-btn","schedules-open-btn","memory-btn","settings-open-btn","notifications-btn","theme-picker"];
  return {
    collapsedClass: document.body.classList.contains("sidebar-collapsed"),
    sidebarW: Math.round(r.width),
    sidebarDisplay: getComputedStyle(sb).display,
    buttons: ids.map((id) => {
      const e = document.getElementById(id);
      if (!e) return { id, missing: true };
      const rr = e.getBoundingClientRect();
      return { id, onScreen: onScreen(e), x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height),
        insideSidebar: rr.right <= r.right + 1 };
    }),
    // 横向溢出：收起态最怕图标条被挤出去
    bodyScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sidebarScrollX: sb.scrollWidth - sb.clientWidth,
  };
})()`;

const before = await page.evaluate(probe);
console.log("=== 展开态 ===");
console.log(JSON.stringify({ w: before.sidebarW, display: before.sidebarDisplay, overflow: before.sidebarScrollX }, null, 0));

// 点收起键（真事件），而不是直接改 class
await page.click("#sidebar-collapse");
await page.waitForTimeout(700);
const after = await page.evaluate(probe);
console.log("\n=== 收起态（点了收起键之后）===");
console.log(`侧栏宽 ${after.sidebarW}px · display=${after.sidebarDisplay} · 收起类=${after.collapsedClass}`);
console.log(`横向溢出：body=${after.bodyScrollX} · sidebar=${after.sidebarScrollX}`);
console.log("按钮可达性：");
for (const b of after.buttons) {
  console.log(`   ${b.missing ? "★缺失" : (b.onScreen ? "✓可见" : "✗不可见")}  ${b.id.padEnd(22)} ${b.missing ? "" : `@(${b.x},${b.y}) ${b.w}×${b.h}${b.insideSidebar ? "" : " ★在侧栏外"}`}`);
}
await page.screenshot({ path: join(HERE, "shots", "sidebar-collapsed-task2.png"), clip: { x: 0, y: 0, width: 420, height: 900 } });
console.log("\n=== 控制台错误 ===", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
