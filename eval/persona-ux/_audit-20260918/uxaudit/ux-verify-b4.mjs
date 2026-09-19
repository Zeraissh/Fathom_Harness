/**
 * UX-B4 活页复核（键盘面）：项目分组头的真按钮用**可信键** Enter/Space 能收起。
 * 用法：node ux-verify-b4.mjs <baseUrl>
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ } });
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#run-list", { timeout: 20000 });
await page.waitForTimeout(2000);

const identity = page.locator(".run-group-identity").first();
const count = await identity.count();
if (count === 0) {
  console.log("FAIL  未找到分组头按钮（列表为空?）");
  await browser.close();
  process.exit(0);
}
const box = page.locator(".run-group").first();
const collapsedBefore = await box.evaluate((el) => el.classList.contains("run-group--collapsed"));
await identity.focus();
const focused = await page.evaluate(() => document.activeElement?.className ?? "");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const collapsedAfterEnter = await box.evaluate((el) => el.classList.contains("run-group--collapsed"));
await page.keyboard.press("Space");
await page.waitForTimeout(400);
const collapsedAfterSpace = await box.evaluate((el) => el.classList.contains("run-group--collapsed"));
const aria = await identity.getAttribute("aria-expanded");

console.log(JSON.stringify({
  focusedIsIdentity: String(focused).includes("run-group-identity"),
  collapsedBefore,
  collapsedAfterEnter,
  collapsedAfterSpace,
  aria,
  pass: String(focused).includes("run-group-identity") && collapsedBefore !== collapsedAfterEnter && collapsedAfterEnter !== collapsedAfterSpace
}, null, 1));
await browser.close();
