/**
 * Remaining B-wave from Code face (Work face silently sets mode=design).
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, "shots");
const OUT = path.join(HERE, "live-remain.json");
const BASE = "http://127.0.0.1:4174";
const WD_A = "D:\\Work\\scratch\\fathom-ux-20260915\\web-a";
const results = [];
const rec = (e) => {
  results.push({ t: new Date().toISOString(), ...e });
  console.log(JSON.stringify({ id: e.id, ok: e.ok, note: e.note ?? e.status ?? "" }));
};
const shot = async (page, name) => {
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: f });
  return `shots/${name}.png`;
};
const text = async (page, n = 1400) => String(await page.locator("body").innerText()).slice(0, n);

async function waitBody(page, re, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (re.test(await text(page, 2500))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null), text: await res.text().catch(() => "") };
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" })).newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("agent.ui.pref.onboardingDone", "1"));
  const skip = page.locator("#onboarding-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();

  // B1 aftermath
  await page.goto(`${BASE}/#/run/8aebf60f-cf1c-434a-8e35-97791d1b5518`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const t1 = await text(page);
  rec({
    id: "B1-aftermath",
    ok: /hello-b1|ping|已完成/.test(t1),
    completedLie: /运行已完成/.test(t1),
    noWriteLie: /没有写盘/.test(t1),
    snippet: t1,
    shot: await shot(page, "b1-aftermath"),
  });

  // B4 aftermath
  await page.goto(`${BASE}/#/run/2c98ad64-8908-4a43-b0b9-783f54e5e1c3`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const t4 = await text(page);
  rec({
    id: "B4-aftermath",
    ok: /已停止|中止|aborted/.test(t4),
    completedLie: /运行已完成/.test(t4) && /已停止/.test(t4),
    snippet: t4,
    shot: await shot(page, "b4-aftermath"),
  });

  // B5/B8 ask_user card on plan run
  await page.goto(`${BASE}/#/run/41c7aa61-a386-45fc-9793-1494af0c39c0`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const t5 = await text(page);
  rec({
    id: "B5-B8-ask-on-plan",
    ok: /提问|两步|口径|选项/.test(t5),
    planPinned: /批准并开跑|否决/.test(t5),
    snippet: t5,
    shot: await shot(page, "b5-ask"),
  });

  // Switch to Code face for remaining writes
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.locator("#workspace-face-code").click();
  await page.waitForTimeout(200);
  await page.locator("#new-chat-btn").click();
  await page.locator("#knobs-toggle").click();
  if (await page.locator("#auto-approve-toggle").isChecked()) await page.locator("#auto-approve-toggle").uncheck();
  await page.locator("#plan-mode-toggle").uncheck().catch(() => {});
  await page.locator("#verify-toggle").uncheck().catch(() => {});
  await page.locator("#pack-select").selectOption({ label: "不用领域包" }).catch(() => {});
  await page.locator("#task-input").fill("在当前工作目录写 hello-code.txt，内容只有一行 code-ok。不要读别的文件，不要跑命令。");
  await page.locator("#submit-btn").click();
  await waitBody(page, /允许|拒绝|要新建/, 90_000);
  rec({ id: "B-code-card", ok: true, snippet: await text(page, 900), shot: await shot(page, "b-code-card") });
  const allow = page.locator(".btn--allow, button.btn--allow").first();
  if (await allow.isVisible().catch(() => false)) await allow.click();
  else await page.locator("[data-action=allow]").first().click().catch(() => {});
  await waitBody(page, /已完成|已停止|已允许/, 90_000);
  let codeOk = false;
  try { codeOk = /code-ok/.test(await readFile(path.join(WD_A, "hello-code.txt"), "utf8")); } catch { /* */ }
  rec({ id: "B-code-write", ok: codeOk, snippet: await text(page, 900), shot: await shot(page, "b-code-done") });

  // B11 @
  await page.locator("#new-chat-btn").click();
  await page.locator("#task-input").fill("");
  await page.locator("#task-input").pressSequentially("@hello", { delay: 30 });
  await page.waitForTimeout(500);
  rec({
    id: "B11-at-code",
    ok: /hello-/.test(await page.locator("#cite-picker").innerText().catch(() => "")),
    picker: await page.locator("#cite-picker").innerText().catch(() => ""),
    shot: await shot(page, "b11-at-code"),
  });
  const row = page.locator("#cite-picker").getByText(/hello-seed/).first();
  if (await row.count()) await row.click();
  rec({ id: "B11-value", ok: /@/.test(await page.locator("#task-input").inputValue()), value: await page.locator("#task-input").inputValue() });

  // B9 Work starter
  await page.locator("#workspace-face-office").click();
  await page.waitForTimeout(200);
  rec({
    id: "B9-starters",
    ok: /做一页|做纪要/.test(await text(page, 800)),
    snippet: await page.locator("#starter-gallery").innerText().catch(() => ""),
    shot: await shot(page, "b9-starters"),
  });
  const pageCard = page.getByRole("button", { name: /做一页/ }).first();
  if (await pageCard.count()) await pageCard.click();
  await page.waitForTimeout(400);
  rec({
    id: "B9-after-click",
    ok: true,
    input: await page.locator("#task-input").inputValue(),
    chip: await page.locator("#design-template-chip").innerText().catch(() => ""),
    shot: await shot(page, "b9-filled"),
  });

  // B10 consult pack visible
  await page.locator("#knobs-toggle").click().catch(() => {});
  rec({
    id: "B10-consult-option",
    ok: (await page.locator("#pack-select option").allTextContents()).some((x) => /consult/.test(x)),
    packs: await page.locator("#pack-select option").allTextContents(),
  });

  // HTTP Code-face ordinary write should be single not design
  const http = await post(`${BASE}/api/runs`, {
    task: "写 hello-http-code.txt 一行 http-code。不要读仓库。",
    workdir: WD_A,
    workspace: "code",
    mode: "single",
    autoApprove: false,
    askUser: true,
  });
  rec({ id: "B12-http-code", ok: http.status < 300, status: http.status, runId: http.json?.runId, mode: http.json?.mode });
  if (http.json?.runId) await post(`${BASE}/api/runs/${http.json.runId}/stop`, {});

  // Work-face HTTP without design fields
  const httpW = await post(`${BASE}/api/runs`, {
    task: "写 hello-http-work.txt 一行 work。不要读仓库。",
    workdir: WD_A,
    workspace: "office",
    autoApprove: false,
    askUser: true,
  });
  rec({
    id: "B12-http-work-no-mode",
    ok: httpW.status < 300,
    status: httpW.status,
    runId: httpW.json?.runId,
    mode: httpW.json?.mode ?? httpW.json?.facade,
    text: JSON.stringify(httpW.json).slice(0, 300),
  });
  if (httpW.json?.runId) await post(`${BASE}/api/runs/${httpW.json.runId}/stop`, {});

  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  await browser.close();
  console.log(`remain ${results.length} → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
