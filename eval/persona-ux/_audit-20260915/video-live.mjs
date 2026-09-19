/**
 * Recapture live stream + approval on the still-running hello-c1 run,
 * plus a longer look at B1 tools and the B1 preview dock.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.join(HERE, "video");
const SHOTS = path.join(HERE, "shots");
const BASE = "http://127.0.0.1:4174";
const C1 = "018691ca-b846-4aaf-905e-a6764d880005";
const B1 = "8aebf60f-cf1c-434a-8e35-97791d1b5518";
const notes = [];

async function recordClip(name, fn) {
  const dir = path.join(VIDEO, name);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
    recordVideo: { dir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const timeline = [];
  const t0 = Date.now();
  const mark = async (label) => {
    const text = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 280);
    timeline.push({ s: Number(((Date.now() - t0) / 1000).toFixed(1)), label, text });
  };
  try {
    await fn(page, mark);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
  } catch (err) {
    timeline.push({ s: Number(((Date.now() - t0) / 1000).toFixed(1)), label: "error", text: String(err).slice(0, 240) });
  } finally {
    const v = page.video();
    await context.close();
    const dest = v ? await v.path() : null;
    await browser.close();
    notes.push({ name, dest: dest ? path.relative(HERE, dest).replaceAll("\\", "/") : null, timeline, ms: Date.now() - t0 });
    console.log(`clip ${name} ${notes[notes.length - 1].ms}ms`);
  }
}

async function waitRe(page, re, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const t = await page.locator("body").innerText().catch(() => "");
    if (re.test(t)) return t;
    await page.waitForTimeout(500);
  }
  return await page.locator("body").innerText().catch(() => "");
}

await mkdir(VIDEO, { recursive: true });

await recordClip("c1-stream-live", async (page, mark) => {
  await page.goto(`${BASE}/#/run/${C1}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
  await mark("open-c1");
  const live = await waitRe(page, /正在想|允许|要新建|已允许|已完成|已停止|Thought Process/, 90_000);
  await mark("signal");
  if (/允许|要新建/.test(live) && !/已允许/.test(live)) {
    const box = page.locator("#action-dock textarea, .action-dock textarea, textarea").first();
    if (await box.count()) {
      await box.click().catch(() => {});
      await box.fill("评测：直播中打拒绝理由，再点允许");
      await mark("typed-reason");
    }
    const allow = page.locator("button", { hasText: /^允许$/ }).first();
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await mark("clicked-allow");
    }
    await waitRe(page, /已允许|已完成|已停止/, 60_000);
    await mark("after-allow");
  }
});

await recordClip("c2-tools-live", async (page, mark) => {
  await page.goto(`${BASE}/#/run/${B1}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
  await mark("open-b1");
  await page.waitForTimeout(1500);
  const tools = page.locator("text=/write_file|写入|读取|工具|验证/").first();
  if (await tools.isVisible().catch(() => false)) await tools.click().catch(() => {});
  await mark("clicked-toolish");
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(600);
  await mark("scrolled");
  await page.locator("text=hello-b1.txt").first().click().catch(() => {});
  await mark("clicked-hello-b1");
  await page.waitForTimeout(800);
});

await recordClip("c7-preview-seed", async (page, mark) => {
  await page.goto(`${BASE}/#/run/${B1}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
  await mark("open-b1-preview");
  const seed = page.locator("text=preview-seed.html").first();
  if (await seed.isVisible().catch(() => false)) {
    await seed.click();
    await mark("opened-seed");
  } else {
    await page.locator("text=hello-b1.txt").first().click().catch(() => {});
    await mark("opened-hello-instead");
  }
  await page.waitForTimeout(1200);
  const review = page.locator("button, a").filter({ hasText: /点评/ }).first();
  await mark(await review.isVisible().catch(() => false) ? "review-visible" : "no-review");
});

const extra = path.join(HERE, "video-live-notes.json");
await writeFile(extra, JSON.stringify(notes, null, 2), "utf8");
console.log("live recapture", notes.length);
