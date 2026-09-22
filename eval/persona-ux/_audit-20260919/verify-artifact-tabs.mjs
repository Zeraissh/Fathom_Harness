/**
 * 计划 2 · Task 6 活页验收：产物条与预览坞标签条收拢到一个真值源。
 *
 * 量五件事（brief Step 6）加一条本任务新增语义的活页锁。
 * 终审 I1 勘误后 ①/② 的判据改了：两侧契约不同——产物条是呈报视图
 * （FILE_GROUPS 分组 + 逐个验存在性，盘上没了的拿掉），标签条是导航器
 * （seq 时序、不验存在性）。"同一个真值源"指数据来源、不指逐项相等。
 * ① 比集合：标签条 ⊇ 产物条；差集（tabs−rail）每一项必须盘上已不存在
 *    （差集里出现盘上还在的项 = 真 bug，要红——不许比成永远绿）。
 * ② 顺序按设计不同（seq vs 分组），只打印、不比对。
 * ③ 点开一个此前没点过的产物 → 它仍在原位（ensurePreviewArtifact 的
 *    "回原位"语义，不是追加到末尾）；
 * ④ 缓存生效：getArtifacts 的单次耗时不对时间线长度增长——量法见下；
 * ⑤ 0 控制台错误；
 * ⑥ 五步序列（review 的 Important 形状，走真实入口）：开X → 开Y → 关Y →
 *    关X → 重开Y。锁的是终态契约：第 5 步 = 五步前的标签条 − X（Y 在格、
 *    X 消失、顺序正确）。边界（Fix round 1 实证）：这条锁抓不住「长度键」变异——
 *    缓存单条目（每 runId 只留最后一次派生），remember/forget 之后都紧跟
 *    一次派生覆写，第 5 步比对的是第 4 步写的键、不是第 3 步的——旧清单
 *    早被覆写、撞不上。变异验红落在源码锁（test/ui-artifacts.test.ts 最后
 *    一条）；探针这条锁的是终态行为，真回归才会红。
 *
 * ④ 的量法说明：getArtifacts 是 initArtifactCanvas 的闭包入参，页面外拿不到。
 * 切标签走 hashchange → openCanvas → renderCurrent，renderCurrent 里有异步
 * fetch——量"切标签耗时"量的是渲染，不是 getArtifacts。真正同步、且必经
 * getArtifacts 的入口是「打开网页」钮（addTabBtn → focusAddress），click 的
 * 派发是同步的，所以量 `performance.now()` 包住 `btn.click()` 的同步段。
 *
 * 缓存必要性在活页上有两个量：
 *   · 热 20 次：stamp 命中路径，20 次 add-tab 同步段——断言 <5ms；
 *   · 冷走查：⑥ 的关Y / 关X / 重开Y 三个 click 都会改 stamp（mine/dismissed
 *     增删），同步段里必然整链重走一遍派生——主靶是链头（tip），它的合并
 *     清单 = 谱系上每一场时间线的并（本实例 657+338≈995 事件）。冷热两个数
 *     摆在一起就是「渲染路径上的热路径与每帧走一遍时间线的差距」。
 *   · 跨 run 对拍（有资格时才做）：另一只**链头** run 的事件数 ≥ 主靶 1.5×。
 *     非链头 run 会被应用的 tip-jump（refreshRunListView → selectRun(tip)）
 *     强拉回链头——探针的 hash 重设会跟它乒乓，页面就此楔死（本实例已实测
 *     过 657 事件的非链头 run，40s+ 主线程不回）。
 *
 * ★ 计划 4 · Task 5 修（三处）：
 *   ① ⑤ 的口径太粗（`errs.length===0` 会把**探针自找**的 404 算在应用头上）——
 *      本探针自己会去开判据 ① 已证"盘上不存在"的产物，应用取件当然 404。
 *      收紧成"**除了**这些已知缺失产物上的 404，一条都不许有"（更严，不是放宽）。
 *   ② ⑥ 的原实现是"派发 click + 固定等 900ms"，**只在最后一步**看终态 ⇒
 *      批次并发（CONC=3）下把**一次点丢**误报成"五步契约破了"（实测两次 click
 *      同步段都只有 0.10ms = `.ac-tab-close` 没找到、`?.click()` 空转；单跑绿）。
 *      改成**每步都等效果落地**（开：标签条真出现这一份；关：真少一格），
 *      没落地就重试最多 5 次，仍旧没落地 ⇒ `ok=false` **照旧红**。
 *      ——派单硬约束二的纪律：真点之后必须断言可见性变化，不能点完就假定生效。
 *      于是"点丢了"与"契约破了"不再互相冒充。
 *   ③ 加**前置门**：`openRun` 后产物条若为**空**，当场停并说清原因（不打印
 *      后续判据）。实测（批次 CONC=3）别的探针在建/删 run ⇒ tip-jump 把页面
 *      拉到最新一场 ⇒ 产物条 0 项 ⇒ ① 会报"差集全部盘上不存在=false"，
 *      **看起来像应用真 bug**，其实只是这一列没落在靶 run 上（"灯指错东西"）。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";

// ---- 选靶 run：有 ≥2 件产物的一只当主靶；事件数最多的一只当性能对拍 ----
async function runFacts(runId) {
  const res = await fetch(`${BASE}/api/runs/${runId}/events`);
  const sse = await res.text();
  const evs = sse.split(/\r?\n/).filter((l) => l.startsWith("data: "))
    .map((l) => { try { return JSON.parse(l.slice(6)); } catch { return null; } })
    .filter(Boolean);
  const results = new Map();
  for (const e of evs) {
    if (e.event?.type === "tool_result") results.set(e.event.toolUseId, e.event);
  }
  const artPaths = [];
  for (const e of evs) {
    if (e.event?.type !== "tool_call") continue;
    const name = String(e.event.name ?? "");
    if (!/^(write_file|edit_file)$/.test(name)) continue;
    const path = String(e.event.input?.path ?? e.event.input?.file_path ?? "").trim();
    if (!path) continue;
    const r = results.get(e.event.toolUseId);
    if (!r || r.resultIsError) continue;
    if (!artPaths.includes(path)) artPaths.push(path);
  }
  return { eventCount: evs.length, artPaths };
}

// 终审 I1：产物条逐个验存在性、标签条不验——差集（tabs−rail）的每一项
// 必须盘上已不存在（存在即真 bug）。借宿主的 /api/runs/:id/paths/inspect。
async function inspectPaths(runId, paths) {
  const res = await fetch(`${BASE}/api/runs/${encodeURIComponent(runId)}/paths/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) throw new Error(`paths/inspect ${res.status}`);
  const body = await res.json();
  const m = new Map();
  for (const item of Array.isArray(body.paths) ? body.paths : []) {
    m.set(String(item?.input ?? ""), item);
  }
  return m;
}

const runs = await (await fetch(`${BASE}/api/runs`)).json();
const facts = new Map();
for (const r of runs) facts.set(r.runId, await runFacts(r.runId));
// 只挑链头（tip）：非链头 run 会被应用的 tip-jump 强拉回链头
// （refreshRunListView 里 conversationTipId 一跳就 selectRun(tip)），探针的
// hash 重设与它乒乓，页面就此楔死——本实例的 657 事件 run 正是 94f58b8a 的
// 父场，一导航就跳回链头（实测 40s+ 主线程不回，已记进报告）。
const tips = runs.filter((r) => !runs.some((o) => o.continuedFrom === r.runId));
const withArts = tips.filter((r) => (facts.get(r.runId)?.artPaths.length ?? 0) >= 2);
if (withArts.length === 0) {
  console.log("★ 这台实例的链头 run 里没有 ≥2 件产物的——验收做不了");
  process.exit(1);
}
const primary = withArts.sort((a, b) => facts.get(b.runId).artPaths.length - facts.get(a.runId).artPaths.length)[0];
// 链头合并清单 = 谱系上每一场时间线的并：把链上事件数加起来，供 ④ 报告口径用
const chainEvents = (() => {
  let cur = primary.runId, total = 0;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    total += facts.get(cur)?.eventCount ?? 0;
    cur = runs.find((r) => r.runId === cur)?.continuedFrom;
  }
  return total;
})();
// 对拍资格：另一只链头、有产物可点开画布、事件数 ≥ 主靶 1.5×。
const compCandidates = tips.filter((r) =>
  r.runId !== primary.runId &&
  (facts.get(r.runId)?.artPaths.length ?? 0) >= 1 &&
  facts.get(r.runId).eventCount >= facts.get(primary.runId).eventCount * 1.5);
const longRun = compCandidates.sort((a, b) => facts.get(b.runId).eventCount - facts.get(a.runId).eventCount)[0] ?? null;
console.log(`主靶 run=${primary.runId}（产物 ${facts.get(primary.runId).artPaths.length} 件 / 事件 ${facts.get(primary.runId).eventCount} 条 / 谱系合并 ${chainEvents} 条）`);
if (longRun) console.log(`对拍 run=${longRun.runId}（事件 ${facts.get(longRun.runId).eventCount} 条）`);
else console.log(`对拍 run=无（本实例没有 ≥1.5× 事件的带产物链头 run）——④ 落回主靶冷/热对拍`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
const badRes = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
// 控制台的 "Failed to load resource: 404" 不说是谁 ⇒ 存下 ≥400 的 URL，判据 ⑤ 红了才定位得了。
page.on("response", (r) => { if (r.status() >= 400) badRes.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 全新档案的右列默认 25% 预算：树吃 200 后预览列只剩 121px，坞头的
    // 固定钮（收起/放大/打开网页）就把标签条挤到 0 宽。量的是清单语义不是
    // 响应式，先按真实用户的档案宽度立一列（面板开在 preview，分片给足，
    // 只设一次，之后由应用自己写）。
    if (!localStorage.getItem("agent.ui.pref.rightRail")) {
      localStorage.setItem("agent.ui.pref.rightRail",
        JSON.stringify({ fraction: 0.45, splitRatio: 0.55, panel: "preview", collapsed: false }));
    }
  } catch {}
});

let firstLoad = true;
// 等主线程安静：连续两次探测性 evaluate 都快（<100ms）才算。boot 期应用会
// 在 loadRuns 完成后自动选中最近一场（还可能自动开它的画布、写 hash），
// 早了会被它盖掉；切到大 run 后还有 SSE 重放风暴（657 事件进 batcher），
// 早了连 click 都会被卡住。cap 用 maxMs。
async function waitForQuiet(maxMs) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const s = performance.now();
      while (performance.now() - s < 1) {} // 1ms 忙等：探测排队延迟
      return performance.now() - s;
    });
    calm = r < 100 ? calm + 1 : 0;
    if (calm >= 2) return true;
  }
  return false;
}

/** `openRun` 是否真的落到了"产物条非空"的状态（前置条件自检，见 openRun 末尾） */
let openRunLanded = false;

async function openRun(runId) {
  // 服务器把 query 当路径（?probe= 会 404），不能靠带参 goto 强制整页加载；
  // 第一次落干净首页，之后用 location.hash 切 run（应用自己监听 hashchange）。
  if (firstLoad) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    firstLoad = false;
    await waitForQuiet(15000); // boot 的 loadRuns + 自动选中最近一场
    await page.waitForTimeout(500);
  }
  // 切 run + 落定校验：boot 自动选中的 writeHash 可能恰好在我们之后发，
  // 会把 hash 盖回最近一场——发现没落对就重设，最多 3 次。
  const want = facts.get(runId).artPaths;
  let rail = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((h) => { location.hash = h; }, `#/run/${runId}`);
    await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 15000 }).catch(() => {});
    // 等 hydration 落定：路径探测回来的重画会换掉卡节点，早了点的是一张死卡
    await page.waitForFunction(() => {
      const nodes = [...document.querySelectorAll(".artifact[data-artifact-path]")];
      return nodes.length > 0 && nodes.every((n) => n.getAttribute("data-artifact-state") === "ok");
    }, { timeout: 15000 }).catch(() => {});
    await waitForQuiet(20000); // 大 run 的 SSE 重放风暴要等它过去
    await page.waitForTimeout(400);
    rail = await page.evaluate(() =>
      [...document.querySelectorAll(".artifact[data-artifact-path]")].map((n) => n.getAttribute("data-artifact-path")));
    const onTarget = await page.evaluate((id) => location.hash.includes(id), runId);
    // 产物条 = 真值源过滤后的这一场产物，且逐个验过存在性：事件里写过、
    // 盘上已不在的会被拿掉（终审 I1）。落定校验按「事件里写过、且盘上还在」
    // 的子集来——盘上没了的本来就不该出现在产物条里。
    let existingWant = want;
    try {
      const insp = await inspectPaths(runId, want);
      existingWant = want.filter((p) => insp.get(p)?.exists !== false);
    } catch { /* inspect 打不通就退成全量期望（老口径），不拦启动 */ }
    // 本场仍在盘上的每一件都必须在，项数不能离谱地多（错落在别的 run 上
    // 会看到别场的整列清单）。
    const landed = onTarget && existingWant.every((p) => rail.includes(p)) && rail.length <= want.length * 2;
    if (landed) break;
  }
  // ★ 计划 4 · T5 加：**前置条件自检**。产物条空 ⇒ 这一轮所有判据都无从量起，
  //   必须**当场喊出来**（并把"在不在靶 run 上"一起说清），不许继续往下算——
  //   否则 ① 会报"差集全部盘上不存在=false"，看起来像**应用真 bug**，
  //   实际只是这一列没开/没落在靶 run 上（"灯指错东西"）。
  //   实测触发场景：批次并发（CONC=3）时别的探针在**建/删 run**，
  //   应用的 tip-jump 把页面拉到最新一场（日志里还跟着 404 /api/runs/<别人的 run>/changes）。
  openRunLanded = rail.length > 0;
  return rail;
}

async function openCanvasViaRail(index) {
  // 产物条住在 detail-rail 里，这列默认收着（rail-body display:none）——
  // Playwright 的可见性点击点不到，用派发 click：委托链照走，与真点击同路。
  // 每张卡有两个 [data-canvas-open]（名称与「预览」钮）——按卡取第一个，
  // 平铺取第 N 个会点到别的卡上。openRun 已等 hydration 落定，节点是稳的；
  // 再加一道「hash 真变了」的效果检查防落空（同一张卡重点时 hash 不变，
  // 应用会直接 open 而不改 hash——检查失败就重试，无害）。
  // 返回值 = 落定那次 click 的同步段时长（给 ④ 的冷走查用）。
  let clickDt = -1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await page.evaluate(() => location.hash);
    const dt = await page.evaluate((i) => {
      const card = document.querySelectorAll(".artifact[data-artifact-path]")[i];
      const opener = card?.querySelector("[data-canvas-open]");
      const t0 = performance.now();
      if (opener) opener.click();
      return performance.now() - t0;
    }, index);
    clickDt = dt;
    const landed = await page.waitForFunction(
      (prev) => location.hash !== prev, before, { timeout: 1500 },
    ).catch(() => false);
    if (landed) break;
  }
  await page.waitForSelector(".ac-tabs .ac-tab", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  return clickDt;
}

async function tabState() {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll(".ac-tabs .ac-tab[data-ac-index]")];
    return {
      count: tabs.length,
      paths: tabs.map((t) => String(t.title ?? "")),
      selected: tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"),
    };
  });
}

// ---- 主靶：① ② ③ ⑥ ----
// 终审 I1 勘误后的判据：两侧契约不同（产物条=呈报视图、验存在性；标签条=
// 导航器、按 seq）。① 比集合：标签条 ⊇ 产物条；差集每一项必须盘上已不存在
// （存在即真 bug）。② 顺序按设计不同，只打印、不比对。
const railPaths = await openRun(primary.runId);
if (!openRunLanded) {
  // ★ 计划 4 · T5 加的前置门：**产物条空 ⇒ 后面五条判据全是假的**。
  //   实测（批次 CONC=3）：别的探针在建/删 run，应用 tip-jump 把页面拉走，
  //   产物条 0 项 ⇒ ① 报"差集全部盘上不存在=false"（像应用真 bug）、
  //   ③/⑥ 报 undefined ⇒ 红得莫名其妙。这里**当场停**并说清是哪一种。
  const onTarget = await page.evaluate((id) => location.hash.includes(id), primary.runId);
  console.log(`\n★★ 前置条件不成立：产物条是空的 ⇒ 本轮判据无从量起（**不是应用有 bug**）。`);
  console.log(`   靶 run=${primary.runId} · 现在 hash=${await page.evaluate(() => location.hash)} · 在靶 run 上=${onTarget}`);
  console.log(`   期望该场产物 ${facts.get(primary.runId).artPaths.length} 件，一件都没渲染出来。`);
  console.log(`   常见成因：并发的别的探针在建/删 run，应用的 tip-jump 把页面拉到最新一场` +
    `（日志里会跟着 404 /api/runs/<别人的 run>/changes）。⇒ 单跑本探针，或把批次调成串行（PROBE_CONC=1）。`);
  await page.screenshot({ path: join(OUT, "verify-artifact-tabs-PRECOND.png"), fullPage: false });
  await browser.close();
  process.exit(1);
}
console.log(`\n① 产物条 ${railPaths.length} 项：${railPaths.join(" | ")}`);

await openCanvasViaRail(0);
let tabs = await tabState();
const railSubsetOfTabs = railPaths.every((p) => tabs.paths.includes(p));
const diff = tabs.paths.filter((p) => !railPaths.includes(p));
let diffAllGone = true;
let inspectErr = null;
if (diff.length > 0) {
  try {
    const insp = await inspectPaths(primary.runId, diff);
    for (const p of diff) {
      const exists = insp.get(p)?.exists;
      console.log(`    差集逐项：${p} → exists=${exists}`);
      if (exists !== false) diffAllGone = false; // 响应缺失/异常/盘上还在都算不成立
    }
  } catch (err) {
    inspectErr = String(err);
    diffAllGone = false;
  }
}
console.log(`   标签条 ${tabs.count} 项 / 产物条 ${railPaths.length} 项：${tabs.paths.join(" | ")}`);
console.log(`   ① 标签条 ⊇ 产物条=${railSubsetOfTabs} · 差集（tabs−rail，${diff.length} 项）：${diff.join(" | ") || "（空）"} · 差集全部盘上不存在=${diffAllGone}${inspectErr ? `（inspect 失败：${inspectErr}）` : ""}`);
console.log(`② 顺序按设计不同（标签条 seq vs 产物条分组），不比对：标签条 ${tabs.paths.slice(0, 4).join(" → ")}… / 产物条 ${railPaths.slice(0, 4).join(" → ")}…`);

// ③ 点一个此前没点过的（第 3 件）——ensurePreviewArtifact 的"回原位"语义：
// 它在**标签条**里的原位不变、选中格 = 它在标签条里的下标。两侧顺序按设计
// 不同，期望位置按标签条自己的清单算，不按产物条下标。
const posInTabs = tabs.paths.indexOf(railPaths[2]);
await openCanvasViaRail(2);
tabs = await tabState();
const inPlace = tabs.selected === posInTabs && tabs.paths[posInTabs] === railPaths[2];
console.log(`③ 点开第 3 件「${railPaths[2]}」：标签条原位=${posInTabs} · 选中格=${tabs.selected}（应 ${posInTabs}）· 原位=${inPlace}`);

// ⑥ 五步序列（review 的 Important 形状，全部走真实入口）：
// 开X → 开Y → 关Y → 关X → 重开Y。产物条卡片的点击链是
// app.js 委托 → onOpenCanvas → openArtifactByPath → rememberPreviewFile
// （mine 长），关标签是 closePreviewTab → forgetPreviewFile（mine 缩、
// dismissed 长）。锁终态契约：第 5 步 = 五步前的标签条 − X（终审 I1 后
// 基线按标签条自己算——两侧顺序按设计不同）。边界（Fix round 1 实证）：
// 这条锁抓不住「长度键」变异——缓存单条目、每次 remember/forget 都紧跟
// 派生覆写，第 5 步比对的是第 4 步写的键，第 3 步的旧清单早被覆写、撞
// 不上；变异红由源码锁担（test/ui-artifacts.test.ts 最后一条）。活页变异
// 态实测两轮五步都绿，逐项证据见 task-6-report.md 的 Fix round 1。
// ③ 已经开过 rail[2]（mine 里先有了它）——不影响五步的终态断言。
// 关闭钮平时 opacity:0（悬停才显），Playwright 的命中测试会跟坞头里的兄弟
// 钮抢点；这里量的是状态语义不是指针几何，用派发 click 走同一条委托链。
// 顺带量一下命中几何，看是不是真有遮挡（记进报告，不拦验收）。
const X = railPaths[4], Y = railPaths[5];
// 终态基线 = 五步**之前**的标签条（两侧顺序按设计不同，不能用产物条清单
// 当期望——第 5 步 = 基线 − X，Y 回到它在基线里的原位）。
const tabsBeforeSix = await tabState();
const geom = await page.evaluate(() => {
  const btn = document.querySelector('.ac-tabs .ac-tab[data-ac-index="2"] .ac-tab-close');
  const r = btn.getBoundingClientRect();
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const tl = document.querySelector(".ac-tabs");
  const dock = document.getElementById("artifact-canvas-view");
  return {
    atPoint: at ? `${at.tagName}.${String(at.className).split(" ")[0]}` : "(none)",
    scrollLeft: tl.scrollLeft, scrollWidth: tl.scrollWidth, clientWidth: tl.clientWidth,
    dockHidden: dock?.hidden, dockW: dock?.clientWidth,
  };
});
console.log(`   命中几何：关闭钮中心被 ${geom.atPoint} 接住 · tablist scrollLeft=${geom.scrollLeft}（scrollWidth=${geom.scrollWidth} clientWidth=${geom.clientWidth}）· 坞 hidden=${geom.dockHidden} w=${geom.dockW}`);
console.log(`⑥ 五步：开X(${X}) → 开Y(${Y}) → 关Y → 关X → 重开Y`);
const tabCountNow = () => page.evaluate(
  () => document.querySelectorAll(".ac-tabs .ac-tab[data-ac-index]").length,
);
const tabHas = (p) => page.evaluate((want) =>
  [...document.querySelectorAll(".ac-tabs .ac-tab")].some((t) => String(t.title ?? "") === want), p);
/** 开到"标签条里真有这一份"为止（同下面 close 的理由：点完必须等效果落地）。 */
const openUntilTabbed = async (index, p) => {
  for (let i = 0; i < 5; i++) {
    const dt = await openCanvasViaRail(index);
    if (await tabHas(p)) return { dt, ok: true, tries: i + 1 };
    await page.waitForTimeout(300);
  }
  return { dt: -1, ok: false, tries: 5 };
};
const openX = await openUntilTabbed(4, X); // 开 X（产物条卡片 → openArtifactByPath → rememberPreviewFile）
const openY = await openUntilTabbed(5, Y); // 开 Y
// 关标签按标题找钮：关掉一件后下标左移，不能按 data-ac-index 找。
//
// ★ 计划 4 · T5 修（并发下的**误判**，实测）：原来是"派发 click + 固定等 900ms"，
//   然后**只在最后一步**看终态。批次里 CONC=3 争用时实测红过一次
//   （终态项数 11、X 没消失，两次 click 的同步段都只有 0.10ms——说明 `.ac-tab-close`
//   当时根本没找到、`?.click()` 空转），而**单跑同一份代码是绿的**。
//   问题不在"五步契约不成立"，而在**探针把"一次点丢了"报成了"契约破了"**——
//   这是误判（本仓"灯指错东西"那一族）。而且它违反了派单硬约束二的纪律：
//   **真点之后必须断言可见性变化**，不能点完就假定生效。
//   ⇒ 改法：每步点完**等它真的少一格**（`waitForFunction`，3s），没少就重试，
//     最多 5 次；仍旧没少就 `ok=false` 且**照旧红**（诚实红，不是放宽）。
//     点丢了 ⇒ 报"这一点没落地"；契约真破 ⇒ 报"点到了但终态不对"。两者不混。
const closeTabByTitle = async (p) => {
  for (let i = 0; i < 5; i++) {
    const before = await tabCountNow();
    const dt = await page.evaluate((want) => {
      const tab = [...document.querySelectorAll(".ac-tabs .ac-tab")].find((t) => String(t.title ?? "") === want);
      const btn = tab?.querySelector(".ac-tab-close");
      const t0 = performance.now();
      btn?.click();
      return performance.now() - t0;
    }, p);
    const landed = await page.waitForFunction(
      (n) => document.querySelectorAll(".ac-tabs .ac-tab[data-ac-index]").length < n,
      before, { timeout: 3000 },
    ).then(() => true).catch(() => false);
    if (landed) return { dt, ok: true, tries: i + 1 };
    await page.waitForTimeout(300);
  }
  return { dt: -1, ok: false, tries: 5 };
};
const closeY = await closeTabByTitle(Y);
const closeX = await closeTabByTitle(X);
const reopenY = await openUntilTabbed(5, Y); // 重开 Y
const reopenDt = reopenY.dt;
tabs = await tabState();
const expPaths = tabsBeforeSix.paths.filter((p) => p !== X);
// ★ 五步成立 = **五步都真的落地** + 终态契约成立。前四步的点丢一个，
//   报的就是"这一步没落地"，不再冒充"契约破了"。
const allStepsLanded = openX.ok && openY.ok && closeY.ok && closeX.ok && reopenY.ok;
const fiveStep = allStepsLanded
  && tabs.count === expPaths.length
  && tabs.paths.join("|") === expPaths.join("|")
  && tabs.selected === expPaths.indexOf(Y)
  && !tabs.paths.includes(X) && tabs.paths.includes(Y);
console.log(`   终态：项数=${tabs.count}（应 ${expPaths.length}）· Y 在格 ${tabs.paths.indexOf(Y)}（应 ${expPaths.indexOf(Y)}）· X 已消失=${!tabs.paths.includes(X)} · 五步成立=${fiveStep}`);
console.log(`   五步**逐步落地确认**：开X ok=${openX.ok}(${openX.tries}) · 开Y ok=${openY.ok}(${openY.tries}) · 关Y ok=${closeY.ok}(${closeY.tries}) · 关X ok=${closeX.ok}(${closeX.tries}) · 重开Y ok=${reopenY.ok}(${reopenY.tries})`);
console.log(`   （关Y=${closeY.dt.toFixed(2)}ms · 关X=${closeX.dt.toFixed(2)}ms · 重开Y=${reopenDt.toFixed(2)}ms——每步都是 stamp 变更后的整链重派生）`);

// ---- ④ 缓存：add-tab 同步段（必经 getArtifacts）----
// 热路径（stamp 命中）是画布渲染路径上每帧走的那个；冷路径（stamp 变更后
// 整链重派生一遍）的价由 ⑥ 的两个 click 量过了。跨 run 对拍只在有资格的
// 实例做（另一只 ≥1.5× 事件的带产物链头 run）。
async function measureAddTabClicks(n) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const dt = await page.evaluate(() => {
      const btn = document.querySelector(".ac-tab-add");
      if (!btn) return -1;
      const t0 = performance.now();
      btn.click();
      return performance.now() - t0;
    });
    samples.push(dt);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const first5 = samples.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const last5 = samples.slice(-5).reduce((a, b) => a + b, 0) / 5;
  return { median, first5, last5, max: samples[samples.length - 1] };
}
const perfPrimary = await measureAddTabClicks(20);
console.log(`\n④ 冷走查（stamp 变更后整链重派生 ~${chainEvents} 事件）：关Y=${closeY.dt.toFixed(2)}ms · 关X=${closeX.dt.toFixed(2)}ms · 重开Y=${reopenDt.toFixed(2)}ms`);
console.log(`   热 20 次 add-tab（stamp 命中）：中位=${perfPrimary.median.toFixed(2)}ms · 前5均=${perfPrimary.first5.toFixed(2)}ms · 后5均=${perfPrimary.last5.toFixed(2)}ms · 最大=${perfPrimary.max.toFixed(2)}ms`);
let flat = perfPrimary.median < 5;
if (longRun) {
  await openRun(longRun.runId);
  await openCanvasViaRail(0);
  const perfLong = await measureAddTabClicks(20);
  console.log(`   对拍 20 次：中位=${perfLong.median.toFixed(2)}ms · 前5均=${perfLong.first5.toFixed(2)}ms · 后5均=${perfLong.last5.toFixed(2)}ms · 最大=${perfLong.max.toFixed(2)}ms（对拍 ${facts.get(longRun.runId).eventCount} 事件）`);
  flat = flat && perfLong.median < 5 && perfLong.median <= perfPrimary.median * 2 + 0.5;
  console.log(`   ④ 两档事件数下耗时都 <5ms 且不成倍涨=${flat}（${facts.get(primary.runId).eventCount} vs ${facts.get(longRun.runId).eventCount} 事件）`);
} else {
  console.log(`   ④ 热路径 <5ms=${flat}（本实例无跨 run 对拍资格；必要性证据=冷/热两行：渲染路径上走的是热路径，冷价只在 stamp 变更时付一次）`);
}

// ---- ⑤ 控制台 ----
// ★ 计划 4 · T5 改口径（原来的 `errs.length===0` 太粗，量到了探针**自找**的 404）：
//   本探针**自己**会去开那些"盘上已不存在"的产物——判据 ① 逐项证过 `exists=false`：
//   标签条按**事件流**派生、产物条按**存在性**校验，两侧差集正是这些已删/合成产物
//   （本次实测差集 4 项：`.verify/_hoverprobe.mjs` · `index.new.html` ·
//    `style.new.css` · `index.new2.html`）。开一件不存在的产物，应用去取它当然 404、
//   控制台当然记一条（实测 2 条 console 404 ↔ 1 个 404 响应 `/artifact?path=…_hoverprobe.mjs`）。
//   那是**探针自找的**，不是"应用有真错"。
//   ⇒ 口径收紧成：**除了这些已知缺失产物上的 404，一条都不许有**；别的错误照旧红。
//   被排除的逐条打印出来，不藏。
const missing = new Set(diff.map((p) => String(p).replace(/\\/g, "/")));
const pathOf = (rec) => {
  const rel = (/^\d+\s+(\S+)/.exec(rec) ?? [])[1] ?? "";
  try { return String(new URL(rel, BASE).searchParams.get("path") ?? "").replace(/\\/g, "/"); } catch { return ""; }
};
const unexpectedRes = badRes.filter((rec) => {
  const rel = (/^\d+\s+(\S+)/.exec(rec) ?? [])[1] ?? "";
  return !(rel.includes("/artifact") && missing.has(pathOf(rec)));
});
const res404Errs = errs.filter((e) => /Failed to load resource/.test(e) && /404/.test(e));
const otherErrs = errs.filter((e) => !res404Errs.includes(e));
console.log(`\n⑤ 控制台错误：${errs.length ? errs.slice(0, 5).join(" │ ") : "零"} · 页面异常：${pageErrs.length ? pageErrs.slice(0, 3) : "零"}`);
if (badRes.length) console.log(`   ≥400 的响应（去重）：${[...new Set(badRes)].join(" │ ")}`);
console.log(`   已知缺失产物上的 404（探针自找）：console ${res404Errs.length} 条 / 响应 ${badRes.length - unexpectedRes.length} 个 · 其余 console 错误 ${otherErrs.length} 条 · 越界响应 ${unexpectedRes.length} 个`);
if (unexpectedRes.length) console.log(`   ★ 越界响应：${[...new Set(unexpectedRes)].join(" │ ")}`);

await page.screenshot({ path: join(OUT, "verify-artifact-tabs.png"), fullPage: false });
console.log(`截图落 eval/persona-ux/_verify-shots/verify-artifact-tabs.png`);
await browser.close();

const ok =
  railSubsetOfTabs && diffAllGone &&
  inPlace && fiveStep &&
  flat && otherErrs.length === 0 && pageErrs.length === 0 && unexpectedRes.length === 0;
console.log(ok
  ? "✅ 六条全成立：① 标签条 ⊇ 产物条且差集全部盘上不存在、② 顺序按设计不同（只打印）、③ 点开回标签条原位、⑥ 五步序列（开X→开Y→关Y→关X→重开Y）**五步都真落地**且终态 = 五步前标签条 − X、④ getArtifacts 热路径 <5ms 且冷价只在 stamp 变更时付、⑤ 除已知缺失产物上的 404 外 0 控制台错误"
  : "★ 有量没达标——看上面哪一行不对");
process.exitCode = ok ? 0 : 1;
