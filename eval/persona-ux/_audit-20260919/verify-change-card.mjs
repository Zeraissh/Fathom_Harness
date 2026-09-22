/**
 * 计划 3 · Task 6 活页验收：对话流里的「本场改动」卡 + 已阅/撤掉/下一个 hunk。
 *
 * 判据八条（brief Step 10 + 修复轮 ① 的新增脸判据 + 终审 I1 判据）：
 *   ① 卡片在：对话流里存在 .chat-change-card，折叠头里的文件数等于服务端
 *      那条链给的触碰路径数；
 *   ② 展开取到真 patch：展开一个文件后体里出现 @@ 头，且至少有一行上下文行
 *      （sign===" " 的那些）——「真 patch 而不是事件流对比」的直接证据；
 *   ③ 撤掉真的进了输入框：点「撤掉」后 #task-input 的值包含那个路径，且
 *      页面没有被导航走（location.hash 不变）、也没有被发送出去（会话里
 *      没有多出一条 user 消息）——★ 三问缺一，「点了就自动发出去了」的实现
 *      也能蒙混过关；★ 且输入框的值要与 buildRevertMessage 逐字相符
 *      （q1e 是裁决门，不是打印项——修复轮 ①）；
 *   ④ 已阅会失效：标一个文件已阅 → 再改一次那个文件 → 重渲染后标记没了；
 *   ⑤ 阅读模式开着与关着，卡片都在；
 *   ⑥ 0 控制台错误；
 *   ⑦ 两脸成对（修复轮 ①）：①-⑤ 都在 Code 脸量（boot 把 workspaceFace
 *      偏好钉成 code）；⑦ 真点脸切换控件——office → data-face="work"，
 *      卡片必须还在 DOM 但 computed display:none（boundingBox 为 null）；
 *      切回 code 恢复可见。只写 Code 脸规则等于没锁，⑦ 是那把锁的另一半。
 *   ⑧ 终审 I1：「下一个 hunk」必须圈在**按钮所属文件**里找（data-hunk-idx
 *      是按文件从 0 起的）——按容器全局找的话，展开 ≥2 个文件时点第二个
 *      文件的 hunk 0 会滚去第一个文件的 hunk 1。夹具两个文件都只有 1 个
 *      真 hunk，造不出 2×2——给两个文件体各注入合成 idx=1 hunk，file2 放
 *      enabled 的 idx=0「下一个」按钮，量 scrollIntoView 落点必须在 file2
 *      的 idx=1 上（文档序第一个 idx=1 是 file1 的合成 hunk，全局查找会
 *      中那个陷阱）。
 *
 * ★ 与 brief 的出入（mock 替代真跑，见 task-6-report.md）：
 *   宿主 LLM 认证已死——POST /api/runs 新起的 run 必死（~100ms 内
 *   model_call_end=error），「用 git 夹具造一场真跑过编辑的会话」造不出来。
 *   做法（照 verify-artifact-route.mjs 的 mock 模式）：
 *   · 起/复用一个死 run（workdir=git 夹具）当靶；
 *   · addInitScript 把 window.EventSource 换成回放器——**只截生产 URL**
 *     `/api/runs/<死 run>/events`，其余（/api/stream、别的 run 的流）全部
 *     放行给真 EventSource；
 *   · 重放**宿主上真实存在的一场**跑了编辑的 run 的真实事件流，路径改写：
 *     该 run 触碰的 7 条路径全部映射到夹具里真实存在的那两个文件
 *     （`src/app.js` = M、`src/new-file.js` = 未跟踪），diff 端点能给真 patch；
 *   · 期望触碰清单不硬编码：**导入应用自己的** `reduceEvents` + `deriveTouchedFiles`
 *     解析改写后的流，DOM 与它对比。
 *   ★ 计划 4 · T5 修：原来的重放源 `6139d6d8-…` 在本宿主上**不存在**，源名
 *     `hello-code.txt` / `changelog.txt` / `hello-seed.txt` 也**没有任何 run 碰过**
 *     ⇒ 改写一条也改不中 ⇒ 判据 ① 早退。原手搓的收法还读了一个**流里不存在的**
 *     字段 `resultIsError`（恒 falsy ⇒ 失败编辑也算成功）。两处都按上面改掉了。
 *   判据 ① 因此量的是「卡片文件数 = 应用对改写流的派生数」——死 run 自己的
 *   档案 0 次触碰，跟它比恒假；这是 mock 下的诚实改编。
 *   判据 ④ 的「再改一次」：给 mock 实例 dispatch 两条 MessageEvent
 *   （edit_file seq 1000 + tool_result seq 1001）——走生产 reduceEvents →
 *   renderDetailWithState 同一条路，已阅标因 lastSeq 不符而消失。
 *   判据 ⑤：localStorage 偏好 + reload 来回切，聚焦模式下再量一次卡在不在
 *   （classifyUnit 只认思考/工具/活动三类，.chat-change-card 是锚点）。
 * ★ 清理只删本探针起/复用的那个死 run。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const FIXTURE = process.env.FIXTURE_DIR ?? String.raw`D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo`;

/**
 * ★ 计划 4 · T5 修（实测失效，两处都是**环境腐烂**、不是计划 4 改的）：
 *
 * (1) 原写死 `SOURCE_RUN = 6139d6d8-…` —— **本宿主上不存在** ⇒ `fetch` 拿回 404 页
 *     ⇒ 0 条事件 ⇒ 判据 ① 无从量起。实测 `GET /api/runs` 里没有它。
 *     换成宿主上**真实存在、且恰好能映射到夹具两个文件**的 run（354 条事件，
 *     快；触碰 7 条路径，全部映射见 REWRITE）。
 * (2) 原 REWRITE 的源名是 `hello-code.txt` / `changelog.txt` / `hello-seed.txt`——
 *     实测**没有哪个 run 触碰过这些名字**（扫遍 56 个 run 都没有）。照它们改写
 *     ⇒ 流里一条也改不中 ⇒ 期望清单空 ⇒ 判据 ① 直接早退。
 *     改成照**所选 run 的真实触碰清单**逐条映射，且**全部**映射到夹具那两个文件
 *     （多对一，同 verify-review-panel）：合并后卡片恰好 2 行，
 *     判据 ⑧（两个文件各注入一个合成 hunk 量"下一个 hunk 只在按钮自己文件里找"）
 *     才有 2×2 可比。
 */
const SOURCE_RUN = process.env.AUDIT_REPLAY_RUN ?? "3296e94c-3b90-48a0-95f4-69ff7c764113";
/** 复用靶死 run（默认不复用：写死的 id 一旦消失就是**静默**退化成新建，不好核）。 */
const REUSE_DEAD = process.env.AUDIT_REUSE_DEAD ?? null;
/**
 * 重放里被改写的路径：源流里的名字 → 夹具里真实存在的名字（M / 未跟踪）。
 * 源侧 7 条 = 该 run 的完整触碰清单（`ONLY_RUN=<id> node scan-card-source.mjs` 可重印）。
 */
const REWRITE = [
  ["_verify/anhui-tv/probeD.mjs", "src/new-file.js"],
  ["anhui-tv-center/_src/scene_c.js", "src/app.js"],
  ["_verify/anhui-tv/probeE.mjs", "src/new-file.js"],
  ["_verify/anhui-tv/probeF.mjs", "src/app.js"],
  ["anhui-tv-center/FACTS.md", "src/app.js"],
  ["_verify/anhui-tv/probeG.mjs", "src/new-file.js"],
  ["_verify/anhui-tv/probeH.mjs", "src/app.js"],
];

// ---- 期望触碰清单 + 撤掉文案：**导入应用自己的纯函数**，不当第二把尺 ----
const APP_PATH = join(HERE, "..", "..", "..", "ui", "public", "app.js");
let appMod = null;
let buildRevertMessage = null;
try {
  appMod = await import(pathToFileURL(APP_PATH).href);
  buildRevertMessage = appMod.buildRevertMessage;
} catch (e) {
  console.log(`★ 导入 ui/public/app.js 失败（${String(e).slice(0, 120)}）`);
}

/**
 * 期望触碰清单：把改写后的流喂进**应用自己的** reduceEvents + deriveTouchedFiles。
 *
 * ★ 计划 4 · T5 修（和 verify-review-panel 同一个**真被测出来的**错）：旧版手搓的
 *   收法读 `tool_result` 事件上的 `resultIsError`，而**流里根本没有这个字段**
 *   （恒 undefined ⇒ 恒 falsy）⇒ 把失败的那几次编辑也算成功 ⇒ 期望比面板多。
 *   真正的语义在应用的 `reduceEvent` 里（它自己算这个标志）。⇒ 拆掉第二把尺。
 *   （`seq` 在 SSE 信封上，`reduceEvents` 自己会把它盖到时间线条目上。）
 */
function touchedOf(streamText) {
  const queue = [];
  for (const l of streamText.split(/\r?\n/)) {
    if (!l.startsWith("data: ")) continue;
    try {
      const j = JSON.parse(l.slice(6));
      if (j && j.event) queue.push({ seq: j.seq, source: "replay", event: j.event });
    } catch {}
  }
  const st = appMod.createInitialState("probe-replay", "replay", false, {});
  return appMod.deriveTouchedFiles(appMod.reduceEvents(st, queue));
}
if (!appMod?.reduceEvents || !appMod?.deriveTouchedFiles || !appMod?.createInitialState) {
  console.log("★ 拿不到应用的 reduceEvents / deriveTouchedFiles / createInitialState——判据 ① 没有可信的尺，先停");
  process.exit(1);
}

// ---- 0) 夹具哨兵：两个目标文件的 diff 形状（夹具漂了就早失败、早说明） ----
{
  const diff = async (p) => {
    const r = await fetch(`${BASE}/api/workspace/git/diff?workdir=${encodeURIComponent(FIXTURE)}&path=${encodeURIComponent(p)}`);
    return r.ok ? r.json() : null;
  };
  const d1 = await diff("src/app.js");
  const d2 = await diff("src/new-file.js");
  const ok1 = d1?.present === true && /^@@\s+-\d+/.test(d1.hunks?.[0]?.header ?? "")
    && (d1.hunks?.[0]?.lines ?? []).some((l) => l.sign === " ");
  const ok2 = d2?.present === true && /^@@\s+-0,0\s+\+1,\d+/.test(d2.hunks?.[0]?.header ?? "");
  console.log(`夹具 diff：src/app.js ${ok1 ? "带上下文行 ✅" : "★ 没有上下文行——判据 ② 会红"}`);
  console.log(`夹具 diff：src/new-file.js ${ok2 ? "合成 @@ -0,0 全 + 行 ✅" : "★ 形状不对"}`);
  if (!ok1 || !ok2) {
    console.log("★ 夹具状态不对，先跑 `node scripts/git-fixture.mjs` 重建");
    process.exit(1);
  }
}

// ---- 1) 靶死 run：复用本会话起的那个，没有就新起一个 ----
const runs0 = await (await fetch(`${BASE}/api/runs`)).json();
let deadId = runs0.find((r) => r.runId === REUSE_DEAD)?.runId ?? null;
if (!deadId) {
  const res = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "audit probe (plan3 t6): change card mock replay", workdir: FIXTURE, workspace: "code" }),
  });
  const created = res.ok ? await res.json() : {};
  deadId = created.runId ?? null;
  const t0 = Date.now();
  while (deadId && Date.now() - t0 < 10000) {
    const rs = await (await fetch(`${BASE}/api/runs`)).json();
    if (rs.some((r) => r.runId === deadId)) break;
    await new Promise((r) => setTimeout(r, 300));
  }
}
if (!deadId) {
  console.log("★ 起不了死 run（POST /api/runs 失败）");
  process.exit(1);
}
const deadInfo = (await (await fetch(`${BASE}/api/runs`)).json()).find((r) => r.runId === deadId) ?? null;
/**
 * workdir 的**字面**比较不可靠：服务端会把路径归一（分隔符方向、大小写、末尾分隔符
 * 都可能变）。实测同一台机器上 POST 传 `D:\…\git-repo`，返回的串看着一样却不相等。
 * ⇒ 比"同一个目录"要归一后比，顺便把两边的原始串打出来（不等时好核）。
 */
const norm = (p) => String(p ?? "").replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
const workdirOk = norm(deadInfo?.workdir) === norm(FIXTURE);
console.log(`靶死 run=${deadId}（status=${deadInfo?.status ?? "?"}，workdir=${workdirOk ? "夹具" : `${JSON.stringify(deadInfo?.workdir)} ≠ ${JSON.stringify(FIXTURE)}`}）`);
if (!workdirOk) {
  console.log("★ 靶 run 的 workdir 不是夹具——diff 端点会对不上重写后的路径");
  process.exit(1);
}

// ---- 2) 取真实流、改写路径、解析期望清单 ----
const realRes = await fetch(`${BASE}/api/runs/${SOURCE_RUN}/events`);
const real = realRes.ok ? await realRes.text() : "";

/**
 * ★ 计划 4 · T5 修（这一处是**实测出来的**、也是最费解的一处）：
 * 只重放"**一次订阅真正会收到的那一段**"——到**第一条 `run_end`**（含）为止。
 *
 * 为什么：应用的契约逐字是「run 级终止（服务端 run_end，**恒为最后一条 durable
 * 事件**）」（app.js:2146）⇒ 客户端收到 run_end 就关流。而本宿主的 run 事件缓冲会把
 * **续跑过的同一个 run** 的后续事件接在第一条 run_end 之**后**。实测源 run
 * `3296e94c`：seq202 = run_end，203 起还有 152 条，seq353 又是 run_end。
 * 照原样重放 ⇒ 应用在第一条 run_end 处关流 ⇒ 后面的编辑**根本收不到**
 * （实测 mock 发出 203/355 块就被关掉，卡片停在 lastSeq=187），
 * 而探针的期望把它们算进去了 ⇒ 期望 5/3、卡片 4/2 ⇒ 判据 ① 假红。
 * ⇒ 把重放体裁到第一条 run_end，并在末尾补一条 `replay_done`
 *   （历史重放的收尾标记，真流里也有；这样应用的 replay gate 走正常那条路，
 *    而不是靠 500ms 兜底超时）。
 * 这**不是**宽纵应用：单次订阅下应用的行为就是对的，错的是"一场 run 的事件缓冲
 * 里出现两个 run_end"这件事本身（记在 task-5-report 的实测发现里）。
 */
function singleSession(body) {
  const frames = body.split(/\r?\n\r?\n/).filter((f) => f.trim() !== "");
  const kept = [];
  let cut = 0;
  for (const f of frames) {
    if (/^\s*event:\s*replay_done\s*$/m.test(f)) continue; // 收尾标记一律延后补
    const dataLine = f.split(/\r?\n/).find((l) => l.startsWith("data: "));
    let type = null;
    if (dataLine) { try { type = JSON.parse(dataLine.slice(6))?.event?.type ?? null; } catch {} }
    kept.push(f);
    if (type === "run_end") { cut += 1; break; }
  }
  const tail = frames.length - kept.length;
  kept.push("event: replay_done\n\ndata: {}");
  return { body: kept.join("\n\n") + "\n\n", droppedDurable: Math.max(0, tail - 1) };
}

const session = singleSession(real);
let mockBody = session.body;
for (const [from, to] of REWRITE) mockBody = mockBody.split(from).join(to);
const expected = touchedOf(mockBody);
console.log(`重放源=${SOURCE_RUN}（HTTP ${realRes.status} · ${real.split(/\r?\n/).filter((l) => l.startsWith("data: ")).length} 条）`);
console.log(`  单次会话裁切：丢掉第一条 run_end 之后的 ${session.droppedDurable} 条 durable 事件（本宿主把续跑段接在了同一 run 上）`);
console.log(`  喂给应用的 reduceEvents+deriveTouchedFiles，期望触碰：`);
for (const f of expected) console.log(`  ${f.path} · ${f.edits} 处 · lastSeq=${f.lastSeq}`);
if (expected.length === 0) {
  console.log(realRes.status !== 200
    ? `★ 宿主上取不到这个重放源（HTTP ${realRes.status}）——换 AUDIT_REPLAY_RUN 指一个存在的 run`
    : "★ 改写后的流里没有任何成功触碰——判据 ① 无从量起（REWRITE 的源名对不上这个 run？）");
  process.exit(1);
}

// ---- 3) 浏览器 + mock EventSource（只截靶 run 的生产 URL） ----
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
const badRes = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
// 控制台的 "Failed to load resource: 404" 不说是谁 ⇒ 把 ≥400 的 URL 存下来，红时打印。
page.on("response", (r) => { if (r.status() >= 400) badRes.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
let diffFetches = 0;
page.on("request", (r) => { if (r.url().includes("/api/workspace/git/diff")) diffFetches++; });

// 回放流里引用的截图属于**源 run**，应用按靶 run 的 id 去取 ⇒ 必然 404。
// mock 既然替靶 run 供事件，就连它的**产物面**一起供（1×1 PNG），次数照打印不藏——
// 否则判据 ⑥（0 控制台错误）量到的是 "mock 没供全"，不是 "应用有真错"。
let artifactStubs = 0;
const PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
await page.route(
  (u) => u.pathname.startsWith(`/api/runs/${deadId}/artifact`),
  (route) => { artifactStubs++; return route.fulfill({ status: 200, contentType: "image/png", body: PX }); },
);
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    localStorage.setItem("AUDIT_MOCK_ES", "1");
    // 把脸钉在 code：boot 默认是 office（index.html 读偏好时 fallback "office"）
    // → data-face="work"。①-⑤ 量的是设计上的宿主脸（Code），Work 脸的可见性
    // 由判据 ⑦ 单独量——不钉住的话 ①-⑤ 会跟 ⑦ 搅在一起。
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
  } catch {}
});
await page.addInitScript((body) => {
  if (localStorage.getItem("AUDIT_MOCK_ES") !== "1") return;
  const dead = body.deadId;
  const NativeES = window.EventSource;
  const blocks = [];
  {
    let ev = null, data = null;
    for (const line of body.stream.split(/\r?\n/)) {
      if (line === "") { if (data !== null) { blocks.push({ ev, data }); ev = null; data = null; } continue; }
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (data !== null) blocks.push({ ev, data });
  }
  window.EventSource = class MockEventSource extends EventTarget {
    constructor(url, cfg) {
      super();
      // ★ 只截生产 URL：/api/runs/<死 run>/events。其余一律真 EventSource。
      if (!String(url).includes(`/api/runs/${dead}/events`)) {
        return new NativeES(url, cfg);
      }
      window.__auditMock = this;
      this.__total = blocks.length;
      this.__dispatched = 0;
      this.close = () => { this._closed = true; clearTimeout(this._t); };
      this.readyState = 0;
      queueMicrotask(() => { if (!this._closed) { this.readyState = 1; this.dispatchEvent(new Event("open")); } });
      let i = 0;
      const pump = () => {
        if (this._closed) return;
        if (i >= blocks.length) {
          setTimeout(() => { if (!this._closed) this.dispatchEvent(new Event("error")); }, 400);
          return;
        }
        const b = blocks[i++];
        this.__dispatched += 1;
        if (b.ev === "message" || !b.ev) this.dispatchEvent(new MessageEvent("message", { data: b.data }));
        else if (b.ev === "delta") this.dispatchEvent(new MessageEvent("delta", { data: b.data }));
        else this.dispatchEvent(new Event(b.ev));
        this._t = setTimeout(pump, 3);
      };
      this._t = setTimeout(pump, 0);
    }
  };
  console.log("[AUDIT_MOCK_ES] 已装回放器：" + blocks.length + " 块，只截 /api/runs/" + dead + "/events");
}, { deadId, stream: mockBody });

// ---- 等主线程安静（照 verify-artifact-route.mjs 的同一把尺） ----
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

/** 卡片当前文件行：path → meta 文本（"N 处改动"）+ data-last-seq（差在哪一条的直接证据） */
async function cardState() {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll("#main-area #conversation .chat-change-card")];
    const card = all[0];
    if (!card) return null;
    const rows = {};
    const lastSeq = {};
    for (const f of card.querySelectorAll("details.chat-change-file")) {
      const p = f.getAttribute("data-path");
      rows[p] = f.querySelector(".chat-change-file-meta")?.textContent?.trim() ?? "";
      lastSeq[p] = f.querySelector(".chat-change-file-body")?.getAttribute("data-last-seq") ?? "";
    }
    return {
      title: card.querySelector(".chat-change-card-title")?.textContent?.trim() ?? "",
      rows,
      lastSeq,
      // ★ 对话里可能不止一张「本场改动」卡：querySelector 只拿第一张，
      //   若第一张是**按轮**的局部卡，就会比应用整场派生数少 —— 这个计数是判据。
      cardCount: all.length,
    };
  });
}

/** mock 回放器的实况：发出多少块、总共多少块（判断"页面到底收全没有"）。 */
const mockStats = () => page.evaluate(() => {
  const m = window.__auditMock;
  return m ? { dispatched: m.__dispatched ?? -1, total: m.__total ?? -1, closed: !!m._closed } : null;
});

// ---- 开靶 run：boot 可能自动选中别的 run，轮询重设 hash 直到卡片落定 ----
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await waitForQuiet(15000);
await page.waitForTimeout(500);
let cardStable = false;
{
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await page.evaluate((id) => { location.hash = id; }, `#/run/${deadId}`);
    const st = await cardState();
    if (st && Object.keys(st.rows).length === expected.length
      && expected.every((f) => st.rows[f.path] === `${f.edits} 处改动`)) {
      cardStable = true;
      break;
    }
    await page.waitForTimeout(800);
  }
}
await waitForQuiet(15000);
if (!cardStable) {
  const st = await cardState();
  const ms = await mockStats();
  console.log(`★ 卡片没落定（${st ? `标题="${st.title}" 行=${JSON.stringify(st.rows)}` : "卡不存在"}）——boot 没订上 mock 流？`);
  if (st) {
    console.log(`  卡里 data-last-seq：${JSON.stringify(st.lastSeq)}（期望：${expected.map((f) => `${f.path}=${f.lastSeq}`).join("，")}）`);
    console.log(`  对话里 .chat-change-card 张数=${st.cardCount}（>1 ⇒ 取到的可能只是**按轮**的局部卡）`);
  }
  console.log(`  mock 回放器：发出 ${ms?.dispatched ?? "?"} / 共 ${ms?.total ?? "?"} 块 · 已关=${ms?.closed ?? "?"}`);
  console.log(`  （期望清单：${expected.map((f) => `${f.path}=${f.edits} 处`).join("，")}）`);
  console.log(`  控制台错误：${errs.length ? errs.join(" │ ") : "零"}`);
  await page.screenshot({ path: join(OUT, "verify-change-card-FAIL.png"), fullPage: false });
  await browser.close();
  process.exit(1);
}

// ---- 判据 ①：卡片在，文件数与期望一致 ----
const st1 = await cardState();
const c1 = st1 !== null
  && st1.title === `改文件 ${expected.length} 个`
  && Object.keys(st1.rows).length === expected.length
  && expected.every((f) => st1.rows[f.path] === `${f.edits} 处改动`);
console.log(`\n—— 判据 ① ——`);
console.log(`卡片标题：${st1?.title} · 行：${JSON.stringify(st1?.rows)}`);
console.log(`期望（应用 deriveTouchedFiles 口径）：${expected.map((f) => `${f.path}=${f.edits} 处`).join("，")}`);
console.log(`① 卡片在、文件数=服务端链给的触碰路径数 → ${c1 ? "✅" : "★ 红"}`);

// ---- 判据 ②：真点开 src/app.js，取到真 patch（@@ 头 + 上下文行） ----
// 文件行收在卡片体里——先真点开卡片本身，再点文件
await page.click("#main-area #conversation .chat-change-card .chat-change-card-details > summary");
const diffsBefore = diffFetches;
await page.click('.chat-change-file[data-path="src/app.js"] > summary');
const appHunk = await page.waitForFunction(() => {
  const file = document.querySelector('.chat-change-file[data-path="src/app.js"]');
  const heads = file ? [...file.querySelectorAll(".chat-hunk-head")] : [];
  const ctxs = file ? [...file.querySelectorAll(".chat-hunk-line--ctx")] : [];
  return heads.length > 0 && ctxs.length > 0 ? { heads: heads.map((h) => h.textContent), ctx: ctxs.length } : null;
}, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
await page.click('.chat-change-file[data-path="src/new-file.js"] > summary');
const newHunk = await page.waitForFunction(() => {
  const file = document.querySelector('.chat-change-file[data-path="src/new-file.js"]');
  const heads = file ? [...file.querySelectorAll(".chat-hunk-head")] : [];
  return heads.length > 0 ? heads.map((h) => h.textContent) : null;
}, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
const c2 = appHunk !== null
  && appHunk.heads.some((h) => /^@@\s+-\d+/.test(h ?? ""))
  && (appHunk.ctx ?? 0) >= 1
  && newHunk !== null
  && newHunk.some((h) => /^@@\s+-0,0\s+\+1,\d+/.test(h ?? ""))
  && diffFetches > diffsBefore;
console.log(`\n—— 判据 ② ——`);
console.log(`src/app.js 展开后 @@ 头：${appHunk ? appHunk.heads.join(" | ") : "（空）"} · 上下文行=${appHunk?.ctx ?? 0}`);
console.log(`src/new-file.js 展开后 @@ 头：${newHunk ? newHunk.join(" | ") : "（空）"}（未跟踪 → 合成全 + 行）`);
console.log(`diff 端点取件：${diffsBefore} → ${diffFetches}（真去取过=${diffFetches > diffsBefore}）`);
console.log(`② 展开取到真 patch → ${c2 ? "✅" : "★ 红"}`);

// ---- 判据 ③：撤掉三问——进输入框 / 没导航 / 没发送 ----
const hashBefore = await page.evaluate(() => location.hash);
const userBefore = await page.evaluate(() => document.querySelectorAll("#main-area #conversation .chat-msg--user").length);
const revertBtn = page.locator('.chat-change-file[data-path="src/app.js"] .chat-hunk-action--revert').first();
const revertAttrs = await revertBtn.evaluate((b) => ({ header: b.dataset.header, added: Number(b.dataset.added), deleted: Number(b.dataset.deleted) }));
await revertBtn.click();
await page.waitForTimeout(300);
const inputVal = await page.evaluate(() => document.getElementById("task-input")?.value ?? "");
const hashAfter = await page.evaluate(() => location.hash);
const userAfter = await page.evaluate(() => document.querySelectorAll("#main-area #conversation .chat-msg--user").length);
await page.waitForTimeout(1200);
const inputStill = await page.evaluate(() => document.getElementById("task-input")?.value ?? "");
const expectedMsg = buildRevertMessage
  ? buildRevertMessage({ path: "src/app.js", header: revertAttrs.header, added: revertAttrs.added, deleted: revertAttrs.deleted })
  : null;
const q1 = inputVal.includes("src/app.js");
const q1e = expectedMsg === null ? null : inputVal === expectedMsg;
const q2 = hashAfter === hashBefore;
const q3 = userAfter === userBefore && inputStill === inputVal;
const c3 = q1 && q1e !== false && q2 && q3;
console.log(`\n—— 判据 ③ ——`);
console.log(`输入框值：${inputVal}`);
console.log(`期望（buildRevertMessage 逐字）：${expectedMsg ?? "（未导入）"}`);
console.log(`三问：进了输入框（含路径）=${q1}${q1e === null ? "" : q1e ? " · 与 buildRevertMessage 逐字相符" : " · ★ 与 buildRevertMessage 不符"} · 没导航（hash 不变）=${q2} · 没发送（user 消息 ${userBefore}→${userAfter}，1.2s 后还在框里）=${q3}`);
console.log(`③ 撤掉只进输入框、不导航、不发送 → ${c3 ? "✅" : "★ 红"}`);

// ---- 判据 ④：已阅 → 注入一次新改动 → 标记失效 ----
await page.click('.chat-change-file[data-path="src/app.js"] .chat-hunk-action--review');
const markOn = await page.waitForSelector('.chat-change-file[data-path="src/app.js"] .chat-change-file-reviewed', { timeout: 8000 })
  .then(() => true).catch(() => false);
const injected = await page.evaluate(() => {
  const es = window.__auditMock;
  if (!es) return "no-mock";
  const mk = (seq, event) => new MessageEvent("message", { data: JSON.stringify({ seq, event }) });
  es.dispatchEvent(mk(1000, { type: "tool_call", seq: 1000, name: "edit_file", input: { path: "src/app.js", old_string: "43", new_string: "44" }, toolUseId: "audit-inject-1" }));
  es.dispatchEvent(mk(1001, { type: "tool_result", seq: 1001, toolUseId: "audit-inject-1", resultIsError: false }));
  return "ok";
});
const markGone = await page.waitForFunction(() => {
  return !document.querySelector('.chat-change-file[data-path="src/app.js"] .chat-change-file-reviewed');
}, null, { timeout: 8000 }).then(() => true).catch(() => false);
await page.waitForTimeout(800);
const afterInject = await cardState();
// ★ 注入后 src/app.js 多一处改动 ⇒ 期望值**从 expected 派生**（原来是写死的 "3 处改动"，
//   那等于把源 run 的触碰次数偷偷钉进探针里：换重放源就假红，实测换源后正是红在这里）。
const appEditsBase = expected.find((f) => f.path === "src/app.js")?.edits ?? null;
const appEditsAfterInject = appEditsBase === null ? null : `${appEditsBase + 1} 处改动`;
const c4 = markOn && injected === "ok" && markGone
  && appEditsAfterInject !== null
  && afterInject?.rows["src/app.js"] === appEditsAfterInject;
console.log(`\n—— 判据 ④ ——`);
console.log(`点已阅后标记出现=${markOn} · 注入 ${injected}（edit_file seq 1000 + tool_result seq 1001）`);
console.log(`注入后标记消失=${markGone} · src/app.js meta=${afterInject?.rows["src/app.js"] ?? "（卡没了）"}（期望 ${appEditsAfterInject ?? "?"} = 基线 ${appEditsBase} + 注入 1）`);
console.log(`④ 已阅随再改动自动失效 → ${c4 ? "✅" : "★ 红"}`);

// ---- 旁证（不拦验收）：单 hunk 文件上「下一个 hunk」是禁用态；hash 全程没被改过 ----
const nextDisabled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.chat-change-file[data-path="src/app.js"] .chat-hunk-action--next')];
  return btns.length > 0 && btns.every((b) => b.disabled);
});
console.log(`\n—— 旁证 ——`);
console.log(`最后一个 hunk 的「下一个 hunk」禁用=${nextDisabled}（单 hunk 文件没有下一个）`);

// ---- 判据 ⑧（终审 I1）：「下一个 hunk」圈在按钮所属文件内，不按容器全局找 ----
const c8r = await page.evaluate(() => {
  // ★ 行序无关：④ 注入的 edit_file 会触发重渲染重排（lastSeq 变了），
  // 谁在前不可假设。陷阱放在**文档序第一行**的文件体里，按钮放在
  // **第二行**的文件体里——修复版圈文件 → 滚到第二行的 idx=1；
  // 退回容器全局找 → 文档序第一个 idx=1 是第一行的合成 hunk，落错文件。
  const rows = [...document.querySelectorAll("#main-area #conversation .chat-change-card details.chat-change-file")];
  if (rows.length < 2) return { ok: false, why: `文件行不足 2（${rows.length}）` };
  const [firstRow, secondRow] = rows;
  const fFirst = firstRow.querySelector(":scope > .chat-change-file-body");
  const fSecond = secondRow.querySelector(":scope > .chat-change-file-body");
  if (!fFirst || !fSecond) return { ok: false, why: "文件体不在（未展开？）" };
  const mkHunk = (idx) => {
    const s = document.createElement("section");
    s.className = "chat-hunk";
    s.dataset.hunkIdx = String(idx);
    s.textContent = `合成 hunk ${idx}`;
    return s;
  };
  fFirst.appendChild(mkHunk(1));                 // 文档序第一个 idx=1（陷阱）
  const trap = mkHunk(1);
  fSecond.appendChild(trap);                     // 按钮所属文件的 idx=1（正确答案）
  const btn = document.createElement("button");
  btn.className = "chat-hunk-action--next";
  btn.dataset.changeAction = "next-hunk";
  btn.dataset.hunkIdx = "0";
  btn.textContent = "合成下一个";
  fSecond.appendChild(btn);
  const scrolled = [];
  const orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) { scrolled.push({ el: this, opts: args[0] ?? null }); };
  try { btn.click(); } finally { Element.prototype.scrollIntoView = orig; }
  const t = scrolled[0]?.el ?? null;
  const file = t?.closest?.(".chat-change-file") ?? null;
  return {
    ok: t === trap && file?.getAttribute("data-path") === secondRow.getAttribute("data-path"),
    targetFile: file?.getAttribute("data-path") ?? "（无）",
    targetIdx: t?.dataset?.hunkIdx ?? "（无）",
    scrolledCount: scrolled.length,
    firstRowPath: firstRow.getAttribute("data-path") ?? "?",
    secondRowPath: secondRow.getAttribute("data-path") ?? "?",
  };
});
const c8 = c8r.ok;
console.log(`\n—— 判据 ⑧ ——`);
console.log(`行序（重排后）：第一行=${c8r.firstRowPath} · 第二行=${c8r.secondRowPath}（陷阱在第一行，按钮在第二行）`);
console.log(`scrollIntoView 落点：file=${c8r.targetFile} idx=${c8r.targetIdx}（次数=${c8r.scrolledCount}${c8r.why ? " · " + c8r.why : ""}）`);
console.log(`⑧ 下一个 hunk 圈在按钮所属文件内（终审 I1） → ${c8 ? "✅" : "★ 红"}`);

// ---- 判据 ⑤：阅读模式开/关两种都量 ----
const boxFull = await page.locator(".chat-change-card").boundingBox();
await page.evaluate(() => localStorage.setItem("agent-ui-reading-mode", "focus"));
await page.reload({ waitUntil: "domcontentloaded" });
await waitForQuiet(15000);
await page.evaluate((id) => { location.hash = id; }, `#/run/${deadId}`);
await page.waitForSelector("#main-area #conversation .chat-change-card", { timeout: 60000 }).catch(() => {});
await waitForQuiet(15000);
const focusActive = await page.evaluate(() =>
  document.querySelectorAll(".rm-summary").length + document.querySelectorAll(".rm-hidden").length);
const boxFocus = await page.locator(".chat-change-card").boundingBox();
await page.evaluate(() => localStorage.setItem("agent-ui-reading-mode", "full"));
await page.reload({ waitUntil: "domcontentloaded" });
await waitForQuiet(15000);
await page.evaluate((id) => { location.hash = id; }, `#/run/${deadId}`);
await page.waitForSelector("#main-area #conversation .chat-change-card", { timeout: 60000 }).catch(() => {});
await waitForQuiet(15000);
const boxBack = await page.locator(".chat-change-card").boundingBox();
const c5 = boxFull !== null && boxFocus !== null && boxBack !== null && focusActive > 0;
console.log(`\n—— 判据 ⑤ ——`);
console.log(`完整模式卡可见=${boxFull !== null} → 聚焦模式卡可见=${boxFocus !== null}（模式生效证据：.rm-summary/.rm-hidden 共 ${focusActive} 处）→ 切回完整卡可见=${boxBack !== null}`);
console.log(`⑤ 阅读模式两种都量，卡片都在 → ${c5 ? "✅" : "★ 红"}`);

// ---- 判据 ⑦：两脸成对——Code 脸照常出现，Work 脸整张藏掉（display:none，卡还在 DOM） ----
// ①-⑤ 全在 Code 脸量（boot 已把 workspaceFace 偏好钉成 code）。这里真点脸切换控件：
// office → data-face="work"，卡片必须还在 DOM 但 computed display:none / boundingBox null；
// 再切回 code，恢复可见。只写 Code 脸规则等于没锁——这条量锁的另一半。
await page.click('#workspace-face [data-workspace-face="office"]');
const workFace = await page.waitForFunction(() => document.body.dataset.face === "work", null, { timeout: 8000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(400);
const workDom = await page.evaluate(() => {
  const card = document.querySelector("#main-area #conversation .chat-change-card");
  if (!card) return { inDom: false, display: "（卡不在 DOM）" };
  return { inDom: true, display: getComputedStyle(card).display };
});
const workBox = await page.locator(".chat-change-card").boundingBox();
await page.click('#workspace-face [data-workspace-face="code"]');
const codeFace = await page.waitForFunction(() => document.body.dataset.face === "code", null, { timeout: 8000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(400);
const codeDisplay = await page.evaluate(() => {
  const card = document.querySelector("#main-area #conversation .chat-change-card");
  return card ? getComputedStyle(card).display : "（卡不在 DOM）";
});
const codeBox = await page.locator(".chat-change-card").boundingBox();
const c7 = workFace && codeFace && workDom.inDom && workDom.display === "none"
  && workBox === null && codeDisplay !== "none" && codeBox !== null;
console.log(`\n—— 判据 ⑦ ——`);
console.log(`office 脸（data-face=work 达成=${workFace}）：卡在 DOM=${workDom.inDom} · computed display=${workDom.display} · boundingBox=${workBox === null ? "null" : "有"}`);
console.log(`code 脸（data-face=code 达成=${codeFace}）：computed display=${codeDisplay} · boundingBox=${codeBox === null ? "null" : "有"}`);
console.log(`⑦ 两脸成对：Work 脸藏掉、Code 脸照常 → ${c7 ? "✅" : "★ 红"}`);

// ---- 判据 ⑥：0 控制台错误 + 0 页面异常 ----
const c6 = errs.length === 0 && pageErrs.length === 0;
console.log(`\n—— 判据 ⑥ ——`);
console.log(`控制台错误：${errs.length ? errs.join(" │ ") : "零"} · 页面异常：${pageErrs.length ? pageErrs.join(" │ ") : "零"}`);
console.log(`mock 代供的 artifact 请求（回放流的截图，1×1 PNG）：${artifactStubs} 次`);
if (badRes.length) console.log(`≥400 的响应（去重）：${[...new Set(badRes)].join(" │ ")}`);
console.log(`⑥ 0 控制台错误 → ${c6 ? "✅" : "★ 红"}`);

await page.screenshot({ path: join(OUT, "verify-change-card.png"), fullPage: false });
console.log(`\n截图落 eval/persona-ux/_verify-shots/verify-change-card.png`);
await browser.close();

// ---- 清理：只删本探针的靶死 run ----
try {
  const del = await fetch(`${BASE}/api/runs/${deadId}`, { method: "DELETE" });
  const after = await (await fetch(`${BASE}/api/runs`)).json();
  const gone = !after.some((r) => r.runId === deadId);
  console.log(`清理靶死 run ${deadId}：DELETE ${del.status} · 已从列表消失=${gone}`);
} catch (e) {
  console.log(`清理靶死 run 失败：${String(e).slice(0, 120)}`);
}

const ok = c1 && c2 && c3 && c4 && c5 && c6 && c7 && c8;
console.log(ok
  ? "\n✅ 八条全成立：卡片在且文件数对 / 展开取到真 patch（含上下文行）/ 撤掉三问全过（逐字比对成门）/ 已阅随再改动失效 / 阅读模式两种都可见 / 0 控制台错误 / 两脸成对（Work 藏、Code 现）/ 下一个 hunk 圈在文件内"
  : "\n★ 有判据没达标——看上面哪一条红");
process.exitCode = ok ? 0 : 1;
