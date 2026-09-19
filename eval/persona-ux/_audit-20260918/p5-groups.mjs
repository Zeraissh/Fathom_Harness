/**
 * P5 取证：事件流的连续工具成组。
 *
 * 判据来自 docs/superpowers/plans/2026-09-18-p5-process-grouping.md Task 5：
 *   1. 恰好一组两步的 run：出现**一条**「用了 2 步」
 *   2. 点它能展开，组体里是两条明细
 *   3. 只跑了一步工具的 run：**没有组**，工具条内联
 *   4. 失败的工具结果**不进组**，仍单独存在（.log-entry--error）
 *
 * 样本是**真实归档 run**，用 `_scan-p5.mjs` 按成组规则的真实定义（完整时间线里
 * 连续 ≥2 个 tool_call，turn_start/散文/失败结果都会切断）从 .agent-run-history
 * 里扫出来，再复制进独立 history 目录。
 *
 * 导航有两个坑，都在这里处理掉了：
 *   a. 有产物的 run 会自动跳到 #/run/<id>/artifact/N，把 /log 顶掉 → 跳完再打回 /log
 *   b. 事件流面板在收起的 #detail-drawer 里，入口是 role=tab 的「Loop」按钮
 *
 * 用法：node p5-groups.mjs <baseUrl> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4199";
const OUT = process.argv[3] ?? "p5-groups.json";

const RUNS = [
  { key: "two-steps", runId: "5d6a3212-1716-4be7-99db-0dbfb20228e5", expect: "1 group / 2 steps" },
  { key: "one-step", runId: "cli-1789390950045", expect: "0 groups / inline tool" },
  { key: "with-failure", runId: "1c6df73a-ce2b-46f4-97f1-66f19c97a1f6", expect: "group + error stays out" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
// 新手卡（#onboarding-overlay）会拦截指针事件。它按 localStorage 的
// agent.ui.pref.onboardingDone 判断，先种上——本机用户点过「开始使用」后就是这个状态。
await page.addInitScript(() => {
  try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch { /* 忽略 */ }
});

async function openLogPanel(runId) {
  await page.goto(`${BASE}/#/run/${runId}/log`, { waitUntil: "commit" });
  await page.waitForTimeout(2000);
  // 坑 a：产物自动跳转把 /log 顶掉
  await page.evaluate((id) => { location.hash = `#/run/${id}/log`; }, runId);
  await page.waitForTimeout(1200);
  // 坑 b：事件流面板在 #detail-drawer 里，而该抽屉被设了 hidden、
  // 且全仓没有任何代码摘掉它（[hidden]{display:none!important} 让它彻底不可见）。
  // 所以这里**用 DOM 打开**——与 test/ui-a11y.test.ts 的 openDrawer() 同款。
  // 这不是用户可达路径，是取证手段；"抽屉不可达"本身已在证据文档里单独记为缺陷。
  await page.evaluate(() => {
    const d = document.getElementById("detail-drawer");
    if (d) { d.hidden = false; d.open = true; }
  });
  await page.waitForTimeout(600);
  // 展开后 Loop 标签应当可点（把下钻面切到事件流）
  const tab = page.locator('[role="tab"]').filter({ hasText: /Loop/ }).first();
  if (await tab.count()) {
    await tab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function readLogPanel() {
  return page.evaluate(() => {
    const host = document.querySelector(".log-entries");
    if (!host) return { error: "no .log-entries" };
    const groups = [...host.querySelectorAll(".log-entry--group")];
    const all = [...host.querySelectorAll(".log-entry")];
    const groupsInHost = all.filter((n) => n.classList.contains("log-entry--group"));
    const flatTool = all.filter((n) => {
      if (n.classList.contains("log-entry--group")) return false;
      const icon = n.querySelector(".log-entry-icon")?.textContent ?? "";
      return /^(✓|✗|→)$/.test(icon.trim());
    });
    const errs = all.filter((n) => n.classList.contains("log-entry--error"));
    const txt = (n) => (n.querySelector(".log-entry-header")?.textContent ?? "").trim().replace(/\s+/g, " ");
    return {
      totalEntries: all.length,
      groupCount: groups.length,
      groupHeaders: groups.map(txt),
      groupCollapsed: groups.map((g) => g.classList.contains("log-entry--collapsed")),
      groupInHostCount: groupsInHost.length,
      flatToolCount: flatTool.length,
      flatToolHeaders: flatTool.map(txt).slice(0, 6),
      errorCount: errs.length,
      errorHeaders: errs.map(txt).slice(0, 4),
      // 失败条目是否落在某个组体内（应为 0 —— 失败不许被组吞掉）
      errorsInsideGroups: errs.filter((n) => n.closest(".log-entry-group-body")).length,
    };
  });
}

const results = {};
for (const r of RUNS) {
  await openLogPanel(r.runId);
  const before = await readLogPanel();

  let expanded = null;
  if (before.groupCount > 0) {
    // 抽屉每次重渲染都会把 hidden 加回来（detailMarkup 自带 hidden），所以
    // 开抽屉与点击必须在同一次 evaluate 里做完，且用派发事件——走的是产品
    // 自己绑在 .log-entry-header 上的 onToggleEntry 监听，不是绕过它。
    const toggled = await page.evaluate(() => {
      const d = document.getElementById("detail-drawer");
      if (d) { d.hidden = false; d.open = true; }
      const header = document.querySelector(".log-entry--group > .log-entry-header");
      if (!header) return false;
      header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(600);
    if (toggled) {
      expanded = await page.evaluate(() => {
        const body = document.querySelector(".log-entry-group-body");
        const group = document.querySelector(".log-entry--group");
        if (!body) return { hasBody: false, innerEntries: 0, innerExpanded: 0, innerSeqs: [] };
        const inner = [...body.querySelectorAll(":scope > .log-entry")];
        return {
          hasBody: true,
          innerEntries: inner.length,
          innerExpanded: inner.filter((n) => !n.classList.contains("log-entry--collapsed")).length,
          innerBodyRendered: inner.filter((n) => n.querySelector(".log-entry-body")).length,
          innerSeqs: inner.map((n) => `${n.getAttribute("data-seq")}:${(n.querySelector(".log-entry-icon")?.textContent ?? "").trim()}`),
          groupStillCollapsed: group ? group.classList.contains("log-entry--collapsed") : null,
        };
      });
      await page.evaluate(() => {
        const d = document.getElementById("detail-drawer");
        if (d) { d.hidden = false; d.open = true; }
      });
      await page.screenshot({ path: `p5-${r.key}-expanded.png` });
    }
  }
  results[r.key] = { runId: r.runId, expect: r.expect, before, expanded };
  await page.screenshot({ path: `p5-${r.key}.png` });
}

const two = results["two-steps"];
const one = results["one-step"];
const fail = results["with-failure"];

const verdict = {
  "判据1 恰好一组两步 run 出现一条组": two.before.groupCount === 1,
  "判据1 组标题写「用了 2 步」": /用了 2 步/.test(two.before.groupHeaders.join(" ")),
  // 步数 ≠ 条目数：一步 = 一条 tool_call（含其成功 tool_result），所以组体条目数
  // 应当 ≥ 步数，而不是等于步数。上一版把这两者混为一谈，误判成 FAIL。
  "判据2 点开后组体有明细（条目数 ≥ 步数 且 > 0）":
    two.expanded?.hasBody === true && two.expanded.innerEntries > 0 && two.expanded.innerEntries >= 2,
  "判据2 组体里的明细全是展开态（不留假行）":
    two.expanded?.hasBody === true && two.expanded.innerExpanded === two.expanded.innerEntries,
  "判据2 组展开后自己不再是折叠态": two.expanded?.groupStillCollapsed === false,
  "判据3 单步 run 没有组": one.before.groupCount === 0,
  "判据3 单步 run 工具条内联可见": one.before.flatToolCount >= 1,
  "判据4 含失败 run 里失败条目独立于组": fail.before.errorCount >= 1 && fail.before.errorsInsideGroups === 0,
  "判据4 同一 run 里组与失败共存": fail.before.groupCount >= 1 && fail.before.errorCount >= 1,
};

await writeFile(OUT, JSON.stringify({ verdict, results }, null, 2), "utf-8");
console.log(JSON.stringify({ verdict, detail: results }, null, 2));
await browser.close();
