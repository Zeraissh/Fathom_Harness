/**
 * 打开目录浮层立刻粘贴：粘贴不许被起点目录的异步回写静默盖掉（计划 3 · T2）。
 *
 * 为什么必须有它：这条缺陷的形状是**静默覆盖**——单测绿只能证明"守卫在"，
 * 证明不了真机上异步回写真的不落地。计划 2 用 page.route 掐住
 * /api/fs/list 1.5 秒做过确定性复现（sdd/plan2/task-1-report.md:188-193），
 * 本探针沿用同一手法，只是不再绕开竞态、而是正面量它。
 *
 * 判据（三条）：
 *   ① 粘贴后放行，输入框仍是粘贴的值——老 bug 的直接反证（老 bug 时
 *      这里会变成起点目录，粘贴被静默盖掉、前往去了旧目录）
 *   ② 下钻之后输入框跟着变成新目录——脏标记只挡异步回写，不挡程序性导航
 *   ③ 全程 0 条控制台错误
 *
 * 打开浮层走真实用户路径（同 verify-face-git.mjs）：展开 composer scope →
 * workdir-trigger → 菜单「＋ 添加目录…」→ 宿主 onAddRequest
 * （index.html:5393）open(当前 workdir)。粘贴用 page.fill（反斜杠无损，
 * 见 sdd/plan2/task-1-report.md:92 的误判更正）。
 */
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const PASTE = process.env.PASTE_PATH ?? "D:\\Work\\Github_pros\\Agent_Design\\src";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));

console.log(`靶：${BASE}/#/`);
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1"); // 跳过引导遮罩
  } catch {}
});

// 0) 宿主哨兵：确认服务的就是本仓磁盘上的 workdir-picker.js（静态文件无
//    Cache-Control，必须看服务端吐出的字节，同 verify-face-git.mjs 的做法）
const localSrc = readFileSync(
  join(HERE, "..", "..", "..", "ui", "public", "features", "workdir-picker.js"),
  "utf8",
).replace(/\r\n/g, "\n");
const servedSrc = (await (await fetch(`${BASE}/features/workdir-picker.js`)).text()).replace(/\r\n/g, "\n");
if (servedSrc !== localSrc) {
  console.log("★★ 宿主服务的 workdir-picker.js 与本仓磁盘不同步——下面全部读数作废");
}

// 掐住第一次带 path 的 /api/fs/list（= 浮层打开时的起点目录加载）1.5 秒，
// 逼粘贴先落地（计划 2 的确定性复现手法）
let gated = false;
let consumed = false;
await page.route("**/api/fs/list**", async (route) => {
  const u = new URL(route.request().url());
  if (!consumed && u.searchParams.get("path")) {
    consumed = true;
    gated = true;
    console.log(`掐住：${u.pathname}?path=${(u.searchParams.get("path") || "").slice(0, 44)}… 1.5s`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  await route.continue();
});
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// 展开 composer scope（折叠时触发钮被 textarea 盖住——verify-face-git.mjs 文件头）
const scopeOpen = await page.evaluate(() => document.getElementById("composer-scope")?.hasAttribute("open"));
if (!scopeOpen) {
  await page.click("#composer-scope > summary");
  await page.waitForSelector("#composer-scope[open]", { timeout: 5000 });
}
await page.click("#workdir-trigger");
await page.waitForSelector("#workdir-menu:not([hidden])", { timeout: 5000 });
await page.click("#workdir-menu button[data-add]");
await page.waitForSelector("#workdir-picker-overlay:not([hidden])", { timeout: 5000 });

// 拦截发生在请求发出后几毫秒内；给它一小段窗口，确认起点目录的加载真的被掐住
const t0 = Date.now();
while (!gated && Date.now() - t0 < 3000) await page.waitForTimeout(50);
if (!gated) {
  console.log("★ 探针失效：起点目录的 fs/list 没被掐住（gated=false），判据全部作废");
  await browser.close();
  process.exit(1);
}

// 浮层一开就贴（不等起点目录加载完——这正是老 bug 的触发姿势）
await page.fill("#workdir-picker-overlay .wp-path-input", PASTE);
const during = await page.inputValue("#workdir-picker-overlay .wp-path-input");
console.log(`fill 刚落地（fs/list 仍被掐着）： "${during}"`);

// 等放行 + 回写窗口过去（掐住 1.5s；fill 时已经过了约 0.5s）
await page.waitForTimeout(2000);
const after = await page.inputValue("#workdir-picker-overlay .wp-path-input");
console.log(`fs/list 放行后：                    "${after}"`);
const c1 = after === PASTE;
console.log(c1 ? "✅ ① 粘贴没被起点目录盖掉" : "★ ① 粘贴被起点目录静默覆盖（老 bug）");

// ② 下钻：点起点目录下的第一行，输入框必须跟着变（脏标记只挡异步回写）
const rows = page.locator("#workdir-picker-overlay .wp-dir");
const rowCount = await rows.count();
let c2 = false;
if (rowCount === 0) {
  console.log("★ ② 起点目录没有子目录行，无从下钻");
} else {
  const title = await rows.first().getAttribute("title");
  await rows.first().click();
  await page.waitForFunction((t) => {
    const el = document.querySelector("#workdir-picker-overlay .wp-path-input");
    return el && el.value === t;
  }, title, { timeout: 5000 }).catch(() => {});
  const drill = await page.inputValue("#workdir-picker-overlay .wp-path-input");
  c2 = drill === title;
  console.log(c2
    ? `✅ ② 下钻后输入框跟着变成 "${drill}"`
    : `★ ② 输入框是 "${drill}"，期望下钻行 "${title}"`);
}

console.log("\n③ 控制台：", errs.length ? errs.slice(0, 5) : "零");
await page.screenshot({ path: join(OUT, "picker-paste.png"), fullPage: false });
await browser.close();

if (c1 && c2 && errs.length === 0) {
  console.log("\n✅ 三条全成立：① 粘贴不被盖 ② 下钻跟得上 ③ 0 控制台错误");
  process.exit(0);
}
console.log("\n★ 有判据没成立，见上。");
process.exit(1);
