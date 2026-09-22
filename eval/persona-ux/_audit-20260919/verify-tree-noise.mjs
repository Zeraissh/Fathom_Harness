/**
 * Task 4 独立活页复核（方案 A · 计划 2 · A6 文件树降噪折叠与展开态记忆）。
 *
 * 为什么不能只靠单测：单测锁的是 foldNoiseEntries / readTreeExpanded 纯函数，
 * 而「组真的折成一行、点开成员显出来、刷新页面目录展开态还在、树宽没被这一刀
 * 弄回去」是 DOM 与 localStorage 的组合行为——纯函数绿不等于屏幕上绿。
 *
 * 夹具：自建一个带 `_probe*` 系列目录的工作目录，POST /api/workdirs 加进
 * 运行时白名单，量完 DELETE 撤掉并删除目录。落在既有 scratch 夹具区
 * （web-a / web-b 同处），不污染仓库树。
 *
 * 用法：node verify-tree-noise.mjs
 *   AUDIT_BASE=http://127.0.0.1:4201（默认）
 *   AUDIT_FIXTURE_ROOT=D:/Work/scratch/fathom-ux-audit-20260918（默认）
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
// 截图落 _verify-shots（gitignore）——不再往已跟踪的 shots/ 写
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const SCRATCH = process.env.AUDIT_FIXTURE_ROOT ?? "D:/Work/scratch/fathom-ux-audit-20260918";
const FIXTURE = join(SCRATCH, "tree-noise-fixture");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  · ${detail}` : ""}`);
}

/** waitForSelector 的软化版：超时不算抛错，返回布尔，由 check 记账。 */
async function waitFor(page, selector, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

let canonical = FIXTURE; // POST 应答里的真实路径（realpath 归一后的白名单形态）

try {
  // ---- 0. 夹具：清旧建新。_probe 系列 + 单个 _qa + 正常目录/文件 ----
  await rm(FIXTURE, { recursive: true, force: true });
  await mkdir(join(FIXTURE, "_probe2-p1"), { recursive: true });
  await mkdir(join(FIXTURE, "_probe3-p2"), { recursive: true });
  await mkdir(join(FIXTURE, "_qa"), { recursive: true });
  await mkdir(join(FIXTURE, "src"), { recursive: true });
  await writeFile(join(FIXTURE, "src", "app.js"), "// tree-noise probe\n");
  await writeFile(join(FIXTURE, "README.md"), "# tree-noise fixture\n");

  const add = await fetch(`${BASE}/api/workdirs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: FIXTURE }),
  });
  const addBody = await add.json().catch(() => null);
  canonical = addBody?.workdir ?? FIXTURE;
  console.log(`白名单加目录: HTTP ${add.status} · ${canonical}`);

  // 主页（#/），不是 run 页：run 页会走 selectRun → syncComposer → patchComposer，
  // 把作曲栏工作目录钉回该 run 自己的 workdir（app.js:3775，抓到过写入栈），
  // 与「用户上一次会话里选过这个目录」的设定互斥。主页走快照恢复路径，
  // 正是「跨会话记忆」发生的地方。
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
    // 进页面之前就把主目录偏好指到夹具：等价于用户上一次会话里选过它。
    // 快照落地时 keep=pref 命中 → 下拉选中夹具 → 树按夹具列出。
    // 按脸记忆（workdirByFace）也要写：restoreWorkdirForFace 会按脸恢复，
    // 只写总 pref 会被它按脸覆盖回列表第一项。
    await page.addInitScript((wd) => {
      try {
        localStorage.setItem("agent.ui.pref.onboardingDone", "1");
        localStorage.setItem("agent.ui.pref.workdir", wd);
        localStorage.setItem("agent.ui.pref.workdirByFace", JSON.stringify({ code: wd, office: wd }));
      } catch { /* 首帧还没 origin 就不写 */ }
    }, canonical);
    await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);

    // 欢迎页右列恒收起（core/rail-policy.js railVisibility：welcome 一律
    // collapsed），唯一重开入口是 #right-rail-handle 这把「把手」——点它
    // 就是用户真实的开栏手势，探针不越过 UI。
    const handleOk = await waitFor(page, "#right-rail-handle:not([hidden])", 5000);
    check("欢迎页有重开右列的把手", handleOk);
    if (!handleOk) throw new Error("右列把手没出现，中止");
    await page.click("#right-rail-handle");
    await page.waitForFunction(
      () => (document.querySelector(".files-rail")?.getBoundingClientRect().width ?? 0) >= 150,
      { timeout: 5000 },
    );

    const sawGroup = await waitFor(page, ".ft-group-name");
    check("树里有降噪组行", sawGroup);
    if (!sawGroup) {
      const bodyText = await page.evaluate(() => document.body.textContent?.slice(0, 300));
      console.log("树里没找到组行，页面开头:", bodyText);
      throw new Error("降噪组行未出现，中止");
    }

    const before = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rail = q(".files-rail");
      const groups = [...document.querySelectorAll(".ft-group-name")];
      const label = q(".ft-group-name .ft-group-label");
      return {
        railW: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
        groupTexts: groups.map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()),
        membersHidden: !q('.ft-row[data-path="_probe2-p1"]') && !q('.ft-row[data-path="_probe3-p2"]'),
        qaRow: Boolean(q('.ft-row[data-path="_qa"]')),
        srcRow: Boolean(q('.ft-row[data-path="src"]')),
        readmeRow: Boolean(q('.ft-row[data-path="README.md"]')),
        labelTruncated: label ? label.scrollWidth > label.clientWidth + 1 : null,
      };
    });

    check("降噪组是**一行**（只有一条 _probe 系列）", before.groupTexts.length === 1,
      JSON.stringify(before.groupTexts));
    check("组行文案是「_probe 系列（2 个，已降噪折叠）」",
      /^_probe 系列（2 个，已降噪折叠）$/.test(before.groupTexts[0] ?? ""),
      before.groupTexts[0] ?? "");
    check("折叠时成员不显示（_probe2-p1 / _probe3-p2 不在树里）", before.membersHidden);
    check("单个 _qa 不成组，原样一行", before.qaRow);
    check("正常目录 src 与 README 原样（降噪只收拾噪音）", before.srcRow && before.readmeRow);
    check("树宽 ≥ 200px（计划 1 的成果没被这一刀弄回去）", before.railW >= 200,
      `railW=${before.railW}`);
    check("组名没被截断（目录名可读）", before.labelTruncated === false,
      `truncated=${before.labelTruncated}`);

    // ---- 点开组：成员显出来 ----
    await page.click(".ft-group-name");
    const opened = await waitFor(page, '.ft-row[data-path="_probe2-p1"]', 5000);
    const openedState = await page.evaluate(() => ({
      p1: Boolean(document.querySelector('.ft-row[data-path="_probe2-p1"]')),
      p2: Boolean(document.querySelector('.ft-row[data-path="_probe3-p2"]')),
      aria: document.querySelector(".ft-group-name")?.getAttribute("aria-expanded"),
    }));
    check("点组后成员显出来（_probe2-p1 / _probe3-p2）", opened && openedState.p1 && openedState.p2,
      JSON.stringify(openedState));
    check("组行 aria-expanded=true（读屏听得见）", openedState.aria === "true",
      `aria=${openedState.aria}`);

    // ---- 展开一个正常目录：目录展开态走跨会话记忆 ----
    await page.click('.ft-row[data-path="src"] .ft-twist');
    const srcOpened = await waitFor(page, '.ft-row[data-path="src/app.js"]', 5000);
    check("展开 src 后子文件可见", srcOpened);

    // ---- 刷新页面：目录展开态跨会话还在；组折叠态是内存态，刷新回到折叠 ----
    // 刷新后欢迎页又把右列收成 0 宽（welcome 恒收起），照旧用把手重开。
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    await page.click("#right-rail-handle");
    await page.waitForFunction(
      () => (document.querySelector(".files-rail")?.getBoundingClientRect().width ?? 0) >= 150,
      { timeout: 5000 },
    );
    const srcPersisted = await waitFor(page, '.ft-row[data-path="src/app.js"]');
    const after = await page.evaluate(() => ({
      groupRow: Boolean(document.querySelector(".ft-group-name")),
      membersHiddenAgain: !document.querySelector('.ft-row[data-path="_probe2-p1"]'),
    }));
    check("刷新后 src 仍展开（A6 的「跨会话记住」）", srcPersisted);
    check("刷新后组回到折叠（组折叠态是内存态，按设计不跨会话）",
      after.groupRow && after.membersHiddenAgain, JSON.stringify(after));

    const railRect = await page.evaluate(() => {
      const r = document.querySelector(".files-rail")?.getBoundingClientRect();
      return r ? { x: Math.floor(r.x) - 6, y: 0, width: Math.ceil(r.width) + 12, height: 700 } : null;
    });
    if (railRect) {
      await page.screenshot({ path: join(OUT, "tree-noise-a6-1600.png"), clip: railRect });
    }
    check("0 控制台错误", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
} finally {
  // ---- 清理：撤白名单 + 删夹具。白名单是共享开发服务器的状态，量完不留痕 ----
  try { await rm(FIXTURE, { recursive: true, force: true }); } catch { /* 已不存在 */ }
  try {
    await fetch(`${BASE}/api/workdirs`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: canonical }),
    });
    console.log("已撤白名单 + 删夹具");
  } catch { /* 清理失败不掩盖测量结果 */ }
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n合计 ${checks.length - failed.length}/${checks.length} 通过`);
if (failed.length) process.exitCode = 1;
