/**
 * 计划 2 · Task 5 活页验收（B5 / B6）：长代码块与长表格的折叠、横滚与复制出口。
 *
 * 量五件事（brief Step 7 + Task 5 review 的消息级复制补量）：
 * ① 60 行代码块：头部条有语言与行数；点「再展 36 行」能展开；点「复制」后
 *    剪贴板里是**全部 60 行**（逐行判，不是 4 段变 1 段）；
 * ② 60 行表格：**自身横滚**——`table.scrollWidth > wrap.clientWidth` 且正文
 *    不横溢（注入前后 `document.documentElement.scrollWidth` 不变）；
 * ③ 点「复制」后剪贴板里是 61 行 TSV（表头 + 60 行）；「再展 40 行」能开能收，
 *    开了按钮要说「收起」（静态写死「再展 N 行」会在展开后说谎）；
 * ④ 消息级「复制」（整条消息的通道，data-chat-action="copy"）：折叠**关着**时
 *    剪贴板仍是全部 60 行代码与 60 行表格，且不含头部条 chrome（语言名/行数/
 *    按钮/再展提示）。Task 5 review 的 Important——原实现走 innerText，关着的
 *    details 与 display:none 的 tbody 不在 innerText 里；
 * ⑤ 0 控制台错误。
 *
 * 消息是**注入**的不是模型生成的：注入的是 `renderMarkdown` 的**真实输出**
 * （页内 `import("/core/markdown.js")`，走的就是 UI 用的那一个模块），
 * 挂在真实 run 的 `.conversation` 宿主里——复制按钮走 app.js 的
 * `data-chat-action` 委托与 `onCopyChat` 剪贴板通道，一条假路都不绕。
 *
 * 注入后宿主可能被 run 事件回流重画（键控补丁会清掉不在清单里的节点），
 * 所以注入带重试：量之前先确认 `.chat-item` 还在，不在就再注。
 *
 * 计划 4 · Task 5 改动（一处，但每次点击都要用）：
 *   本探针的视口是 1280——计划 4 之后那是**浮层档**（`layout:"floating"`），
 *   而浮层档一开列就亮遮罩（`#right-rail-scrim`，`inset:0`）。实测（Task 5 的
 *   `_verify-shots/diag-cover.mjs`，1280 档）：右列自动召出时遮罩是 **968×900**、
 *   `elementFromPoint` 在输入框/对话内容中心命中的是 `div#right-rail-scrim`
 *   ⇒ 点内容一律被遮罩接走、Playwright 30s 超时（原版的真实红因）。
 *   **已用「退回 HEAD（去掉本轮修复）」对照量过：读数逐字段相同** ⇒ 这不是本轮
 *   T5 修复引入的，是浮层档的既有几何。
 *   ⇒ 本探针量的是**长内容渲染**、不是右列，所以每次点对话内容前先把右列收掉。
 *     这是**前置条件**，不是放宽判据（五条判据的期望值一字未动）。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });

/**
 * 60 行代码 + 60 行表格。
 * 表格用 14 列短记号撑宽而不是一个超长串：正文有 word-break: break-word，
 * 超长串会被拆行、表格永远不横溢；而每列的 min-content 是整词，14 列求和
 * 必然超过对话列宽——横滚只有这一种造法量得出来。
 */
const buildSrc = () => {
  const code =
    "```ts\n" + Array.from({ length: 60 }, (_, i) => `const x${i} = ${i};`).join("\n") + "\n```";
  const cols = Array.from({ length: 12 }, (_, j) => `c${String(j).padStart(2, "0")}`);
  const table = [
    `| # | ${cols.join(" | ")} | 值 |`,
    `| --- | ${cols.map(() => "---").join(" | ")} | --- |`,
    ...Array.from({ length: 60 }, (_, i) =>
      `| ${i} | ${cols.map((c) => `${c}v${i}`).join(" | ")} | 值${i} |`),
  ].join("\n");
  return `${code}\n\n${table}`;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);

// 找一个已落定的 run 打开：宿主 `.conversation` 需要真实渲染过一次，
// app.js 的 data-chat-action 委托才会绑上去（patchConversation 绑 __revealBound）
const runInfo = await page.evaluate(() => ({
  runItems: document.querySelectorAll(".run-item").length,
  conv: Boolean(document.querySelector(".conversation")),
  bound: document.querySelector(".conversation")?.__revealBound === true,
}));
console.log(`run 数=${runInfo.runItems} · .conversation 已渲染=${runInfo.conv} · 委托已绑=${runInfo.bound}`);

if (!runInfo.conv && runInfo.runItems > 0) {
  // 点最后一个（多半是早已结束的 run；live 的会不停重画，把注入的节点冲掉）
  await page.evaluate(() => {
    const items = document.querySelectorAll(".run-item");
    items[items.length - 1].click();
  });
  await page.waitForFunction(
    () => document.querySelector(".conversation")?.__revealBound === true,
    undefined, { timeout: 10000 },
  ).catch(() => {});
  console.log("已点开最后一个 run，等待宿主绑定");
}
if (!(await page.evaluate(() => document.querySelector(".conversation")?.__revealBound === true))) {
  console.log("★ 找不到带委托的对话宿主（没有可打开的 run，或点开后没绑上）——验收做不了");
  await browser.close();
  process.exit(1);
}

// 注入前先记下正文是否本来就横溢（判据是注入前后不变，不是绝对值）
const pageOverflowBefore = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** 注入消息（页内 import 真实 renderMarkdown），带重试：宿主可能被事件回流重画 */
async function inject(attempt = 0) {
  const ok = await page.evaluate(async (src) => {
    try {
      const { renderMarkdown } = await import("/core/markdown.js");
      const host = document.querySelector(".conversation");
      if (!host) return false;
      const old = host.querySelector(".chat-item[data-long-probe]");
      if (old) return true; // 还在，不用重注
      const node = document.createElement("div");
      node.className = "chat-item";
      node.setAttribute("data-long-probe", "1");
      node.innerHTML =
        `<div class="chat-body chat-body--text md">${renderMarkdown(src)}</div>` +
        `<div class="chat-msg-actions">` +
        `<button type="button" data-chat-action="copy" title="复制消息">复制</button>` +
        `</div>`;
      host.appendChild(node);
      return true;
    } catch (e) {
      return false;
    }
  }, buildSrc());
  if (!ok) {
    if (attempt < 3) { await page.waitForTimeout(1200); return inject(attempt + 1); }
    return false;
  }
  return true;
}
const injected = await inject();
if (!injected) {
  console.log("★ 注入失败（宿主拿不到，或 renderMarkdown 模块 import 不进来）");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(400);

/** 量之前确认注入的节点还活着；被重画冲掉就重注 */
async function ensureAlive() {
  const alive = await page.evaluate(() => Boolean(document.querySelector('.chat-item[data-long-probe]')));
  if (alive) return true;
  const again = await inject();
  if (again) await page.waitForTimeout(400);
  return again;
}

/**
 * 点对话内容前先把右列收掉（浮层档一亮列就亮遮罩，盖满主区——见文件头），
 * 并把目标滚到**视口中部**。
 *
 * ★ 为什么要 `block:"center"`：`.back-bar` 现在是 `position: sticky; top: 0;
 *   z-index: 61`（T5 修复轮，为的是召出钮在长对话里不被滚走），它**永久盖住滚动
 *   容器顶端那条**。Playwright 默认把元素滚到"刚好可见"，常常正好落进那条下面
 *   ⇒ 报 `<span class="chat-head"> from <div class="back-bar"> subtree intercepts
 *   pointer events`。滚到中部就离开了那条（这是**粘性头部的固有代价**，不是缺陷；
 *   真人会多滚一点，自动化得替它多滚一点）。
 * 两次都在挡就重试——应用的 `preview:content` 重算会把列重新打开。
 */
async function clickChat(sel) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wasOpen = await page.evaluate((s) => {
      const rail = document.getElementById("right-rail");
      const open = !!rail && rail.dataset.collapsed !== "true";
      if (open) document.getElementById("right-rail-collapse")?.click(); // 走 #right-rail 的委托
      document.querySelector(s)?.scrollIntoView({ block: "center" });
      return open;
    }, sel);
    if (wasOpen && attempt === 0) console.log("   （先收右列：浮层档遮罩盖满主区，不收掉点不到内容）");
    await page.waitForTimeout(700);
    try {
      await page.click(sel, { timeout: 6000 });
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      console.log(`   （点击被挡，重试 ${attempt + 1}/2）`);
    }
  }
}

// ① 代码块：头部条 + 折叠 + 复制全量
await ensureAlive();
const codeHead = await page.evaluate(() => {
  const block = document.querySelector('.chat-item[data-long-probe] .md-code-block');
  return {
    found: Boolean(block),
    lang: block?.querySelector(".md-block-lang")?.textContent ?? null,
    count: block?.querySelector(".md-block-count")?.textContent ?? null,
    hasDetails: Boolean(block?.querySelector("details.md-code-rest")),
    summary: block?.querySelector(".md-code-rest summary")?.textContent ?? null,
    headHasX0: block?.querySelector(".md-code-block > pre code")?.textContent?.includes("const x0") ?? false,
    restHasX59: block?.querySelector(".md-code-rest code")?.textContent?.includes("x59") ?? false,
  };
});
console.log(`① 代码块：在=${codeHead.found} · 语言="${codeHead.lang}" · 行数="${codeHead.count}" · 折起了=${codeHead.hasDetails} · 提示="${codeHead.summary}"`);
console.log(`   头部有 x0=${codeHead.headHasX0} · 折起段有 x59=${codeHead.restHasX59}`);

await clickChat('.chat-item[data-long-probe] .md-code-rest summary');
const codeOpen = await page.evaluate(() =>
  document.querySelector('.chat-item[data-long-probe] details.md-code-rest')?.open === true);
console.log(`   点「再展」后 details 展开=${codeOpen}`);

await clickChat('.chat-item[data-long-probe] [data-chat-action="copy-code"]');
await page.waitForTimeout(300);
const codeClip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
const codeLines = codeClip.split(/\r?\n/).filter((l) => l.trim() !== "");
const codeLinesOk =
  codeLines.length === 60 &&
  codeLines[0] === "const x0 = 0;" &&
  codeLines[59] === "const x59 = 59;" &&
  codeLines.every((l) => /^const x\d+ = \d+;$/.test(l));
console.log(`   复制后剪贴板：${codeLines.length} 行（应 60）· 首="${codeLines[0]}" · 尾="${codeLines[59]}" · 逐行全对=${codeLinesOk}`);

// ② 表格：自身横滚 + 正文不横溢
await ensureAlive();
const tableGeom = await page.evaluate(() => {
  const block = document.querySelector('.chat-item[data-long-probe] .md-table-block');
  const wrap = block?.querySelector(".md-table-wrap");
  const table = block?.querySelector("table.md-table");
  return {
    found: Boolean(block),
    count: block?.querySelector(".md-block-count")?.textContent ?? null,
    hasMoreBtn: Boolean(block?.querySelector('[data-chat-action="table-more"]')),
    moreLabel: block?.querySelector('[data-chat-action="table-more"]')?.textContent ?? null,
    hasCopyBtn: Boolean(block?.querySelector('[data-chat-action="copy-table"]')),
    scrollWidth: table?.scrollWidth ?? -1,
    wrapClientWidth: wrap?.clientWidth ?? -1,
    restHidden: block?.querySelector("tbody.md-table-rest")
      ? getComputedStyle(block.querySelector("tbody.md-table-rest")).display === "none"
      : null,
  };
});
const pageOverflowAfter = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log(`② 表格：在=${tableGeom.found} · 行数="${tableGeom.count}" · 有展开钮=${tableGeom.hasMoreBtn}（"${tableGeom.moreLabel}"）· 有复制钮=${tableGeom.hasCopyBtn}`);
console.log(`   自身横滚：table.scrollWidth=${tableGeom.scrollWidth} > wrap.clientWidth=${tableGeom.wrapClientWidth} → ${tableGeom.scrollWidth > tableGeom.wrapClientWidth}`);
console.log(`   正文横溢：注入前=${pageOverflowBefore} 注入后=${pageOverflowAfter}（应都为 false——表格横滚不撑破正文）`);
console.log(`   折起段默认隐藏（display:none，行仍在 DOM）=${tableGeom.restHidden}`);

// ③ 表格复制 TSV + 展开/收起
await clickChat('.chat-item[data-long-probe] [data-chat-action="copy-table"]');
await page.waitForTimeout(300);
const tableClip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
const tsvLines = tableClip.split(/\r?\n/).filter((l) => l.trim() !== "");
const tsvOk =
  tsvLines.length === 61 &&
  tsvLines[0].startsWith("#\tc00\tc01\t") &&
  tsvLines[0].endsWith("\tc11\t值") &&
  tsvLines[60].startsWith("59\tc00v59\t") &&
  tsvLines.every((l) => l.split("\t").length === 14);
console.log(`③ 复制后剪贴板：${tsvLines.length} 行 TSV（应 61=表头+60 行）· 表头="${tsvLines[0]}" · 每行 14 列=${tsvLines.every((l) => l.split("\t").length === 14)} · 首尾齐全=${tsvOk}`);

await clickChat('.chat-item[data-long-probe] [data-chat-action="table-more"]');
const opened = await page.evaluate(() => {
  const block = document.querySelector('.chat-item[data-long-probe] .md-table-block');
  const btn = block?.querySelector('[data-chat-action="table-more"]');
  return {
    isOpen: block?.classList.contains("is-open") ?? false,
    label: btn?.textContent ?? null,
    restShown: block?.querySelector("tbody.md-table-rest")
      ? getComputedStyle(block.querySelector("tbody.md-table-rest")).display !== "none"
      : null,
  };
});
await clickChat('.chat-item[data-long-probe] [data-chat-action="table-more"]');
const closedAgain = await page.evaluate(() => {
  const block = document.querySelector('.chat-item[data-long-probe] .md-table-block');
  const btn = block?.querySelector('[data-chat-action="table-more"]');
  return {
    isOpen: block?.classList.contains("is-open") ?? false,
    label: btn?.textContent ?? null,
  };
});
console.log(`   「再展 40 行」点开：is-open=${opened.isOpen} · 按钮变="${opened.label}" · 折起段可见=${opened.restShown}`);
console.log(`   再点收起：is-open=${closedAgain.isOpen} · 按钮变回="${closedAgain.label}"`);

// ④ 消息级复制：折叠**关着**时也要全文，且不掺头部条 chrome（Task 5 review 的 Important）
await ensureAlive();
// 把①里展开的代码折回去——消息级复制要在「折起」状态下证明拿得到全文
const reclosed = await page.evaluate(() => {
  const d = document.querySelector('.chat-item[data-long-probe] details.md-code-rest');
  if (d?.open) {
    const s = d.querySelector("summary");
    if (s) s.click();
  }
  return !(d?.open);
});
await clickChat('.chat-item[data-long-probe] [data-chat-action="copy"]');
await page.waitForTimeout(300);
const msgClip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
const msgLines = msgClip.split(/\r?\n/).filter((l) => l.trim() !== "");
const msgCodeLines = msgLines.filter((l) => /^const x\d+ = \d+;$/.test(l));
const msgTableRows = msgLines.filter((l) => /^\d+\tc00v\d+/.test(l));
const msgNoChrome = !msgClip.includes("复制") && !msgClip.includes("再展") && !msgClip.includes("60 行");
const msgOk =
  reclosed &&
  msgCodeLines.length === 60 &&
  msgCodeLines[0] === "const x0 = 0;" &&
  msgCodeLines[59] === "const x59 = 59;" &&
  msgTableRows.length === 60 &&
  msgTableRows[0].startsWith("0\tc00v0\t") &&
  msgTableRows[59].startsWith("59\tc00v59\t") &&
  msgClip.includes("值59") &&
  msgNoChrome;
console.log(`④ 消息级复制：代码折回=${reclosed} · 剪贴板代码行=${msgCodeLines.length}（应 60）· 表格行=${msgTableRows.length}（应 60）`);
console.log(`   无头部条 chrome（复制/再展/60 行）=${msgNoChrome} · 首行="${msgTableRows[0] ?? ""}" · 末行="${msgTableRows[59] ?? ""}"`);

await page.screenshot({ path: join(OUT, "verify-long-content.png"), fullPage: false });
console.log(`截图落 eval/persona-ux/_verify-shots/verify-long-content.png`);

console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();

const ok =
  codeHead.found && codeHead.lang === "ts" && codeHead.count === "60 行" &&
  codeHead.hasDetails && /再展 \d+ 行/.test(codeHead.summary ?? "") &&
  codeHead.headHasX0 && codeHead.restHasX59 &&
  codeOpen && codeLinesOk &&
  tableGeom.found && tableGeom.count === "60 行" && tableGeom.hasMoreBtn && tableGeom.hasCopyBtn &&
  tableGeom.scrollWidth > tableGeom.wrapClientWidth &&
  !pageOverflowBefore && !pageOverflowAfter &&
  tableGeom.restHidden === true &&
  tsvOk &&
  opened.isOpen && opened.label === "收起" && opened.restShown === true &&
  !closedAgain.isOpen && /再展 40 行/.test(closedAgain.label ?? "") &&
  msgOk &&
  errs.length === 0;
console.log(ok
  ? "✅ 五条全成立：代码折叠/复制全量 60 行、表格自身横滚不撑正文、TSV 61 行可开可收、消息级复制全文无 chrome、0 控制台错误"
  : "★ 有量没达标——看上面哪一行不对");
process.exitCode = ok ? 0 : 1;
