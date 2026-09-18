/**
 * 裁决：真实鼠标点击「发送」键是否提交？（源码注释称「嵌入预览/某些环境下 submit 会被吞」）
 * 真点击 = Playwright 的 page.click（CDP Input 真实事件），不是 el.click()。
 *
 * 同时拍一张「写盘审批挂起 + 工具轮进行中」的高分辨率证据图（进行时静默窗口）。
 *
 * 用法：node ux-click-send.mjs <baseUrl> <outDir>
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const OUT = process.argv[3] ?? ".";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ }
});

const postLog = [];
page.on("request", (req) => { if (req.method() === "POST" && req.url().includes("/api/")) postLog.push(req.url()); });

await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#task-input", { timeout: 20000 });
await page.waitForTimeout(1500);

// 1) 真实鼠标点击发送键
await page.fill("#task-input", "把 hello-code.txt 第一行的内容改成 pong2，只动这一行。");
await page.waitForTimeout(300);
const postsBefore = postLog.length;
await page.click("#submit-btn", { timeout: 8000 }).catch(e => console.log("click 异常:", e.message));
await page.waitForTimeout(2500);
const postsAfter = postLog.length;
console.log(`真实鼠标点击发送键 → POST 数：${postsBefore} → ${postsAfter}`);

// 2) 若没提交，改用 Enter（对照）
if (postsAfter === postsBefore) {
  console.log("点击未产生 POST，试 Enter…");
  await page.focus("#task-input");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  console.log(`Enter 后 POST 数：${postLog.length}`);
}
console.log("POST 明细:", postLog.join("\n  "));

// 3) 等一条工具轮任务跑起来（写盘卡挂起时拍证据图）
const runsResp = await page.evaluate(async () => (await fetch("/api/runs")).json());
const active = runsResp.filter(r => r.status === "running").sort((a, b) => b.createdAt - a.createdAt)[0];
if (active) {
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, active.runId);
  await page.waitForTimeout(1500);
  // 等审批卡出现（最多 60s）
  const cardAppeared = await page.waitForSelector(".approval-card", { timeout: 60000 }).then(() => true).catch(() => false);
  console.log(`审批卡出现: ${cardAppeared}`);
  await page.screenshot({ path: `${OUT}/live-approval-pending.png` });
  const facts = await page.evaluate(() => {
    const strip = document.querySelector(".live-strip");
    const cs = strip ? getComputedStyle(strip) : null;
    return {
      stripHidden: strip?.hidden, stripDisplay: cs?.display, stripText: strip?.textContent.trim().slice(0, 80),
      dockText: document.getElementById("action-dock")?.textContent.trim().replace(/\s+/g, " ").slice(0, 100),
      submitLabel: document.getElementById("submit-btn")?.textContent.trim(),
      placeholder: document.getElementById("task-input")?.placeholder,
    };
  });
  console.log("挂起相位现场:", JSON.stringify(facts, null, 2));
  // 拒绝写盘，别再写文件
  await page.click("button.btn--deny", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // 停止该 run
  await page.click("#submit-btn", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
}

await browser.close();
