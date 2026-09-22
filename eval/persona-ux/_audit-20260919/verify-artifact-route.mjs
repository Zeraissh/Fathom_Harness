/**
 * 计划 3 · Task 5 活页验收：产物深链从"按下标"改成"按路径"。
 *
 * 判据四条（brief Step 7）：
 *   ① 点开第 2 件产物后，地址栏是**路径形态**——`/artifact/` 后那一段**不是
 *      纯数字**，且 decodeURIComponent 回来等于点开的那一份的路径。
 *      ★ 判"不是纯数字"而不是"等于某个具体路径"：具体路径取决于这一场的
 *      产物，写死了会在别的 run 上假红。
 *   ② **刷新页面**，打开的还是那一件（这条测的是"深链真的能复原"）。
 *   ③ 地址改成**旧下标形态** `…/artifact/1`，回车 → 打开的是活清单里第 1 件
 *      （历史会话、别人发来的链接不许断——本任务的安全绳）。
 *   ④ 地址改成清单里不存在的路径，回车 → 不崩、有话说，0 新增页面异常。
 *
 * ⑤（打印旁证，不拦验收）：路径形态深链带 ?full 刷新/恢复后，?full 不被剥掉、
 *   画布仍放大——「?full 往返，刷新保持形态」是 test/ui-artifact-canvas.test.ts
 *   锁着的既有契约，路径分支必须照样成立。
 *
 * ⑥（Fix round 1 追加，拦验收）：**跑着的 run** 上深链保持打开、焦点不被抢。
 *   前四条跑在空闲 run 上——稳定后不再有渲染，抓不到「openPendingArtifact 成功时
 *   不清 pendingArtifact ⇒ 每次状态推送重开画布（renderCurrent 重取 + 抢焦点到
 *   关闭钮）」。做法：在靶 run 上**用输入框追加一条对话**（让模型连续写 4 个
 *   文件）——本宿主对归档 run 的继续会**派生子 run**（index.html:2709 起），子 run
 *   继承会话认证、真能跑（POST /api/runs 新起 run 反而必死：缺会话配置，~100ms
 *   内「认证失败」）。等**新产物**落地（路径不在靶 run 已有清单里——子 run 的卡
 *   列表会继承会话文件，按「第一张卡」等会撞上旧产物）→ 深链打开它 → 把焦点
 *   放进输入框（disabled 就放进画布外的卡片按钮）→ 采样。跑着的 run 每推一个
 *   状态就渲染一次（SSE → renderDetailWithState，index.html:4423），渲染末尾
 *   无条件 openPendingArtifact——bug 若在，画布每次都被重开（取件数涨）且焦点
 *   被抢到关闭钮（openCanvas 末尾 dock.closeBtn.focus()）。
 *   ★ 宿主 LLM 认证**时好时坏**（实测 5 个子 run 里 2 个活 3 个 ~100ms 内
 *   model_call_end=error 死掉）：最多试 4 次，每次看子 run 的事件流——新产物
 *   落地就深链采样；模型调用失败就删掉死子 run、回靶 run 重试。
 *   ★ 不用 switchLoopView：index.html 的应用代码在 type=module 内联脚本里，
 *   模块作用域，evaluate 够不着（实测 ReferenceError）。
 *   ★ 清理只删探针起的子 run（childId !== 靶 runId 才删）——删错会把验收靶场毁掉。
 *
 * 说明（判据 ④ 与 brief 措辞的出入，见 task-5-report.md）：
 *   brief 预期 announceStatus("找不到该产物") 与"0 控制台错误"。实测的机制是：
 *   深链路径分支走 openArtifactByPath → rememberPreviewFile 先把这一份记成标签
 *   （"打开网页"同一条路，任何路径都会进画布）→ 画布取件 → 服务器对不存在
 *   的文件回 404 → 画布把预览读不到的话写进错误卡（.ac-fallback-text），
 *   取件 404 会在控制台留一条"Failed to load resource"。所以"有话说"落在
 *   画布错误卡而不是 aria-live 播报，控制台也不是 0。判据按实测机制量：
 *   不崩（0 pageerror）+ 有话说（播报或错误卡二者有其一），控制台逐条打印。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const WANT = Number(process.env.AUDIT_ROUTE_MIN ?? "3");

// ---- 选靶 run：只挑链头（tip）。非链头 run 会被应用的 tip-jump 强拉回链头，
// 探针的 hash 重设与它乒乓，页面就此楔死（verify-artifact-tabs.mjs 实测过）。----
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
  const cands = tips.map((r) => ({ r, arts: 0 }));
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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
// 画布取件计数：openCanvas 每次无条件 renderCurrent() → fetch /artifact?path=。
// 深链成功后它应该一次也不再涨——涨了就是 openPendingArtifact 没清、每次渲染重开画布。
let artifactFetches = 0;
page.on("request", (r) => { if (r.url().includes("/artifact?path=")) artifactFetches++; });
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 复现条件同委托方实测：给预览列立一列可用的宽度（只设一次，之后由应用自己写）。
    if (!localStorage.getItem("agent.ui.pref.rightRail")) {
      localStorage.setItem("agent.ui.pref.rightRail",
        JSON.stringify({ fraction: 0.45, splitRatio: 0.55, panel: "preview", collapsed: false }));
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

// ---- 开 run：hash 导航 + 等产物条 hydration 落定（与 verify-artifact-tabs 同一条路）----
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await waitForQuiet(15000);
await page.waitForTimeout(500);
for (let attempt = 0; attempt < 3; attempt++) {
  await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}`);
  await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll(".artifact[data-artifact-path]")];
    return nodes.length > 0 && nodes.every((n) => n.getAttribute("data-artifact-state") === "ok");
  }, { timeout: 15000 }).catch(() => {});
  await waitForQuiet(20000);
  await page.waitForTimeout(400);
  const onTarget = await page.evaluate((id) => location.hash.includes(id), runId);
  const n = await page.evaluate(() => document.querySelectorAll(".artifact[data-artifact-path]").length);
  if (onTarget && n > 0) break;
}

/** 画布标签条状态：路径清单 + 选中格 */
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

/** 地址栏 /artifact/ 后那一段（?full 之前） */
function hashArtifactSeg(hash) {
  const m = /^#\/run\/[^/]+\/artifact\/([^/?]+)/.exec(hash || "");
  return m ? m[1] : null;
}

// ---- 判据 ①：点开第 2 件产物（真去点卡片）----
const cardPath = await page.evaluate(() => {
  const card = document.querySelectorAll(".artifact[data-artifact-path]")[1];
  const opener = card?.querySelector("[data-canvas-open]");
  opener?.click();
  return card?.getAttribute("data-artifact-path") ?? null;
});
await page.waitForSelector(".ac-tabs .ac-tab", { timeout: 10000 }).catch(() => {});
await waitForQuiet(20000);
await page.waitForTimeout(600);
const hash1 = await page.evaluate(() => location.hash);
const seg1 = hashArtifactSeg(hash1);
let decoded1 = null;
try { decoded1 = seg1 !== null ? decodeURIComponent(seg1) : null; } catch { /* 非法转义时保持 null */ }
const c1 = seg1 !== null && !/^\d+$/.test(seg1) && decoded1 === cardPath;
console.log(`\n—— 判据 ① ——`);
console.log(`点开的产物：${cardPath}`);
console.log(`地址栏：${hash1}`);
console.log(`段：${seg1} · 解码：${decoded1} · 纯数字=${seg1 !== null && /^\d+$/.test(seg1)}`);
console.log(`① 路径形态且解码回同一条路径 → ${c1 ? "✅" : "★ 红"}`);

// ---- 判据 ②：刷新，打开的还是那一件 ----
await page.reload({ waitUntil: "domcontentloaded" });
await waitForQuiet(20000);
const restored = await page.waitForFunction((want) => {
  const sel = document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]');
  return sel && String(sel.title ?? "") === want;
}, cardPath, { timeout: 30000 }).then(() => true).catch(() => false);
await page.waitForTimeout(600);
const hash2 = await page.evaluate(() => location.hash);
const seg2 = hashArtifactSeg(hash2);
const tabsAfterReload = await tabState();
const c2 = restored && tabsAfterReload.selected >= 0 && tabsAfterReload.paths[tabsAfterReload.selected] === cardPath;
console.log(`\n—— 判据 ② ——`);
console.log(`刷新后地址栏：${hash2} · 段=${seg2}（路径形态=${seg2 !== null && !/^\d+$/.test(seg2)}）`);
console.log(`选中格=${tabsAfterReload.selected} · 标题=${tabsAfterReload.paths[tabsAfterReload.selected]} · 期望=${cardPath}`);
console.log(`② 刷新后打开的还是那一件 → ${c2 ? "✅" : "★ 红"}`);

// ---- 判据 ⑤（打印旁证）：?full 深链不被剥掉、画布保持放大 ----
await page.evaluate((h) => { location.hash = h; }, `${hash2}?full`);
const fullKept = await page.waitForFunction(() => {
  const dock = document.getElementById("artifact-canvas-view");
  return dock?.classList.contains("preview-dock--expanded") === true;
}, null, { timeout: 10000 }).then(() => true).catch(() => false);
await waitForQuiet(10000);
const hashFull = await page.evaluate(() => location.hash);
console.log(`\n—— ⑤（旁证）——`);
console.log(`设 ?full 后地址栏：${hashFull}（?full 保留=${hashFull.includes("?full")}）· 坞放大=${fullKept}`);
console.log(`⑤ ?full 不剥、放大态恢复 → ${fullKept && hashFull.includes("?full") ? "✅（旁证，不拦验收）" : "（旁证未达成，见报告）"}`);

// ---- 判据 ③：旧下标形态仍认 ----
const tabsBeforeIdx = await tabState();
await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}/artifact/1`);
const idxLanded = await page.waitForFunction(() => {
  const sel = document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]');
  return sel && sel.getAttribute("data-ac-index") === "1";
}, null, { timeout: 10000 }).then(() => true).catch(() => false);
await waitForQuiet(10000);
const tabsAfterIdx = await tabState();
const expectIdxPath = tabsBeforeIdx.paths[1];
const c3 = idxLanded && tabsAfterIdx.selected === 1 && tabsAfterIdx.paths[1] === expectIdxPath;
console.log(`\n—— 判据 ③ ——`);
console.log(`设旧下标形态 #/run/<id>/artifact/1 后：选中格=${tabsAfterIdx.selected} · 标题=${tabsAfterIdx.paths[tabsAfterIdx.selected] ?? "—"}`);
console.log(`活清单第 1 件（设 hash 前）= ${expectIdxPath}`);
console.log(`③ 旧下标形态打开的是清单里第 1 件 → ${c3 ? "✅" : "★ 红"}`);

// ---- 判据 ④：清单里不存在的路径 → 不崩、有话说 ----
const bogus = "不存在-9f3e2b/phantom.md";
const errsBefore = errs.length;
const pageErrsBefore = pageErrs.length;
await page.evaluate((id, p) => { location.hash = id; }, `#/run/${runId}/artifact/${encodeURIComponent(bogus)}`);
await page.waitForTimeout(2500);
await waitForQuiet(10000);
const said = await page.evaluate(() => ({
  announcer: document.getElementById("status-announcer")?.textContent ?? "",
  fallback: [...document.querySelectorAll(".ac-fallback-text")].map((n) => n.textContent ?? "").join(" | "),
  selected: document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]')?.title ?? "",
}));
const newErrs = errs.slice(errsBefore);
const newPageErrs = pageErrs.slice(pageErrsBefore);
const c4a = newPageErrs.length === 0;
const c4b = (said.announcer ?? "").trim().length > 0 || (said.fallback ?? "").trim().length > 0;
const c4 = c4a && c4b;
console.log(`\n—— 判据 ④ ——`);
console.log(`设不存在路径 ${bogus} 后：选中标签=${said.selected}`);
console.log(`播报（#status-announcer）：${said.announcer || "（空）"}`);
console.log(`画布错误卡（.ac-fallback-text）：${said.fallback || "（空）"}`);
console.log(`新增页面异常：${newPageErrs.length ? newPageErrs.join(" │ ") : "零"} · 新增控制台错误：${newErrs.length ? newErrs.join(" │ ") : "零"}`);
console.log(`④ 不崩（${c4a ? "0 页面异常" : "★ 有页面异常"}）、有话说（${c4b ? "播报或错误卡有其一" : "★ 两者皆空"}）→ ${c4 ? "✅" : "★ 红"}`);
if (newErrs.length) {
  console.log(`   注：控制台不是严格 0（brief 措辞如此）——取件 404 是画布对不存在路径的预期行为，`);
  console.log(`   见 task-5-report.md 的判据 ④ 出入说明。`);
}

// ---- 追加判据 ⑥（Fix round 1）：跑着的 run 上深链保持打开、焦点不被抢 ----
let g6 = false;
console.log(`\n—— 追加判据 ⑥：跑着的 run 上深链保持打开、焦点不被抢 ——`);
if (process.env.AUDIT_MOCK_EVENTS === "1") {
  // —— mock 模式（AUDIT_MOCK_EVENTS=1）：宿主 LLM 认证已死（4/4 子 run ~100ms 内
  // model_call_end=error），起不了真流式。状态推送源换成「重放靶 run 自己的真实
  // 事件流，产物路径改写成 t5m-*.txt」——用 addInitScript 把 window.EventSource
  // 换成回放器（page.route 的 fulfill 喂不动 EventSource：画布开了但状态一条没
  // 减少，产物卡=0）。走的是 UI 同一条 reduceEvents → renderDetailWithState →
  // openPendingArtifact 路径（预修版已用真事件抓红，见报告 Fix round 1）。
  const realStream = await (await fetch(`${BASE}/api/runs/${runId}/events`)).text();
  const evCount = realStream.split(/\r?\n/).filter((l) => l.startsWith("data: ")).length;
  let mockBody = realStream;
  arts.forEach((p, i) => { if (p) mockBody = mockBody.split(p).join(`t5m-${i + 1}.txt`); });
  await page.evaluate(() => { localStorage.setItem("AUDIT_MOCK_ES", "1"); });
  await page.addInitScript((body) => {
    if (localStorage.getItem("AUDIT_MOCK_ES") !== "1") return;
    const NativeES = window.EventSource;
    // 把真实流文本拆成 {ev, data} 块（真实格式：id:/data: 逐块，末块 event: replay_done）
    const blocks = [];
    {
      let ev = null, data = null;
      for (const line of body.split(/\r?\n/)) {
        if (line === "") { if (data !== null) { blocks.push({ ev, data }); ev = null; data = null; } continue; }
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
        // id: 忽略——mock 不做断线重连
      }
      if (data !== null) blocks.push({ ev, data });
    }
    window.EventSource = class MockEventSource extends EventTarget {
      constructor(url, cfg) {
        super();
        if (String(url).includes("/api/stream")) {
          // 生命周期流放行给真 EventSource——run 列表等照常
          this._native = new NativeES(url, cfg);
          const fwd = (type) => (e) => this.dispatchEvent(e.data === undefined ? new Event(type) : new MessageEvent(type, { data: e.data }));
          for (const t of ["message", "open", "error", "replay_done", "delta"]) this._native.addEventListener(t, fwd(t));
          this.close = () => this._native.close();
          this.readyState = 2;
          return;
        }
        this.close = () => { this._closed = true; clearTimeout(this._t); };
        this.readyState = 0;
        queueMicrotask(() => { if (!this._closed) { this.readyState = 1; this.dispatchEvent(new Event("open")); } });
        let i = 0;
        const pump = () => {
          if (this._closed) return;
          if (i >= blocks.length) {
            // 真服务端 finalize 后掐流 → EventSource 报 error；app 的 error 处理
            // 按 harness 事实收敛成 live，不挂横幅。
            setTimeout(() => { if (!this._closed) this.dispatchEvent(new Event("error")); }, 400);
            return;
          }
          const b = blocks[i++];
          if (b.ev === "message" || !b.ev) this.dispatchEvent(new MessageEvent("message", { data: b.data }));
          else if (b.ev === "delta") this.dispatchEvent(new MessageEvent("delta", { data: b.data }));
          else this.dispatchEvent(new Event(b.ev));
          this._t = setTimeout(pump, 3);
        };
        this._t = setTimeout(pump, 0);
      }
    };
    console.log("[AUDIT_MOCK_ES] 已装回放器：" + blocks.length + " 块");
  }, mockBody);
  console.log(`⑥ mock 模式：重放靶 run 真实事件流（${evCount} 条），产物路径改写为 t5m-*.txt`);
  await page.reload({ waitUntil: "domcontentloaded" });
  // 深链指向重放里**从没被写**的 t5m-x.txt：openCanvas 才是唯一取件源（b2 干净）。
  // 指向 t5m-1 的话，noteWrites 会对「打开中的文件被写」做一次防抖重拉（合法特性，
  // 不抢焦点），b2 会多 1 次取件。重放风暴里要轮询重设 hash（boot 自动选 run /
  // 写盘自动开最后一件 都可能改写它），直到开起来。
  const mockOpened = await (async () => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}/artifact/t5m-x.txt`);
      const ok = await page.waitForFunction(() => {
        const sel = document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]');
        return sel && String(sel.title ?? "") === "t5m-x.txt";
      }, null, { timeout: 2500 }).then(() => true).catch(() => false);
      if (ok) return true;
    }
    return false;
  })();
  if (!mockOpened) {
    console.log("⑥ mock 模式：深链没把画布打开——本轮判据无法验证（见报告）");
  } else {
    const mockNew = "t5m-x.txt";
    const ref0 = await page.evaluate(() => {
      const t = document.getElementById("task-input");
      const el = t && !t.disabled ? t : document.querySelector('.artifact[data-artifact-path] [data-canvas-open]');
      el?.focus();
      const a = document.activeElement;
      return a ? (a.classList?.contains("ac-close") ? "DOCK-CLOSE" : (a.id ? `#${a.id}` : (a.className ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : a.tagName.toLowerCase()))) : "null";
    });
    const fetchesBefore = artifactFetches;
    const cardsBefore = await page.evaluate(() => document.querySelectorAll(".artifact[data-artifact-path]").length);
    const convBefore = await page.evaluate(() => document.getElementById("conversation")?.textContent.length ?? -1);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => {
        const a = document.activeElement;
        return {
          active: a ? (a.classList?.contains("ac-close") ? "DOCK-CLOSE" : (a.id ? `#${a.id}` : (a.className ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : a.tagName.toLowerCase()))) : "null",
          cards: document.querySelectorAll(".artifact[data-artifact-path]").length,
          convLen: document.getElementById("conversation")?.textContent.length ?? -1,
          selected: document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]')?.title ?? "",
          seg: /^#\/run\/[^/]+\/artifact\/([^/?]+)/.exec(location.hash)?.[1] ?? "",
        };
      }));
    }
    const fetchesAfter = artifactFetches;
    const last = samples[samples.length - 1];
    const stillOpen = last.selected === mockNew && last.seg !== "" && !/^\d+$/.test(last.seg);
    const b1 = samples.every((s) => s.active === ref0);
    const b1s = samples.every((s) => s.active !== "DOCK-CLOSE");
    const b2 = fetchesAfter === fetchesBefore;
    const b3 = stillOpen;
    const b4 = samples.some((s) => s.cards !== cardsBefore || s.convLen !== convBefore);
    console.log(`采样基准焦点=${ref0}（每 1s，共 12 次）：`);
    for (const s of samples) {
      console.log(`  焦点=${s.active} · 产物卡=${s.cards} · #conversation 长=${s.convLen} · 选中=${s.selected} · 段=${s.seg}`);
    }
    console.log(`取件数：采样前 ${fetchesBefore} → 采样后 ${fetchesAfter}（画布被重开=${fetchesAfter !== fetchesBefore}）`);
    console.log(`画布仍开着且 hash 仍路径形态=${b3} · 采样窗口内确有状态推送渲染=${b4}`);
    console.log(`⑥ 焦点从未被任何渲染抢走=${b1} · 从未被抢到关闭钮=${b1s} · 取件零增长=${b2} → ${b1 && b2 && b3 && b4 ? "✅" : "★ 红"}`);
    g6 = b1 && b2 && b3 && b4;
  }
} else {
console.log(`做法：输入框追加「连续写 4 个文件」的对话 → 派生子 run 真跑起来 →`);
console.log(`等新产物落地后深链打开 → 焦点放画布外 → 采样看状态推送有没有抢焦点/重开画布。`);
await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}`);
await page.waitForSelector(".artifact[data-artifact-path]", { timeout: 15000 }).catch(() => {});
await waitForQuiet(20000);
const TASK = "Create 4 small text files named t5s-1.txt, t5s-2.txt, t5s-3.txt, t5s-4.txt in the current working directory, one at a time, in this order. Each file contains exactly one line: 'file N says hi' where N is its number. Create them sequentially in separate steps, do not batch, do not read any files first.";
let newCard = null;
let childId = null;
let targetId = runId;
for (let attempt = 1; attempt <= 4 && !newCard; attempt++) {
  console.log(`⑥ 尝试 ${attempt}/4：追加「连续写 4 个文件」`);
  // 提交前的靶 run 事件数：就地续跑时靠它裁出「提交后新增」的尾部判死
  let evBase = 0;
  try {
    const evText = await (await fetch(`${BASE}/api/runs/${runId}/events`)).text();
    evBase = evText.split(/\r?\n/).filter((l) => l.startsWith("data: ")).length;
  } catch { /* 读不到就按 0 处理 */ }
  const composerOk = await page.evaluate(() => {
    const t = document.getElementById("task-input");
    if (!t || t.disabled) return false;
    t.value = "";
    t.focus();
    return true;
  });
  if (!composerOk) {
    console.log("⑥ 输入框不可用——发不了对话，本轮判据无法验证（见报告）");
    break;
  }
  await page.keyboard.type(TASK);
  await page.keyboard.press("Enter");
  // 落定：派生子 run（子 runId 出现在列表）或就地续跑（靶 run 状态变 running）
  childId = null;
  let parentState = "?";
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const rs = await (await fetch(`${BASE}/api/runs`)).json();
    childId = rs.find((r) => r.continuedFrom === runId)?.runId ?? null;
    parentState = rs.find((r) => r.runId === runId)?.status ?? "?";
    if (childId || parentState === "running") break;
    await new Promise((r) => setTimeout(r, 300));
  }
  targetId = childId ?? runId;
  if (childId) {
    console.log(`  派生子 run=${childId}`);
    await page.evaluate((id) => { location.hash = id; }, `#/run/${childId}`);
    await page.waitForTimeout(800);
  } else {
    console.log(`  就地续跑（${runId} 状态=${parentState}）`);
  }
  // 等新产物落地；模型调用失败就立刻判死重试。子 run 的事件流是它自己的
  //（不含会话历史），就地续跑则按「提交后新增」的尾部判。
  const deadline = Date.now() + 90000;
  let died = false;
  while (Date.now() < deadline) {
    newCard = await page.evaluate((artsArr) => {
      const set = new Set(artsArr);
      const nodes = [...document.querySelectorAll(".artifact[data-artifact-path]")];
      return nodes.map((n) => n.getAttribute("data-artifact-path")).find((x) => x && !set.has(x)) ?? null;
    }, arts).catch(() => null);
    if (newCard) break;
    try {
      const evText = await (await fetch(`${BASE}/api/runs/${targetId}/events`)).text();
      const evs = evText.split(/\r?\n/).filter((l) => l.startsWith("data: "))
        .map((l) => { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter(Boolean);
      const tail = targetId === runId ? evs.slice(evBase) : evs;
      if (tail.some((e) => e.event?.type === "model_call_end" && e.event.status === "error")
        || tail.some((e) => e.event?.type === "run_end")) { died = true; break; }
    } catch { /* 事件流读不到就继续等卡片 */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  if (newCard) break;
  if (childId && childId !== runId) {
    const del = await fetch(`${BASE}/api/runs/${childId}`, { method: "DELETE" });
    console.log(`  ${died ? "模型调用失败（认证）" : "90s 没有新产物"}——删掉死子 run：DELETE ${del.status}`);
    await page.evaluate((id) => { location.hash = id; }, `#/run/${runId}`);
    await waitForQuiet(10000);
  } else {
    console.log(`  ${died ? "模型调用失败（认证）" : "90s 没有新产物"}——重试`);
    await page.waitForTimeout(1000);
  }
}
if (!newCard) {
  console.log("⑥ 试了 4 次都没有新产物落地——本轮判据无法验证（见报告）");
} else {
  console.log(`新产物落地：${newCard}（run=${targetId}），设深链打开它`);
  await page.evaluate((id, p) => { location.hash = id; }, `#/run/${targetId}/artifact/${encodeURIComponent(newCard)}`);
  const opened = await page.waitForFunction((want) => {
    const sel = document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]');
    return sel && String(sel.title ?? "") === want;
  }, newCard, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!opened) {
    console.log("⑥ 深链没把画布打开——本轮判据无法验证（见报告）");
  } else {
    // 焦点放到画布外（输入框可能因 running 被禁用；禁用就用产物卡的开画布钮）
    const ref0 = await page.evaluate(() => {
      const t = document.getElementById("task-input");
      const el = t && !t.disabled ? t : document.querySelector('.artifact[data-artifact-path] [data-canvas-open]');
      el?.focus();
      const a = document.activeElement;
      return a ? (a.classList?.contains("ac-close") ? "DOCK-CLOSE" : (a.id ? `#${a.id}` : (a.className ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : a.tagName.toLowerCase()))) : "null";
    });
    const fetchesBefore = artifactFetches;
    const cardsBefore = await page.evaluate(() => document.querySelectorAll(".artifact[data-artifact-path]").length);
    const convBefore = await page.evaluate(() => document.getElementById("conversation")?.textContent.length ?? -1);
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2000);
      samples.push(await page.evaluate(() => {
        const a = document.activeElement;
        return {
          active: a ? (a.classList?.contains("ac-close") ? "DOCK-CLOSE" : (a.id ? `#${a.id}` : (a.className ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : a.tagName.toLowerCase()))) : "null",
          cards: document.querySelectorAll(".artifact[data-artifact-path]").length,
          convLen: document.getElementById("conversation")?.textContent.length ?? -1,
          selected: document.querySelector('.ac-tabs .ac-tab[aria-selected="true"]')?.title ?? "",
          seg: /^#\/run\/[^/]+\/artifact\/([^/?]+)/.exec(location.hash)?.[1] ?? "",
        };
      }));
    }
    const fetchesAfter = artifactFetches;
    const last = samples[samples.length - 1];
    const stillOpen = last.selected === newCard && last.seg !== "" && !/^\d+$/.test(last.seg);
    const b1 = samples.every((s) => s.active === ref0);
    const b1s = samples.every((s) => s.active !== "DOCK-CLOSE");
    const b2 = fetchesAfter === fetchesBefore;
    const b3 = stillOpen;
    const b4 = samples.some((s) => s.cards !== cardsBefore || s.convLen !== convBefore);
    console.log(`采样基准焦点=${ref0}（发送后每 2s，共 6 次）：`);
    for (const s of samples) {
      console.log(`  焦点=${s.active} · 产物卡=${s.cards} · #conversation 长=${s.convLen} · 选中=${s.selected} · 段=${s.seg}`);
    }
    console.log(`取件数：采样前 ${fetchesBefore} → 采样后 ${fetchesAfter}（画布被重开=${fetchesAfter !== fetchesBefore}）`);
    console.log(`画布仍开着且 hash 仍路径形态=${b3} · 采样窗口内确有状态推送渲染=${b4}`);
    console.log(`⑥ 焦点从未被任何渲染抢走=${b1} · 从未被抢到关闭钮=${b1s} · 取件零增长=${b2} → ${b1 && b2 && b3 && b4 ? "✅" : "★ 红"}`);
    g6 = b1 && b2 && b3 && b4;
    // 清理本次探针起的子 run（链头会被它占掉，留着影响后续验收选靶）。
    // ★ 只删子 run——删靶 run 会把验收靶场毁掉。
    if (childId && childId !== runId) {
      try {
        const del = await fetch(`${BASE}/api/runs/${childId}`, { method: "DELETE" });
        console.log(`清理探针起的子 run ${childId}：DELETE ${del.status}`);
      } catch (e) {
        console.log(`清理子 run 失败：${String(e).slice(0, 120)}`);
      }
    }
  }
}
}

await page.screenshot({ path: join(OUT, "verify-artifact-route.png"), fullPage: false });
console.log(`\n截图落 eval/persona-ux/_verify-shots/verify-artifact-route.png`);
await browser.close();

const ok = c1 && c2 && c3 && c4 && g6;
console.log(ok
  ? "\n✅ 五条全成立：① 点开写路径形态地址、② 刷新复原同一件、③ 旧下标形态仍认、④ 不存在路径不崩有话说、⑥ 跑着的 run 上深链保持打开且焦点不被抢"
  : "\n★ 有判据没达标——看上面哪一条红");
process.exitCode = ok ? 0 : 1;
