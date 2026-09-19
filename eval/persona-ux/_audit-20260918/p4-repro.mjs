/**
 * P4 复现闸门：先复现，不复现就删条目。
 *
 * 要证的（都来自 09-15 审计档案，不是现状）：
 *   A. 「点中 @hello-code.txt 后输入框仍是 @hello」——insertWorkspaceFileMention
 *      按 trigger.query.length 整段替换，读代码看不出这个 bug，所以必须实测。
 *   B. 「输入框打 /：补全不出现，命令面板也不自动打开」
 *   C. 「# $ 同样空响」
 *
 * 只做只读观测：打字、读输入框与 picker 的 DOM，不发送。
 *
 * 用法：node p4-repro.mjs <baseUrl> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const OUT = process.argv[3] ?? "p4-repro.json";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ }
});
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#task-input", { timeout: 20000 });
await page.waitForTimeout(1500);

const composer = "#task-input";
const value = () => page.$eval(composer, (el) => el.value);
const pickerState = () =>
  page.evaluate(() => {
    const p = document.getElementById("cite-picker");
    if (!p) return { exists: false };
    return {
      exists: true,
      hidden: p.hasAttribute("hidden"),
      items: [...p.querySelectorAll("[role=option], .cite-picker-item, li, button")].map((n) => n.textContent.trim()).slice(0, 8),
    };
  });

async function typeAndRead(text) {
  await page.fill(composer, "");
  await page.click(composer);
  await page.type(composer, text, { delay: 30 });
  await page.waitForTimeout(900);
  return { after: await value(), picker: await pickerState() };
}

const results = {};

// ---- A: @ 点选是否插入完整路径 ----
await page.fill(composer, "");
await page.click(composer);
await page.type(composer, "@hello", { delay: 30 });
await page.waitForTimeout(1200);
const beforePick = { value: await value(), picker: await pickerState() };
let clicked = null;
if (beforePick.picker.exists && !beforePick.picker.hidden) {
  const opts = page.locator("#cite-picker [role=option], #cite-picker .cite-picker-item, #cite-picker li, #cite-picker button");
  const n = await opts.count();
  for (let i = 0; i < n; i++) {
    const t = (await opts.nth(i).textContent()) ?? "";
    if (t.includes("hello-code")) {
      await opts.nth(i).click({ force: true }).catch(() => {});
      clicked = t.trim();
      break;
    }
  }
  if (clicked == null && n > 0) {
    await opts.first().click({ force: true }).catch(() => {});
    clicked = ((await opts.first().textContent()) ?? "").trim();
  }
}
await page.waitForTimeout(500);
results.atPick = {
  typedValue: "@hello",
  pickerBefore: beforePick.picker,
  clickedOption: clicked,
  valueAfterClick: await value(),
};

// ---- B: / 的行为 ----
results.slash = await typeAndRead("/");
results.slashPalette = await page.evaluate(() => {
  const pal = document.getElementById("command-palette");
  if (!pal) return { exists: false };
  return { exists: true, hidden: pal.hasAttribute("hidden") };
});

// ---- C: # 与 $ ----
results.hash = await typeAndRead("#");
results.dollar = await typeAndRead("$");

const verdict = {
  "A 复现：点选后输入框完整插入 @hello-code.txt":
    /@hello-code\.txt/.test(results.atPick.valueAfterClick),
  "A 点选后没有把原片段留在后面（无重复）":
    (results.atPick.valueAfterClick.match(/hello-code\.txt/g) ?? []).length === 1,
  "B 复现：打 / 后出现了补全或命令面板":
    (results.slash.picker.exists && !results.slash.picker.hidden) || results.slashPalette.hidden === false,
  "C1 复现：打 # 后有反应（补全或面板）":
    (results.hash.picker.exists && !results.hash.picker.hidden),
  "C2 复现：打 $ 后有反应（补全或面板）":
    (results.dollar.picker.exists && !results.dollar.picker.hidden),
};

await writeFile(OUT, JSON.stringify({ verdict, results }, null, 2), "utf-8");
console.log(JSON.stringify({ verdict, detail: results }, null, 2));
await browser.close();
