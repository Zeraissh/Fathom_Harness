/**
 * 计划 3 · Task 3 活页验收：坞头的标签条不再被挤成 0 宽。
 *
 * 病根（读出来的机制，不是推测）：.ac-head 自己就有 overflow-x:auto（它的
 * 注释逐字写着「split 档预览列可能只有 ~141px：头里的「放大」等键够不着时
 * 允许横滚，不让它越列而过」），但 .ac-tabs 是 flex:1 1 0 + min-width:0——
 * 坞头里**唯一**能被压到 0 的成员（其他成员都有硬地板：收起键 32、加号键
 * 32、放大键 flex-shrink:0 的 min-content）。于是标签条被 flex 直接压到 0，
 * 作者写的横滚救不到它。修法：给 .ac-tabs 一个读得懂的下限。
 *
 * 判据四条：
 *   ① .ac-tabs clientWidth > 0（修前实测 0——老 bug 的直接反证）；
 *   ② .ac-tabs 第一个标签的中心点 elementFromPoint 命中它自己或后代
 *      （修前它 0 宽，中心点被坞头里的兄弟接走）；
 *   ③ 坞头（.ac-head）scrollWidth > clientWidth——横滚仍然成立。
 *      这一条**不是前后判别器**（实测修前它就已经成立：坞头固定成员
 *      190px 自己就溢出了 159px 的坞），它是**回归护栏**，不是本修复的证据。
 *      真正的判别器是 ①（clientWidth 从 0 变成 96）与 ②（标签中心点被谁接住）。
 *   ④ 0 控制台错误。
 *
 * 顺带把 brief Step 1 的实量做了：坞头除标签条外所有成员的占地
 * （padding-inline 16×2 + gap 8×3 + 收起键 32 + 加号键 32 + 放大键实宽），
 * 与坞宽对减（修前标签条实得 0，两者应正好对上）——量到的数写进
 * styles.css 里那条 min-width 的注释，作为常量的依据。
 *
 * ★ 计划 4 · Task 5 改写（原版**实测红**，三处判据全红；两处改动：钉 Code 脸 +
 *   复现条件离开 split 时代）。原版红因：它 boot 到 Work 脸 ⇒ 新世界里坞住在
 *   Code 脸的预览槽、Work 脸上那个槽 display:none ⇒ 量到的是**死坞**（坞
 *   clientWidth=0、标签条 0px、第一个标签宽 0），① 标签条 clientWidth>0、
 *   ② 标签中心不被接走、③ 坞头横滚 三条全红。改成 Code 脸 + 占宽档最窄处
 *   （1440 / fraction 0.18）之后才有可量的坞（实得 239px）。
 *
 * 复现条件（计划 4 后改写）：split 两列没了，坞只住在 Code 脸的预览槽
 * （`#right-rail-preview`）里——**Work 脸上预览槽 display:none，不钉脸会量到
 * 0×0 的死坞**（Task 5 实测：11 个标签在、坞 0 宽）。且「挤成 0 宽」的回归
 * 面现在只剩占宽档的最窄处：viewport 1440、fraction 0.18（钳制下限）→
 * railWidth=240、坞实得 ~239——标签条 min-width 96 + 坞头固定成员 ~190 之和
 * 286 仍比 239 大，坞头的 overflow-x:auto 必须接着救它（判据 ③ 只在这个
 * 最窄处才验得到）。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const WANT = Number(process.env.AUDIT_TABS_MIN ?? "5");

// ---- 选靶 run：只挑链头（tip）。非链头 run 会被应用的 tip-jump 强拉回
// 链头（refreshRunListView → selectRun(tip)），探针的 hash 重设与它乒乓，
// 页面就此楔死（verify-artifact-tabs.mjs 实测过 40s+ 主线程不回）。----
async function artifactPaths(runId) {
  const res = await fetch(`${BASE}/api/runs/${runId}/events`);
  const sse = await res.text();
  const evs = sse.split(/\r?\n/).filter((l) => l.startsWith("data: "))
    .map((l) => { try { return JSON.parse(l.slice(6)); } catch { return null; } })
    .filter(Boolean);
  const results = new Map();
  for (const e of evs) {
    if (e.event?.type === "tool_result") results.set(e.event.toolUseId, e.event);
  }
  const paths = [];
  for (const e of evs) {
    if (e.event?.type !== "tool_call") continue;
    const name = String(e.event.name ?? "");
    if (!/^(write_file|edit_file)$/.test(name)) continue;
    const path = String(e.event.input?.path ?? e.event.input?.file_path ?? "").trim();
    if (!path) continue;
    const r = results.get(e.event.toolUseId);
    if (!r || r.resultIsError) continue;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

const runs = await (await fetch(`${BASE}/api/runs`)).json();
const tips = runs.filter((r) => !runs.some((o) => o.continuedFrom === r.runId));
let runId = null;
if (process.env.AUDIT_RUN) {
  const hint = process.env.AUDIT_RUN;
  runId = (runs.find((r) => r.runId === hint) ?? runs.find((r) => r.runId.startsWith(hint)))?.runId ?? null;
  if (!runId) {
    console.log(`★ AUDIT_RUN=${hint} 没匹配到任何 run`);
    process.exit(1);
  }
  if (!tips.some((r) => r.runId === runId)) {
    console.log(`★ AUDIT_RUN=${hint} 不是链头 run（会被 tip-jump 楔死），换链头里产物最多的`);
    runId = null;
  }
}
if (!runId) {
  const cands = tips.map((r) => ({ r, arts: 0 })).sort((a, b) => b.arts - a.arts);
  for (const c of cands) c.arts = (await artifactPaths(c.r.runId)).length;
  cands.sort((a, b) => b.arts - a.arts);
  if (cands.length === 0 || cands[0].arts < WANT) {
    console.log(`★ 链头 run 里没有 ≥${WANT} 件产物的——验收做不了`);
    process.exit(1);
  }
  runId = cands[0].r.runId;
}
const arts = await artifactPaths(runId);
console.log(`靶 run=${runId}（产物 ${arts.length} 件，链头）`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 计划 4 后：坞只住在 Code 脸的预览槽——不钉脸量到的是 0×0 死坞（Task 5 实测红因）。
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
    // 复现条件：fraction 0.18（钳制下限）→ 1440 视口下 railCap 被夹到 RAIL_MIN_PX=240，
    // 坞实得 ~239——占宽档的最窄处，正是「标签条被压成 0」的回归面。
    // 只设一次，之后由应用自己写。
    if (!localStorage.getItem("agent.ui.pref.rightRail")) {
      localStorage.setItem("agent.ui.pref.rightRail",
        JSON.stringify({ fraction: 0.18, surface: "preview", collapsed: false }));
    }
  } catch {}
});

// 等主线程安静：连续两次探测性 evaluate 都快（<100ms）才算。boot 期应用会
// 自动选中最近一场、切到大 run 后还有 SSE 重放风暴，早了连 click 都会被卡住。
async function waitForQuiet(maxMs) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const s = performance.now();
      while (performance.now() - s < 1) {}
      return performance.now() - s;
    });
    calm = r < 100 ? calm + 1 : 0;
    if (calm >= 2) return true;
  }
  return false;
}

// ---- 开 run + 开画布（与 verify-artifact-tabs.mjs 同一条路）----
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await waitForQuiet(15000);
await page.waitForTimeout(500);
let tabCount = 0;
for (let attempt = 0; attempt < 3; attempt++) {
  await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}`);
  await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll(".artifact[data-artifact-path]")];
    return nodes.length > 0 && nodes.every((n) => n.getAttribute("data-artifact-state") === "ok");
  }, { timeout: 15000 }).catch(() => {});
  await waitForQuiet(20000);
  await page.waitForTimeout(400);
  // 开画布：产物条住在 detail-rail，默认收着，用派发 click 走委托链
  const before = await page.evaluate(() => location.hash);
  await page.evaluate(() => {
    const card = document.querySelectorAll(".artifact[data-artifact-path]")[0];
    card?.querySelector("[data-canvas-open]")?.click();
  });
  const landed = await page.waitForFunction(
    (prev) => location.hash !== prev, before, { timeout: 1500 },
  ).catch(() => false);
  await page.waitForSelector(".ac-tabs .ac-tab", { timeout: 10000 }).catch(() => {});
  await waitForQuiet(20000);
  await page.waitForTimeout(600);
  tabCount = await page.evaluate(() => document.querySelectorAll(".ac-tabs .ac-tab").length);
  if (tabCount > 0) break;
}

// ---- 量：坞头成员逐个量宽 + 判据 ----
// ★ 必须圈在 artifact 画布坞里量：页面里还有一只 #file-preview-overlay
// 的覆盖坞（hidden、0×0），它的 .ac-head 在 DOM 序上排第一——
// 直接 querySelector(".ac-head") 会量到那只死坞。
const m = await page.evaluate(() => {
  const dock =
    document.getElementById("artifact-canvas-view") ??
    [...document.querySelectorAll(".preview-dock")].find((d) => !d.hidden);
  const head = dock?.querySelector(".ac-head");
  const tabs = dock?.querySelector(".ac-tabs");
  const cs = head ? getComputedStyle(head) : null;
  const rectOf = (sel) => {
    const el = head?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.round(r.width * 10) / 10;
  };
  const members = [
    { name: "收起键 .pd-collapse", w: rectOf(".pd-collapse") },
    { name: "标签条 .ac-tabs", w: tabs ? Math.round(tabs.getBoundingClientRect().width * 10) / 10 : null },
    { name: "加号键 .ac-tab-add", w: rectOf(".ac-tab-add") },
    { name: "放大键 .pd-expand", w: rectOf(".pd-expand") },
  ];
  const pad = cs ? Math.round((parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * 10) / 10 : null;
  const gap = cs ? parseFloat(cs.gap) : null;
  const firstTab = tabs?.querySelector(".ac-tab");
  const fr = firstTab?.getBoundingClientRect();
  let hit = null;
  if (fr) {
    const at = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
    hit = at
      ? (at === firstTab || firstTab.contains(at)
        ? "命中"
        : `被 ${at.tagName}.${String(at.className ?? "").split(" ")[0]} 接走`)
      : "(none)";
  }
  return {
    dockW: dock ? Math.round(dock.clientWidth * 10) / 10 : null,
    dockHidden: dock ? dock.hidden : null,
    headW: head ? Math.round(head.clientWidth * 10) / 10 : null,
    headScrollW: head ? head.scrollWidth : null,
    headScrolls: head ? head.scrollWidth > head.clientWidth : null,
    members,
    pad,
    gap,
    tabCount: tabs?.querySelectorAll(".ac-tab").length ?? 0,
    tabsClientW: tabs ? tabs.clientWidth : null,
    tabsScrollW: tabs ? tabs.scrollWidth : null,
    tabsScrollLeft: tabs ? tabs.scrollLeft : null,
    firstTabW: fr ? Math.round(fr.width * 10) / 10 : null,
    hit,
  };
});

console.log(`\n—— Step 1 实量（坞头成员逐个量宽）——`);
console.log(`坞 clientWidth=${m.dockW} · hidden=${m.dockHidden} · 坞头 clientWidth=${m.headW}（scrollWidth=${m.headScrollW}，横滚=${m.headScrolls}）`);
for (const mm of m.members) console.log(`  ${mm.name.padEnd(20)} ${mm.w ?? "—"}px`);
console.log(`  padding-inline=${m.pad} · gap=${m.gap} · 标签数=${m.tabCount} · 第一个标签宽=${m.firstTabW}`);
const nonTab = m.members.filter((x) => x.name !== "标签条 .ac-tabs");
const fixed = nonTab.reduce((a, x) => a + (x.w ?? 0), 0) + (m.pad ?? 0) + (m.gap ?? 0) * (m.members.length - 1);
console.log(`  固定成本（除标签条外全体）= 成员 ${nonTab.map((x) => `${x.w}`).join(" + ")} + padding ${m.pad} + gap ${m.gap}×${m.members.length - 1} = ${Math.round(fixed * 10) / 10}px`);
console.log(`  坞 ${m.dockW} − 固定成本 ${Math.round(fixed * 10) / 10} = ${Math.round((m.dockW - fixed) * 10) / 10}px（标签条实得，修前应为 0）`);

console.log(`\n—— 判据 ——`);
const c1 = (m.tabsClientW ?? 0) > 0;
const c2 = m.hit === "命中";
const c3 = m.headScrolls === true;
const c4 = errs.length === 0 && pageErrs.length === 0;
console.log(`① .ac-tabs clientWidth > 0：${m.tabsClientW}px（scrollWidth=${m.tabsScrollW} scrollLeft=${m.tabsScrollLeft}）→ ${c1 ? "✅" : "★ 红"}`);
console.log(`② 第一个标签中心点：${m.hit}（第一个标签宽 ${m.firstTabW}px）→ ${c2 ? "✅" : "★ 红"}`);
console.log(`③ 坞头横滚 scrollWidth(${m.headScrollW}) > clientWidth(${m.headW}) → ${c3 ? "✅" : "★ 红"}`);
console.log(`④ 控制台错误：${errs.length ? errs.slice(0, 5).join(" │ ") : "零"} · 页面异常：${pageErrs.length ? pageErrs.slice(0, 3) : "零"} → ${c4 ? "✅" : "★ 红"}`);

await page.screenshot({ path: join(OUT, "verify-dock-tabs.png"), fullPage: false });
console.log(`截图落 eval/persona-ux/_verify-shots/verify-dock-tabs.png`);
await browser.close();

const ok = c1 && c2 && c3 && c4;
console.log(ok
  ? "\n✅ 四条全成立：标签条不再被挤成 0 宽，第一个标签可见、坞头横滚生效、0 控制台错误"
  : "\n★ 有判据没达标——看上面哪一条红");
process.exitCode = ok ? 0 : 1;
