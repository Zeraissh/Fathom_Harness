/**
 * Wave A census against the isolated 4174 host.
 * Clicks chrome / routes / knobs / settings. Does not POST /api/runs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, "shots");
const OUT = path.join(HERE, "census.json");
const BASE = process.env.FATHOM_AUDIT_URL ?? "http://127.0.0.1:4174";

const records = [];

function rec(entry) {
  records.push({ t: new Date().toISOString(), ...entry });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(HERE, file).replaceAll("\\", "/");
}

async function visibleText(page, sel) {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  if (!(await el.isVisible().catch(() => false))) return { hidden: true };
  const box = await el.boundingBox().catch(() => null);
  return {
    text: String(await el.innerText().catch(() => "")).slice(0, 400),
    aria: await el.getAttribute("aria-label"),
    hiddenAttr: await el.getAttribute("hidden"),
    display: box ? "on-screen" : "no-box",
  };
}

async function clickSafe(page, sel, id, notes = {}) {
  const loc = page.locator(sel).first();
  const before = { hash: await page.evaluate(() => location.hash), title: await page.title() };
  const vis = await visibleText(page, sel);
  if ((await loc.count()) === 0) {
    rec({ id, sel, ok: false, reason: "missing", ...notes });
    return false;
  }
  try {
    await loc.click({ timeout: 4000 });
    await page.waitForTimeout(250);
    rec({
      id,
      sel,
      ok: true,
      vis,
      before,
      after: { hash: await page.evaluate(() => location.hash), title: await page.title() },
      bodySnippet: String(await page.locator("body").innerText()).slice(0, 280),
      ...notes,
    });
    return true;
  } catch (err) {
    rec({ id, sel, ok: false, reason: String(err).slice(0, 240), vis, ...notes });
    return false;
  }
}

async function dismissOverlays(page) {
  for (const sel of ["#onboarding-skip", ".onboarding-overlay #onboarding-skip"]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  // --- cold start + onboarding (fresh profile) ---
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  rec({
    id: "cold-title",
    ok: true,
    title: await page.title(),
    hash: await page.evaluate(() => location.hash),
    onboarding: await visibleText(page, "#onboarding-overlay, .onboarding-overlay, .onboarding-card"),
    welcome: await visibleText(page, ".empty-state--welcome, #main-area"),
    placeholder: await page.locator("#task-input").getAttribute("placeholder"),
    submitAria: await page.locator("#submit-btn").getAttribute("aria-label"),
    submitLabel: await page.locator("#submit-btn-label").innerText().catch(() => ""),
    faceOffice: await page.locator("#workspace-face-office").getAttribute("aria-checked"),
    faceCode: await page.locator("#workspace-face-code").getAttribute("aria-checked"),
    autoApprove: await page.locator("#auto-approve-toggle").isChecked().catch(() => null),
    verify: await page.locator("#verify-toggle").isChecked().catch(() => null),
    shot: await shot(page, "a00-cold"),
  });

  const onboardTitle = await page.locator("#onboarding-title").innerText().catch(() => "");
  const onboardBody = await page.locator("#onboarding-body").innerText().catch(() => "");
  rec({ id: "onboarding-page1", ok: Boolean(onboardTitle), title: onboardTitle, body: onboardBody });
  if (await page.locator("#onboarding-next").isVisible().catch(() => false)) {
    const steps = [];
    for (let i = 0; i < 4; i += 1) {
      steps.push({
        i,
        title: await page.locator("#onboarding-title").innerText().catch(() => ""),
        body: await page.locator("#onboarding-body").innerText().catch(() => ""),
        meta: await page.locator("#onboarding-step").innerText().catch(() => ""),
        next: await page.locator("#onboarding-next").innerText().catch(() => ""),
      });
      await page.locator("#onboarding-next").click();
      await page.waitForTimeout(200);
    }
    rec({ id: "onboarding-walk", ok: true, steps, shot: await shot(page, "a01-after-onboarding") });
  } else {
    rec({ id: "onboarding-walk", ok: false, reason: "no overlay (profile already done?)" });
  }

  // --- chrome clicks ---
  await dismissOverlays(page);
  await clickSafe(page, "#notifications-btn", "chrome-notifications");
  await shot(page, "a02-notifications");
  await page.keyboard.press("Escape");
  await clickSafe(page, "#home-spend", "chrome-spend");
  await shot(page, "a03-spend");
  await page.keyboard.press("Escape");
  await clickSafe(page, "#theme-toggle", "chrome-theme-open");
  for (const theme of ["auto", "light", "dark", "graphite", "contrast"]) {
    await clickSafe(page, `[data-theme-choice="${theme}"]`, `theme-${theme}`);
    await page.waitForTimeout(150);
  }
  await clickSafe(page, "#theme-toggle", "chrome-theme-reopen");
  await page.keyboard.press("Escape");

  await clickSafe(page, "#workspace-face-code", "face-code");
  await clickSafe(page, "#workspace-face-office", "face-work");
  await clickSafe(page, "#new-chat-btn", "new-chat");
  await clickSafe(page, "#sidebar-filter-btn", "filter-open");
  const allProj = page.locator("#sidebar-all-projects");
  rec({
    id: "filter-all-projects-default",
    ok: true,
    checked: await allProj.isChecked().catch(() => null),
    filterOptions: await page.locator("#run-filter option").allTextContents().catch(() => []),
  });
  for (const val of ["running", "done", "failed", "all"]) {
    await page.locator("#run-filter").selectOption(val).catch(() => {});
    rec({ id: `filter-status-${val}`, ok: true, value: val });
  }
  await page.keyboard.press("Escape");

  await clickSafe(page, "#sidebar-collapse", "sidebar-collapse");
  await clickSafe(page, "#sidebar-expand", "sidebar-expand");

  // footer overlays
  for (const [sel, id] of [
    ["#board-open-btn", "footer-board"],
    ["#artifacts-open-btn", "footer-artifacts"],
    ["#schedules-open-btn", "footer-schedules"],
    ["#memory-btn", "footer-memory"],
    ["#settings-open-btn", "footer-settings"],
  ]) {
    await dismissOverlays(page);
    await clickSafe(page, sel, id);
    await shot(page, `a10-${id}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // hash routes
  for (const hash of ["#/", "#/board", "#/artifacts", "#/schedules", "#/settings", "#/usage"]) {
    await page.goto(BASE + "/" + hash, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    rec({
      id: `route-${hash}`,
      ok: true,
      hash: await page.evaluate(() => location.hash),
      title: await page.title(),
      h: String(await page.locator("h1,h2,h3").first().innerText().catch(() => "")).slice(0, 120),
      snippet: String(await page.locator("body").innerText()).slice(0, 360),
      shot: await shot(page, `a20-route-${hash.replace(/[#/]/g, "") || "home"}`),
    });
  }

  // settings 9 pages
  await page.goto(BASE + "/#/settings", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const settingTabs = [
    "settings-appearance",
    "settings-models",
    "settings-mcp",
    "settings-packs",
    "settings-defaults",
    "settings-notifications",
    "settings-shortcuts",
    "settings-usage",
    "settings-about",
  ];
  for (const tab of settingTabs) {
    const tabBtn = page.locator(`[data-settings-tab="${tab}"], #${tab}, button:has-text("${tab.replace("settings-", "")}")`).first();
    const clicked = await clickSafe(page, `#${tab}, [href="#${tab}"], [data-section="${tab}"]`, `settings-tab-${tab}`);
    if (!clicked) {
      const byText = {
        "settings-appearance": "外观",
        "settings-models": "模型",
        "settings-mcp": "MCP",
        "settings-packs": "领域包",
        "settings-defaults": "运行默认值",
        "settings-notifications": "通知",
        "settings-shortcuts": "快捷键",
        "settings-usage": "消耗",
        "settings-about": "关于",
      }[tab];
      await page.getByRole("button", { name: new RegExp(byText) }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      rec({
        id: `settings-tab-fallback-${tab}`,
        ok: true,
        snippet: String(await page.locator("body").innerText()).slice(0, 400),
      });
    }
    rec({
      id: `settings-body-${tab}`,
      ok: true,
      snippet: String(await page.locator("#settings-view, .settings-view, main").innerText().catch(async () => page.locator("body").innerText())).slice(0, 500),
      shot: await shot(page, `a30-${tab}`),
    });
  }

  // persist: change theme in settings if possible, reload
  await page.goto(BASE + "/#/settings", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  rec({ id: "settings-theme-before-reload", ok: true, theme: themeBefore });

  // composer knobs (home)
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await page.waitForTimeout(300);
  rec({
    id: "composer-resting",
    ok: true,
    placeholder: await page.locator("#task-input").getAttribute("placeholder"),
    submit: await page.locator("#submit-btn-label").innerText().catch(() => ""),
    workdir: await page.locator("#workdir-trigger-text").innerText().catch(() => ""),
    project: await page.locator("#project-select").innerText().catch(() => ""),
    model: await page.locator("#executor-model-trigger-text").innerText().catch(() => ""),
    roles: await page.locator("#role-models-knob").innerText().catch(() => ""),
    knobsHidden: await page.locator("#run-knobs").isHidden().catch(() => null),
    budgetHidden: await page.locator("#budget-extend-row").isHidden().catch(() => null),
    errorHidden: await page.locator("#submit-error").isHidden().catch(() => null),
    reconnectHidden: await page.locator("#reconnect-banner").isHidden().catch(() => null),
    gitHidden: await page.locator("#workspace-git-chip").isHidden().catch(() => null),
  });

  await clickSafe(page, "#workdir-trigger", "composer-workdir-open");
  rec({
    id: "composer-workdir-menu",
    ok: true,
    menu: String(await page.locator("#workdir-menu").innerText().catch(() => "")).slice(0, 400),
  });
  await page.keyboard.press("Escape");

  await clickSafe(page, "#executor-model-trigger", "composer-model-open");
  rec({
    id: "composer-model-menu",
    ok: true,
    menu: String(await page.locator("#executor-model-menu").innerText().catch(() => "")).slice(0, 500),
  });
  await page.keyboard.press("Escape");

  await clickSafe(page, "#knobs-toggle", "composer-knobs-open");
  rec({
    id: "composer-knobs",
    ok: true,
    text: String(await page.locator("#run-knobs").innerText().catch(() => "")).slice(0, 800),
    packOptions: await page.locator("#pack-select option").allTextContents().catch(() => []),
    permissionOptions: await page.locator("#permission-mode-select option").allTextContents().catch(() => []),
    effortOptions: await page.locator("#effort-select option").allTextContents().catch(() => []),
    autoApprove: await page.locator("#auto-approve-toggle").isChecked().catch(() => null),
    verify: await page.locator("#verify-toggle").isChecked().catch(() => null),
    plan: await page.locator("#plan-mode-toggle").isChecked().catch(() => null),
    multi: await page.locator("#multi-agent-toggle").isChecked().catch(() => null),
    permissionStance: await page.locator("#permission-stance").innerText().catch(() => ""),
    shot: await shot(page, "a40-knobs"),
  });

  // mention keys
  await page.locator("#task-input").click();
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("@", { delay: 40 });
  await page.waitForTimeout(400);
  rec({
    id: "at-picker",
    ok: true,
    pickerVisible: await page.locator("#cite-picker").isVisible().catch(() => false),
    picker: String(await page.locator("#cite-picker").innerText().catch(() => "")).slice(0, 400),
    shot: await shot(page, "a41-at"),
  });
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("#", { delay: 40 });
  await page.waitForTimeout(300);
  rec({
    id: "hash-picker",
    ok: true,
    pickerVisible: await page.locator("#cite-picker").isVisible().catch(() => false),
    input: await page.locator("#task-input").inputValue(),
  });
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("/", { delay: 40 });
  await page.waitForTimeout(300);
  rec({
    id: "slash-picker",
    ok: true,
    pickerVisible: await page.locator("#cite-picker").isVisible().catch(() => false),
    palette: await page.locator("#command-palette, .command-palette").isVisible().catch(() => false),
    input: await page.locator("#task-input").inputValue(),
  });
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("$", { delay: 40 });
  await page.waitForTimeout(300);
  rec({
    id: "dollar-picker",
    ok: true,
    pickerVisible: await page.locator("#cite-picker").isVisible().catch(() => false),
    input: await page.locator("#task-input").inputValue(),
  });
  await page.locator("#task-input").fill("");

  await clickSafe(page, "#cite-session-btn", "cite-session");
  rec({
    id: "cite-session-panel",
    ok: true,
    picker: String(await page.locator("#cite-picker").innerText().catch(() => "")).slice(0, 300),
  });
  await page.keyboard.press("Escape");

  // command palette
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(300);
  rec({
    id: "command-palette",
    ok: true,
    visible: await page.locator("#command-palette, .palette, [data-palette]").first().isVisible().catch(() => false),
    text: String(await page.locator("body").innerText()).includes("新建对话"),
    snippet: String(await page.locator(".command-palette, #command-palette, [role=dialog]").last().innerText().catch(() => "")).slice(0, 500),
    shot: await shot(page, "a42-palette"),
  });
  await page.keyboard.press("Escape");

  // file tree
  rec({
    id: "file-tree-resting",
    ok: true,
    tree: String(await page.locator("#workspace-file-tree").innerText().catch(() => "")).slice(0, 500),
    visible: await page.locator("#workspace-file-tree").isVisible().catch(() => false),
  });
  const fileRow = page.locator("#workspace-file-tree button, #workspace-file-tree [role=treeitem], #workspace-file-tree a").filter({ hasText: /hello-seed|preview-seed/ }).first();
  if (await fileRow.count()) {
    await fileRow.click();
    await page.waitForTimeout(500);
    rec({
      id: "file-tree-open-seed",
      ok: true,
      href: await page.evaluate(() => location.href),
      preview: String(await page.locator("#preview-dock, .preview-dock, .artifact-canvas").innerText().catch(() => "")).slice(0, 400),
      jumpedFile: await page.evaluate(() => location.protocol === "file:"),
      shot: await shot(page, "a43-file-preview"),
    });
  } else {
    rec({ id: "file-tree-open-seed", ok: false, reason: "seed row not found" });
  }

  // starter gallery
  rec({
    id: "starter-gallery",
    ok: true,
    hidden: await page.locator("#starter-gallery").isHidden().catch(() => null),
    text: String(await page.locator("#starter-gallery").innerText().catch(() => "")).slice(0, 400),
  });

  // viewports
  for (const [w, h, name] of [
    [1280, 800, "1280"],
    [1100, 800, "1100"],
    [900, 800, "900"],
    [700, 800, "700"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await page.waitForTimeout(300);
    rec({
      id: `viewport-${name}`,
      ok: true,
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      sidebarVisible: await page.locator("#sidebar").isVisible().catch(() => false),
      composerVisible: await page.locator("#task-input").isVisible().catch(() => false),
      shot: await shot(page, `a50-vp-${name}`),
    });
  }

  // hidden-but-displayed check
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  const lie = await page.evaluate(() => {
    const ids = ["reconnect-banner", "budget-extend-row", "submit-error", "run-knobs", "action-dock", "cite-picker"];
    return ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, missing: true };
      const cs = getComputedStyle(el);
      return {
        id,
        hasHidden: el.hasAttribute("hidden"),
        display: cs.display,
        visibility: cs.visibility,
        lie: el.hasAttribute("hidden") && cs.display !== "none",
      };
    });
  });
  rec({ id: "hidden-display-lies", ok: !lie.some((x) => x.lie), lie });

  // APIs (no secrets)
  for (const p of ["/health", "/ready", "/api/harness", "/api/runs", "/api/usage"]) {
    try {
      const res = await page.request.get(BASE + p);
      const text = await res.text();
      rec({
        id: `api-${p}`,
        ok: res.ok(),
        status: res.status(),
        body: text.slice(0, 800).replace(/sk-[A-Za-z0-9_-]+/g, "sk-***"),
      });
    } catch (err) {
      rec({ id: `api-${p}`, ok: false, reason: String(err).slice(0, 200) });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    count: records.length,
    records,
  };
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  await browser.close();
  console.log(`census wrote ${records.length} records → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
