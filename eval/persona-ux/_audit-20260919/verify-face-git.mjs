/**
 * 两脸 git 差异的**端到端**复核（计划 2 任务 1）。
 *
 * 计划 1 的 Task 4 只做到「摘掉 hidden 后 display 翻转正确」——那是规则
 * 内容的证据，不是触发路径的证据。宿主上所有 workdir 都不是 git 仓库，
 * 所以 `root.hidden = !present`（workspace-git.js:192）恒为 hidden。
 * 本探针拿 scripts/git-fixture.mjs 造出来的真仓库，走真实路径。
 *
 * 与 brief 探针的四处偏差（理由见 task-1-report.md）：
 *  1) ① 挪到「添加」之后：/api/workspace/git 对白名单外的 workdir 返 403，
 *     添加前问 ① 只会拿到 403——先打一次「加之前 → 403」当白名单门的
 *     证据，添加后再读 ① 拿真数据。
 *  2) 目录加入白名单走**真实用户路径**：工作目录菜单 →「＋ 添加目录…」浮层
 *     → 粘贴绝对路径 → 前往 → 选这个目录。brief 里直接改 #workdir-select
 *     是猜的——它是 sr-only 的提交事实源，真 UI 是自定义菜单与浮层，
 *     直接 set value + change 不会触发宿主接线。
 *  3) 判据按**用户可见口径**（computed display）：Work 脸 display:none、
 *     Code 脸 display:flex。hidden 属性只表达 git 数据有无（有仓库时两脸
 *     都该是 false），不随脸走——brief 的 `work.hidden===true` 表达式会
 *     给出永久的假阴性「没走通」。
 *  4) 点菜单前先展开 composer scope：折叠的 scope 仍渲染 scopebar
 *     （styles.css 里 author display:flex 压过 UA hidden），被透明
 *     TEXTAREA#task-input 整个盖住——真实用户同样必须先展开才点得到。
 *     这是真机缺陷（计划 3 材料），探针如实按用户路径走。
 *
 * ★ 计划 4 · T5 修：② 那段原来只把夹具钉成 **Code 脸**的主目录（加目录的流程也只在
 *   进循环前跑一次）⇒ 工作目录是**按项目/脸**记的（index.html `project.workdirs`），
 *   夹具只进了 Code 脸那份 ⇒ Work 脸菜单里根本没有夹具行、主目录仍不是仓库 ⇒
 *   芯片 `hidden=true` ⇒ 判据里的 `work.hidden===false` 假红。
 *   修法是**每张脸上各走一遍真实路径**（ensureFixtureOnFace），不是为了凑绿：
 *   不修的话 Work 脸"看不见芯片"可以归因于"没仓库"，而这条判据要证的正是
 *   **脸规则**在起作用——两脸 hidden 都是 false、唯一剩下的差异才是脸。
 *   原判据的意图是对的，缺的是前置。
 *
 * 注：路径默认取仓库根的 `.git-fixture/git-repo`（缺了就自己跑脚本造，见下），
 * 也可用 FIXTURE_DIR 指到别处。page.fill 输入反斜杠无损
 *（诊断早期曾误判 fill 剥离反斜杠，实为诊断脚本自身被 shell 转义层
 * 吃掉反斜杠，与本应用无关）。
 * 另：浮层打开时异步加载起点目录并回写输入框（workdir-picker.js:651），
 * 探针先等回写落地再贴路径（真实用户先看到列表再贴），否则输入会被
 * 覆盖、前往去旧目录——这是应用侧的真实竞态（计划 3 材料），探针只绕开。
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";

/**
 * ★ 计划 4 · T5 修：原来 FIXTURE_DIR 不给就直接 throw（退出 1）。
 * 后果是**批量跑必然红**，而红的原因与产品毫无关系（"你没给我传环境变量"）——
 * 这恰恰是本任务要清掉的那一类假红：探针不该把"我没被喂参数"报成"应用坏了"，
 * 那会让下一个看红名单的人去查一个不存在的产品缺陷。
 * ⇒ 不给就**自己造**：默认路径 `.git-fixture/git-repo`（已在 .gitignore 里），
 *   不完整就跑 scripts/git-fixture.mjs（幂等；脚本自带哨兵，不认的目录拒删）。
 *   显式传了 FIXTURE_DIR 但那儿不是夹具 ⇒ 仍然是**大声报错**（调用方的错，别替他猜）。
 */
const FIXTURE_ENV = process.env.FIXTURE_DIR ?? "";
const FIXTURE = FIXTURE_ENV || join(ROOT, ".git-fixture", "git-repo");
const fixtureReady = () =>
  existsSync(join(FIXTURE, ".git")) && existsSync(join(FIXTURE, ".git-fixture-sentinel"));
if (!fixtureReady()) {
  if (FIXTURE_ENV) {
    throw new Error(`FIXTURE_DIR 指到 ${FIXTURE}，但那儿不是夹具（缺 .git 或哨兵文件）——请先跑 node scripts/git-fixture.mjs`);
  }
  console.log(`夹具不完备（${FIXTURE}）→ 现跑 scripts/git-fixture.mjs 造一个`);
  execFileSync(process.execPath, [join(ROOT, "scripts", "git-fixture.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (!fixtureReady()) throw new Error(`夹具造不出来：${FIXTURE} 仍不是 git 仓库`);
}
console.log(`夹具：${FIXTURE}（${FIXTURE_ENV ? "FIXTURE_DIR 指定" : "默认位置"}）`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

/**
 * ★ 计划 4 · T5 前置：让夹具在**两脸都可见**。
 *
 * 工作目录的可见性是**从 run 推出来的**（app.js `inferWorkdirFace` / `workdirVisibleOnFace`）：
 * 某个目录只被 code 脸的 run 用过 ⇒ 它**只在 Code 脸的菜单里**出现（实测 Work 脸菜单
 * 11 行、Code 脸 15 行，差的就是它）；两脸都用过（或都没用过）⇒ 推成 `null` ⇒ 两脸都可见。
 * 夹具此前只被 code 的 run 用过 ⇒ Work 脸菜单里根本没有夹具行 ⇒ 在 Work 脸上无论怎么
 * 走「＋ 添加目录…」，`onAdded` 里那句 `if (visible.some(...))` 都不成立、主目录切不过去
 * ⇒ 芯片恒 `hidden=true`。
 * ⇒ 起一个 **office 工作区** 的死 run（workdir = 夹具）把这条推平。收尾删掉它。
 */
let officeRunId = null;
try {
  const r = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "audit probe (plan2 t1): face-git office-side sentinel", workdir: FIXTURE, workspace: "office" }),
  });
  officeRunId = r.ok ? ((await r.json()).runId ?? null) : null;
  console.log(`前置：起了 office 工作区的死 run ${officeRunId}（让夹具在两脸都可见）`);
} catch (e) {
  console.log("★ 起 office 死 run 失败：", String(e).slice(0, 140));
}

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);

// 0) 宿主哨兵：静态资源没有 Cache-Control，必须看服务端吐出的字节
const served = await page.evaluate(async () => {
  const t = await (await fetch("/styles.css")).text();
  return {
    hasWork: t.includes('body[data-face="work"] .workspace-git-chip'),
    hasCode: t.includes('body[data-face="code"] .workspace-git-chip'),
  };
});
console.log(`0) 宿主 /styles.css 两脸规则：work=${served.hasWork} code=${served.hasCode}`);
if (!served.hasWork || !served.hasCode) console.log("★★ 宿主没在服务两脸规则——下面全部读数作废");

// 加白名单之前的 ① 口径：目录还不是白名单成员时，git 端点必须 403（白名单门）。
// ★ 首次跑（夹具还没被加过）才能重现 403；夹具已在宿主白名单里时这里是 200，
//   那是"记得住"的正常结果，不是判据——所以只打印，不拦。
const before = await page.evaluate(async (wd) => {
  const r = await fetch(`/api/workspace/git?workdir=${encodeURIComponent(wd)}`);
  return r.status;
}, FIXTURE);
console.log(`加之前 git 端点 → ${before}${before === 403 ? "（白名单门，首次运行形态）" : "（夹具已在白名单里——403 那条证据只在全新宿主上重现）"}`);

// 展开 composer scope 再开工作目录菜单（见文件头偏差 3）
const openWorkdirMenu = async () => {
  const open = await page.evaluate(() => document.getElementById("composer-scope")?.hasAttribute("open"));
  if (!open) {
    await page.click("#composer-scope > summary");
    await page.waitForSelector("#composer-scope[open]", { timeout: 5000 });
  }
  await page.click("#workdir-trigger");
  await page.waitForSelector("#workdir-menu:not([hidden])", { timeout: 5000 });
};

/**
 * 在**当前这张脸**上把夹具准备好：不在菜单里就走「＋ 添加目录…」真实路径加进去，
 * 已在菜单里但不是主目录就点「改到这里」，最后等 git 芯片读到分支。
 *
 * ★ 计划 4 · T5 修（两处，都是**实测**出来的）：
 *  (1) 原来这个流程只在**进循环之前**跑一次 ⇒ 夹具只被加进当时那张脸的
 *      （按项目记的）工作目录列表 ⇒ **另一张脸的菜单里根本没有夹具行**。
 *      工作目录是**按项目/脸**记的（index.html `project.workdirs`），
 *      不是全局一份 ⇒ 必须在**每张脸上各加一遍**。
 *  (2) 于是 Work 脸的主目录一直是"不是仓库"的目录 ⇒ 芯片 `hidden=true` ⇒
 *      判据里的 `work.hidden===false` 假红。而且这条不修就是**方法论**问题：
 *      Work 脸"看不见芯片"可以归因于"没仓库"，而判据要证的正是**脸规则**在起作用。
 *      两脸 `hidden` 都 false 之后，唯一剩下的差异才是脸。
 *  (3) ★ 再往下追，实测出**真正的机制**（`_verify-shots/diag-face-chip.mjs`）：
 *      **git 芯片跟的是"选中 run 的 workdir"，不是这张脸的"主目录"**——
 *      导航到一场 workdir=夹具 的 run 后，两脸立刻都读到 `feat/fixture-branch`、
 *      `hidden` 都为 false，只剩 `display` 不同。所以 (1)(2) 这套"改脸的菜单主目录"
 *      能让**工作目录选择器**这条真路走通（那本身就是活页证据），但**它不驱动芯片**；
 *      芯片要对，必须**选一场 workdir=夹具 的 run**。⇒ 调用点先选哨兵 run（并自检
 *      读到了夹具分支），每脸走完真路后再把选中 run 钉回哨兵 run，读数才算数。
 */
async function ensureFixtureOnFace(label) {
  let st = { rowCount: 0, has: null, isPrimary: null };
  try {
    await openWorkdirMenu();
    st = await page.evaluate(() => {
      const row = [...document.querySelectorAll("#workdir-menu .wd-option")]
        .find((r) => (r.textContent || "").includes("git-repo"));
      return { rowCount: document.querySelectorAll("#workdir-menu .wd-option").length, has: !!row, isPrimary: row ? row.classList.contains("is-primary") : null };
    });
    console.log(`  ${label} 脸菜单：${st.rowCount} 行 · 有夹具行=${st.has} · 是主目录=${st.isPrimary}`);
    if (!st.has) {
      // 真实用户路径：菜单末项「＋ 添加目录…」→ 目录选择器浮层
      console.log(`  ${label} 脸菜单里没有夹具行 → 走「＋ 添加目录…」真实路径加一遍（工作目录按脸记）`);
      await page.click("#workdir-menu button[data-add]");
      await page.waitForSelector("#workdir-picker-overlay:not([hidden])", { timeout: 5000 });
      // 浮层打开会异步加载起点目录并回写路径输入框（workdir-picker.js:651）——
      // 贴路径必须等这个回写落地，否则输入会被覆盖、前往就去了旧目录。
      // ★ 注意 Playwright 的签名是 waitForFunction(fn, arg, options)：没有 arg 时
      //   必须显式传 undefined，否则 { timeout } 会被当成 arg 吃掉、超时回落 30s
      //   （原来几处就是这么写的，所以失败要等 30 秒才报）。
      await page.waitForFunction(() => {
        const el = document.querySelector("#workdir-picker-overlay .wp-path-input");
        return el && el.value !== "";
      }, undefined, { timeout: 5000 });
      await page.fill("#workdir-picker-overlay .wp-path-input", FIXTURE);
      await page.click("#workdir-picker-overlay .wp-go");
      await page.waitForFunction(() => {
        const crumb = document.querySelector("#workdir-picker-overlay .wp-current .wp-crumb");
        return crumb && crumb.tagName === "BUTTON"; // 面包屑变按钮 = 已下钻到真实目录
      }, undefined, { timeout: 8000 });
      await page.click("#workdir-picker-overlay .wp-choose");
      // 浮层是 hidden 状态收起的——visible 口径等不到，必须用 attached
      await page.waitForSelector("#workdir-picker-overlay[hidden]", { state: "attached", timeout: 8000 });
      st.has = true; // 本次加的
    } else if (st.isPrimary === false) {
      const row = page.locator("#workdir-menu .wd-option").filter({ hasText: "git-repo" }).first();
      await row.locator(".wd-primary-btn").click();
    }
    // ★ 这里**不再等芯片**：芯片跟的是"选中 run 的 workdir"，不跟这张脸的主目录
    //   （见文件头 (3) 与 ②-B）。等一个不会来的读数只会把真路证据也一起拖成红。
    console.log(`  ${label} 脸：目录列表已备好（菜单行=${st.has ? "有" : "无"}，主目录已切到它）`);
  } catch (e) {
    const now = await page.evaluate(() => ({
      face: document.body.dataset.face,
      trigger: document.querySelector("#workspace-git-trigger-text")?.textContent?.trim().slice(0, 40) ?? "（无）",
      chipHidden: document.getElementById("workspace-git-chip")?.hasAttribute("hidden") ?? null,
      pickerOpen: !document.getElementById("workdir-picker-overlay")?.hasAttribute("hidden"),
      menuRows: document.querySelectorAll("#workdir-menu .wd-option").length,
    })).catch(() => null);
    console.log(`  ★ ${label} 脸走工作目录真路失败：`, String(e).slice(0, 160));
    console.log(`     卡住时的现场：${JSON.stringify(now)}`);
  }
  await page.waitForTimeout(600);
  return st;
}

// ① 服务端认不认这个目录：直接问 git 端点（只读 GET）
const git = await page.evaluate(async (wd) => {
  const r = await fetch(`/api/workspace/git?workdir=${encodeURIComponent(wd)}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}, FIXTURE);
console.log(`① /api/workspace/git → ${git.status} ${JSON.stringify(git.body).slice(0, 160)}`);

const probe = `(() => {
  const chip = document.getElementById("workspace-git-chip");
  if (!chip) return { missing: true };
  return {
    face: document.body.dataset.face,
    hidden: chip.hasAttribute("hidden"),
    display: getComputedStyle(chip).display,
    text: (chip.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 48),
  };
})()`;

const FACES = [["Work", "#workspace-face-office"], ["Code", "#workspace-face-code"]];

// ②-A 真路：工作目录选择器（两脸各走一遍）。这一段是**选择器**的活页证据，
//      **不驱动芯片**（见文件头 (3)）⇒ 必须放在选中哨兵 run **之前**：
//      选中 run 之后工作目录触发钮会 disabled（"locator resolved to <button disabled…>" 实测）。
console.log("\n②-A 真路：工作目录选择器加夹具（两脸各一遍）");
const menuEvidence = [];
for (const [label, sel] of FACES) {
  await page.click(sel).catch(() => {});
  await page.waitForTimeout(1200);
  menuEvidence.push({ label, ...(await ensureFixtureOnFace(label)) });
}

// ②-B 真前置：**选一场 workdir = 夹具 的 run** —— 芯片才读到夹具分支。
//   证据链（`_verify-shots/diag-face-chip.mjs`，起哨兵 run 后导航到它）：
//     导航前 work 脸 `hidden=true` 文本「—」
//     导航后 work 脸 `hidden=false`「feat/fixture-branch *」display=none
//     →Code    code 脸 `hidden=false`「feat/fixture-branch *」display=flex
//     →Work    work 脸 `hidden=false`「feat/fixture-branch *」display=none
//   ⇒ git 芯片跟的是**选中 run 的 workdir**，**不是**那张脸的"主目录"。
//   原来本探针只去动"脸的菜单主目录"、从没选过这场 run ⇒ Code 脸的芯片读到
//   仓库自己的 `feat/rail-skeleton` ⇒ 判据里的 `code.text.includes("feat/fixture-branch")`
//   假红（串行批次里实测到那一次）。**探索器不选靶场，灯就指错地方。**
console.log("\n②-B 真前置：选中 workdir=夹具 的哨兵 run");
if (!officeRunId) {
  console.log(`  ★★ 没有哨兵 run（起 run 失败）⇒ 两脸差异无从量起（**不是脸规则破了**）`);
  await browser.close();
  process.exit(1);
}
await page.evaluate((id) => { location.hash = `#/run/${id}`; }, officeRunId);
await page.waitForTimeout(3500);
{
  const pre = await page.evaluate(probe);
  console.log(`  已选中 ${officeRunId} · 芯片「${pre.text}」hidden=${pre.hidden}`);
  if (!String(pre.text).includes("feat/fixture-branch")) {
    console.log(`  ★★ 前置不成立：选中夹具 run 之后芯片仍不是夹具分支 ⇒ 两脸差异无从量起（**不是脸规则破了**）`);
    await browser.close();
    process.exit(1);
  }
}

console.log("\n②-C 真机切脸（Work / Code）：");
const seen = [];
for (const [label, sel] of FACES) {
  await page.click(sel).catch(() => {});
  await page.waitForTimeout(1200);
  const p = await page.evaluate(probe);
  seen.push({ label, ...p });
  console.log(`  ${label.padEnd(5)} data-face=${String(p.face).padEnd(5)} hidden=${String(p.hidden).padEnd(5)} display=${p.display.padEnd(5)} 「${p.text}」`);
}

const work = seen.find((s) => s.label === "Work");
const code = seen.find((s) => s.label === "Code");
// 判据（用户可见口径）：Work 脸 CSS 藏起（display none）、Code 脸显示（flex）；
// `hidden` 属性只随 git 数据**有无**走 ⇒ **前置条件**是两脸都拿到同一份仓库数据
// （②-B 选中 workdir=夹具 的哨兵 run）。
//   不铺这个前置会怎样：Work 脸 `hidden=true`，"藏"就被记在"没仓库"头上、
//   而不是"脸规则"头上——这条判据就**白量**了（这是本探针 (2) 修的那件事）。
//
// ★ 计划 4 · T5 把判据**拆成两半**：`dataAgrees`（前置：两脸拿到的是**同一份**
//   仓库数据、且都非空）与 `faceRule`（要证的脸规则）。不拆的话，前置没铺好时
//   报出来的是一句"脸规则没生效"——**灯指错东西**。拆开之后，前置不成立会单独
//   说清（"两脸的 git 数据不是同一份"），与"脸规则破了"不再互相冒充。
const dataAgrees = !!work && !!code
  && work.hidden === false && code.hidden === false
  && String(work.text).includes("feat/fixture-branch")
  && String(code.text).includes("feat/fixture-branch");
const faceRule = !!work && !!code && work.display === "none" && code.display === "flex";
const ok = dataAgrees && faceRule;
console.log(`\n前置（两脸同一份仓库数据、都非空）：Work「${work?.text ?? "?"}」/ Code「${code?.text ?? "?"}」→ ${dataAgrees ? "✅ 成立" : "★★ 不成立——这条判据无从量起，别把它读成'脸规则破了'"}`);
console.log(`真路（工作目录选择器）旁证：${menuEvidence.map((m) => `${m.label} 菜单 ${m.rowCount} 行/有夹具行=${m.has}/是主目录=${m.isPrimary}`).join(" · ")}（②-A，**不驱动芯片**，见文件头 (3)）`);
console.log(`判据：有仓库时 Work 藏（none）、Code 显（flex），两脸 hidden 属性都=false → ${ok ? "✅ 真的走过一遍了" : "★★ 没走通，看上面"}`);
if (!ok) process.exitCode = 1; // 自动化要能机械检出失败，别只靠人眼看输出
console.log("控制台错误：", errs.length ? errs.slice(0, 5) : "零");

// 收尾：只删本探针起的那个 office 哨兵 run（别碰别人的）
if (officeRunId) {
  try {
    const del = await fetch(`${BASE}/api/runs/${officeRunId}`, { method: "DELETE" });
    const after = await (await fetch(`${BASE}/api/runs`)).json();
    const gone = !after.some((r) => r.runId === officeRunId);
    console.log(`清理 office 哨兵 run ${officeRunId}：DELETE ${del.status} · 已从列表消失=${gone}`);
  } catch (e) {
    console.log(`清理 office 哨兵 run 失败：${String(e).slice(0, 120)}`);
  }
}
await browser.close();
