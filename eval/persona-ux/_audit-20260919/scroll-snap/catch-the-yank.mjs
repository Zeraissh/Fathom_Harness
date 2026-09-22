/**
 * 复现②：抓住「是谁把滚动拽回底部」。
 *
 * 上一条探针没复现，因为它测的是 loop **睡着的时候**（4 秒内 DOM 变更 0）。
 * 委托方说的"一直自动往下滑动"是**内容持续增长**时的现象。
 *
 * 决定性仪器：覆写 `Element.prototype.scrollTop` 的 setter，**记调用栈**。
 * 谁把它设成 scrollHeight，栈上就写谁的名字——不用猜。
 * （`keepScrollAnchored` 是 `scroller.scrollTop = scroller.scrollHeight`，
 *   改完之后所有后续调用都会经过这层包装。）
 *
 * 只记"变化"，不刷屏：loop 睡着时什么都不打印，醒来才出东西。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4173";
const RUN = process.env.AUDIT_RUN ?? "956661ce-6e90-4955-a5fd-3f1558ad922d";
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 480000);   // 默认盯 8 分钟

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/#/run/${RUN}/loop`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// ── 装仪器 ──────────────────────────────────────────────────
const installed = await page.evaluate(() => {
  const s = document.getElementById("main-area");
  if (!s) return { ok: false, why: "找不到 #main-area" };
  if (s.scrollHeight - s.clientHeight <= 40) return { ok: false, why: "这场对话不可滚" };

  window.__ev = [];          // 事件流（只记变化）
  window.__sets = [];        // scrollTop 被谁设过
  window.__mut = 0;

  const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) {
      if (this.id === "main-area") {
        const prev = desc.get.call(this);
        // 只记"被程序设到（接近）最大值"这件事——那正是拽回底部的形状
        const max = this.scrollHeight - this.clientHeight;
        if (Math.abs(Number(v) - this.scrollHeight) < 2 || (max > 100 && prev - Number(v) > 200)) {
          window.__sets.push({
            t: Math.round(performance.now()),
            from: Math.round(prev), to: Math.round(v), max: Math.round(max),
            follow: this.__followBottom,
            stack: String(new Error().stack || "").split("\n").slice(2, 7)
              .map((l) => l.trim().replace(/^at\s+/, "").replace(/\(.*?([^/\\]+:\d+:\d+)\)/, "$1")).join("  ← ").slice(0, 320),
          });
        }
      }
      return desc.set.call(this, v);
    },
  });

  let last = { st: Math.round(s.scrollTop), mut: 0, follow: s.__followBottom };
  s.addEventListener("scroll", () => {
    const cur = { st: Math.round(s.scrollTop), mut: window.__mut, follow: s.__followBottom };
    if (Math.abs(cur.st - last.st) > 20 || cur.follow !== last.follow) {
      window.__ev.push({ t: Math.round(performance.now()), ...cur, from: last.st });
      last = cur;
    }
  }, { passive: true });
  new MutationObserver((rs) => { window.__mut += rs.length; })
    .observe(s.querySelector(".chat-stream") ?? s, { childList: true, subtree: true, characterData: true });

  return { ok: true, scrollable: s.scrollHeight - s.clientHeight, items: s.querySelectorAll(".chat-item").length };
});

if (!installed.ok) {
  console.log("★ 装不上仪器：" + installed.why);
  await browser.close();
  process.exit(0);
}
console.log(`仪器就位：可滚 ${installed.scrollable}px · ${installed.items} 个条目`);

// ── 把用户置于"上翻过"的状态 ────────────────────────────────
const box = await page.evaluate(() => {
  const r = document.getElementById("main-area").getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await page.mouse.move(box.x, box.y);
await page.mouse.wheel(0, -1500);     // 上翻
await page.waitForTimeout(500);

const at = await page.evaluate(() => {
  const s = document.getElementById("main-area");
  return { dist: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight), follow: s.__followBottom, mut: window.__mut };
});
console.log(`上翻后：距底 ${at.dist}px · follow=${at.follow} · DOM 变更 ${at.mut}`);
console.log(`\n盯 ${Math.round(BUDGET_MS / 1000)} 秒，等 loop 醒来……\n`);

// ── 等，只打印变化 ───────────────────────────────────────────
let seenEv = 0, seenSets = 0;
const t0 = Date.now();
while (Date.now() - t0 < BUDGET_MS) {
  await page.waitForTimeout(4000);
  const snap = await page.evaluate(() => {
    const s = document.getElementById("main-area");
    return {
      ev: window.__ev, sets: window.__sets, mut: window.__mut,
      dist: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight),
      follow: s.__followBottom,
    };
  });
  for (const e of snap.ev.slice(seenEv)) {
    console.log(`  [${String(Math.round(e.t / 1000)).padStart(4)}s] 滚动 ${e.from} → ${e.st}  follow=${e.follow}  (其间 DOM 变更 ${e.mut})`);
  }
  seenEv = snap.ev.length;
  for (const x of snap.sets.slice(seenSets)) {
    console.log(`  [${String(Math.round(x.t / 1000)).padStart(4)}s] ★ scrollTop 被程序设为 ${x.to}（原 ${x.from} / 最大 ${x.max}）follow=${x.follow}`);
    console.log(`            栈：${x.stack}`);
  }
  if (snap.sets.length > seenSets) seenSets = snap.sets.length;
  const el = Math.round((Date.now() - t0) / 1000);
  if (el % 60 < 4) console.log(`  … ${el}s  距底 ${snap.dist}px · follow=${snap.follow} · DOM 变更累计 ${snap.mut}`);
  if (seenSets > 0) { console.log("\n★★ 抓到了：上面那笔 scrollTop 赋值就是拽回底部的动作"); break; }
}

const fin = await page.evaluate(() => {
  const s = document.getElementById("main-area");
  return { dist: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight), follow: s.__followBottom, mut: window.__mut, sets: window.__sets.length, ev: window.__ev.length };
});
console.log(`\n=== 收尾 ===`);
console.log(`  距底 ${fin.dist}px · follow=${fin.follow} · DOM 变更累计 ${fin.mut} · 滚动事件 ${fin.ev} 笔 · 可疑赋值 ${fin.sets} 笔`);
if (fin.sets === 0) console.log(`  ${fin.mut === 0 ? "整段时间里 loop 一次都没醒（DOM 变更 0）——需要更长的预算或换个更活跃的 run" : "有活动但没有可疑赋值——跟随逻辑本身没被触发拽回"}`);
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
