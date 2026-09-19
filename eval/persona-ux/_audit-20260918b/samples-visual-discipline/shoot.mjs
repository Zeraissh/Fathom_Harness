/**
 * 视觉纪律双样本对照截图（2026-09-18 深夜）。
 * 前置：隔离宿主在 4203（personas-audit）。run1 的产物是静态文件直接开；
 * run2 的空白只有在宿主 CSP 端点下才复现（file:// 无 CSP，脚本会跑）。
 * 用法：node eval/persona-ux/_audit-20260918b/samples-visual-discipline/shoot.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

// ① run1：静态 SVG 图（file:// 直接开，无 CSP——脚本与否都成立，本就没脚本）
await page.goto(pathToFileURL(join(HERE, "run1-static-svg", "linecount-report.html")).href);
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "run1-static-svg-renders.png"), fullPage: false });

// ② run2：脚本渲染图走宿主 CSP 端点 → 实况空白 + 收集 CSP 报错原文
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
await page.goto(
  "http://localhost:4203/api/runs/25d9cedf-d32f-49cc-9865-bbfcf473e040/artifact?path=loc-chart.html",
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(1200);
const rows = await page.evaluate(() => document.querySelectorAll(".row").length).catch(() => -1);
await page.screenshot({ path: join(OUT, "run2-script-rendered-blank-in-canvas.png"), fullPage: false });
writeFileSync(
  join(OUT, "run2-canvas-console.txt"),
  `渲染出的 .row 行数：${rows}（0 = 空白）\n\n控制台原文：\n${consoleLines.join("\n")}\n`,
  "utf8",
);

await browser.close();
console.log("shots →", OUT, "| run2 rows =", rows);
