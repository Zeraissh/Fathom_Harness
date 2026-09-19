/**
 * P4 验收：
 *   1. `/` 打在第一格 → 命令面板打开（审计：「要么弹出命令面板，要么不当命令」）
 *   2. `/` 在**有内容时**照常插入斜杠（路径要用它，不能占着）
 *   3. `#` / `$` 仍是普通字符（没被吃、也没有被误当命令）—— 这条是"改判为不改"的守门
 *   4. 从**文件树点一个文件** → 坞打开且**真的看得见**（右列切到预览面板）
 *      —— 这是 P1 造出来的集成缺口：列停在「文件」上时 CSS 会把坞 display:none
 *
 * 用法：node p4-verify.mjs <baseUrl> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const OUT = process.argv[3] ?? "p4-verify.json";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.removeItem("agent.ui.pref.rightRail");
  } catch { /* 忽略 */ }
});
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#task-input", { timeout: 20000 });
await page.waitForTimeout(1800);

const composer = "#task-input";
const paletteOpen = () =>
  page.evaluate(() => {
    const pal = document.getElementById("command-palette");
    return Boolean(pal) && !pal.hasAttribute("hidden");
  });

const out = {};

// ---- 1. `/` 在第一格开面板 ----
await page.fill(composer, "");
await page.click(composer);
await page.keyboard.press("/");
await page.waitForTimeout(700);
out.slashOnEmpty = { paletteOpen: await paletteOpen(), composerValue: await page.$eval(composer, (el) => el.value) };
// 关掉面板再继续
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// ---- 2. 有内容时 `/` 照常插字 ----
await page.fill(composer, "看下 src");
await page.click(composer);
await page.keyboard.press("End");
await page.keyboard.press("/");
await page.waitForTimeout(500);
out.slashWithText = { paletteOpen: await paletteOpen(), composerValue: await page.$eval(composer, (el) => el.value) };

// ---- 3. # / $ 仍是普通字符 ----
async function plainChar(ch) {
  await page.fill(composer, "");
  await page.click(composer);
  await page.keyboard.press(ch === "$" ? "$" : ch);
  await page.waitForTimeout(400);
  return { composerValue: await page.$eval(composer, (el) => el.value), paletteOpen: await paletteOpen() };
}
out.hash = await plainChar("#");
out.dollar = await plainChar("$");
await page.fill(composer, "");

// ---- 4. 文件树点文件 → 坞可见 ----
// 先把右列切回「文件」面板，模拟"用户在看文件树"
await page.evaluate(() => {
  const tab = document.querySelector('[data-rail-panel="tree"]');
  tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(600);
const beforeClick = await page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  return { panel: rail?.dataset.panel ?? null };
});

const fileRow = page.locator(".ft-row").filter({ hasText: /hello-code\.txt/ }).first();
let rowText = null;
if (await fileRow.count()) {
  rowText = ((await fileRow.textContent()) ?? "").trim();
  await fileRow.click({ force: true });
} else {
  // 树可能还没展开，先点开根再找
  await page.locator(".ft-row").first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  const again = page.locator(".ft-row").filter({ hasText: /hello-code\.txt/ }).first();
  if (await again.count()) {
    rowText = ((await again.textContent()) ?? "").trim();
    await again.click({ force: true });
  }
}
await page.waitForTimeout(1500);

out.treeOpen = await page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  const dock = document.getElementById("file-preview-view") ?? document.querySelector(".right-rail-preview .preview-dock");
  const r = dock?.getBoundingClientRect?.();
  return {
    railPanelAfter: rail?.dataset.panel ?? null,
    dockFound: Boolean(dock),
    dockHidden: dock?.hasAttribute("hidden") ?? null,
    dockVisiblePx: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
    previewText: (dock?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
  };
});
out.rowText = rowText;
out.panelBeforeClick = beforeClick.panel;

const verdict = {
  "1 `/` 在第一格打开命令面板": out.slashOnEmpty.paletteOpen === true,
  "1 打开面板时没把 `/` 写进输入框": out.slashOnEmpty.composerValue === "",
  "2 有内容时 `/` 照常插入（不抢键）": out.slashWithText.composerValue.includes("/") && out.slashWithText.paletteOpen === false,
  "3 `#` 是普通字符且不误开面板": out.hash.composerValue === "#" && out.hash.paletteOpen === false,
  "3 `$` 是普通字符且不误开面板": out.dollar.composerValue === "$" && out.dollar.paletteOpen === false,
  "4 点文件前右列停在「文件」面板（前提成立）": out.panelBeforeClick === "tree",
  "4 点文件后右列切到「预览」": out.treeOpen.railPanelAfter === "preview",
  "4 坞真的可见（有像素尺寸、没 hidden）": (() => {
    const px = out.treeOpen.dockVisiblePx ?? "";
    const m = /^(\d+)x(\d+)$/.exec(px);
    return out.treeOpen.dockFound && out.treeOpen.dockHidden === false && Boolean(m) && Number(m[1]) > 0 && Number(m[2]) > 0;
  })(),
};

await page.screenshot({ path: "p4-verify.png" });
await writeFile(OUT, JSON.stringify({ verdict, out }, null, 2), "utf-8");
console.log(JSON.stringify({ verdict, out }, null, 2));
await browser.close();
