/**
 * 编排补发 verification 事件 · 活页取证（2026-09-18）。
 *
 * 前置：脚本化宿主在 4207 运行（.claude/launch.json 的 planverif）。
 * 用法：node eval/persona-ux/_audit-20260918b/capture-planverif.mjs [runId]
 *
 * 纪律（沿用前轮）：截图只认活页屏幕；SSE 常连不断，waitUntil 用
 * domcontentloaded 再显式等待，不用 networkidle。全新 profile 会弹「初次使用」
 * 引导浮层——addInitScript 预置 onboardingDone。
 *
 * 两个用途：
 *   ① 首次跑 = 事件在宿主内存里；
 *   ② 重启宿主后再跑一次同样的脚本 = 事件只能来自盘上档案（重放保真）。
 *   两次截图逐像素对照，重放链路才算验过。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.PLANVERIF_BASE ?? "http://localhost:4207";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
const SUFFIX = process.env.PLANVERIF_SUFFIX ?? "";
await mkdir(OUT, { recursive: true });

// 未指定 runId 就取列表里最新的一条——重启后 id 不变，仍取到同一条
const runs = await (await fetch(`${BASE}/api/runs`)).json();
const runId = process.argv[2] ?? process.env.PLANVERIF_RUN_ID ?? runs[0]?.runId;
if (!runId) throw new Error("没有可复验的 run——先 POST /api/runs");
console.log(`run ${runId}（宿主内存/档案里的最新一条）`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
  } catch {
    /* 隐私模式等场景忽略 */
  }
});
const shot = (name) => page.screenshot({ path: join(OUT, `${name}${SUFFIX}.png`) });
const settle = (ms = 1500) => page.waitForTimeout(ms);

// ① 四张裁决卡 + 归属行 + 徽标（s1 两轮 + s2 + s3）
await page.goto(`${BASE}/#/run/${runId}/loop`, { waitUntil: "domcontentloaded" });
await settle();
const cards = await page.evaluate(() => {
  const all = [...document.querySelectorAll(".chat-verdict")];
  return all.map((c) => ({
    head: c.querySelector(".chat-verdict-head")?.textContent?.trim() ?? "",
    subtask: c.querySelector(".chat-verdict-subtask")?.getAttribute("data-subtask-id") ?? null,
    staticOnly: Boolean(c.querySelector("[data-static-only]")),
  }));
});
console.log("裁决卡：", JSON.stringify(cards, null, 1));
if (cards.length < 4) throw new Error(`裁决卡只有 ${cards.length} 张——期望 4（s1 两轮 + s2 + s3）`);
// 徽标只该出现在真跑不了的那一步：s1(consult) 两张卡都标；
// s2(python-coding) 有通用可运行器、s3(stm32-debug) 手里有探针——都不许标
const badged = cards.filter((c) => c.staticOnly).map((c) => c.subtask);
if (badged.length !== 2 || badged.some((id) => id !== "s1")) {
  throw new Error(`静态推导徽标该只出现在 s1 的两张卡上，实际：${JSON.stringify(badged)}`);
}
if (cards.some((c) => c.subtask === "s3" && c.staticOnly)) {
  throw new Error("stm32-debug 手里有探针却被标「未经运行验证」——判据③没生效");
}
await page.evaluate(() => document.querySelector(".chat-verdict")?.scrollIntoView({ block: "center" }));
await settle(400);
await shot("pv1-plan-verdicts-wide");

// ② 窄档：归属行做唯一可缩项，页面不许横向溢出
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/#/run/${runId}/loop`, { waitUntil: "domcontentloaded" });
await settle();
const narrow = await page.evaluate(() => ({
  vw: window.innerWidth,
  docScrollW: document.documentElement.scrollWidth,
  subtaskTruncated: [...document.querySelectorAll(".chat-verdict-subtask")].some(
    (e) => e.scrollWidth > e.clientWidth,
  ),
}));
console.log("窄档：", JSON.stringify(narrow));
if (narrow.docScrollW > narrow.vw) throw new Error("窄档出现横向溢出");
await shot("pv2-plan-verdicts-narrow");

// ③ 子代理视角：只显示该子任务自己的裁决
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/#/run/${runId}/loop`, { waitUntil: "domcontentloaded" });
await settle();
const scoped = [];
for (const id of ["s1", "s2", "s3"]) {
  await page.evaluate((agent) => {
    const btn = [...document.querySelectorAll(`button[data-agent-id='${agent}']`)][0];
    btn?.click();
  }, id);
  await settle(700);
  scoped.push({
    agent: id,
    heads: await page.evaluate(() =>
      [...document.querySelectorAll(".agent-overlay .chat-verdict")].map(
        (c) => c.querySelector(".chat-verdict-head")?.textContent?.trim() ?? "",
      ),
    ),
  });
  await page.evaluate(() => document.querySelector(".agent-overlay [data-agent-close], .agent-overlay .agent-overlay-close")?.click());
  await settle(400);
}
console.log("子代理视角：", JSON.stringify(scoped, null, 1));
if (scoped.some((s) => s.heads.length === 0)) throw new Error("子代理视角看不到自己的裁决");
await page.goto(`${BASE}/#/run/${runId}/loop`, { waitUntil: "domcontentloaded" });
await settle();
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button[data-agent-id='s1']")][0];
  btn?.click();
});
await settle(700);
await shot("pv3-agent-scope-s1");

await browser.close();
console.log("shots →", OUT);
