/**
 * 复现：4173 上 `#/run/956661ce…/loop` 的会话，上滑被持续拽回底部。
 *
 * 委托方原话：「一箱上滑动就会调到底部」。
 *
 * 为什么用真 wheel 事件而不是 `scroller.scrollTop = x`：
 *   `.content-area` 的 `scroll-behavior` 是 smooth，而本项目的自动化面板
 *   **不合成画面**——任何带动画的滚动在那里都不会推进（本仓 `index.html:1127-1130`
 *   的注释记过这个坑，上一轮有人差点把"量不到"当成产品缺陷）。
 *   `page.mouse.wheel()` 是真实输入事件，浏览器自己走滚动与 scroll 事件，
 *   绕开这个问题。
 *
 * 决定性诊断：`scroller.__followBottom` 是挂在**元素上**的 expando
 * （`dom/patch.js:167`），所以在页面里读得到它。
 *   · 读完仍是 true  → 「跟随意图」没被用户的滚动改写（判据/监听的问题）
 *   · 读成 false 而位置照样回到底 → 另有其二在滚（不是跟随逻辑的锅）
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
// 截图落 _verify-shots（gitignore）——不再往已跟踪的 shots/ 写
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4173";
const RUN = process.env.AUDIT_RUN ?? "956661ce-6e90-4955-a5fd-3f1558ad922d";
const URL = `${BASE}/#/run/${RUN}/loop`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));

console.log(`靶：${URL}`);
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);   // 让它把事件重放完、稳定下来

const geom = `(() => {
  const s = document.getElementById("main-area");
  if (!s) return { missing: true };
  const cs = getComputedStyle(s);
  return {
    scrollTop: Math.round(s.scrollTop), scrollHeight: Math.round(s.scrollHeight),
    clientHeight: Math.round(s.clientHeight),
    distToBottom: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight),
    scrollable: s.scrollHeight - s.clientHeight,
    follow: s.__followBottom,
    behavior: cs.scrollBehavior,
    items: s.querySelectorAll(".chat-item").length,
  };
})()`;

const g0 = await page.evaluate(geom);
if (g0.missing) { console.log("★ 找不到 #main-area"); await browser.close(); process.exit(1); }
console.log("\n=== 起始状态 ===");
console.log(`  可滚 ${g0.scrollable}px（内容 ${g0.scrollHeight} / 视口 ${g0.clientHeight}）· 距底 ${g0.distToBottom}px`);
console.log(`  __followBottom=${g0.follow} · scroll-behavior=${g0.behavior} · 对话条目 ${g0.items}`);

if (g0.scrollable <= 0) {
  console.log("\n★ 这场对话当前不可滚（内容比视口短），复现不了——换一场或等它长起来。");
  await browser.close();
  process.exit(0);
}

// 装记录器：每次 scroll 记一笔，另记变更次数（看"拽回"发生在什么之间）
await page.evaluate(() => {
  const s = document.getElementById("main-area");
  window.__scrollLog = [];
  window.__mutations = 0;
  s.addEventListener("scroll", () => {
    window.__scrollLog.push({
      t: Math.round(performance.now()),
      st: Math.round(s.scrollTop),
      follow: s.__followBottom,
    });
  }, { passive: true });
  const host = s.querySelector(".chat-stream") ?? s;
  new MutationObserver((records) => { window.__mutations += records.length; })
    .observe(host, { childList: true, subtree: true, characterData: true });
});

const box = await page.evaluate(() => {
  const r = document.getElementById("main-area").getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await page.mouse.move(box.x, box.y);

// 先确认"跟随中"：把位置滚到底，看它是否保持
console.log("\n=== A. 基线：贴底时跟随（应当保持贴底）===");
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(1200);
const gA = await page.evaluate(geom);
console.log(`  距底 ${gA.distToBottom}px · follow=${gA.follow}   ${gA.distToBottom <= 40 ? "✅ 贴底" : "★ 没贴住"}`);

// 真正的一步：上滑
console.log("\n=== B. 上滑（真 wheel）——这一步是复现的核心 ===");
await page.evaluate(() => { window.__scrollLog = []; window.__mutations = 0; });
const before = await page.evaluate(geom);
await page.mouse.wheel(0, -900);
await page.waitForTimeout(300);
const right = await page.evaluate(geom);
console.log(`  上滑前距底 ${before.distToBottom}px → 上滑后 300ms 距底 ${right.distToBottom}px · follow=${right.follow}`);

// 盯 4 秒：看它会不会自己回去
for (const ms of [700, 1500, 2500, 4000]) {
  await page.waitForTimeout(ms - (ms === 700 ? 300 : 0));
  const g = await page.evaluate(geom);
  console.log(`  +${String(ms).padStart(4)}ms  距底 ${String(g.distToBottom).padStart(5)}px · follow=${String(g.follow).padStart(5)} · 期间 DOM 变更 ${await page.evaluate(() => window.__mutations)}`);
}

const log = await page.evaluate(() => window.__scrollLog.slice(0, 40));
console.log(`\n=== 滚动事件轨迹（共 ${log.length} 笔，最多显 40）===`);
for (const e of log) console.log(`  t=${String(e.t).padStart(6)}ms  scrollTop=${String(e.st).padStart(6)}  follow=${e.follow}`);

const gEnd = await page.evaluate(geom);
const snappedBack = gEnd.distToBottom <= 40 && before.distToBottom <= 40;
console.log(`\n=== 判定 ===`);
console.log(`  上滑 900px 之后 4 秒，距底 ${gEnd.distToBottom}px（起始 ${before.distToBottom}px）`);
console.log(`  ${snappedBack ? "★★ 复现：被拽回底部" : (gEnd.distToBottom > 40 ? "✅ 停住了，没被拽回" : "（结果不明确，见上面轨迹）")}`);
if (right.follow === true && snappedBack) {
  console.log(`  ★ 线索：上滑之后 __followBottom 仍是 true —— 「意图」没被用户的滚动改写`);
} else if (right.follow === false && snappedBack) {
  console.log(`  ★ 线索：__followBottom 已是 false 而位置照样回底 —— 另有其二在滚，不是跟随逻辑`);
}
await page.screenshot({ path: join(OUT, "scroll-snap-4173.png"), fullPage: false });
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
