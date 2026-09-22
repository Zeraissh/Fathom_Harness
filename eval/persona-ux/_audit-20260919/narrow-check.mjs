import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
await page.goto("http://127.0.0.1:4173/#/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
const m = await page.evaluate(`(() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
    return { y: Math.round(r.y), bot: Math.round(r.bottom), inView: r.y < innerHeight && r.bottom > 0, h: Math.round(r.height) }; };
  const scrollers = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (['auto','scroll'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 2)
      scrollers.push({ el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+'.'+(e.className||'').toString().trim().split(/\s+/).slice(0,2).join('.'), max: e.scrollHeight - e.clientHeight });
  }
  return { vh: innerHeight, composer: b('#submit-form'), centerRow: b('#center-row'), rail: b('#right-rail'),
    docMax: document.documentElement.scrollHeight - document.documentElement.clientHeight, scrollers: scrollers.slice(0,6),
    winScrollY: window.scrollY };
})()`);
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: join(HERE, "shots", "welcome-390.png") });
// 试着手动滚到底，看输入框能不能露出来
await page.evaluate(() => { window.scrollTo(0, 99999); });
await page.keyboard.press("End").catch(()=>{});
await page.waitForTimeout(500);
const after = await page.evaluate(() => { const r = document.querySelector('#submit-form').getBoundingClientRect();
  return { y: Math.round(r.y), inView: r.y < innerHeight && r.bottom > 0, winScrollY: window.scrollY }; });
console.log("尽力滚动后:", JSON.stringify(after));
await browser.close();
