/**
 * 计划 3 · Task 7 活页验收：右栏召出的「改动」审阅面板。
 *
 * 判据十条（brief Step 7 六条 + 派单硬约束）：
 *   ① 召出（1600 · 占宽列）：点卡头的「在右栏审阅 →」→ data-surface 变 review
 *      且 review 槽**真的现身**（新模型里 review 恒有自己的槽，占宽列只是占宽）；
 *   ② 收得回去：⋮ 菜单点「文件」→ data-surface=tree、review 槽不可见；
 *   ③ 召出（1200 · 浮层档）：点头部的「改动」召出钮 → data-surface=review、槽可见；
 *   ④ 有内容：面板里的路径数与**应用自己的 deriveTouchedFiles** 对该流的解析一致
 *   ⑤ 动作在面板里能用：面板里点「撤掉」→ 输入框逐字拿到 buildRevertMessage
 *      那句话（三问：进框 / 没导航 / 没发送）；
 *   ⑥ 动作在卡片里也能用：同一份探针里再点卡片的「撤掉」→ 同样逐字——
 *      抽函数时两边的 data-* 挂钩名一致，这是唯一的证；
 *   ⑦ 收得回去、唤得回来：⋮「文件」收 → 点「改动」召出（review:reveal）内容还在；
 *      收起键收成细条 → 再点收起键展开，槽仍可见；
 *   ⑧ 1200（浮层档）四只召出钮都在头部、两两不重叠、不溢出、不压收起键；
 *   ⑨ 两脸成对（派单硬约束）：office → 改动召出钮与 review 槽都还在 DOM 但
 *      computed display:none；切回 code 恢复。全程 0 控制台错误。
 *
 * ★ 计划 4 · Task 5 改写（本探针是计划 3 的活页验收，被计划 4 打散得最多）：
 *   1. **四个死标记全踩**：`data-panel`（→ `data-surface`）、`layout === "split"`
 *      （split 已拆）、`#rail-tab-tree` / `#rail-tab-review`（tab 行已删）、
 *      `.right-rail-tab`（同上）。逐条按新世界改。
 *   2. ★ **重放源在本宿主上根本不存在**：原写死 `6139d6d8-…`，实测
 *      `GET /api/runs` 里找不到它 ⇒ 探针第一版红在"改写后的流里没有任何成功触碰"
 *      （拿 `fetch` 拿到的是 404 页 ⇒ 0 条）。已换成宿主上真实存在、
 *      且**触碰路径恰好 3 条**的 run ⇒ 可完整映射到夹具的两个文件（见 REWRITE）。
 *   3. ★ 判据 ① 的「split 档不许当死按钮」那半**随计划 4 一起作废**：计划 4 的
 *      3-E 把 `dataset.layout === "split"` 那段死代码（含那句播报）**整段删掉**了
 *      ——新模型里 review 恒有自己的槽、浮层只是不占宽，它**看得见**。
 *      所以这里不再断言"不占列"的播报（那是被删掉的旧行为）。
 *   4. ★ 判据 ⑨ 的「Work 脸右列不为空」**故意删掉**：那是计划 4 记账的**已知中间态**
 *      （Work 脸 + 持久偏好 review/preview ⇒ 空列；计划 6 换掉 Work 脸内容后消失），
 *      派单第 12 条明令**不许判成失败**。这里只观测并打印，不裁决。
 *   5. 判据 ⑧ 的"三只 tab 键"换成"四只召出钮"——键搬家了（设计稿 §7：钮在对话头部），
 *      但**要证的东西一字未变**：都看得见、两两不重叠、不溢出、不压收起键。
 *   6. ★ 判据 ④ 的"期望"改成**用应用自己的一对纯函数算**：旧版手搓的 `touchedOf()`
 *      读 `tool_result` 上的 `resultIsError`，而流里那字段**根本不存在**（恒 undefined）
 *      ⇒ 期望 5 处、面板 3 处 ⇒ 假红。应用的 `reduceEvent` 自己算这个标志
 *      （seq 44 / 230 两条真的失败了）⇒ **应用对、探针错**。已拆掉第二把尺。
 *   7. ★ 判据 ⑩ 的 5 条 404 定位到**mock 自身的缺口**：回放流里引用的截图属于源
 *      run，应用按靶 run 的 id 去取 ⇒ 必然 404。mock 已连**产物面**一起供（回 1×1 PNG），
 *      次数照打印，不藏。判据 ⑩ 现在量的才是"应用有真错"。
 *   8. 判据 ⑥ 前置补一次"收掉栏杆"：浮层档下 scrim（inset:0）盖着对话列，
 *      这是计划 4 **既有**行为（_verify-shots/cover-before.json 对照已证），
 *      不是本计划引入的；判据 ⑦ 之前再显式归位到"展开+review"，免得白捡一个真。
 * ★ 清理只删本探针起的那个死 run。
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
 * 重放源（计划 4 · T5 换）：原写死 `6139d6d8-92de-4246-8686-2d2b81fd8eb4`，
 * **本宿主上不存在**（`GET /api/runs` 里找不到）⇒ 取到的是 404 页、0 条事件。
 * 换成宿主上真实存在、且**成功触碰的路径恰好 3 条**的 run ⇒ 能完整映射到夹具的
 * 两个文件（夹具实测：`M src/app.js` + `?? src/new-file.js`，别无他改）。
 */
const SOURCE_RUN = process.env.AUDIT_REPLAY_RUN ?? "01873c59-9521-4094-9f2e-bc868389b0ec";
/** 重放里被改写的路径：源流里的名字 → 夹具里真实存在的名字（M / 未跟踪） */
const REWRITE = [
  // 源流：foup/app.js ×3 与 foup/index.html ×2 ⇒ 合成夹具里那个 M 文件
  ["foup/app.js", "src/app.js"],
  ["foup/index.html", "src/app.js"],
  // 源流：foup/_verify/README.md ×1 ⇒ 夹具里的未跟踪文件（全 + 行）
  ["foup/_verify/README.md", "src/new-file.js"],
];

// ---- 期望触碰清单：用应用的同一套收法解析改写后的流（不硬编码，同 T6） ----
// ---- 撤掉文案 + 触碰清单：**导入应用自己的纯函数**，不当第二把尺 ----
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
 * ★ 计划 4 · T5 改口径（这是一个**真被测出来的**错）：
 *   旧版这里手搓了一个 `touchedOf()`，拿 `tool_result` 事件上的 `res.resultIsError`
 *   判成功与否。实测：**流里的 tool_result 事件根本没有这个字段**（恒 undefined ⇒
 *   恒 falsy）⇒ 手搓口径把每一次 edit_file 都算成功 ⇒ 期望 `src/app.js=5 处`，
 *   而面板画的是 `3 处` ⇒ 判据 ④ 假红。
 *   真正的语义在应用的 `reduceEvent` 里：它自己算 resultIsError（实测 seq 44 与
 *   230 两条被判失败）⇒ 应用得 3，**应用是对的、探针是错的**。
 *   修法不是"把期望改成 3"，而是**拆掉第二把尺**：直接用应用导出的一对纯函数
 *   算期望——这样判据 ④ 才真的在问"面板是不是同一条派生链画的"，
 *   而不是在问"探针的复述准不准"。（同 buildRevertMessage 的同一把尺纪律。）
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
  console.log("★ 拿不到应用的 reduceEvents / deriveTouchedFiles / createInitialState——判据 ④ 没有可信的尺，先停");
  process.exit(1);
}

// ---- 0) 夹具哨兵（同 T6：夹具漂了就早失败） ----
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
  console.log(`夹具 diff：src/app.js ${ok1 ? "带上下文行 ✅" : "★ 没有上下文行"}`);
  console.log(`夹具 diff：src/new-file.js ${ok2 ? "合成 @@ -0,0 全 + 行 ✅" : "★ 形状不对"}`);
  if (!ok1 || !ok2) {
    console.log("★ 夹具状态不对，先跑 `node scripts/git-fixture.mjs` 重建");
    process.exit(1);
  }
}

// ---- 1) 靶死 run（T6 的探针每次跑完会删掉自己的靶，所以只走新建） ----
let deadId = null;
{
  const res = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "audit probe (plan3 t7): review panel mock replay", workdir: FIXTURE, workspace: "code" }),
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
 * workdir 的**字面**比较不可靠：服务端会把路径归一（分隔符方向 / 大小写 / 末尾
 * 分隔符都可能变）。实测同一台机器上 POST 传 `D:\…\git-repo`，返回的串看着一样
 * 却不相等 ⇒ 比"同一个目录"必须归一；不等时把两边原始串打出来，好核。
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
const realBlocks = real.split(/\r?\n/).filter((l) => l.startsWith("data: ")).length;

/**
 * ★ 计划 4 · T5 修（与 verify-change-card 同源，那一处是实测出来的）：
 * 只重放"**一次订阅真正会收到的那一段**"——到**第一条 `run_end`**（含）为止。
 *
 * 应用的契约逐字是「run 级终止（服务端 run_end，**恒为最后一条 durable 事件**）」
 * （app.js:2146）⇒ 客户端收到 run_end 就关流。而本宿主的 run 缓冲会把**续跑过的
 * 同一个 run** 的后续事件接在第一条 run_end 之后（实测：源 run 里第一条 run_end
 * 之后还有 152 条 durable，末尾又有一条 run_end）⇒ 照原样重放，应用在第一条
 * run_end 处关流、后面的编辑根本收不到，而期望却算进去了。
 *
 * ★ 本探针**当下**恰好没被这条绊到（它的成功触碰都在第一条 run_end 之前），
 * 但那是**巧合**、不是不变量：一旦重放源换一个 run，判据 ④ 就会像
 * verify-change-card 那样假红。所以这里一起裁掉，让期望与"客户端真收得到的东西"
 * 严格同一（同一把尺）。末尾补 `replay_done`（真流里也有），让应用的 replay gate
 * 走正常那条路而不是靠 500ms 兜底。
 */
function singleSession(body) {
  const frames = body.split(/\r?\n\r?\n/).filter((f) => f.trim() !== "");
  const kept = [];
  for (const f of frames) {
    if (/^\s*event:\s*replay_done\s*$/m.test(f)) continue;
    const dataLine = f.split(/\r?\n/).find((l) => l.startsWith("data: "));
    let type = null;
    if (dataLine) { try { type = JSON.parse(dataLine.slice(6))?.event?.type ?? null; } catch {} }
    kept.push(f);
    if (type === "run_end") break;
  }
  const dropped = Math.max(0, frames.length - kept.length - 1);
  kept.push("event: replay_done\n\ndata: {}");
  return { body: kept.join("\n\n") + "\n\n", droppedDurable: dropped };
}

const session = singleSession(real);
let mockBody = session.body;
for (const [from, to] of REWRITE) mockBody = mockBody.split(from).join(to);
const expected = touchedOf(mockBody);
console.log(`重放源=${SOURCE_RUN}（HTTP ${realRes.status} · ${realBlocks} 条）`);
console.log(`  单次会话裁切：丢掉第一条 run_end 之后的 ${session.droppedDurable} 条 durable 事件（本宿主把续跑段接在了同一 run 上）`);
console.log(`  喂给应用的 reduceEvents+deriveTouchedFiles，期望触碰：`);
for (const f of expected) console.log(`  ${f.path} · ${f.edits} 处 · lastSeq=${f.lastSeq}`);
if (expected.length === 0) {
  console.log(realRes.status !== 200
    ? `★ 宿主上取不到这个重放源（HTTP ${realRes.status}）——换 AUDIT_REPLAY_RUN 指一个存在的 run`
    : "★ 改写后的流里没有任何成功触碰——判据 ④ 无从量起");
  process.exit(1);
}

// ---- 3) 浏览器 + mock EventSource（只截靶 run 的生产 URL；boot 钉 code 脸） ----
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
const pageErrs = [];
const badRes = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));
// 控制台里那些 "Failed to load resource: 404" 只说"有个资源 404"、不说**是谁**，
// 判据 ⑩ 红了也没法定位 ⇒ 这里把 ≥400 的响应 URL 原样存下来，红时一起打印。
page.on("response", (r) => { if (r.status() >= 400) badRes.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
let diffFetches = 0;
page.on("request", (r) => { if (r.url().includes("/api/workspace/git/diff")) diffFetches++; });

/**
 * 回放的是**别的 run** 的事件，那些事件里引用的截图属于**那个** run；应用按事件
 * 里的 runId（=靶 run）拼出 `/api/runs/<靶>/artifact?path=…` 去取 ⇒ 必然 404。
 * mock 既然替靶 run 供事件，就得连它的**产物面**一起供——否则判据 ⑩ 量到的是
 * "mock 没供全"，不是"应用有真错"。这里把靶 run 名下的 artifact 请求统一回一个
 * 1×1 PNG，并把次数记下来（打印出来，不藏）。
 */
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
    // 把脸钉在 code：boot 默认是 office → data-face="work"。①-⑧ 量的是
    // Code 脸（宿主脸），Work 脸的可见性由判据 ⑨ 单独量。
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
      if (!String(url).includes(`/api/runs/${dead}/events`)) {
        return new NativeES(url, cfg);
      }
      window.__auditMock = this;
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

// ---- 等主线程安静（同 T6 的同一把尺） ----
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

/** 卡片当前文件行：path → meta 文本（"N 处改动"） */
async function cardState() {
  return page.evaluate(() => {
    const card = document.querySelector("#main-area #conversation .chat-change-card");
    if (!card) return null;
    const rows = {};
    for (const f of card.querySelectorAll("details.chat-change-file")) {
      rows[f.getAttribute("data-path")] = f.querySelector(".chat-change-file-meta")?.textContent?.trim() ?? "";
    }
    return { title: card.querySelector(".chat-change-card-title")?.textContent?.trim() ?? "", rows };
  });
}

/**
 * 浮层档下 `#right-rail-scrim`（inset:0）盖住整个对话列 —— 这是计划 4 的**既有**行为
 * （T5 之前就在：见 _verify-shots/cover-before.json 与 cover-after.json 的对照），
 * 不是本计划引入的。要和**对话里的卡片**交互，就先把栏杆收掉（scrim 随收起消失）。
 *
 * 先试 × 收起键（确定性最高），失败再退回 Esc——两条都是产品文档里的关闭路径，
 * 拿哪条都改变不了判据 ⑥ 要证的东西（卡片的撤掉动作与面板用的是同一组 data-* 挂钩）。
 */
async function collapseRailForChat() {
  const st = await page.evaluate(() => {
    const rail = document.getElementById("right-rail");
    return rail ? { collapsed: rail.dataset.collapsed, scrim: !!document.getElementById("right-rail-scrim") } : null;
  });
  if (st && st.collapsed === "true") return;
  await page.click("#right-rail-collapse");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.getElementById("right-rail")?.dataset.collapsed);
  if (after !== "true") {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

/** 面板当前状态：title + 文件行 + 槽可见性 */
async function panelState() {
  return page.evaluate(() => {
    const rail = document.getElementById("right-rail");
    const slot = document.getElementById("right-rail-review");
    if (!rail || !slot) return null;
    const rows = {};
    for (const f of slot.querySelectorAll("details.chat-change-file")) {
      rows[f.getAttribute("data-path")] = f.querySelector(".chat-change-file-meta")?.textContent?.trim() ?? "";
    }
    const note = slot.querySelector(".chat-change-note")?.textContent?.trim() ?? null;
    const box = slot.getBoundingClientRect();
    return {
      surface: rail.dataset.surface,
      layout: rail.dataset.layout,
      collapsed: rail.dataset.collapsed,
      title: slot.querySelector(".right-rail-review-head .chat-change-card-title")?.textContent?.trim() ?? "",
      rows,
      note,
      display: getComputedStyle(slot).display,
      hiddenAttr: slot.hidden,
      visible: slot.hidden !== true && getComputedStyle(slot).display !== "none" && box.width > 0,
    };
  });
}

/** 撤掉三问 + 逐字比对（同 T6 判据 ③ 的尺） */
async function revertThreeQuestions(buttonLocator, path) {
  const hashBefore = await page.evaluate(() => location.hash);
  const userBefore = await page.evaluate(() => document.querySelectorAll("#main-area #conversation .chat-msg--user").length);
  const attrs = await buttonLocator.evaluate((b) => ({
    header: b.dataset.header,
    added: Number(b.dataset.added),
    deleted: Number(b.dataset.deleted),
  }));
  await buttonLocator.click();
  await page.waitForTimeout(300);
  const inputVal = await page.evaluate(() => document.getElementById("task-input")?.value ?? "");
  const hashAfter = await page.evaluate(() => location.hash);
  const userAfter = await page.evaluate(() => document.querySelectorAll("#main-area #conversation .chat-msg--user").length);
  await page.waitForTimeout(1200);
  const inputStill = await page.evaluate(() => document.getElementById("task-input")?.value ?? "");
  const expectedMsg = buildRevertMessage
    ? buildRevertMessage({ path, header: attrs.header, added: attrs.added, deleted: attrs.deleted })
    : null;
  return {
    q1: inputVal.includes(path),
    q1e: expectedMsg === null ? null : inputVal === expectedMsg,
    q2: hashAfter === hashBefore,
    q3: userAfter === userBefore && inputStill === inputVal,
    inputVal,
    expectedMsg,
  };
}

// ---- 开靶 run：boot 可能自动选中别的 run，轮询重设 hash 直到卡片落定（同 T6） ----
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
  console.log(`★ 卡片没落定（${st ? `标题="${st.title}" 行=${JSON.stringify(st.rows)}` : "卡不存在"}）——boot 没订上 mock 流？`);
  console.log(`  控制台错误：${errs.length ? errs.join(" │ ") : "零"}`);
  await page.screenshot({ path: join(OUT, "verify-review-panel-FAIL.png"), fullPage: false });
  await browser.close();
  process.exit(1);
}

// ---- 判据 ①：召出（1600 · 占宽列）——卡头「在右栏审阅 →」→ surface=review 且槽现身 ----
// ★ 计划 4 后这一条的形状变了：旧世界 review 在 split 档**不现身**、要点播报
//   （终审 I4 的补救）；新世界 review **恒有自己的槽**，占宽列只是占宽 ⇒
//   正确的结果是"槽真的现身"，而那句"不占列"的播报随 3-E 的死代码一起删掉了。
const slotVis = () => page.evaluate(() => {
  const tree = document.querySelector(".right-rail > .workspace-file-tree");
  const preview = document.querySelector(".right-rail > .right-rail-preview");
  const review = document.querySelector(".right-rail > .right-rail-review");
  const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  return { tree: vis(tree), preview: vis(preview), review: vis(review) };
});
const cardOpenBefore = await page.evaluate(() => document.querySelector(".chat-change-card .chat-change-card-details")?.open ?? null);
await page.click("#main-area #conversation .chat-change-card .chat-change-open-review");
await page.waitForTimeout(600);
const s1 = await panelState();
const cardOpenAfter = await page.evaluate(() => document.querySelector(".chat-change-card .chat-change-card-details")?.open ?? null);
const visAfter = await slotVis();
const c1 = s1?.surface === "review" && s1?.visible === true && visAfter.review === true;
console.log(`\n—— 判据 ①（1600 · 占宽列） ——`);
console.log(`点「在右栏审阅 →」后：data-surface=${s1?.surface} · layout=${s1?.layout} · 槽可见=${s1?.visible}`);
console.log(`点后槽可见性：tree=${visAfter.tree} · preview=${visAfter.preview} · review=${visAfter.review}（一次一只）`);
console.log(`卡被按钮带开了吗：${cardOpenBefore} → ${cardOpenAfter}（preventDefault 生效=${cardOpenBefore === cardOpenAfter}，观察项不裁决）`);
console.log(`① 召出改的是面选择，且 review 槽真的现身 → ${c1 ? "✅" : "★ 红"}`);

// ---- 换视口到 1200（浮层档）：resize 走 paintRightRail，槽位显隐重算 ----
await page.setViewportSize({ width: 1200, height: 900 });
await waitForQuiet(15000);
await page.waitForTimeout(500);
const s2 = await panelState();
console.log(`\n—— 视口 1600 → 1200 ——`);
console.log(`layout=${s2?.layout} mode=${s2?.mode ?? "?"} · data-surface=${s2?.surface} · 槽可见=${s2?.visible}（pref.surface=review 已持久）`);

// ---- 判据 ②：收得回去（⋮ 菜单点「文件」→ surface=tree → review 槽不可见） ----
await page.click("#rail-surface-more");
await page.waitForTimeout(450);
await page.click(".rail-more-item[data-rail-surface='tree']");
await page.waitForTimeout(600);
const s2b = await panelState();
const c2 = s2b?.surface === "tree" && s2b?.visible === false;
console.log(`\n—— 判据 ② ——`);
console.log(`⋮ 菜单点「文件」后：data-surface=${s2b?.surface} · 槽可见=${s2b?.visible}`);
console.log(`② 切回文件面，review 槽收得回去 → ${c2 ? "✅" : "★ 红"}`);

// ---- 判据 ③ + ④：点「改动」召出钮，槽可见、内容与期望一致 ----
await page.click("#rail-surface-review");
await page.waitForTimeout(900);
const s3 = await panelState();
const c3 = s3?.surface === "review" && s3?.visible === true;
const c4 = s3 !== null
  && s3.title === `改文件 ${expected.length} 个`
  && Object.keys(s3.rows).length === expected.length
  && expected.every((f) => s3.rows[f.path] === `${f.edits} 处改动`);
console.log(`\n—— 判据 ③④ ——`);
console.log(`点「改动」召出钮后：data-surface=${s3?.surface} · 槽可见=${s3?.visible} · 标题="${s3?.title}"`);
console.log(`面板行：${JSON.stringify(s3?.rows)}`);
console.log(`期望（应用 deriveTouchedFiles 口径）：${expected.map((f) => `${f.path}=${f.edits} 处`).join("，")}`);
console.log(`③ 「改动」tab 召出面板 → ${c3 ? "✅" : "★ 红"}`);
console.log(`④ 面板文件数=服务端链给的触碰路径数 → ${c4 ? "✅" : "★ 红"}`);

// ---- 判据 ⑤：面板里点「撤掉」——真点开文件、等 hunk、点按钮 ----
// ★ 计划 4 · T5 修：原来只点一次、只等 15s。宿主上**并行跑别的重活**（vitest / 构建）时，
// 应用那次异步 diff 取件会被拖过 15s ⇒ @@ 头等不到 ⇒ ⑤ 印出一句"（空）"的红，
// 而红的原因与产品无关（机器忙）。实测：同一探针单跑 4/4 次都印出 `@@ -1,5 +1,5 @@`，
// 批次里那次才是"（空）"。⇒ 改成**重开一次再等**，且不放松断言（两次都没等到就红：
// "展开后确实渲染出 hunk"这条该守的东西没变）。顺带把"没等到"直接写进日志——
// 红必须自解释，别让下一个人再去猜挂的是哪条子断言（原来那行"（空）"就没说清）。
const PANEL_FILE_SEL = '#right-rail-review details.chat-change-file[data-path="src/app.js"]';
/** 幂等的"展开到打开态"：先收成关闭再展开，避免重试时把已开的 details 点关上。 */
async function ensurePanelFileOpen() {
  const isOpen = await page.evaluate((s) => document.querySelector(s)?.open === true, PANEL_FILE_SEL);
  if (isOpen) {
    await page.click(`${PANEL_FILE_SEL} > summary`);
    await page.waitForTimeout(250);
  }
  await page.click(`${PANEL_FILE_SEL} > summary`);
}
async function waitPanelHunks(step) {
  return page.waitForFunction(() => {
    const file = document.querySelector('#right-rail-review details.chat-change-file[data-path="src/app.js"]');
    const heads = file ? [...file.querySelectorAll(".chat-hunk-head")] : [];
    return heads.length > 0 ? heads.map((h) => h.textContent) : null;
  }, null, { timeout: step }).then((h) => h.jsonValue()).catch(() => null);
}
const PANEL_HUNK_WAIT_MS = 20000;
const diffsBeforePanel = diffFetches;
let panelHunks = null;
for (let attempt = 1; attempt <= 2 && !panelHunks; attempt++) {
  await ensurePanelFileOpen();
  panelHunks = await waitPanelHunks(PANEL_HUNK_WAIT_MS);
}
const r5 = await revertThreeQuestions(
  page.locator('#right-rail-review .chat-hunk-action--revert').first(),
  "src/app.js",
);
const c5 = r5.q1 && r5.q1e !== false && r5.q2 && r5.q3 && panelHunks !== null && diffFetches > diffsBeforePanel;
console.log(`\n—— 判据 ⑤（面板里点撤掉） ——`);
console.log(`面板 src/app.js 展开 @@ 头：${panelHunks ? panelHunks.join(" | ") : `★ 没等到（两次展开、各等 ${PANEL_HUNK_WAIT_MS / 1000}s）`} · diff 取件 ${diffsBeforePanel} → ${diffFetches}`);
console.log(`输入框值：${r5.inputVal}`);
console.log(`期望（buildRevertMessage 逐字）：${r5.expectedMsg ?? "（未导入）"}`);
console.log(`三问：进框=${r5.q1}${r5.q1e === null ? "" : r5.q1e ? " · 逐字相符" : " · ★ 与 buildRevertMessage 不符"} · 没导航=${r5.q2} · 没发送=${r5.q3}`);
console.log(`⑤ 面板里的撤掉动作可用 → ${c5 ? "✅" : "★ 红"}`);

// ---- 判据 ⑥：卡片里也点一次「撤掉」（同一份探针、同一把尺） ----
// 浮层档下 scrim 盖着对话列 ⇒ 先收掉栏杆（见 collapseRailForChat 的说明）。
await collapseRailForChat();
await page.click("#main-area #conversation .chat-change-card .chat-change-card-details > summary");
await page.click('#main-area #conversation .chat-change-file[data-path="src/new-file.js"] > summary');
await page.waitForFunction(() => {
  const file = document.querySelector('#main-area #conversation .chat-change-file[data-path="src/new-file.js"]');
  return file && file.querySelectorAll(".chat-hunk-head").length > 0;
}, null, { timeout: 15000 }).catch(() => {});
const r6 = await revertThreeQuestions(
  page.locator('#main-area #conversation .chat-hunk-action--revert').first(),
  "src/new-file.js",
);
const c6 = r6.q1 && r6.q1e !== false && r6.q2 && r6.q3;
console.log(`\n—— 判据 ⑥（卡片里点撤掉） ——`);
console.log(`输入框值：${r6.inputVal}`);
console.log(`期望（buildRevertMessage 逐字）：${r6.expectedMsg ?? "（未导入）"}`);
console.log(`三问：进框=${r6.q1}${r6.q1e === null ? "" : r6.q1e ? " · 逐字相符" : " · ★ 与 buildRevertMessage 不符"} · 没导航=${r6.q2} · 没发送=${r6.q3}`);
console.log(`⑥ 卡片里的撤掉动作也没断（两处挂钩名一致） → ${c6 ? "✅" : "★ 红"}`);

// ---- 判据 ⑦：两条收回路径 + 唤回（review:reveal 后内容还在） ----
// 计划 4：tab 行没了 ⇒「切文件面」走对话头部的 ⋮ 菜单（Code 脸没有直挂的树钮）。
// 前置归位：⑥ 为了点卡片把栏杆收掉了，这一条量的是「收起/展开」本身，
// 起点必须是**展开 + review**，否则 s7a 的「槽不可见=false」会白捡一个真。
await page.click("#rail-surface-review");
await page.waitForTimeout(600);
const s7pre = await page.evaluate(() => {
  const rail = document.getElementById("right-rail");
  return { surface: rail?.dataset.surface, collapsed: rail?.dataset.collapsed };
});
console.log(`\n—— 判据 ⑦ 前置归位 ——`);
console.log(`点「改动」召出钮后：data-surface=${s7pre.surface} · collapsed=${s7pre.collapsed}（必须=review / false，否则下面的量是白捡的）`);
if (s7pre.surface !== "review" || s7pre.collapsed !== "false") {
  console.log("★ 归位失败——判据 ⑦ 的起点不对，先停");
  await browser.close();
  process.exit(1);
}
await page.click("#rail-surface-more");
await page.waitForTimeout(450);
await page.click(".rail-more-item[data-rail-surface='tree']");
await page.waitForTimeout(600);
const s7a = await panelState();
await page.click("#rail-surface-review");
await page.waitForTimeout(700);
const s7b = await panelState();
const revealKeptRows = s7b?.rows && Object.keys(s7b.rows).length === expected.length
  && expected.every((f) => s7b.rows[f.path] === `${f.edits} 处改动`);
await page.click('#right-rail-collapse');
await page.waitForTimeout(400);
const s7c = await panelState();
await page.click('#right-rail-collapse');
await page.waitForTimeout(400);
const s7d = await panelState();
const c7 = s7a?.visible === false && s7b?.visible === true && revealKeptRows
  && s7c?.collapsed === "true" && s7d?.collapsed === "false" && s7d?.visible === true;
console.log(`\n—— 判据 ⑦ ——`);
console.log(`文件 tab：槽可见=${s7a?.visible} → 改动 tab 唤回：槽可见=${s7b?.visible}（内容还在=${revealKeptRows}）`);
console.log(`收起键：collapsed ${s7c?.collapsed} → 再点展开：collapsed=${s7d?.collapsed} · 槽可见=${s7d?.visible}`);
console.log(`⑦ 收得回去、唤得回来 → ${c7 ? "✅" : "★ 红"}`);

// ---- 判据 ⑧：1200（浮层档）四只召出钮——都看得见、两两不重叠、不溢出、不压收起键 ----
// 计划 4：键从「列里的 tab 行」搬到「对话头部」（设计稿 §7），**要证的东西一字未变**。
const tabs = await page.evaluate(() => {
  const bar = document.querySelector(".rail-surface-bar");
  const barBox = bar.getBoundingClientRect();
  const collapse = document.getElementById("right-rail-collapse")?.getBoundingClientRect() ?? null;
  const items = [...document.querySelectorAll(".rail-surface-btn--code")].map((t) => {
    const b = t.getBoundingClientRect();
    return {
      text: t.id.replace("rail-surface-", ""),
      left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width,
      hidden: getComputedStyle(t).display === "none",
      intersectsCollapse: collapse ? !(b.right <= collapse.left || b.left >= collapse.right || b.bottom <= collapse.top || b.top >= collapse.bottom) : false,
    };
  }).sort((a, b) => a.left - b.left);
  return { barLeft: barBox.left, barRight: barBox.right, items };
});
const pairwiseOk = tabs.items.every((t, i) => i === 0 || t.left >= tabs.items[i - 1].right);
const inBar = (t) => t.left >= tabs.barLeft - 1 && t.right <= tabs.barRight + 1;
const c8 = tabs.items.length === 4
  && tabs.items.every((t) => !t.hidden && t.width > 0)
  && pairwiseOk
  && tabs.items.every(inBar)
  && tabs.items.every((t) => !t.intersectsCollapse);
console.log(`\n—— 判据 ⑧（1200 · 浮层档 · 头部四只召出钮） ——`);
console.log(`四只钮：${tabs.items.map((t) => `${t.text}@${Math.round(t.left)}-${Math.round(t.right)}`).join(" · ")} · 钮行 ${Math.round(tabs.barLeft)}-${Math.round(tabs.barRight)}`);
console.log(`两两不重叠=${pairwiseOk} · 不溢出钮行=${tabs.items.every(inBar)} · 不压收起键=${tabs.items.every((t) => !t.intersectsCollapse)}`);
console.log(`⑧ 浮层档四只键点得到、不挤坏、不压收起键 → ${c8 ? "✅" : "★ 红"}`);

// ---- 判据 ⑨：两脸成对——office → 改动召出钮与 review 槽都藏（DOM 还在）；code 脸恢复 ----
// ★ 计划 4：旧版还断言「Work 脸下 panel=review 落回树（右列不为空）」——**故意删掉**：
//   那是计划 4 记账的**已知中间态**（Work 脸 + 持久偏好 review/preview ⇒ 空列，
//   计划 6 换掉 Work 脸内容后自然消失），派单第 12 条明令不许判成失败。
//   这里只**观测**并打印，不进裁决。
await page.click('#workspace-face [data-workspace-face="office"]');
const workFace = await page.waitForFunction(() => document.body.dataset.face === "work", null, { timeout: 8000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(400);
const workDom = await page.evaluate(() => {
  const key = document.getElementById("rail-surface-review");
  const slot = document.getElementById("right-rail-review");
  const tree = document.querySelector(".right-rail > .workspace-file-tree");
  const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  return {
    keyInDom: !!key,
    keyDisplay: key ? getComputedStyle(key).display : "（钮不在 DOM）",
    slotInDom: !!slot,
    slotDisplay: slot ? getComputedStyle(slot).display : "（槽不在 DOM）",
    treeVisible: vis(tree),
  };
});
await page.click('#workspace-face [data-workspace-face="code"]');
const codeFace = await page.waitForFunction(() => document.body.dataset.face === "code", null, { timeout: 8000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(400);
const codeDom = await page.evaluate(() => {
  const key = document.getElementById("rail-surface-review");
  const slot = document.getElementById("right-rail-review");
  return {
    keyDisplay: key ? getComputedStyle(key).display : "（钮不在 DOM）",
    slotDisplay: slot ? getComputedStyle(slot).display : "（槽不在 DOM）",
  };
});
const c9 = workFace && codeFace && workDom.keyInDom && workDom.keyDisplay === "none"
  && workDom.slotInDom && workDom.slotDisplay === "none"
  && codeDom.keyDisplay !== "none" && codeDom.slotDisplay !== "none";
console.log(`\n—— 判据 ⑨（两脸成对） ——`);
console.log(`office 脸（data-face=work 达成=${workFace}）：改动钮在 DOM=${workDom.keyInDom} · display=${workDom.keyDisplay}；槽在 DOM=${workDom.slotInDom} · display=${workDom.slotDisplay}`);
console.log(`（观测，不裁决）Work 脸下右列为空=${!workDom.treeVisible}——已知中间态，派单第 12 条不许判失败`);
console.log(`code 脸（data-face=code 达成=${codeFace}）：改动钮 display=${codeDom.keyDisplay} · 槽 display=${codeDom.slotDisplay}`);
console.log(`⑨ 两脸成对：Work 藏、Code 现 → ${c9 ? "✅" : "★ 红"}`);

// ---- 判据 ⑩：0 控制台错误 + 0 页面异常 ----
const c10 = errs.length === 0 && pageErrs.length === 0;
console.log(`\n—— 判据 ⑩ ——`);
console.log(`控制台错误：${errs.length ? errs.join(" │ ") : "零"} · 页面异常：${pageErrs.length ? pageErrs.join(" │ ") : "零"}`);
console.log(`mock 代供的 artifact 请求（回放流的截图，1×1 PNG）：${artifactStubs} 次`);
if (badRes.length) console.log(`≥400 的响应（去重）：${[...new Set(badRes)].join(" │ ")}`);
console.log(`⑩ 0 控制台错误 → ${c10 ? "✅" : "★ 红"}`);

await page.screenshot({ path: join(OUT, "verify-review-panel.png"), fullPage: false });
console.log(`\n截图落 eval/persona-ux/_verify-shots/verify-review-panel.png`);
await browser.close();

// ---- 清理：只删本探针起的靶死 run ----
try {
  const del = await fetch(`${BASE}/api/runs/${deadId}`, { method: "DELETE" });
  const after = await (await fetch(`${BASE}/api/runs`)).json();
  const gone = !after.some((r) => r.runId === deadId);
  console.log(`清理靶死 run ${deadId}：DELETE ${del.status} · 已从列表消失=${gone}`);
} catch (e) {
  console.log(`清理靶死 run 失败：${String(e).slice(0, 120)}`);
}

const ok = c1 && c2 && c3 && c4 && c5 && c6 && c7 && c8 && c9 && c10;
console.log(ok
  ? "\n✅ 十条全成立：CTA 召出且槽现身 / ⋮「文件」收得回 / 「改动」钮召出 / 面板文件数与服务端链一致 / 面板撤掉逐字进框 / 卡片撤掉也没断 / 两条收回路径 + 唤回 / 浮层档四键不挤坏不压收起键 / 两脸成对 / 0 控制台错误"
  : "\n★ 有判据没达标——看上面哪一条红");
process.exitCode = ok ? 0 : 1;
