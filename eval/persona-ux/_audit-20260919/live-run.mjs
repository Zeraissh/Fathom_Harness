/**
 * 三轮走查 · 进行中活页采样（2026-09-19）。
 * 在用户 4173 上发一条真对话（已授权），全程采样"进行中"的界面状态。
 * 任务刻意做小：一次 view_image 看图问题，用来实测执行者能否真看见像素。
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4173";
const TASK = "看一眼 `_ux_probe/view-probe.png`（用 view_image），告诉我它是什么颜色。";

const SAMPLE = `(() => {
  const el = (s) => document.querySelector(s);
  const onScreen = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const txt = (s) => { const e = el(s); return e ? (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,140) : null; };
  const btn = (re) => [...document.querySelectorAll('button')].filter(b => onScreen(b) && re.test((b.textContent||'').trim()));
  return {
    hash: location.hash.slice(0, 40),
    liveStrip: onScreen(el('.live-strip')) ? txt('.live-strip') : null,
    progress: onScreen(el('.chat-progress')) ? txt('.chat-progress') : null,
    toolGroups: document.querySelectorAll('.chat-tools, .tool-group').length,
    tools: document.querySelectorAll('.chat-tool').length,
    approvalsOnScreen: [...document.querySelectorAll('[class*=approval]')].filter(onScreen).length,
    approveBtns: btn(/^允许$|^批准|^允许并记住/).length,
    stopBtns: btn(/^停止$/).length,
    notices: [...document.querySelectorAll('.chat-notice, .notice')].filter(onScreen).map(n => (n.textContent||'').trim().slice(0,60)),
  };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });

await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// 填任务并发送
const ta = await page.$('#submit-form textarea, #submit-form input[type=text], #submit-form [contenteditable=true]');
if (!ta) { console.log("★ 找不到输入框"); await browser.close(); process.exit(1); }
await ta.fill(TASK);
await page.waitForTimeout(300);
const send = await page.$('#submit-form button[type=submit], #send-btn, .send-btn');
if (send) await send.click();
else { await ta.press("Enter"); }
console.log("已发送:", TASK);

const t0 = Date.now();
const samples = [];
const shots = [];
let approved = 0;
for (let i = 0; i < 180; i++) {
  const s = await page.evaluate(SAMPLE).catch(() => null);
  if (s) { samples.push({ t: Date.now() - t0, ...s });
    if (i % 6 === 0 || s.approveBtns > 0) console.log(`[${String(Math.round((Date.now()-t0)/1000)).padStart(3)}s] live=${s.liveStrip?JSON.stringify(s.liveStrip.slice(0,42)):'—'} prog=${s.progress?JSON.stringify(s.progress.slice(0,28)):'—'} tools=${s.tools} 卡=${s.approvalsOnScreen} 允许键=${s.approveBtns}`);
  }
  // 有审批卡就点允许（授权范围内的驱动）
  if (s && s.approveBtns > 0) {
    const clicked = await page.evaluate(`(() => {
      const onScreen = (e) => { const r = e.getBoundingClientRect(); return r.width>2 && r.height>2 && getComputedStyle(e).display!=='none'; };
      const b = [...document.querySelectorAll('button')].find(x => onScreen(x) && /^允许$|^批准|^允许并记住/.test((x.textContent||'').trim()));
      if (b) { b.click(); return (b.textContent||'').trim(); } return null; })()`);
    if (clicked) { approved++; console.log(`      → 点了「${clicked}」(第 ${approved} 次)`);
      const card = await page.evaluate(() => { const c=[...document.querySelectorAll('[class*=approval]')].find(e=>e.getBoundingClientRect().width>2); return c?(c.textContent||'').trim().replace(/\s+/g,' ').slice(0,160):null; });
      if (card) console.log(`      卡原文: ${card}`);
      await page.screenshot({ path: join(OUT, `live-approval-${approved}.png`) }); shots.push(`live-approval-${approved}.png`);
    }
  }
  if (s && s.stopBtns === 0 && i > 6) { console.log(`[${Math.round((Date.now()-t0)/1000)}s] 停止键消失 → 本轮结束`); break; }
  await page.waitForTimeout(900);
}
await page.screenshot({ path: join(OUT, "live-final.png") });

// 收尾：把模型的实际回答抄出来
const answer = await page.evaluate(`(() => {
  const t = [...document.querySelectorAll('.chat-msg--assistant, .chat-assistant, .msg--assistant, .chat-text')].map(e => (e.textContent||'').trim()).filter(Boolean);
  return t.slice(-3).map(x => x.replace(/\s+/g,' ').slice(0,500));
})()`);
await writeFile(join(HERE, "live-run.json"), JSON.stringify({ task: TASK, approved, samples, shots, answer }, null, 1), "utf-8");
console.log("\n=== 模型末段回答 ===");
for (const a of answer) console.log(" •", a);
console.log(`\n共采样 ${samples.length} 次，点允许 ${approved} 次`);
const live = samples.filter(s => s.liveStrip).length;
const prog = samples.filter(s => s.progress).length;
console.log(`直播条出现 ${live}/${samples.length} 次采样；轮数·耗时指示出现 ${prog} 次`);
await browser.close();
