/**
 * 计划 4 的验收探针：**右列骨架**（两脸的召出钮 · 一次一只 · 同键开/关 ·
 * 浮层 ↔ 占宽列）。活页真点，不吃静态锁。
 *
 * 为什么必须真点（Ruling Q11）：召出钮住在**对话头部**（app.js 渲染的 `.back-bar`），
 * 而点击委托的挂点在 `#main-panel` 上——**一条挂错的委托能通过全部静态锁**
 * （"把选择器改名"那句改动照做、测试照绿），只有真点一下才知道键是死的。
 *
 * 判据（派单 13 条 = 计划的 8 条 + 控制器补的 5 条），每条都**真点、真断言**：
 *   ① 两脸各自的召出钮（Code 四只 / Work 一只，且互不可见）
 *   ② 点一个键 ⇒ 召出、该面可见（**真点 + 可见性断言**，不是"DOM 里有这个元素"）
 *   ③ 再点同一个键 ⇒ 收起（**必须从开着的列点起**）
 *   ④ 点另一个键 ⇒ 换面，且**仍只有一只**面可见
 *   ⑤ 窄屏浮层：**不占位**——对话列 = 全部可用宽（最窄档 640 / 中间档 1100 各量一次）
 *   ⑥ 宽屏占宽列：召出后 `#main-area` 变窄，且 railWidth ∈ [240, 360]
 *   ⑦ 两脸成对（Work 脸看不到 Code 的三只）
 *   ⑧ 0 控制台错误
 *   ⑨ **每只露出来的键都必须点得到**（`elementFromPoint` 命中它自己或后代）——
 *      本轮实测补的：窄档浮层原本 `top: 0` 起、盖住整条头部，1100 档每只键的
 *      命中都是 `div#right-rail`，Playwright 点击超时 ⇒「再点同一个键」在窄档
 *      根本不可能（判据 ②③ 能红全靠这条前提成立，所以它单独量、单独报）。
 *   ⑩ **四条关闭路径**（设计稿 §5：`×` / `Esc` / 遮罩 / 同键）——同键由 ③/⑤c 盖，
 *      这里补 `×` / `Esc` / 遮罩三条，且在**第三档**（`mode:"side"` +
 *      `layout:"floating"`，available ∈ [656,1072)）与最窄档各跑一遍
 *   ⑪ **浮层下拖柄不可见**（浮层不可拖——本轮裁定）
 *   ⑫ **「更多」菜单项语义：开/换面、永不收起**
 *   ⑬ **占位的「终端」钮：给一句话，且列状态不变**
 *   另：派单第 12 条（**Work 脸空列不许判成失败**）是约束不是判据——见判据 ⑦ 处的注。
 *
 * ★ 与计划正文的出入（按 Global Constraints："以仓库为准并回写勘误"）：
 *   1. 正文判据 ⑤ 写"窄屏召出前后 `#main-area` 的宽**逐像素不变**"。实测这条
 *      等式**只在"收着也 0 占位"时成立**：中间档（如 1100）收起时是 docked 的
 *      40px 细条（T1 的刻意设计：细条上有翻转的展开键），召出后转 floating
 *      反而**多出 40px**；最窄档（640）左栏又正处在自动让位/堆叠布局的过渡里，
 *      "前后"两次测量本身不可比。⇒ 改成**可证的两条**：
 *      ① 开着时对话列 = `innerWidth − 左栏`（浮层一个像素都不拿，即
 *         railPolicy 的 centerWidth = available）；② 开着不比收着窄。
 *      两条都在 640（最窄档）与 1100（中间档）各量一次。
 *   2. 正文说"窄屏"用 900——实测 900 的档位是"细条 ↔ floating"而不是 overlay
 *      （railBudget 仍有 436，≥ RAIL_MIN 240）。overlay 要视口 <656（左栏已成
 *      顶部横条）。⇒ 探针用 640 量最窄档、1100 量中间档。
 *   3. **每次落地的状态必须由探针自己重置**：`page.goto` 到**同一个 hash** 是
 *      同文档导航，init 脚本不会重跑、应用的会话内状态（railOpenedThisSession /
 *      上一档的面与收起）会**跨档残留**——本探针第一版就栽在这上面（900 档量到的
 *      "收着"其实是上一档遗留的开着，于是 ③⑤a⑤c 假红）。⇒ `land()` 先回
 *      `${BASE}/`（换文档、重跑 init、清会话标记）再进 run。
 *
 * ★ 收起态下"槽不可见"的判法：收起 = **40px 细条**（T1/T2 的刻意设计，细条上
 *   留翻转的展开键），槽仍在 DOM 里、几何宽 >0，只是被 `overflow:hidden` 裁掉。
 *   ⇒ 断言用「列开着 **且** 槽有几何」的合成判据，并同时打印原始几何，
 *   免得把"细条裁掉"误读成"面板还开着"。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "3221e432-9dda-42e0-b15f-377200ce96cf";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
    // 每次**换文档**都重置：档位之间互不污染（同键收起会写 collapsed=true）
    localStorage.setItem("agent.ui.pref.rightRail",
      JSON.stringify({ fraction: 0.25, surface: "tree", collapsed: true }));
  } catch {}
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);
if (!RUN_ID) {
  console.log("★ 拿不到任何 run——验收做不了");
  process.exit(1);
}
console.log(`靶 run=${RUN_ID} · 宿主 ${BASE}`);

/** 一次量清：档位/形态/面/槽几何/每只键的命中 */
const geom = () => page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  const area = document.getElementById("main-area");
  const rect = (e) => { const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  const geomVisible = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none"
    && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const keys = [...document.querySelectorAll(".rail-surface-btn")].map((k) => {
    const r = k.getBoundingClientRect();
    const shown = getComputedStyle(k).display !== "none" && r.width > 0 && r.height > 0;
    let hit = null;
    if (shown) {
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      hit = at ? (at === k || k.contains(at) ? "self" : `${at.tagName}.${String(at.className ?? "").split(" ")[0]}`) : "none";
    }
    return { id: k.id, face: k.className.includes("--work") ? "work" : "code",
      shown, hit, pressed: k.getAttribute("aria-pressed"), box: rect(k) };
  });
  const collapsed = rail?.dataset.collapsed ?? null;
  const railW = rail ? Math.round(rail.getBoundingClientRect().width) : null;
  const innerW = window.innerWidth;
  const sidebarW = Math.round(document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0);
  const slot = (e) => ({ geom: geomVisible(e), on: collapsed === "false" && geomVisible(e) });
  return {
    face: document.body.dataset.face,
    layout: rail?.dataset.layout ?? null, mode: rail?.dataset.mode ?? null,
    surface: rail?.dataset.surface ?? null, collapsed, railW,
    rail: rail ? rect(rail) : null, area: area ? rect(area) : null,
    innerW, sidebarW,
    // 「浮层不占位」的可证形式：对话列 = 全部可用宽（railPolicy 的 centerWidth = available）。
    // ★ 同一瞬间取三样（innerW / sidebarW / area.w）——分开取会量到左栏自动让位
    //   的中途（第一版 640 档就是这么假红的：收着时左栏 30px、开着时 0px）。
    areaIsFull: area ? Math.abs(area.getBoundingClientRect().width - (innerW - sidebarW)) <= 1 : null,
    tree: slot(document.querySelector("#right-rail > .workspace-file-tree")),
    preview: slot(document.getElementById("right-rail-preview")),
    review: slot(document.getElementById("right-rail-review")),
    barBottom: Math.round(document.querySelector(".rail-surface-bar")?.getBoundingClientRect().bottom ?? -1),
    keys,
  };
});

const shownCode = (g) => g.keys.filter((k) => k.face === "code" && k.shown);
const shownWork = (g) => g.keys.filter((k) => k.face === "work" && k.shown);
/** 一次一只：三只槽里**恰好**一只「列开着 且 有几何」 */
const oneSlot = (g) => {
  const on = [g.tree.on, g.preview.on, g.review.on].filter(Boolean).length;
  return { count: on, ok: on === 1 };
};
const slotsOf = (g) => `${g.tree.on ? "树" : g.tree.geom ? "树(裁)" : "-"}/${g.preview.on ? "预览" : g.preview.geom ? "预览(裁)" : "-"}/${g.review.on ? "改动" : g.review.geom ? "改动(裁)" : "-"}`;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "★ 红"} ${name}\n     ${detail}`);
};
/** 第三条状态：**结构上不可达**（不是通过、也不是红）——必须显式印出来，不许静默算绿 */
const recordNA = (name, detail) => {
  results.push({ name, ok: true, na: true });
  console.log(`◻ N/A ${name}\n     ${detail}`);
};

/** 落一次现场：视口 → **换文档重置** → 进 run → 等主线程安静 */
async function land(width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
  await page.waitForSelector(".rail-surface-bar", { timeout: 20000 }).catch(() => {});
  await page.waitForSelector("#main-area > .back-bar", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

const toFace = async (want) => {
  const sel = want === "code" ? '[data-workspace-face="code"]' : '[data-workspace-face="office"]';
  await page.click(`#workspace-face ${sel}`, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction((f) => document.body.dataset.face === f, want, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
};

const click = async (id) => {
  await page.click(id, { timeout: 6000 });
  await page.waitForTimeout(900);
  return geom();
};

// ============================ 判据 ①⑦：两脸成对 ============================
await land(1600);
await toFace("code");
const gCode = await geom();
record("① Code 脸：四只键都在且可见（Work 脸那只不出现）",
  gCode.face === "code" && shownCode(gCode).length === 4 && shownWork(gCode).length === 0,
  `face=${gCode.face} · Code 键 ${shownCode(gCode).map((k) => k.id.replace("rail-surface-", "")).join("/") || "无"} · Work 键 ${shownWork(gCode).length} 只`);

// ================== 判据 ⑨：露出来的键都点得到（本轮修的缺陷） ==================
const hitBad = (g) => g.keys.filter((k) => k.shown && k.hit !== "self");
record("⑨ 每只露出来的键都点得到（elementFromPoint 命中它自己）",
  hitBad(gCode).length === 0,
  hitBad(gCode).length === 0
    ? `四只键全部命中自己 · 键行下沿 y=${gCode.barBottom}（1600 · docked）`
    : hitBad(gCode).map((k) => `${k.id} 被 ${k.hit} 接走`).join(" · "));

// ==================== 判据 ②③④：召出 / 同键收 / 换面 ====================
try {
  const g2 = await click("#rail-surface-preview");
  const c2 = g2.collapsed === "false" && g2.preview.on === true && g2.surface === "preview" && oneSlot(g2).ok;
  record("② 点「预览」⇒ 召出、该面可见（一次一只）", c2,
    `collapsed=${g2.collapsed} surface=${g2.surface} 槽=${slotsOf(g2)}`);

  const g3 = await click("#rail-surface-preview");
  const c3 = g3.collapsed === "true" && g3.preview.on === false && (g3.railW ?? 0) <= 40;
  record("③ **再点同一个键** ⇒ 收起（细条/整条藏，槽裁掉）", c3,
    `collapsed=${g3.collapsed} 右列 ${g3.railW}px 预览槽 几何=${g3.preview.geom} 算可见=${g3.preview.on}`);

  const g4a = await click("#rail-surface-review");
  const g4b = await click("#rail-surface-preview");
  const c4 = g4a.review.on === true && g4a.preview.on === false && oneSlot(g4a).ok
    && g4b.preview.on === true && g4b.review.on === false && oneSlot(g4b).ok;
  record("④ 点另一个键 ⇒ 换面（不是收起），且**仍只有一只**", c4,
    `改动面(${g4a.surface}) 槽=${slotsOf(g4a)} → 预览面(${g4b.surface}) 槽=${slotsOf(g4b)} · 收起态=${g4b.collapsed}`);
  await click("#rail-surface-preview"); // 收敛：换面 ≠ 收起，收一次留个干净状态
} catch (e) {
  record("②③④ 真点失败", false, String(e).split("\n")[0].slice(0, 140));
}

// ==================== 判据 ⑥：宽屏占宽列（变窄 + 宽度区间） ====================
await land(1600);
await toFace("code");
const wideClosed = await geom();
let wideOpen;
try { wideOpen = await click("#rail-surface-review"); } catch (e) { wideOpen = null; }
record("⑥ 宽屏占宽列：召出后 `#main-area` 变窄，railWidth ∈ [240,360]",
  !!wideOpen && wideOpen.area.w < wideClosed.area.w && wideOpen.railW >= 240 && wideOpen.railW <= 360,
  `1600 档 收着(${wideClosed.layout}/${wideClosed.railW}px) 对话 ${wideClosed.area?.w} → 开着(${wideOpen?.layout}/${wideOpen?.railW}px) 对话 ${wideOpen?.area?.w}`);

// ====== 判据 ⑤a：最窄档（640 · overlay）浮层不占位 ⇒ 对话列 = 全部可用宽 ======
// ★ 与计划正文的出入：正文写"召出前后逐像素不变"。实测该等式**只在
//   "收着也 0 占位" 时成立，而 overlay 档的左栏同时处在自动让位/堆叠布局的
//   过渡里（第一版就量到"收着 610 → 开着 640"的假红）。⇒ 改成可证的两条：
//   ① 开着时对话列 = innerWidth − 左栏（浮层一个像素都不拿）；
//   ② 开着不比收着窄。
await land(640);
await toFace("code");
const o640Closed = await geom();
let o640Open;
try { o640Open = await click("#rail-surface-review"); } catch (e) { o640Open = null; }
record("⑤a 最窄档（640 · overlay/floating）：浮层不占位（对话列 = 全部可用宽）",
  !!o640Open && o640Open.layout === "floating" && o640Open.areaIsFull === true
    && o640Open.area.w >= o640Closed.area.w,
  `640 档 收着(${o640Closed.mode}/${o640Closed.layout}/${o640Closed.railW}px) 对话 ${o640Closed.area?.w} → 开着(${o640Open?.mode}/${o640Open?.layout}/${o640Open?.railW}px) 对话 ${o640Open?.area?.w} · 可用宽 = ${o640Open?.innerW} − 左栏 ${o640Open?.sidebarW} = ${(o640Open?.innerW ?? 0) - (o640Open?.sidebarW ?? 0)}`);

// ============ 判据 ⑤b/c：中间档（1100）floating 不占位 + 同键可点可收 ============
await land(1100);
await toFace("code");
const midClosed = await geom();
let midOpen;
try { midOpen = await click("#rail-surface-review"); } catch (e) { midOpen = null; }
const midNotNarrower = !!midOpen && midOpen.area.w >= midClosed.area.w;
const midHitBad = midOpen ? hitBad(midOpen) : [{ id: "（点击失败）", hit: "—" }];
record("⑤b 中间档（1100 · floating）：对话列不减 + 浮层不拿宽 + 浮层下键仍点得到",
  !!midOpen && midNotNarrower && midOpen.layout === "floating" && midOpen.areaIsFull === true && midHitBad.length === 0,
  `1100 档 收着(${midClosed.layout}/${midClosed.railW}px) 对话 ${midClosed.area?.w} → 开着(${midOpen?.layout}/${midOpen?.railW}px) 对话 ${midOpen?.area?.w}（可用宽 ${midOpen?.innerW}-${midOpen?.sidebarW}=${(midOpen?.innerW ?? 0) - (midOpen?.sidebarW ?? 0)}）· 键命中 ${midHitBad.length ? midHitBad.map((k) => k.id + "←" + k.hit).join(",") : "全部自己"}`);

let midAgain = null;
try { midAgain = await click("#rail-surface-review"); } catch (e) { /* 见下 */ }
record("⑤c 浮层下**再点同一个键**也收得掉（本轮修的缺陷）",
  !!midAgain && midAgain.collapsed === "true" && midAgain.review.on === false,
  midAgain
    ? `collapsed=${midAgain.collapsed} 右列 ${midAgain.railW}px 改动槽 几何=${midAgain.review.geom} 算可见=${midAgain.review.on}`
    : "★ 浮层下那一键点不到（timeout）——本轮的缺陷还在");

// ==================== 判据 ⑦：两脸成对（Work 脸看不到 Code 的三只） ====================
await land(1600);
await toFace("work");
const gWork = await geom();
record("⑦ Work 脸：只出自己那一只，Code 的四只都不出现",
  gWork.face === "work" && shownWork(gWork).length === 1 && shownCode(gWork).length === 0,
  `face=${gWork.face} · Work 键 ${shownWork(gWork).map((k) => k.id).join("/") || "无"} · Code 键 ${shownCode(gWork).length} 只`);
// ★ 派单第 12 条（Work 脸空列不许判成失败）：本条只看**钮**，不看槽——
//   持久偏好为 review/preview 时 Work 脸的列可能是空的（任务 3 记账的已知中间态，
//   计划 6 换掉 Work 脸内容后自然消失）⇒ 拿"空列"报失败会是一条假红。

// ============ 判据 ⑩：四条关闭路径（× / Esc / 遮罩；同键已由 ③/⑤c 盖） ============
// 设计稿 §5 逐字：「自己的 × · Esc · 点遮罩 · 再点同一个键（四条都要通）」。
// ★ 必须覆盖**第三档**（`mode:"side"` + `layout:"floating"`，available ∈ [656,1072)）——
//   那一档正是本轮修掉"遮罩亮而 Esc 死"的地方，只在它身上验得到（派单第 9 条）。
//   1280 视口实测 available = 1280 − 左栏 312 = 968 ⇒ 第三档 ✓。
const dragDisplay = () => page.evaluate(() => {
  const d = document.getElementById("right-rail-drag");
  return d ? getComputedStyle(d).display : "无元素";
});

/** 一条关闭路径：召出 → 关闭 → 断言 collapsed 翻真 */
async function closePath(width, bandKind, bandLabel, act) {
  await land(width);
  await toFace("code");
  let before;
  try { before = await click("#rail-surface-review"); }
  catch (e) { record(`⑩ ${bandLabel}`, false, `${width} 档召不出（${String(e).split("\n")[0].slice(0, 70)}）`); return null; }
  if (before.collapsed !== "false") {
    record(`⑩ ${bandLabel}`, false, `${width} 档召不出列：collapsed=${before.collapsed} ⇒ 关闭路径无从量`);
    return null;
  }
  const rightBand = before.layout === "floating"
    && (bandKind === "third" ? before.mode === "side" : before.mode === "overlay");
  let err = null;
  try { await act(); } catch (e) { err = String(e).split("\n")[0].slice(0, 80); }
  await page.waitForTimeout(900);
  const after = await geom();
  const ok = !err && after.collapsed === "true";
  record(`⑩ ${bandLabel}`, ok,
    `${width} 档（${before.layout}/${before.mode}${rightBand ? " ✓档位对" : " ★档位不符预期"}）`
    + `：召出后 collapsed=${before.collapsed} 右列 ${before.railW}px → 关闭后 collapsed=${after.collapsed} 右列 ${after.railW}px`
    + (err ? ` · ★ ${err}` : ""));
  return after;
}

/**
 * 遮罩那条路单独写：它有一条**结构上不可达**的档位（最窄 overlay 档的 sheet 满宽，
 * 遮罩整个被压住、没有任何一点露在外面）——那不是缺陷、是几何，但也不许静默算绿。
 * 所以先**量**遮罩露不露得出来，再决定"真点"还是记 N/A，并把取样点逐点印出来。
 */
async function maskPath(width, band) {
  await land(width);
  await toFace("code");
  let before;
  try { before = await click("#rail-surface-review"); }
  catch (e) { record(`⑩ 点遮罩关闭（${band}）`, false, `${width} 档召不出（${String(e).split("\n")[0].slice(0, 70)}）`); return; }
  if (before.collapsed !== "false") {
    record(`⑩ 点遮罩关闭（${band}）`, false, `${width} 档召不出列：collapsed=${before.collapsed} ⇒ 关闭路径无从量`);
    return;
  }
  const exp = await page.evaluate(() => {
    const s = document.getElementById("right-rail-scrim");
    if (!s || s.hidden) return { visible: false, box: null, hits: [] };
    const b = s.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // ★ 取样点必须落在**视口内**：遮罩的边框盒可以远高于视口（640 档实测 640×4496），
    //   拿 `b.bottom - 10` 去取点会落在视口外、`elementFromPoint` 一律返回 null ⇒
    //   得到"没有任何一点露出来"的**假证据**（首版就是这么写的）。
    const top = Math.max(b.top, 0), bottom = Math.min(b.bottom, vh);
    const ys = [...new Set([Math.round(top + 8), Math.round((top + bottom) / 2), Math.round(bottom - 8)])]
      .filter((y) => y > 0 && y < vh);
    const xs = [...new Set([Math.round(b.left + 10), Math.round(b.left + b.width / 2), Math.round(b.right - 10)])]
      .filter((x) => x > 0 && x < vw);
    const pts = [];
    for (const y of ys) for (const x of xs) pts.push([`(${x},${y})`, x, y]);
    return {
      visible: true,
      box: { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) },
      viewport: { w: vw, h: vh },
      hits: pts.map(([tag, x, y]) => {
        const t = document.elementFromPoint(x, y);
        return `${tag}:${t ? (t === s ? "遮罩自己" : t.tagName.toLowerCase() + (t.id ? "#" + t.id : "")) : "none"}`;
      }),
    };
  });
  if (!exp.visible || !exp.hits.some((h) => h.endsWith("遮罩自己"))) {
    recordNA(`⑩ 点遮罩关闭（${band}）`,
      `${width} 档遮罩${exp.visible ? `在（盒 ${exp.box.w}×${exp.box.h}，y ${exp.box.top}…${exp.box.bottom}；视口 ${exp.viewport.w}×${exp.viewport.h}）但**视口内没有任何取样点露在 sheet 之外**` : "藏着"}`
      + ` · 视口内取样：${exp.hits.join(" · ")}`
      + ` ⇒ 该档的遮罩整个被满宽 sheet 压住，这条路**结构上不可达**（不是缺陷）。`
      + `该档 ×/Esc 两条已分别量过，同键由 ③/⑤c 覆盖。`);
    return;
  }
  let err = null;
  try { await page.click("#right-rail-scrim", { timeout: 5000 }); } catch (e) { err = String(e).split("\n")[0].slice(0, 80); }
  await page.waitForTimeout(900);
  const after = await geom();
  const ok = !err && after.collapsed === "true";
  record(`⑩ 点遮罩关闭（${band}）`, ok,
    `${width} 档（${before.layout}/${before.mode}）：遮罩 ${exp.box.w}×${exp.box.h} 露出（${exp.hits.join(" · ")}）`
    + ` · 召出后 collapsed=${before.collapsed} → 关闭后 collapsed=${after.collapsed}` + (err ? ` · ★ ${err}` : ""));
}

for (const [w, kind, label] of [[1280, "third", "第三档 side+floating"], [640, "overlay", "最窄档 overlay"]]) {
  await closePath(w, kind, `× 收起键关闭（${label}）`, async () => {
    await page.click("#right-rail-collapse", { timeout: 5000 });
  });
  await closePath(w, kind, `Esc 关闭（${label}）`, async () => {
    await page.keyboard.press("Escape");
  });
  await maskPath(w, label);
}

// ============ 判据 ⑪：浮层下拖柄不可见（浮层不可拖——本轮裁定） ============
// 拖宽只属于占宽列（设计稿 §5 的表）；第三档曾"拖柄亮着、拖完弹回"= 一个说谎的交互。
await land(1600);
await toFace("code");
await click("#rail-surface-review");
const dragDocked = await dragDisplay();
await land(1280);
await toFace("code");
await click("#rail-surface-review");
const dragFloat = await dragDisplay();
record("⑪ 拖柄只在占宽列亮，浮层下 display:none",
  dragDocked !== "none" && dragFloat === "none",
  `1600（docked）拖柄 display=${dragDocked} · 1280（floating）拖柄 display=${dragFloat}`);

// ============ 判据 ⑫：「更多」菜单项语义 = 开/换面、**永不收起** ============
// 审查建议钉住：菜单项点完即消失，没有"可见状态"可读——若点「文件」把整列收掉，
// 会被读成故障。⋮ 开着时点「文件」⇒ data-surface=tree 且列仍开着。
await land(1600);
await toFace("code");
await click("#rail-surface-review"); // 先让面=review 且列开着
const menuBefore = await geom();
let menuAfter = null;
try {
  await page.click("#rail-surface-more", { timeout: 5000 });
  await page.waitForTimeout(450);
  await page.click(".rail-more-item[data-rail-surface='tree']", { timeout: 5000 });
  await page.waitForTimeout(1100);
  menuAfter = await geom();
} catch (e) {
  menuAfter = null;
  record("⑫ 菜单项：开/换面、永不收起", false, `★ 点不到：${String(e).split("\n")[0].slice(0, 90)}`);
}
if (menuAfter) {
  record("⑫ 菜单项：开/换面、永不收起",
    menuBefore.collapsed === "false" && menuAfter.surface === "tree" && menuAfter.collapsed === "false",
    `点「文件」前 surface=${menuBefore.surface} collapsed=${menuBefore.collapsed} → 后 surface=${menuAfter.surface} collapsed=${menuAfter.collapsed}（树槽 ${slotsOf(menuAfter)}）`);
}

// ============ 判据 ⑬：占位的「终端」钮——给话、且列状态不变 ============
await land(1600);
await toFace("code");
const termBefore = await geom();
let termAfter = null, termSaid = "";
try {
  // 先清空播报元素：不然"里面本来就有字"会让这条判据量到别人的话
  await page.evaluate(() => { const a = document.getElementById("status-announcer"); if (a) a.textContent = ""; });
  await page.click("#rail-surface-terminal", { timeout: 5000 });
  await page.waitForTimeout(800);
  termAfter = await geom();
  termSaid = await page.evaluate(() => document.getElementById("status-announcer")?.textContent ?? "");
} catch (e) {
  record("⑬ 终端占位钮：给话且列不变", false, `★ 点不到：${String(e).split("\n")[0].slice(0, 90)}`);
}
if (termAfter) {
  record("⑬ 终端占位钮：给话且列不变（不召出、不收起）",
    termSaid.includes("终端") && termAfter.collapsed === termBefore.collapsed && termAfter.surface === termBefore.surface,
    `播报=「${termSaid.slice(0, 40)}」· 列 collapsed ${termBefore.collapsed}→${termAfter.collapsed} · surface ${termBefore.surface}→${termAfter.surface}`);
}

await page.screenshot({ path: join(OUT, "verify-rail-surfaces.png"), fullPage: false });

// ============================ 判据 ⑧：0 控制台错误 ============================
record("⑧ 0 控制台错误 / 0 页面异常", errs.length === 0 && pageErrs.length === 0,
  `控制台 ${errs.length ? errs.slice(0, 4).join(" │ ") : "零"} · 页面异常 ${pageErrs.length ? pageErrs.slice(0, 3).join(" │ ") : "零"}`);

console.log(`\n截图落 eval/persona-ux/_verify-shots/verify-rail-surfaces.png（gitignored）`);
await browser.close();

const bad = results.filter((r) => !r.ok);
const na = results.filter((r) => r.na);
console.log(`\n${bad.length === 0 ? `✅ 判据全成立（${results.length} 条；其中 ${na.length} 条结构上不可达，已显式记 N/A，未静默算绿）` : `★ ${bad.length} 条红了：${bad.map((r) => r.name).join(" · ")}`}`);
process.exitCode = bad.length === 0 ? 0 : 1;
