/**
 * Task 3 独立活页复核（方案 A · 计划 1）——计划 4 · Task 5 改写。
 *
 * 为什么由控制者复跑：Task 3 的测试打的是 `railPolicy()` 纯函数，
 * 而"preview 列不再 0×0"的**真正成因在 CSS**（特异性并列、谁在后面谁赢）。
 * 纯函数绿不等于屏幕上绿——所以这条必须真浏览器量。
 *
 * 原版红了，四处（Task 5 实测）：
 *   ① `--rail-tree-w` / `--rail-preview-w` CSS 变量已随 split 删除 → 恒空。
 *   ② `.files-rail` 树选择器已死（树现在挂 `#workspace-file-tree`）→ 树量恒 null。
 *   ③ 它的前提"preview 列常在"没了——新世界面按需召出，没召出时 preview 槽
 *      在每个档都 0×0（原版四个档全亮 0，但那是设计，不是缺陷）。
 *   ④ boot 会自动恢复本 run 的产物画布（hash → /artifact/...），面直接被抬到
 *      preview——"量常态"的测法本身不成立，且第一次同键点击会把列收掉并
 *      把 collapsed 写进偏好、污染后续档位。
 *
 * 改写后问的是 Task 3 同一问的新形状：**"一次一只"的 CSS 在真屏幕上成不成立**，
 * 每档走同一串真点击：同键收 → 同键开 → 切树面，三次都以可见性断言（槽的
 * computed display / 几何，不是 DOM 在不在）。
 *
 * ★ 修复轮 1（Task 5 实测第二遍，原版还红）：上一版声称"init 每档重置偏好，
 *   档位之间互不污染"——**那句话是假的**：`page.goto` 到**同一个 hash** 是
 *   同文档导航，init 脚本**不重跑**，会话内状态（当前面 / 收起 /
 *   railOpenedThisSession）**跨档残留** ⇒ 第二档起「① 同键收」点到的其实是
 *   「异键换面」，量到 322px 而不是 40px。实测症状：**只有第一档（1920）绿**，
 *   1600/1440/1100 三档全假红（★ 报的是"同键收没生效"，实际是探针自己的状态泄漏）。
 *   ⇒ 每档先回 `${BASE}/`（换文档 ⇒ 重跑 init、清会话标记）再进 run；并把起点
 *   归一到「面=preview 且开着」——① 的语义是"同键收"，**必须从开着的列点起**
 *   （计划硬约束三；否则关着时点同键是"开"，量不出收）。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
// 必须开一条**有内容的 run**：欢迎页的右列是内容驱动收起的（二轮定的规矩），
// 在 `#/` 上量右列只会量到 0——第一版探针就踩了这个。
const RUN = process.env.AUDIT_RUN ?? "3221e432-9dda-42e0-b15f-377200ce96cf";
let RUN_ID = RUN;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => {
  try {
    localStorage.setItem("agent.ui.pref.onboardingDone", "1");
    // 召出钮 Code 脸才齐（Work 脸只有一只树钮）——预览钮必须钉 Code 脸才点得到。
    localStorage.setItem("agent.ui.pref.workspaceFace", "code");
    // ★ 每次导航都重置偏好：档位之间互不污染（上一次的同键收起会写 collapsed=true，
    // 原版第二档起全量到 40px 细条）。
    localStorage.setItem("agent.ui.pref.rightRail",
      JSON.stringify({ fraction: 0.25, surface: "tree", collapsed: false }));
  } catch {}
});
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
RUN_ID = await page.evaluate(async (prefix) => {
  const list = await (await fetch("/api/runs")).json();
  const hit = list.find((r) => r.runId.startsWith(prefix)) ?? list[0];
  return hit ? hit.runId : null;
}, RUN);
console.log("靶 run:", RUN_ID);

const probe = `(() => {
  const rail = document.getElementById("right-rail");
  if (!rail) return { missing: true };
  const tree = document.getElementById("workspace-file-tree") || document.querySelector(".file-tree");
  const prev = document.getElementById("right-rail-preview");
  const b = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(e).display }; };
  return {
    layout: rail.dataset.layout, mode: rail.dataset.mode, collapsed: rail.dataset.collapsed,
    surface: rail.dataset.surface, railW: Math.round(rail.getBoundingClientRect().width),
    tree: b(tree), preview: b(prev),
    treeRows: tree ? tree.querySelectorAll(".ft-row").length : null,
  };
})()`;

const openPreview = (s) => s.collapsed === "false" && s.preview && s.preview.w > 0 && s.preview.display !== "none";
const openTree = (s) => s.collapsed === "false" && s.tree && s.tree.w > 0 && s.tree.display !== "none";
const previewGone = (s) => !s.preview || s.preview.w === 0 || s.preview.display === "none";
const treeGone = (s) => !s.tree || s.tree.w === 0 || s.tree.display === "none";

console.log("档位 | layout | mode | 右列 | ①同键收 | ②同键开 | ③切树面");
let allOk = true;
for (const w of [1920, 1600, 1440, 1100]) {
  await page.setViewportSize({ width: w, height: 900 });
  // ★ 换文档重置（修复轮 1）：先回 `${BASE}/` 再进 run。直接 `goto` 到同一个
  //   hash 是同文档导航、init 不重跑 ⇒ 上一档的面/收起态会残留，本档的
  //   「同键收」就变成了「异键换面」。
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.evaluate((id) => { location.hash = `#/run/${id}`; }, RUN_ID);
  await page.waitForTimeout(4500);
  // 起点归一：① 是"同键**收**"，必须**从开着的列点起**。boot 通常已由产物画布
  // 自动抬到 preview；万一没有，这里点一次把它开出来（那是开/换面，不是收）。
  const a0 = await page.evaluate(probe);
  if (!a0.missing && !openPreview(a0)) {
    await page.click("#rail-surface-preview", { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const a = await page.evaluate(probe);
  if (a.missing) { console.log(`${w}: 无右列`); allOk = false; continue; }
  const row = `${String(w).padStart(4)} | ${String(a.layout).padEnd(8)} | ${String(a.mode).padEnd(7)} | ${String(a.railW).padStart(4)}`;
  // boot 会自动恢复产物画布 → 面已是 preview 且开着（Task 5 实测）。从这里点同键 = 收。
  let b = null, c = null, d = null;
  try {
    await page.click("#rail-surface-preview", { timeout: 4000 });
    await page.waitForTimeout(1000);
    b = await page.evaluate(probe);
    await page.click("#rail-surface-preview", { timeout: 4000 });
    await page.waitForTimeout(1000);
    c = await page.evaluate(probe);
    // 切树面：Code 脸的树钮在 ⋮ 菜单里（Work 脸直挂的那只 Code 脸 display:none）
    await page.click("#rail-surface-more", { timeout: 4000 });
    await page.waitForTimeout(400);
    await page.click(".rail-more-item[data-rail-surface='tree']", { timeout: 4000 });
    await page.waitForTimeout(1000);
    d = await page.evaluate(probe);
  } catch (e) {
    console.log(`${row} | 点击失败 ${String(e).split("\n")[0].slice(0, 50)}`);
    allOk = false;
    continue;
  }
  const r1 = b?.collapsed === "true";
  const r2 = openPreview(c);
  const r3 = openTree(d) && previewGone(d);
  allOk = allOk && r1 && r2 && r3;
  console.log(`${row} | ${r1 ? "✅" : "★"}(${b?.railW}px) | ${r2 ? "✅" : "★"}(${c?.preview ? c.preview.w + "px" + c.preview.display : "—"}) | ${r3 ? "✅" : "★"}(树${d?.tree ? d.tree.w + "px" + d.tree.display : "—"} 预览${d?.preview ? d.preview.w + "px" + d.preview.display : "—"})`);
}
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto(`${BASE}/#/run/${RUN_ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);
await page.click("#rail-surface-more", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(400);
await page.click(".rail-more-item[data-rail-surface='tree']", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, "verify-task3-rail-surfaces-1600.png"), fullPage: false });
console.log("截图落 eval/persona-ux/_verify-shots/verify-task3-rail-surfaces-1600.png（gitignored）");
console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
console.log(allOk ? "\n✅ 四个档的同键收/同键开/切树面全部以可见性成立" : "\n★ 有档没达标——看上面哪一列红");
process.exitCode = allOk ? 0 : 1;
