/**
 * 二轮走查活页截图（2026-09-18 夜场）。
 *
 * 前置：隔离宿主在 4203 运行（.claude/launch.json 的 personas-audit 条目 +
 * D:\Work\scratch\fathom-personas-20260918\personas.env）。
 * 用法：node eval/persona-ux/_audit-20260918b/capture.mjs
 *
 * 纪律（沿用前轮）：截图只认活页屏幕；SSE 常连不断，waitUntil 用 domcontentloaded
 * 再显式等待，不用 networkidle。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:4203";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// 全新 profile 会弹「初次使用」引导浮层（模态挡点击/挡截图主体）——预置已看过
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
  } catch {
    /* 隐私模式等场景忽略 */
  }
});
const shot = (name) => page.screenshot({ path: join(OUT, name) });
const settle = (ms = 1300) => page.waitForTimeout(ms);

// ① 欢迎页（宽档）：内容驱动的右列已收起——品牌 + 输入框 + 起步卡
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await settle();
await shot("w1-welcome-wide.png");

// ② 窄档欢迎：右缘把手是收起态唯一入口
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await settle();
await shot("w2-welcome-narrow-handle.png");

// ③ 点把手：全宽 sheet + 遮罩（Esc/点外/收起键三路关）
await page.click("#right-rail-handle");
await settle(600);
await shot("w3-narrow-sheet.png");
await page.keyboard.press("Escape");
await settle(400);

// ④ H8：单执行者验证跑的裁决卡——「核查通过（静态推导）」
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/#/run/ffb5d337-7e2e-4d22-bacb-a6e42c95a511/loop`, { waitUntil: "domcontentloaded" });
await settle(1500);
await page
  .evaluate(() => document.querySelector("[data-static-only]")?.scrollIntoView({ block: "center" }))
  .catch(() => {});
await settle(400);
await shot("v1-verdict-static-derived.png");

// ⑤ U4/U5：u6 跑（写盘审批 + 经放行留痕；命令原文只一遍）
await page.goto(`${BASE}/#/run/ae0ae937-5c98-4d9a-9ef7-89e3e9c71ace/loop`, { waitUntil: "domcontentloaded" });
await settle(1500);
await shot("a1-approval-single-line.png");

// ⑥ U1/U5：列表——被中止的那条 run 标「已停止」（原为绿色已完成）
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await settle(1500);
await shot("l1-run-list-stopped.png");

await browser.close();
console.log("shots →", OUT);
