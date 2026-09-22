/**
 * Task 4 独立活页复核（方案 A · 计划 1）。
 *
 * 为什么由控制者复跑：implementer 那三行 none/flex 是**摘掉 `hidden` 之后**量的。
 * 那证明了 CSS 规则本身写对了，但没回答更要紧的一问：
 * **在真机上，这条规则会不会自己触发？**
 * 芯片的 hidden 由 git 数据有无驱动（workspace-git.js `root.hidden = !present`），
 * 若被测 run 的 workdir 不是 git 仓库，两脸差异在真机上根本不可观测——
 * 那就不叫"功能好了"，只叫"功能尚未被证明"。
 * 本探针把两种口径分开量，并顺带核宿主服务的是不是 eca67a0。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
await mkdir(join(HERE, "shots"), { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "94f58b8a";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

// ① 宿主服务的是不是 eca67a0：静态资源没有 Cache-Control（三轮走查 L5 发现），
//    所以这里必须看**服务端实际吐出来的字节**，不能信本地工作树。
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const served = await page.evaluate(async () => {
  const t = await (await fetch("/styles.css")).text();
  return {
    bytes: t.length,
    hasWork: t.includes('body[data-face="work"] .workspace-git-chip'),
    hasCode: t.includes('body[data-face="code"] .workspace-git-chip'),
  };
});
console.log(`宿主 /styles.css：${served.bytes} 字节 · work 规则=${served.hasWork} · code 规则=${served.hasCode}`);
if (!served.hasWork || !served.hasCode) console.log("★★ 宿主没在服务新代码——下面全部读数作废");

let RUN_ID = RUN;
await page.waitForTimeout(1600);
RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);

// 量一种口径：芯片的真实态（带 hidden）与"规则若不受 hidden 压制"的态。
const probe = `(() => {
  const chip = document.getElementById("workspace-git-chip");
  const face = document.body.dataset.face;
  if (!chip) return { face, missing: true };
  const real = getComputedStyle(chip).display;
  const wasHidden = chip.hasAttribute("hidden");
  chip.removeAttribute("hidden");                 // 临时摘掉，隔离出 body[data-face] 这一条规则
  const ruleOnly = getComputedStyle(chip).display;
  if (wasHidden) chip.setAttribute("hidden", ""); // 立刻还原，不留痕
  return {
    face, wasHidden, real, ruleOnly,
    tabSelected: document.querySelector("#workspace-face [aria-checked='true']")?.textContent?.trim() ?? null,
    workdirPresent: !wasHidden,
  };
})()`;

const step = async (label) => {
  const p = await page.evaluate(probe);
  if (p.missing) return console.log(`${label}：★ 找不到 #workspace-git-chip`);
  console.log(
    `${label.padEnd(22)} data-face=${String(p.face).padEnd(5)} tab=${String(p.tabSelected).padEnd(5)} ` +
    `hidden=${String(p.wasHidden).padEnd(5)} 真机display=${p.real.padEnd(5)} 摘hidden后=${p.ruleOnly}`,
  );
  return p;
};

console.log("\n=== 欢迎页（无 workdir）===");
await step("欢迎页");
await page.goto(`${BASE}/#/run/${RUN_ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);

console.log(`\n=== run 页 ${RUN_ID} ===`);
const first = await step("初始（office）");

let flipped = null;
try {
  await page.click("#workspace-face-code");
  await page.waitForTimeout(900);
  console.log("");
  flipped = await step("点了 Code 之后");
  await page.click("#workspace-face-office");
  await page.waitForTimeout(900);
  console.log("");
  await step("点回 Work 之后");
} catch (e) {
  console.log("★ 切脸点击失败：", String(e).slice(0, 200));
}

if (first && first.wasHidden) {
  console.log("\n★ 本 run 的 workdir 无 git 数据 → 芯片恒 hidden → **两脸差异在真机上不可观测**。");
  console.log("  上面「摘hidden后」一列是规则本身的证据；「真机display」一列是用户真正看到的。");
}
await page.screenshot({ path: join(HERE, "shots", "face-task4-1600.png"), clip: { x: 0, y: 0, width: 420, height: 420 } });
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
