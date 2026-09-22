/**
 * 活页确认：降噪折叠修好之后，树里还剩多少行（2026-09-20）。
 *
 * 背景：委托方贴了张截图问"好看吗"——树里 `_probeB-profile-…` 之类
 * 带着 Chrome 配置目录的内容铺满整栏。根因是 `noiseGroupOf` 只取到
 * 第一个连字符/数字之前，`_probe` / `_probeA` / `_probeB` … 成了七个组，
 * 而"≥2 才成组"让每族只剩一个的全部原样显示。
 *
 * 本探针量三件：
 *   ① 树里现在有几行（组行 + 普通行）
 *   ② 还有没有 `_probe*` 形状的条目原样露着
 *   ③ 展开箭头朝下的条目有几个（那些才是会铺开内容的）
 * 计划 4 · Task 5 改写（原版两处失效）：
 *   ① BASE 硬编码 4173 → 参数化（本计划硬约束一）。
 *   ② `rail?.querySelector("#rail-tab-tree")?.click?.()`——tab 行已删（死标记），
 *      恒 no-op。新世界召树面靠偏好默认（surface 缺省即 tree）+ 内容驱动开列；
 *      这里改为 init 钉 `{surface:"tree", collapsed:false}` 并 boot 到 run 页。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const RUN = process.env.AUDIT_RUN ?? "956661ce-6e90-4955-a5fd-3f1558ad922d";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 树面是 surface 缺省值；钉上偏好免掉 tab 点击（tab 行已删），列开不开交给
    // 内容驱动可见性（树非空就开）。
    if (!localStorage.getItem("agent.ui.pref.rightRail")) {
      localStorage.setItem("agent.ui.pref.rightRail",
        JSON.stringify({ fraction: 0.25, surface: "tree", collapsed: false }));
    }
  } catch {}
});
await page.goto(`${BASE}/#/run/${RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const r = await page.evaluate(() => {
  const tree =
    document.getElementById("workspace-file-tree") ||
    document.querySelector(".files-rail") ||
    document.querySelector(".file-tree");
  if (!tree) return { missing: true };
  const rows = [...tree.querySelectorAll(".ft-row")];
  // 组行的判据是**没有 dataset.path**（组不是一个路径），不是类名——
  // 我第一版找 `.ft-group`，可那个类在落地时被删了（行只有 `.ft-row`），
  // 于是报出"0 个组行"的假读数。**别用计划里的类名，用它实际的样子。**
  const isGroup = (r) => !r.dataset.path;
  const groups = rows.filter(isGroup);
  const text = (e) => (e.textContent || "").trim().replace(/\s+/g, " ");
  const open = rows.filter((r) => r.querySelector('.ft-twist[aria-expanded="true"]'));
  return {
    total: rows.length,
    groupRows: groups.length,
    groupLabels: groups.map(text).slice(0, 8),
    plainProbeLeaks: rows
      .filter((r) => !isGroup(r) && /^_probe/i.test(r.dataset.path || ""))
      .map((r) => r.dataset.path),
    openRows: open.length,
    openNames: open.map((r) => (r.dataset.path || "(组行)")).slice(0, 8),
  };
});

if (r.missing) { console.log("★ 找不到文件树"); await browser.close(); process.exit(0); }

console.log(`树里共 ${r.total} 行（其中组行 ${r.groupRows} 行）`);
console.log(`组行：${r.groupLabels.join(" | ") || "（无）"}`);
console.log(`\n★ 原样露着的 _probe* 条目：${r.plainProbeLeaks.length} 个`);
for (const n of r.plainProbeLeaks.slice(0, 10)) console.log("   " + n);
console.log(`\n展开态（twist 朝下）的条目：${r.openRows} 个`);
for (const n of r.openNames) console.log("   " + n);

// 对不上本地量值时，先看清树里到底是哪个目录的内容
const dump = await page.evaluate(() => {
  const tree =
    document.getElementById("workspace-file-tree") ||
    document.querySelector(".files-rail") ||
    document.querySelector(".file-tree");
  const rows = [...tree.querySelectorAll(".ft-row")];
  return {
    head: (tree.querySelector(".ft-empty")?.textContent || "").trim(),
    names: rows.map((r) => r.dataset.path).slice(0, 30),
  };
});
console.log(`\n=== 树里前 30 个路径 ===`);
for (const n of dump.names) console.log("   " + n);
if (dump.head) console.log(`（空态文案：${dump.head}）`);

await browser.close();
