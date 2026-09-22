/**
 * Task 4 端到端复核（方案 A · 计划 1）——接 verify-task4-face.mjs 的发现。
 *
 * 上一个探针量到：芯片在所有页面上都是 `hidden`，因为被测 run 的 workdir 不是
 * git 仓库——`body[data-face]` 那两条规则**在真机上一次都没被触发过**。
 * "摘掉 hidden 量到 flex"证明的是 CSS 写对了，不是功能通了。
 *
 * 这一条去找一个**真有 git 数据的 workdir**，在它上面做端到端切脸：
 * 那才是用户真正会看到的路径。找不到就如实报——"不可观测"本身是结论。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

// 逐个 workdir 问服务端：这里是不是 git 仓库？只读 GET，不碰任何状态。
const scan = await page.evaluate(async () => {
  const runs = await (await fetch("/api/runs")).json();
  const seen = new Map();
  for (const r of runs) if (r.workdir && !seen.has(r.workdir)) seen.set(r.workdir, r.runId);
  const out = [];
  for (const [workdir, runId] of seen) {
    try {
      const g = await (await fetch(`/api/workspace/git?workdir=${encodeURIComponent(workdir)}`)).json();
      out.push({ runId, workdir, present: !!g?.present, branch: g?.branch ?? null,
        dirty: g?.dirty ?? null, error: g?.error ?? null });
    } catch (e) { out.push({ runId, workdir, present: false, error: String(e).slice(0, 80) }); }
  }
  return { total: runs.length, checked: out.length, hits: out };
});
console.log(`runs 共 ${scan.total} 条，去重后 ${scan.checked} 个 workdir：`);
for (const h of scan.hits) {
  console.log(`  ${h.present ? "★有仓库" : "  无仓库"}  ${h.branch ?? "—"}  ${h.workdir}  (run ${String(h.runId).slice(0, 8)}${h.error ? " · " + h.error : ""})`);
}

const target = scan.hits.find((h) => h.present);
if (!target) {
  console.log("\n★ 结论：本宿主上**没有任何 run 的 workdir 是 git 仓库**。");
  console.log("  两脸 git 差异在这台机器上无法端到端观测——只能证明 CSS 规则本身写对了。");
  console.log("  这不构成缺陷（无仓库本就不该显示 git 芯片），但意味着 Task 4 的验收");
  console.log("  完全依赖\"摘掉 hidden\"的人工口径，缺一条真实路径的覆盖。");
} else {
  console.log(`\n找到 git 仓库：${target.workdir}（分支 ${target.branch}）→ 用 run ${target.runId} 做端到端切脸`);
  await page.goto(`${BASE}/#/run/${target.runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const probe = `(() => {
    const chip = document.getElementById("workspace-git-chip");
    if (!chip) return { missing: true };
    return { face: document.body.dataset.face, hidden: chip.hasAttribute("hidden"),
      display: getComputedStyle(chip).display,
      text: (chip.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40) };
  })()`;
  for (const [label, sel, wait] of [["初始", null, 0], ["→ Code", "#workspace-face-code", 1000], ["→ Work", "#workspace-face-office", 1000]]) {
    if (sel) { await page.click(sel); await page.waitForTimeout(wait); }
    const p = await page.evaluate(probe);
    console.log(`  ${label.padEnd(8)} data-face=${String(p.face).padEnd(5)} hidden=${String(p.hidden).padEnd(5)} display=${p.display.padEnd(5)} 「${p.text}」`);
  }
}
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
