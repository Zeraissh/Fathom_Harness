/**
 * 三轮走查：装配条上的「识图」chip 到底看不看得见（2026-09-19，只读）。
 * 判据：chip 在不在 DOM、在不在可见盒内、被谁挤出去。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
await mkdir(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4173";
const HEAVY = "4ac7109c-4d36-47f7-8ac3-27e3219da60a";

const PROBE = `(() => {
  const bar = document.getElementById("composer-scopebar");
  if (!bar) return { none: true };
  const br = bar.getBoundingClientRect();
  const bs = getComputedStyle(bar);
  const chips = [...bar.querySelectorAll(".assembly-chip")].map((c) => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return {
      chip: (c.textContent || "").trim().slice(0, 30),
      why: (c.getAttribute("title") || "").slice(0, 130),
      x: Math.round(r.x), w: Math.round(r.width),
      fullyInsideBar: r.x >= br.x - 1 && r.right <= br.right + 1,
      onScreen: r.width > 2 && cs.display !== "none",
      offRightBy: Math.round(r.right - br.right),
    };
  });
  return {
    barHiddenAttr: bar.hasAttribute("hidden"),
    barBox: { x: Math.round(br.x), w: Math.round(br.width), h: Math.round(br.height) },
    barClientW: bar.clientWidth, barScrollW: bar.scrollWidth,
    barOverflowX: bs.overflowX, barFlexWrap: bs.flexWrap,
    chipCount: chips.length,
    chips,
    hasScroll: bar.scrollWidth > bar.clientWidth + 1,
  };
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {}
});

const out = {};
for (const w of [1600, 1440, 1100, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  out[w] = await page.evaluate(PROBE);
  const r = out[w];
  if (r.none) { console.log(`[${w}] 无装配条`); continue; }
  console.log(`\n[${w}] 装配条 ${r.barBox.w}px @x=${r.barBox.x} hidden=${r.barHiddenAttr} 溢出=${r.hasScroll} (scrollW ${r.barScrollW} / clientW ${r.barClientW}, overflowX=${r.barOverflowX}, wrap=${r.barFlexWrap})`);
  for (const c of r.chips) {
    console.log(`    ${c.fullyInsideBar ? "✓在框内" : "✗被挤出" + (c.offRightBy > 0 ? " +" + c.offRightBy + "px" : "")}  "${c.chip}"`);
  }
  const vis = r.chips.find((c) => /识图/.test(c.chip));
  if (vis) console.log(`    → 识图 chip: ${vis.fullyInsideBar ? "看得见" : "看不见"} | why="${vis.why}"`);
  else console.log("    → 装配条里没有识图 chip");
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/#/run/${HEAVY}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const box = await page.evaluate(() => { const b = document.getElementById("composer-scopebar").getBoundingClientRect();
  return { x: Math.round(b.x) - 20, y: Math.round(b.y) - 24, width: Math.round(b.width) + 40, height: Math.round(b.height) + 48 }; });
await page.screenshot({ path: join(OUT, "assembly-bar-1440.png"), clip: box });
await writeFile(join(HERE, "assembly-bar.json"), JSON.stringify(out, null, 1), "utf-8");
await browser.close();
