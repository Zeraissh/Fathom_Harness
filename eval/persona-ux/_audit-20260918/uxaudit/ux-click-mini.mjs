/**
 * 最小复测：真实鼠标点击「发送」键是否产生 POST /api/runs。
 * 用法：node ux-click-mini.mjs <baseUrl>
 */
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
const posts = [];
page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/runs")) posts.push(r.url()); });
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#task-input", { timeout: 20000 });
await page.waitForTimeout(1500);
await page.fill("#task-input", "只回一句话：说「点击测试收到」。不要动任何文件。");
await page.waitForTimeout(400);
const before = posts.length;
console.log("点击前 POST 数:", before);
await page.click("#submit-btn", { timeout: 8000 });
await page.waitForTimeout(3000);
console.log("真鼠标点击后 POST 数:", posts.length);
if (posts.length === before) {
  const bodyHasErr = await page.evaluate(() => document.getElementById("submit-error")?.textContent.trim() || null);
  const btnState = await page.evaluate(() => ({ label: document.getElementById("submit-btn")?.textContent.trim(), taValue: document.getElementById("task-input")?.value.slice(0, 20) }));
  console.log("点击未提交。submit-error:", bodyHasErr, "按钮:", JSON.stringify(btnState));
  console.log("→ 对照：Enter 提交");
  await page.focus("#task-input");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  console.log("Enter 后 POST 数:", posts.length);
}
console.log("POST:", posts);
await browser.close();
