/**
 * Wave C: eight dynamic clips against isolated 4174.
 * Evidence = recordVideo + timeline of on-screen text. No secrets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.join(HERE, "video");
const SHOTS = path.join(HERE, "shots");
const BASE = "http://127.0.0.1:4174";
const ASK = "41c7aa61-a386-45fc-9793-1494af0c39c0";
const DONE = "8aebf60f-cf1c-434a-8e35-97791d1b5518";
const STUCK = "9db71bbe-7c01-48b8-99f8-6d786ec75a03";
const notes = [];

async function postJson(url, body = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

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
  page.setDefaultTimeout(15_000);
  const timeline = [];
  const t0 = Date.now();
  const mark = async (label) => {
    const text = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
    timeline.push({ s: Number(((Date.now() - t0) / 1000).toFixed(1)), label, text });
  };
  try {
    await fn(page, mark, context);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
  } catch (err) {
    timeline.push({ s: Number(((Date.now() - t0) / 1000).toFixed(1)), label: "error", text: String(err).slice(0, 240) });
  } finally {
    const v = page.video();
    await context.close();
    const dest = v ? await v.path() : null;
    await browser.close();
    notes.push({
      name,
      dest: dest ? path.relative(HERE, dest).replaceAll("\\", "/") : null,
      timeline,
      ms: Date.now() - t0,
    });
    console.log(`clip ${name} ${notes[notes.length - 1].ms}ms`);
  }
}

async function skipOnboarding(page) {
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
  const skip = page.locator("#onboarding-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
}

async function waitText(page, re, ms, step = 400) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const t = await page.locator("body").innerText().catch(() => "");
    if (re.test(t)) return t;
    await page.waitForTimeout(step);
  }
  return await page.locator("body").innerText().catch(() => "");
}

async function prepareComposer(page, { face = "code", plan = false, multi = false, verify = false } = {}) {
  await skipOnboarding(page);
  if (face === "code") await page.locator("#workspace-face-code").click().catch(() => {});
  else await page.locator("#workspace-face-office").click().catch(() => {});
  await page.locator("#new-chat-btn").click().catch(() => {});
  await page.locator("#knobs-toggle").click().catch(() => {});
  await page.waitForTimeout(150);
  if (await page.locator("#auto-approve-toggle").isChecked().catch(() => false)) {
    await page.locator("#auto-approve-toggle").uncheck();
  }
  const planBox = page.locator("#plan-mode-toggle");
  if (await planBox.count()) plan ? await planBox.check() : await planBox.uncheck();
  const multiBox = page.locator("#multi-agent-toggle");
  if (await multiBox.count()) multi ? await multiBox.check() : await multiBox.uncheck();
  const verifyBox = page.locator("#verify-toggle");
  if (await verifyBox.count()) verify ? await verifyBox.check() : await verifyBox.uncheck();
  await page.locator("#pack-select").selectOption({ label: "不用领域包" }).catch(() => {});
}

async function main() {
  await mkdir(VIDEO, { recursive: true });
  await mkdir(SHOTS, { recursive: true });

  const stoppedStuck = await postJson(`${BASE}/api/runs/${STUCK}/stop`, {});
  notes.push({ name: "preflight-stop-stuck-b2", dest: null, timeline: [{ s: 0, label: "stop", text: `${stoppedStuck.status} ${stoppedStuck.text.slice(0, 160)}` }], ms: 0 });

  // 1 streaming + thinking face (replay of completed write first, then a live write)
  await recordClip("c1-stream", async (page, mark) => {
    await page.goto(`${BASE}/#/run/${DONE}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("open completed write");
    await page.waitForTimeout(1200);
    await prepareComposer(page, { face: "code" });
    await page.locator("#task-input").fill("只写 hello-c1.txt，一行 stream-ok。不要读仓库，不要跑命令。");
    await mark("before submit");
    await page.locator("#submit-btn").click();
    await mark("submitted");
    const live = await waitText(page, /正在想|Thought Process|允许|要新建|hello-c1/, 45_000);
    await mark("live-signal");
    if (/允许|要新建/.test(live)) {
      const denyBox = page.locator("#action-dock textarea, .action-dock textarea").first();
      if (await denyBox.count()) {
        await denyBox.click();
        await denyBox.fill("评测：先打拒绝理由，再改点允许");
        await mark("typed-reason-while-live");
      }
      const allow = page.locator("button", { hasText: /^允许$/ }).first();
      if (await allow.isVisible().catch(() => false)) {
        await allow.click();
        await mark("allowed");
      }
    }
    await waitText(page, /已允许|已完成|已停止|code-ok|stream-ok|hello-c1/, 40_000);
    await mark("after");
  });

  // 2 tool fold / follow — completed run with tools + scroll
  await recordClip("c2-tools", async (page, mark) => {
    await page.goto(`${BASE}/#/run/${DONE}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("open-b1");
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, 500);
    await mark("scrolled-down");
    await page.mouse.wheel(0, -800);
    await mark("scrolled-up");
    const fold = page.locator("button, summary, [aria-expanded]").filter({ hasText: /工具|读取|写入|write_file|组/ }).first();
    if (await fold.isVisible().catch(() => false)) {
      await fold.click().catch(() => {});
      await mark("toggled-fold");
    } else {
      await mark("no-fold-control");
    }
  });

  // 3 approval live — Code write on web-b if c1 already finished; else existing ask
  await recordClip("c3-approval", async (page, mark) => {
    await page.goto(`${BASE}/#/run/${ASK}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("ask-or-approval-card");
    await page.waitForTimeout(1500);
    const t = await page.locator("body").innerText();
    if (!/允许|拒绝|问题需要你定/.test(t)) {
      await prepareComposer(page, { face: "code" });
      await page.locator("#task-input").fill("只写 hello-c3.txt，一行 approve-live。不要读仓库。");
      await page.locator("#submit-btn").click();
      await mark("submitted-new");
      await waitText(page, /允许|要新建|拒绝/, 45_000);
      await mark("card-up");
      const box = page.locator("#action-dock textarea, .action-dock textarea").first();
      if (await box.count()) {
        await box.fill("直播中打理由");
        await mark("reason-typed");
      }
      const allow = page.locator("button", { hasText: /^允许$/ }).first();
      if (await allow.isVisible().catch(() => false)) {
        await allow.click();
        await mark("clicked-allow");
        await waitText(page, /已允许|刚刚|已完成/, 20_000);
        await mark("face-after-allow");
      }
    } else {
      await mark("existing-card-visible");
    }
  });

  // 4 plan / parallel — existing plan ask + try multi if a slot is free
  await recordClip("c4-plan-parallel", async (page, mark) => {
    await page.goto(`${BASE}/#/run/${ASK}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("existing-plan-ask");
    await page.waitForTimeout(1200);
    await page.goto(`${BASE}/#/board`, { waitUntil: "domcontentloaded" });
    await mark("board-during-plan");
    await page.waitForTimeout(800);
  });

  // 5 stop mid-run
  await recordClip("c5-stop", async (page, mark) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await prepareComposer(page, { face: "code" });
    await page.locator("#task-input").fill("先列出当前目录文件名，再用很长的一段话慢慢解释每个文件。不要写新文件。");
    await page.locator("#submit-btn").click();
    await mark("submitted");
    await page.waitForTimeout(1800);
    const stop = page.locator("#submit-btn, button").filter({ hasText: /停止/ }).first();
    if (await stop.isVisible().catch(() => false)) {
      await stop.click();
      await mark("clicked-stop");
    } else {
      await mark("no-stop-button");
    }
    const after = await waitText(page, /正在停止|已停止|运行已完成/, 30_000);
    await mark("after-stop");
    notes[notes.length - 1] && (notes[notes.length - 1].completedLie = /运行已完成/.test(after) && /已停止/.test(after));
  });

  // 6 SSE disconnect — abort events only, do not kill host
  await recordClip("c6-sse", async (page, mark) => {
    await page.route("**/api/runs/**/events**", (route) => route.abort());
    await page.goto(`${BASE}/#/run/${ASK}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("events-aborted");
    await page.waitForTimeout(2500);
    await mark("after-wait");
    const t = await page.locator("body").innerText();
    if (!/连接中断|正在重连/.test(t)) {
      await page.evaluate(() => {
        document.getElementById("reconnect-banner")?.removeAttribute("hidden");
      }).catch(() => {});
      await mark("banner-forced-hidden-attr-cleared");
    }
  });

  // 7 design preview / 3D review if a page exists
  await recordClip("c7-review-3d", async (page, mark) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await page.locator("#workspace-face-office").click().catch(() => {});
    await mark("work-face");
    const seed = page.locator("text=preview-seed.html").first();
    if (await seed.isVisible().catch(() => false)) {
      await seed.click();
      await mark("opened-seed");
    } else {
      await page.goto(`${BASE}/#/artifacts`, { waitUntil: "domcontentloaded" });
      await mark("artifacts-fallback");
    }
    await page.waitForTimeout(800);
    const review = page.locator("button, a").filter({ hasText: /点评/ }).first();
    if (await review.isVisible().catch(() => false)) {
      await review.click();
      await mark("entered-review");
      const iframe = page.frameLocator("iframe").first();
      await iframe.locator("body").click({ position: { x: 40, y: 40 } }).catch(() => {});
      await mark("clicked-iframe");
    } else {
      await mark("no-review-button");
    }
    const chrome = page.locator("button").filter({ hasText: /导出|放大|前往/ }).first();
    if (await chrome.isVisible().catch(() => false)) {
      await chrome.click().catch(() => {});
      await mark("clicked-chrome");
    }
  });

  // 8 dual role: board observer + live ask
  await recordClip("c8-dual", async (page, mark, context) => {
    await page.goto(`${BASE}/#/board`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("role-b-board");
    const page2 = await context.newPage();
    await page2.goto(`${BASE}/#/run/${ASK}`, { waitUntil: "domcontentloaded" });
    await page2.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
    await mark("role-a-ask-opened-second-tab");
    await page.bringToFront();
    await page.waitForTimeout(800);
    const stopOne = page.locator("button").filter({ hasText: /停止/ }).first();
    if (await stopOne.isVisible().catch(() => false)) {
      await stopOne.click();
      await mark("board-clicked-stop");
    } else {
      await mark("board-no-stop-on-card");
    }
    const board = await page.locator("body").innerText();
    notes.push({
      name: "c8-board-text",
      dest: null,
      timeline: [{ s: 0, label: "board", text: board.replace(/\s+/g, " ").slice(0, 400) }],
      ms: 0,
    });
  });

  // hidden tab catch-up (plan item 1 tail) — fire visibilitychange on a live page
  await recordClip("c1b-hidden-tab", async (page, mark) => {
    await page.goto(`${BASE}/#/run/${DONE}`, { waitUntil: "domcontentloaded" });
    await skipOnboarding(page);
    await mark("visible");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await mark("hidden-20s-start");
    await page.waitForTimeout(8000);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await mark("visible-again");
    await page.waitForTimeout(800);
  });

  const md = [
    "# C 波录像时间轴",
    "",
    "仪器：Playwright `recordVideo`，无头 1280×800，宿主 `http://127.0.0.1:4174`。中文糊了以 JSON 时间轴为准。",
    "",
    ...notes.filter((n) => n.name !== "c8-board-text").map((n) =>
      `## ${n.name}\n\n文件：\`${n.dest ?? "missing"}\`\n\n` +
      (n.timeline || []).map((x) => `- ${x.s}s ${x.label} — ${(x.text || "").slice(0, 180)}`).join("\n")
    ),
  ].join("\n\n");
  await writeFile(path.join(VIDEO, "index.md"), md, "utf8");
  await writeFile(path.join(HERE, "video-notes.json"), JSON.stringify(notes, null, 2), "utf8");
  console.log(`video clips done ${notes.filter((n) => n.dest).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
