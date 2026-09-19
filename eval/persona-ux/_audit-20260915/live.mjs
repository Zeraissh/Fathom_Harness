/**
 * Wave B live conversations against isolated 4174.
 * Drives the real composer (not just HTTP) so approval cards and outcome faces are evidence.
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, "shots");
const OUT = path.join(HERE, "live.json");
const BASE = process.env.FATHOM_AUDIT_URL ?? "http://127.0.0.1:4174";
const WD_A = "D:\\Work\\scratch\\fathom-ux-20260915\\web-a";
const WD_B = "D:\\Work\\scratch\\fathom-ux-20260915\\web-b";

const results = [];

function rec(entry) {
  results.push({ t: new Date().toISOString(), ...entry });
  console.log(JSON.stringify({ id: entry.id, ok: entry.ok, note: entry.note ?? entry.reason ?? "" }));
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(HERE, file).replaceAll("\\", "/");
}

async function dismiss(page) {
  const skip = page.locator("#onboarding-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

async function bodyText(page, limit = 1200) {
  return String(await page.locator("body").innerText()).slice(0, limit);
}

async function waitFor(page, pred, timeoutMs, step = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return true;
    await page.waitForTimeout(step);
  }
  return false;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: res.status, text: text.slice(0, 800), json };
}

async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function ensureWorkdir(page) {
  const label = await page.locator("#workdir-trigger-text").innerText().catch(() => "");
  if (/web-a/.test(label)) return label;
  await page.locator("#workdir-trigger").click();
  await page.waitForTimeout(200);
  const item = page.locator("#workdir-menu").getByText(/web-a/).first();
  if (await item.count()) await item.click();
  await page.keyboard.press("Escape").catch(() => {});
  return page.locator("#workdir-trigger-text").innerText().catch(() => "");
}

async function submitTask(page, task, { plan = false, verify = false, multi = false, pack } = {}) {
  await dismiss(page);
  await page.locator("#new-chat-btn").click().catch(() => {});
  await page.waitForTimeout(200);
  await ensureWorkdir(page);
  await page.locator("#knobs-toggle").click();
  await page.waitForTimeout(150);
  if (await page.locator("#auto-approve-toggle").isChecked()) {
    await page.locator("#auto-approve-toggle").uncheck();
  }
  const planBox = page.locator("#plan-mode-toggle");
  if (await planBox.count()) {
    if (plan) await planBox.check();
    else await planBox.uncheck();
  }
  const verifyBox = page.locator("#verify-toggle");
  if (await verifyBox.count()) {
    if (verify) await verifyBox.check();
    else await verifyBox.uncheck();
  }
  const multiBox = page.locator("#multi-agent-toggle");
  if (await multiBox.count()) {
    if (multi) await multiBox.check();
    else await multiBox.uncheck();
  }
  if (pack) {
    await page.locator("#pack-select").selectOption({ label: pack }).catch(async () => {
      await page.locator("#pack-select").selectOption(pack).catch(() => {});
    });
  } else {
    await page.locator("#pack-select").selectOption({ label: "不用领域包" }).catch(() => {});
  }
  await page.locator("#task-input").fill(task);
  await page.locator("#submit-btn").click();
  await page.waitForTimeout(800);
}

async function clickAllow(page) {
  const allow = page.locator("button", { hasText: /允许/ }).first();
  if (await allow.isVisible().catch(() => false)) {
    await allow.click();
    return true;
  }
  return false;
}

async function clickDeny(page, reason = "评测拒绝") {
  const deny = page.locator("button", { hasText: /拒绝/ }).first();
  if (!(await deny.isVisible().catch(() => false))) return false;
  const reasonBox = page.locator("#action-dock textarea, .action-dock textarea, [placeholder*='理由']").first();
  if (await reasonBox.count()) await reasonBox.fill(reason);
  await deny.click();
  return true;
}

async function clickStop(page) {
  const stop = page.locator("#submit-btn, button").filter({ hasText: /停止/ }).first();
  if (await stop.isVisible().catch(() => false)) {
    await stop.click();
    return true;
  }
  return false;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await dismiss(page);
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));

  // ---- B1 allow write ----
  await submitTask(page, "在当前工作目录写 hello-b1.txt，内容只有一行 ping。不要读别的文件，不要跑命令。");
  rec({
    id: "B1-submit",
    ok: !(await page.locator("#submit-error").isVisible().catch(() => false)),
    error: await page.locator("#submit-error-text").innerText().catch(() => ""),
    hash: await page.evaluate(() => location.hash),
    snippet: await bodyText(page, 500),
    shot: await shot(page, "b1-submit"),
  });
  const sawApproval = await waitFor(page, async () => {
    const t = await bodyText(page, 2000);
    return /允许|拒绝|要新建|write_file/.test(t);
  }, 90_000);
  rec({
    id: "B1-approval-card",
    ok: sawApproval,
    snippet: await bodyText(page, 900),
    shot: await shot(page, "b1-approval"),
  });
  const allowed = await clickAllow(page);
  rec({ id: "B1-allow-click", ok: allowed });
  await waitFor(page, async () => /已完成|已停止|已允许/.test(await bodyText(page, 2500)), 120_000);
  let diskB1 = false;
  try {
    const txt = await readFile(path.join(WD_A, "hello-b1.txt"), "utf8");
    diskB1 = /ping/.test(txt);
  } catch { diskB1 = false; }
  rec({
    id: "B1-done",
    ok: diskB1,
    disk: diskB1,
    changes: /没有写盘/.test(await bodyText(page, 2500)),
    snippet: await bodyText(page, 1200),
    shot: await shot(page, "b1-done"),
    note: diskB1 ? "file written" : "file missing",
  });

  // ---- B2 deny write ----
  await submitTask(page, "在当前工作目录写 hello-b2-denied.txt，内容只有一行 nope。不要读别的文件，不要跑命令。");
  await waitFor(page, async () => /允许|拒绝|要新建/.test(await bodyText(page, 2000)), 90_000);
  rec({ id: "B2-card", ok: true, snippet: await bodyText(page, 700), shot: await shot(page, "b2-card") });
  await clickDeny(page, "评测：不要写这个文件");
  await waitFor(page, async () => /拒绝|已停止|已完成/.test(await bodyText(page, 2000)), 60_000);
  let deniedExists = true;
  try {
    await access(path.join(WD_A, "hello-b2-denied.txt"));
  } catch { deniedExists = false; }
  rec({
    id: "B2-denied",
    ok: !deniedExists,
    fileExists: deniedExists,
    snippet: await bodyText(page, 900),
    shot: await shot(page, "b2-done"),
  });

  // ---- B3 follow-up on last finished if possible ----
  const follow = page.locator("#task-input");
  await follow.fill("再写一行到同一个目录：hello-b3.txt 内容 only b3。不要读仓库。");
  await page.locator("#submit-btn").click();
  await page.waitForTimeout(1000);
  rec({
    id: "B3-follow-error",
    ok: true,
    error: await page.locator("#submit-error-text").innerText().catch(() => ""),
    snippet: await bodyText(page, 500),
  });
  const followApproval = await waitFor(page, async () => /允许|拒绝|要新建/.test(await bodyText(page, 2000)), 80_000);
  if (followApproval) await clickAllow(page);
  await waitFor(page, async () => /已完成|已停止/.test(await bodyText(page, 2500)), 100_000);
  rec({
    id: "B3-done",
    ok: true,
    snippet: await bodyText(page, 900),
    shot: await shot(page, "b3-done"),
  });

  // ---- B4 stop mid-run ----
  await submitTask(page, "先列出当前目录的文件名，再用一句话慢慢解释每个文件是做什么的。不要写新文件。");
  await page.waitForTimeout(2500);
  const stopped = await clickStop(page);
  rec({ id: "B4-stop-click", ok: stopped, snippet: await bodyText(page, 400), shot: await shot(page, "b4-stopping") });
  await waitFor(page, async () => /已停止|正在停止/.test(await bodyText(page, 2500)), 60_000);
  const t4 = await bodyText(page, 1500);
  rec({
    id: "B4-stop-face",
    ok: /已停止/.test(t4),
    completedLie: /运行已完成/.test(t4) && /已停止/.test(t4),
    snippet: t4,
    shot: await shot(page, "b4-stopped"),
  });

  // ---- B5 plan gate ----
  await submitTask(page, "只做计划：把当前目录里已有的 txt 列成两步检查清单，每步一句话。不要写文件，不要跑命令。", { plan: true });
  const planCard = await waitFor(page, async () => /批准|否决|计划/.test(await bodyText(page, 2500)), 120_000);
  rec({ id: "B5-plan-card", ok: planCard, snippet: await bodyText(page, 1000), shot: await shot(page, "b5-plan") });
  const titleEdit = page.locator("#action-dock input, .action-dock input, textarea").first();
  if (await titleEdit.count()) {
    await titleEdit.fill("评测改过的标题");
  }
  const approvePlan = page.locator("button", { hasText: /批准/ }).first();
  if (await approvePlan.isVisible().catch(() => false)) await approvePlan.click();
  await waitFor(page, async () => /已完成|已停止|运行中/.test(await bodyText(page, 2500)), 90_000);
  rec({ id: "B5-after-approve", ok: true, snippet: await bodyText(page, 900), shot: await shot(page, "b5-after") });

  // ---- B8 ask_user ----
  await submitTask(page, "先用提问工具问我：文件名要用 hello-b8.txt 还是 note-b8.txt？等我回答后再写那一个文件，内容一行 asked。不要先写盘。");
  const asked = await waitFor(page, async () => /提问|回答|hello-b8|note-b8/.test(await bodyText(page, 2500)), 90_000);
  rec({ id: "B8-ask", ok: asked, snippet: await bodyText(page, 900), shot: await shot(page, "b8-ask") });

  // ---- B11 @ mention ----
  await page.locator("#new-chat-btn").click().catch(() => {});
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("@hello", { delay: 40 });
  await page.waitForTimeout(400);
  rec({
    id: "B11-at",
    ok: /hello-seed|hello-b1/.test(await page.locator("#cite-picker").innerText().catch(() => "")),
    picker: await page.locator("#cite-picker").innerText().catch(() => ""),
    shot: await shot(page, "b11-at"),
  });
  const pick = page.locator("#cite-picker").getByText(/hello-seed/).first();
  if (await pick.count()) await pick.click();
  rec({ id: "B11-inserted", ok: true, value: await page.locator("#task-input").inputValue() });

  // ---- B12 failure face: empty project ----
  await page.locator("#project-select").selectOption({ label: /新建|未入项/ }).catch(() => {});
  const proj = page.locator("#project-select");
  rec({ id: "B12-project-options", ok: true, options: await page.locator("#project-select option").allTextContents().catch(() => []) });

  // HTTP: Work-face ordinary sentence should not 409
  const httpB1 = await postJson(`${BASE}/api/runs`, {
    task: "写一个 hello-http.txt，一行 http-ok。不要读仓库。",
    workdir: WD_A,
    workspace: "office",
    autoApprove: false,
    askUser: true,
  });
  rec({
    id: "B12-http-work-plain",
    ok: httpB1.status === 200 || httpB1.status === 201,
    status: httpB1.status,
    text: httpB1.text.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***"),
  });
  if (httpB1.json?.runId) {
    await postJson(`${BASE}/api/runs/${httpB1.json.runId}/stop`, {});
  }

  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  await browser.close();
  console.log(`live wrote ${results.length} → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
