/**
 * 溢出批（UX-C2 / O2–O10）活页验收。
 *
 * 每项做 A/B：页面当前（修复后）测量一次；再注入一条"修复前"样式覆盖测量一次，
 * 期望 B 出现溢出/被裁、A 不出现。窄上下文条目（工具名/活动行/审批卡——它们的
 * 真实容器是右列/审批坞，不是 709px 的对话列）放进 260px 容器里测。
 * O2 在窄视口打开设置→消耗，实测标签步长随宽度自适应、相邻标签不重叠。
 *
 * 用法：node ux-verify-overflow.mjs <baseUrl> <runId> <outDir>
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4201";
const RUN_ID = process.argv[3] ?? "";
const OUT = process.argv[4] ?? ".";
await mkdir(OUT, { recursive: true });

const MCP_LONG = "mcp__plugin_stm32-debug-kit_stm32-gdb-mcp__reconstruct_fault_context"; // 67 字符
// 纯 ASCII、无分隔符（CJK 处处可断行，造不出「不可断长词」条件）
const LONG_NAME = `${"verylongsegment".repeat(9)}.txt`; // ~130 字符无空格
const LONG_CMD = 'D:/Work/MCP_Servers/stm32-gdb-mcp/.venv/Scripts/python.exe -m mcp_server.server --long-flag --another-very-long-flag value-with-many-characters-here';
const LONG_URL = "https://example.com/very/long/path/with/many/segments/and/a/query?alpha=1234567890&beta=abcdefghijklmnopqrstuvwxyz&gamma=0123456789&delta=more-values-here";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ } });
await page.goto(`${BASE}/`, { waitUntil: "commit" });
await page.waitForSelector("#task-input", { timeout: 20000 });
if (RUN_ID) {
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
  await page.waitForTimeout(2500);
}

const results = [];
const note = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};

async function override(id, cssText) {
  await page.evaluate(([i, t]) => {
    let el = document.getElementById(`ux-ovr-${i}`);
    if (!el) {
      el = document.createElement("style");
      el.id = `ux-ovr-${i}`;
      document.head.appendChild(el);
    }
    el.textContent = t;
  }, [id, cssText]);
}
async function clearOverride(id) {
  await page.evaluate((i) => document.getElementById(`ux-ovr-${i}`)?.remove(), id);
}

/**
 * 在 260px 窄容器里注入一段真实类名结构。返回 { measure, remove } 用的宿主。
 * 窄上下文是这些条目的真实所在（右列 / 审批坞），1440 宽的对话列塞得下就测不出。
 */
async function injectNarrow(html, width = 260) {
  await page.evaluate(([h, w]) => {
    const host = document.querySelector(".conversation") || document.getElementById("main-area");
    const wrap = document.createElement("div");
    wrap.dataset.uxProbe = "1";
    wrap.style.width = `${w}px`;
    wrap.style.maxWidth = "100%";
    wrap.innerHTML = h;
    host.appendChild(wrap);
  }, [html, width]);
}
async function removeProbes() {
  await page.evaluate(() => document.querySelectorAll('[data-ux-probe="1"]').forEach((n) => n.remove()));
}
async function blown(sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return { blown: el.scrollWidth > el.clientWidth + 1, scrollW: el.scrollWidth, clientW: el.clientWidth };
  }, sel);
}

// ============ O3 工具行：67 字符 MCP 全名（窄上下文） ============
{
  await removeProbes();
  await injectNarrow(
    `<details class="chat-tool"><summary><span class="aside-mark">✓</span> <code title="${MCP_LONG}">${MCP_LONG}</code> <span class="aside-peek">${LONG_CMD.slice(0, 88)}</span></summary></details>`,
  );
  const card = '[data-ux-probe="1"] .chat-tool';
  const a = await blown(card);
  await override("o3", `.chat-tool > summary > code { flex: 0 0 auto; min-width: auto; overflow: visible; text-overflow: clip; }`);
  const b = await blown(card);
  await clearOverride("o3");
  note("O3 工具名", Boolean(a && !a.blown && b && b.blown), `修复后=${a?.scrollW}/${a?.clientW}；模拟修复前=${b?.scrollW}/${b?.clientW}`);
}

// ============ O7 活动行：「正在 <工具>」 ============
{
  await removeProbes();
  await injectNarrow(`<div class="chat-activity" role="status"><span class="thinking-shimmer">正在</span> <code title="${MCP_LONG}">${MCP_LONG}</code></div>`);
  const line = '[data-ux-probe="1"] .chat-activity';
  const a = await blown(line);
  await override("o7", `.chat-activity code { min-width: auto; overflow: visible; text-overflow: clip; }`);
  const b = await blown(line);
  await clearOverride("o7");
  note("O7 活动行", Boolean(a && !a.blown && b && b.blown), `修复后=${a?.scrollW}/${a?.clientW}；模拟修复前=${b?.scrollW}/${b?.clientW}`);
}

// ============ O4 工具组摘要：长 bash ============
{
  await removeProbes();
  await injectNarrow(
    `<details class="chat-tool-group"><summary><span class="aside-mark">⋯</span> <span class="tool-headline"><span class="tool-kw">${LONG_CMD.split(" ")[0]}</span> <span class="tool-target">${LONG_CMD.slice(30, 130)}</span></span></summary></details>`,
  );
  const head = '[data-ux-probe="1"] .tool-headline';
  const read = () => page.evaluate((s) => {
    const el = document.querySelector(s);
    const host = el?.closest("summary");
    return el && host ? { headScroll: el.scrollWidth, headClient: el.clientWidth, hostBlown: host.scrollWidth > host.clientWidth + 1 } : null;
  }, head);
  const a = await read();
  await override("o4", `.tool-headline { min-width: auto; max-width: none; overflow: visible; text-overflow: clip; }`);
  const b = await read();
  await clearOverride("o4");
  note("O4 工具组摘要", Boolean(a && !a.hostBlown && a.headScroll > a.headClient && b?.hostBlown), `修复后 head=${a?.headScroll}/${a?.headClient} 摘要未撑破=${a && !a.hostBlown}；模拟修复前撑破=${b?.hostBlown}`);
}

// ============ O5 审批卡首行：无分隔长名（窄上下文） ============
{
  await removeProbes();
  await injectNarrow(
    `<div class="approval-card"><div class="approval-card-header"><span class="approval-tool-name">要新建或改 ${LONG_NAME}</span><span class="approval-result approval-result--allow">已放行</span></div></div>`,
  );
  const card = '[data-ux-probe="1"] .approval-card';
  const a = await blown(card);
  await override("o5", `.approval-tool-name { min-width: auto; overflow-wrap: normal; }`);
  const b = await blown(card);
  await clearOverride("o5");
  note("O5 审批卡首行", Boolean(a && !a.blown && b && b.blown), `修复后=${a?.scrollW}/${a?.clientW}；模拟修复前=${b?.scrollW}/${b?.clientW}`);
}

// ============ O6 来源表：长 URL ============
{
  await removeProbes();
  await injectNarrow(
    `<aside class="chat-sources" role="region"><div class="chat-sources-head">来源</div><div class="md-table-wrap"><table class="md-table chat-sources-table"><thead><tr><th>来源</th><th>该页说的</th><th>链接</th></tr></thead><tbody><tr><td>样例</td><td>引用</td><td><a href="#">${LONG_URL}</a></td></tr></tbody></table></div></aside>`,
    709,
  );
  const a = await page.evaluate(() => {
    const aside = document.querySelector('[data-ux-probe="1"] .chat-sources');
    const wrap = aside?.querySelector(".md-table-wrap");
    return aside && wrap ? { asideBlown: aside.scrollWidth > aside.clientWidth + 1, wrapOverflowX: getComputedStyle(wrap).overflowX } : null;
  });
  note("O6 来源表", Boolean(a && !a.asideBlown && a.wrapOverflowX === "auto"), `aside 未撑破=${a && !a.asideBlown}，wrap overflow-x=${a?.wrapOverflowX}`);
}

// ============ O9 子对话 chip ============
{
  await removeProbes();
  await injectNarrow(`<ul class="campaign-chip-list"><li class="campaign-chip"><span class="campaign-chip-title">${LONG_CMD}</span></li></ul>`, 709);
  const read = () => page.evaluate(() => {
    const chip = document.querySelector('[data-ux-probe="1"] .campaign-chip');
    const list = document.querySelector('[data-ux-probe="1"]');
    const title = chip?.querySelector(".campaign-chip-title");
    return chip && list ? {
      chipW: Math.round(chip.getBoundingClientRect().width),
      listW: Math.round(list.getBoundingClientRect().width),
      titleEllipsized: title ? title.scrollWidth > title.clientWidth + 1 : null,
    } : null;
  });
  const a = await read();
  await override("o9", `.campaign-chip-title { max-width: none; overflow: visible; text-overflow: clip; }`);
  const b = await read();
  await clearOverride("o9");
  note(
    "O9 子对话 chip",
    Boolean(a && b && a.chipW <= a.listW + 1 && a.titleEllipsized && b.chipW > a.chipW + 20),
    `修复后 chip=${a?.chipW}≤list=${a?.listW} 标题出省略号=${a?.titleEllipsized}；模拟修复前 chip=${b?.chipW}`,
  );
}

await removeProbes();

// ============ O2 消耗图表：窄视口步长自适应 + 标签不裁不叠 ============
{
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => {
    const btn = document.getElementById("settings-open-btn") || document.querySelector('[aria-label="打开设置"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(1000);
  const sectionState = await page.evaluate(() => {
    const sec = document.getElementById("settings-usage");
    if (!sec) return { present: false };
    sec.scrollIntoView({ block: "start" });
    return { present: true, plotCount: document.querySelectorAll("#settings-usage-plot .usage-col-label").length };
  });
  if (opened && sectionState.present && sectionState.plotCount > 0) {
    await page.locator('#settings-usage [data-days="30"]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    const facts = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#settings-usage-plot .usage-col-label")].filter((l) => l.textContent.trim());
      const cs = getComputedStyle(labels[0] ?? document.body);
      const cols = [...document.querySelectorAll("#settings-usage-plot .usage-col")];
      const days = cols.map((c) => c.dataset.day);
      const idx = (l) => days.indexOf(l.closest(".usage-col").dataset.day);
      const stride = labels.length >= 2 ? idx(labels[1]) - idx(labels[0]) : null;
      let overlap = false;
      for (let i = 1; i < labels.length; i++) {
        const a = labels[i - 1].getBoundingClientRect();
        const b = labels[i].getBoundingClientRect();
        if (b.left < a.right - 1) overlap = true;
      }
      return { count: labels.length, stride, overflow: cs.overflow, text: labels.map((l) => l.textContent.trim()).slice(0, 6), overlap, days: cols.length };
    });
    // 断言随实际窗口自适应（点没点中 30d 都成立）：步长 ≥ max(固定节奏, 全日期宽度所需)
    const colsW = await page.evaluate(() => document.querySelector("#settings-usage-plot .usage-cols")?.clientWidth ?? 0);
    const colW = colsW > 0 && facts.days > 0 ? colsW / facts.days : 0;
    const fixed = facts.days <= 7 ? 1 : facts.days <= 30 ? 4 : 10;
    const need = colW > 0 ? Math.ceil(58 / colW) : fixed;
    const okStride = facts.stride != null && facts.stride >= Math.max(fixed, need);
    note(
      "O2 图表标签",
      facts.overflow === "visible" && okStride && !facts.overlap,
      `窄视口窗口 ${facts.days} 天、列区 ${Math.round(colsW)}px（列宽≈${colW.toFixed(1)}）步长=${facts.stride}（需≥max(${fixed},${need})）标签=${JSON.stringify(facts.text)} 重叠=${facts.overlap} overflow=${facts.overflow}`,
    );
    await page.screenshot({ path: `${OUT}/overflow-usage-420.png` });
  } else {
    note("O2 图表标签", false, `设置未打开或图表未渲染：opened=${opened} present=${sectionState.present} plotLabels=${sectionState.plotCount}`);
  }
}

// ============ O10 设置模型名：无空格长 label ============
{
  // 设置此时已开着（O2 段打开了它）；模型行在 #settings-models
  const rowState = await page.evaluate(() => {
    const sec = document.getElementById("settings-models");
    if (!sec) return { present: false };
    sec.scrollIntoView({ block: "start" });
    const strong = sec.querySelector(".settings-model-copy strong");
    return { present: true, hasRow: !!strong };
  });
  if (rowState.present && rowState.hasRow) {
    const read = () => page.evaluate(() => {
      const strong = document.querySelector("#settings-models .settings-model-copy strong");
      const row = strong?.closest(".settings-model-row");
      const copy = strong?.closest(".settings-model-copy");
      return strong && row && copy ? {
        strongBroken: strong.getBoundingClientRect().height > parseFloat(getComputedStyle(strong).lineHeight || "18") * 1.6,
        copyBlown: copy.scrollWidth > copy.clientWidth + 1,
        rowBlown: row.scrollWidth > row.clientWidth + 1,
      } : null;
    });
    await page.evaluate(() => {
      document.querySelector("#settings-models .settings-model-copy strong").textContent = "verylongmodelnamewithoutanyseparators".repeat(4);
    });
    const a = await read();
    await override("o10", `.settings-model-copy strong { overflow-wrap: normal; }`);
    const b = await read();
    await clearOverride("o10");
    note(
      "O10 模型名",
      Boolean(a && b && !a.copyBlown && !a.rowBlown && (b.copyBlown || b.rowBlown)),
      `修复后 copy 撑破=${a?.copyBlown} row 撑破=${a?.rowBlown}；模拟修复前 copy=${b?.copyBlown} row=${b?.rowBlown}`,
    );
  } else {
    note("O10 模型名", false, `设置未打开或没有模型行：present=${rowState.present} hasRow=${rowState.hasRow}`);
  }
}

console.log("\n汇总:", results.filter((r) => r.ok).length, "/", results.length, "PASS");
await browser.close();
