/**
 * 4173 活页验证：上滑当场清跟随（2026-09-19 修）。
 *
 * 为什么这条能在 loop 睡着时也验得了：
 * 修法的作用点是**同步**的——`wheel` 事件到达时就把 `__followBottom` 清成
 * false，不等那个异步的 scroll 事件。所以在页面里派发一个 wheel、
 * **同一个 evaluate 里立刻读** `__followBottom`，就能确定地看到它翻了。
 * 修之前同一读数会一直是 true（跟随没断），这正是"拽回底部"的那一半。
 *
 * 另外核：① 宿主服务的确实是改过的 dom/patch.js（静态资源没有 Cache-Control，
 * 必须看服务端吐出来的字节，不能信本地工作树）② 往下滚不清跟随 ③ 收尾无回归。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4173";
const RUN = process.env.AUDIT_RUN ?? "956661ce-6e90-4955-a5fd-3f1558ad922d";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/#/run/${RUN}/loop`, { waitUntil: "domcontentloaded" });

// ① 服务端吐出来的 patch.js 里有没有这次的修法
//    注意**不要加查询串**：静态服务对 `/dom/patch.js?cb=…` 会 404（实测验过），
//    那会得到一句"没服务新代码"的假警报。
const served = await page.evaluate(async () => {
  const res = await fetch("/dom/patch.js");
  const t = res.ok ? await res.text() : "";
  return {
    status: res.status, bytes: t.length,
    hasWheel: t.includes('addEventListener("wheel"'),
    hasTouch: t.includes('addEventListener("touchmove"'),
    hasKey: t.includes('"PageUp"'),
  };
});
console.log(`宿主 /dom/patch.js：HTTP ${served.status} · ${served.bytes} 字节 · wheel 监听=${served.hasWheel} · touchmove=${served.hasTouch} · keydown=${served.hasKey}`);
if (!served.hasWheel) console.log("★★ 宿主没在服务改过的代码——下面的读数作废（需要重启宿主或强制刷新缓存）");

await page.waitForTimeout(4000);

const r = await page.evaluate(() => {
  const s = document.getElementById("main-area");
  if (!s) return { missing: true };
  const out = {};
  const read = () => s.__followBottom;

  // 基线：贴底跟随中
  s.scrollTop = s.scrollHeight;
  out.before = read();

  // ① 上滑：wheel 之后**同步**读——修法成立的话必须当场翻成 false
  s.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
  out.afterWheelUp = read();

  // ② 往上滚之后**贴回底部**，再往下滚一次：应当恢复/保持跟随，
  //    而不是被"往下滚"再次清掉（往下滚是在回底部，不算接管）
  s.scrollTop = s.scrollHeight;              // 贴底
  s.dispatchEvent(new Event("scroll"));      // 让 scroll 监听把意图重新武装
  out.rearmed = read();
  s.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  out.afterWheelDown = read();

  // ③ 键盘上翻
  s.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
  out.afterPageUp = read();

  out.scrollable = s.scrollHeight - s.clientHeight;
  return out;
});

if (r.missing) { console.log("★ 找不到 #main-area"); await browser.close(); process.exit(1); }

console.log(`\n可滚 ${r.scrollable}px`);
console.log(`  贴底时              __followBottom = ${r.before}`);
console.log(`  派发 wheel 上滑之后   __followBottom = ${r.afterWheelUp}   ← 必须 false，且是**同步**翻的`);
console.log(`  贴回底部（真实 scroll）=${r.rearmed} → 往下滚之后 = ${r.afterWheelDown}   ← 往下滚不算接管，不该再清`);
console.log(`  PgUp 之后            __followBottom = ${r.afterPageUp}   ← 必须 false`);

const pass = r.before === true && r.afterWheelUp === false && r.rearmed === true
  && r.afterWheelDown === true && r.afterPageUp === false;
console.log(`\n判定：${pass ? "✅ 四条都成立——上滑/键盘当场清跟随、贴回底部能恢复、往下滚不清" : "★★ 有条款不成立，看上面"}`);
console.log("控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
