/**
 * 回走取证补针：主区滚动行为（贴底/箭头/是否被顶回）——只读。
 * 用法：node probe-scroll.mjs <baseUrl> <runId>
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4173";
const RUN_ID = process.argv[3];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/#/run/${RUN_ID}`, { waitUntil: "commit" });
await page.waitForSelector(".conversation", { timeout: 30000 });
await page.waitForTimeout(2000);

const out = await page.evaluate(async () => {
  const el = document.getElementById("main-area");
  const snap = (tag) => ({ tag, st: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight, atBottom: Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4 });
  const navState = () => Array.from(document.querySelectorAll(".scroll-nav-btn")).map((b) => ({ label: b.getAttribute("aria-label"), hidden: b.hasAttribute("hidden"), text: b.textContent.trim().slice(0, 20) }));
  const res = { scrollBehavior: getComputedStyle(el).scrollBehavior, samples: [], navs: {} };
  res.samples.push(snap("init"));
  res.navs.init = navState();

  // 到顶
  el.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 500));
  res.samples.push(snap("afterTop"));
  res.navs.scrolledUp = navState();

  // 直到底，采样是否稳定
  el.scrollTop = el.scrollHeight;
  await new Promise((r) => setTimeout(r, 150));
  res.samples.push(snap("bottom+150ms"));
  await new Promise((r) => setTimeout(r, 400));
  res.samples.push(snap("bottom+550ms"));
  await new Promise((r) => setTimeout(r, 800));
  res.samples.push(snap("bottom+1350ms"));
  res.navs.atBottom = navState();
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
