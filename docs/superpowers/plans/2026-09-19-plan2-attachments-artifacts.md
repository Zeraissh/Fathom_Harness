# 计划 2 · 附件与产物条 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「附件是输入」与「产物是输出」这两条链补成设计案画的样子——附件有编号可引用、非图附件有 chip、上传有进度与失败出路、大目录靠降噪折叠而不靠滚动；产物那头把**三套互不通气的派生系统收拢成一套视图**，并给长内容补上折叠与留存出口。

**Architecture:** 全部是**现有零件的补齐与收拢**，不新建面、不引入持久化实体。附件继续走「文本行」当传输（**编号 chip 本身就是行内文本**——输入框是 `<textarea>`，塞不进真 DOM chip，这是本计划唯一一处"设计案的字面做不到、按意图改"）；产物继续由事件流派生，三套系统收拢在**一个真值源**上，「保存为产物」= 往 run 的事件日志追加一条事件（**日志本来就持久化**，零新实体）。

**Tech Stack:** 原生 ESM（`ui/public/*.js`，无构建步）、纯 CSS、vitest + jsdom、Playwright 做活页验收。

**Spec（设计案，逐屏拍板的那一份）:**
- `.superpowers/brainstorm/198-1789817065/content/states-A-attachments.html`（A 簇 6 态）
- `.superpowers/brainstorm/198-1789817065/content/states-B-richcontent.html`（B 簇 8 态）
- `.superpowers/brainstorm/198-1789817065/content/scheme-a-work-3states.html` / `scheme-a-code-3states.html`（骨架与两脸）
- 调研依据：`eval/persona-ux/_audit-20260919/RESEARCH-AGENT-UI.md`
- **代码现状（本计划的地基）**：`.superpowers/plan2-grounding/`（**已 gitignore 的草稿区**）——`plan2-survey.md`（16 问，全部带 file:line 与它执行的 grep 模式）+ 四份逐字摘录 `plan2-excerpts-{attach,tree,artifacts,markdown}.md`。
  **它们快照于 `main@16383ca`，会过期——仓库才是真值。** 用途是让写计划的人（和读计划的你）不必从零 grep；**实现者应当直接读仓库里的文件**，别把摘录当权威。

**前一份计划**：`docs/superpowers/plans/2026-09-19-scheme-a-skeleton.md`（计划 1，已落地于 `main`）。本计划**承接它的骨架**，不重做。

---

## Global Constraints

计划 1 的全部约束继续有效，**另加五条从计划 1 的教训里长出来的**（计划 1 里我写下了四处与代码不符的话，全靠实现者与审查者抓出来）。

### 从计划 1 继承

- **正文度量用 `em` 不用 `ch`**。一个中文全角字 ≈ 1em；`ch` 是拉丁"0"的宽度，对中文不对口。度量常量只写一处：`:root { --measure: 40em }`。
- **CSS 变量：引用的必须定义过**。`ui-app.test.ts` 有一条硬门，新变量必须同时在 `:root` 有默认值，否则测试当场红。
- **禁用 unicode dingbat 做状态图标**（`✻ ✽ ✢ ∙ ◆ ○ ✓ ✕ ■`）：Windows 下字体回落不一致。状态点一律用 CSS 画的形状。
- **两脸的差异只收在 `body[data-face="work|code"]` 一个属性上**，不许在别处再判断"现在是哪张脸"。（注意：`data-workspace-face` 与两处 `designModeActive = workspaceFace === "office"` **尚未迁移**，见计划 3。）
- **中文文案**：界面文案全中文；代码注释中文。
- **每个任务结束必须提交**，commit message 用 `type(scope): 中文描述`（本仓既有格式），结尾带 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **不许改 `eval/persona-ux/**`**——那是档案。

### 计划 1 的教训（**每一条都有对应的实战事故**）

- **CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁。** 计划 1 里我把元素 id 当成类写进选择器（规则空转）、又只锁了 CSS 文本没锁 markup（删掉那个类，303 条测试全绿而 bug 复活）。
- **断言要锁"接线表达式本身"，不是"这一带出现过这个名字"。** 一句注释喂得饱 `toContain`——计划 1 里 `index.html:2349` 的注释就让"真的读到 verifyToggle"这条锁形同虚设（只删接线、留注释，14/14 全绿）。
- **★ "使用"与"引入"是两件事，接线锁两半都要。**（2026-09-19 的实战，比上面那条更隐蔽）
  `stripAttachmentLine` 是 Task 2 加进 `index.html` 的，**而它连着三笔提交都没有 import**——点"删除附件"必然 `ReferenceError`。中间过了**六道关**：实现者、变异验红、任务审查（判 Spec ✅ / Approved）、控制者独立核实、两轮 fix round 与两轮定向复查，**全绿而它是坏的**；最后是活页探针**真去点了一下删除**才现形。
  **为什么锁全绿**：源码文本锁证明的是"这个名字在文件里出现过"——而**用了却忘了 import，文件里当然出现过那个名字**。锁住"调用"不等于锁住"引入"。
  **规矩**：凡在壳里新增一个来自 `app.js` 的调用，**必须同时有一条能红的锁**。`test/ui-shell-imports.test.ts` 是这条规矩的通用护栏（app.js 的每个导出名，只要在壳里以「名字(」被调用，就必须在壳的 import 列表里）；**它自身也要变异验红过**（去掉一个 import 看它点名）。
  **更深一层的教训**：这条缝**只有在"有人真去点"时才现形**，而当天六道关里**没有一道真的跑过浏览器**。这不是"再加一条断言"能覆盖的——**该记的是"纯函数绿 + 接线锁绿"不等于"这条路走得通"**。
- **改了测试/断言必须变异验红：把被锁的那行删掉，看它红不红，再还原。** 写完直接绿什么都不证明。这条对本计划里**每一个**"加锁"步骤都适用。
- **行尾与内容核验用字节，不用 `git status`。** 本仓无 `.gitattributes` 而 `core.autocrlf=true`——索引存 LF、检出转 CRLF，工作树是 CRLF 还是 LF，`git status` **一律显示干净**。核对脚本：`node eval/persona-ux/_audit-20260919/check-eol.mjs [文件…]`。
- **★ 行尾漂了怎么修（不显然，别踩空）**：`git checkout HEAD -- <path>` **修不好它**——git 的 stat 缓存认为该文件没变（归一化后内容相同），**会跳过写入**，你跑完以为修好了、其实一个字都没动。
  **正解是先删再 checkout**：
  ```bash
  rm -f <path> && git checkout HEAD -- <path>
  ```
  **为什么会漂**：任何把整个文件重写一遍的工具（`sed -i`、某些编辑器、**包括编辑类工具的整文件写回**）都可能把 CRLF 写成 LF。所以改完文件顺手跑一次 `check-eol.mjs`，别等出问题才查。
- **计划正文里的每个 `file:line` 锚点都必须来自真实读取。** 本计划的锚点全部取自 `.superpowers/plan2-grounding/` 里的勘查与**四份逐字摘录**；**落笔时若摘录与计划正文不符，以仓库为准并回写勘误**。
- **别用 `git worktree` 建测试基线做跨目录对比**：本仓的 `cli-*` 是 spawn 活页测试，换目录行为就变，差异会被误读成"我修好了/我弄坏了"。

### 本计划新增的设计纪律

- **零依赖渲染链不许破**。`ui/public/core/markdown.js` 与 `core/highlight.js` 是**手写零依赖**的（无 marked/hljs/prism/shiki，注释里写明了为什么不引库）。**KaTeX 是唯一允许的外部渲染依赖**（走 `/vendor/katex` 白名单挂载）。本计划**不引入任何新的渲染依赖**。
- **不引入持久化的产物实体**。产物继续由事件流派生；「保存为产物」= 往 run 事件日志追加一条事件。
- **附件的传输格式不许破坏向后兼容**。`附件：<路径>` 是历史会话里已有的格式，`ATTACH_CAPTURE_RE` 的扩展必须**同时认旧格式**。
- **产物的三套系统收拢到一个真值源上**，不许造第四套。

### 关于 `eval/persona-ux/**` 的口径修正（计划 1 的约束在这里不够精确）

计划 1 写的是"不许改 `eval/persona-ux/**`——那是档案"。但本计划自己要产出验收探针，而 `_audit-20260919/` 正是本工作流的目录（计划 1 的探针已经落在那里）。精确口径：

- **不许改** `eval/persona-ux/_audit-20260915/**`、`eval/persona-ux/walks/**`、以及 `_audit-20260919/` 里**已有的**报告与探针。
- **可以新增**本计划自己的探针到 `eval/persona-ux/_audit-20260919/`。

---

## 文件结构

| 文件 | 职责 | 本计划里怎么动 |
|---|---|---|
| `scripts/git-fixture.mjs` | **新建**：造/刷新一个 git 支撑的 scratch 工作目录（幂等） | 任务 1 |
| `ui/public/index.html` | 壳 + 内联控制器 | 任务 2/3/5/6：附件序号与 chip、上传进度/失败/重试、长内容折叠与出口、产物条收拢 |
| `ui/public/app.js` | 派生层（纯函数）+ DOM 补丁 | 任务 2/5/6：`parseAttachmentLine` / `stripAttachmentLine` / `attachmentRefsOf`、折叠派生、产物真值源 |
| `ui/public/features/file-tree.js` | 文件树 | 任务 4：按类型折叠、Expand/Collapse All、展开态持久化 |
| `ui/workspace-files.ts` | 树的数据侧（排除/排序/深度） | 任务 4：**只读**——本计划不改排除规则（见 Global Constraints 口径 3） |
| `ui/public/features/artifacts.js` | 产物画廊视图 | 任务 6：改读统一真值源 |
| `ui/public/styles.css` | 全部样式 | 每个任务都会碰 |
| `test/ui-attachments.test.ts` | **新建**：附件的纯函数层锁 | 任务 2/3 |
| `test/ui-layout.test.ts` | 计划 1 的骨架锁 | 任务 4/5 追加 |
| `test/ui-artifacts*.test.ts` | 产物画廊与画布既有锁 | 任务 6 追加 |
| `eval/persona-ux/_audit-20260919/verify-*.mjs` | **新增**：本计划的活页验收探针 | 任务 1/2/3/4/5/6 |

---

### Task 1: git 支撑的 workdir 夹具（把计划 1 那个未闭合的口子补上）

**Files:**
- Create: `scripts/git-fixture.mjs`
- Create: `eval/persona-ux/_audit-20260919/verify-face-git.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `scripts/git-fixture.mjs` —— 幂等地造一个 git 仓库 scratch 目录并打印其绝对路径；后续计划 3（Code 脸 git/PR 面）**全部依赖它**

**背景（这是计划 1 留下的一条真实缺口，不是新需求）：**
计划 1 的 Task 4 把两脸差异收在 `body[data-face]` 上，其中一条是 git 芯片在 Work 脸藏起。终审与复查都确认：**规则内容正确、`data-face` 接线端到端正确，但"规则的触发路径"从未被真实走过**——因为宿主 4201 的 workdir 白名单三处（`web-a` / `web-b` / `C:\Users\rk302\Fathom`）**全部 `present: false`**，芯片恒 `hidden`，两脸差异在真机上不可观测。终审据此把它**升格为计划 2 的入场条件**，并把「git 支撑的 scratch workdir 夹具」列进 Recommendations 第 2 条。

- [ ] **Step 1: 写夹具脚本**

新建 `scripts/git-fixture.mjs`：

```js
/**
 * 造一个 **git 支撑的 scratch 工作目录**（计划 2 任务 1）。
 *
 * 为什么需要它：计划 1 把两脸差异收在 `body[data-face]` 上，其中一条是
 * 「git 芯片在 Work 脸藏起」。那条规则的**内容**验过了（摘掉 hidden 后
 * none/flex 翻转正确），**接线**也端到端验过了，但**触发路径一次都没被
 * 真实走过**——宿主上所有 workdir 都不是仓库，芯片恒 hidden。
 *
 * 这不是缺陷（无仓库本就不该显示 git 芯片），但它是"测试绿、CSS 对、
 * 而真实路径从未被执行"的典型，而 Code 脸整族差异（分支、脏状态、PR）
 * 全都要靠这条路径。所以先造一个真的仓库出来。
 *
 * 幂等：重复跑会先清掉再重建，绝不留下半截状态。
 * **重建前先验哨兵**；不认识这个目录就拒跑（见下面那段）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? join(process.cwd(), ".git-fixture");
const dir = join(root, "git-repo");

/** 哨兵：只有它存在，才允许本脚本整目录重建。 */
const SENTINEL = ".git-fixture-sentinel";

const git = (...args) =>
  execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

/**
 * 删之前先证明"这是我们自己的目录"（★ review 的 Important，见勘误）。
 *
 * 脚本头注写的是"造 scratch 目录"，但**误传真实项目路径完全可能**，
 * 而下一行是 `rmSync(recursive, force)`——`<root>/git-repo` 这种名字
 * 在 monorepo 包名、教学目录、别人的脚手架里都很常见。**删错一次不可逆**，
 * 所以宁可拒跑，也不替人决定。
 */
if (existsSync(dir) && !existsSync(join(dir, SENTINEL))) {
  console.error(
    `拒绝运行：${dir}\n` +
      `它已经存在，但没有本夹具的哨兵文件 ${SENTINEL}——看起来不是这个脚本造的。\n` +
      `删掉它可能是不可逆的数据损失，所以不替你决定。\n` +
      `确认它确实可以删的话，手动删掉再跑一次。`,
  );
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "src"), { recursive: true });
writeFileSync(join(dir, SENTINEL), "scripts/git-fixture.mjs 的哨兵：有这个文件才允许本脚本整目录重建。\n");

git("init", "-q");
git("config", "user.email", "fixture@example.invalid");
git("config", "user.name", "Fixture");
git("config", "commit.gpgsign", "false");

writeFileSync(join(dir, "README.md"), "# fixture\n\n这不是给人看的目录，是两脸/PR 差异的活页夹具。\n");
writeFileSync(join(dir, "src", "app.js"), "export const answer = 42;\n");
git("add", "-A");
git("commit", "-q", "-m", "chore: 夹具初版");

// 造出「有未提交改动」与「有未跟踪文件」两种状态——git 芯片要显示的就是它们
writeFileSync(join(dir, "src", "app.js"), "export const answer = 43;\n");
writeFileSync(join(dir, "src", "new-file.js"), "export const fresh = true;\n");
git("checkout", "-q", "-b", "feat/fixture-branch");

console.log(dir);
```

> **落点说明**：`git init` 出来的目录默认在仓库根的 `.git-fixture/` 下。**它必须加进 `.gitignore`**（否则夹具里的 git 仓库会以未跟踪目录的形式出现在本仓 status 里）——Step 2 一并做。

> **★ 勘误（Task 1 review 的 Important · 已回写）**：本计划初稿的脚本是 `rmSync(dir, {recursive:true, force:true})` **零护栏**——脚本头注写着"造 scratch 目录"，**误传真实项目路径完全可能**，而 `<root>/git-repo` 这种名字在 monorepo 包名、教学目录里都常见，**删错一次不可逆**。
> 上面已经补上**哨兵判据**：目录不存在、或带着 `.git-fixture-sentinel` 才允许重建，否则**拒跑并退出码非 0**。
> **这条是计划作者（我）写下的脚本**，实现者只是忠实执行——但它会被**计划 3 反复复用**，所以在计划正文里就得是对的。
> **验证要求（写进 Step 3/5）**：除了正常路跑通，**还必须真造一个不含哨兵的假 `<root>/git-repo`，跑脚本，确认它拒跑且那个目录一个字节都没动**。护栏没验过就不算护栏。

- [ ] **Step 2: 把它挡在版本控制之外**

在 `.gitignore` 末尾追加：

```
# 计划 2 任务 1：两脸/PR 差异的活页夹具（脚本 scripts/git-fixture.mjs 生成）
.git-fixture/
```

- [ ] **Step 3: 跑一次，确认它真的造出仓库**

Run: `node scripts/git-fixture.mjs && git -C .git-fixture/git-repo status --short && git -C .git-fixture/git-repo branch --show-current`

Expected: 打印出夹具绝对路径；`status --short` 显示 ` M src/app.js` 与 `?? src/new-file.js`；分支名 `feat/fixture-branch`。

- [ ] **Step 4: 写活页探针**

新建 `eval/persona-ux/_audit-20260919/verify-face-git.mjs`。它要**把计划 1 那条从未被走过的路径真正走一遍**：

```js
/**
 * 两脸 git 差异的**端到端**复核（计划 2 任务 1）。
 *
 * 计划 1 的 Task 4 只做到「摘掉 hidden 后 display 翻转正确」——那是规则
 * 内容的证据，不是触发路径的证据。宿主上所有 workdir 都不是 git 仓库，
 * 所以 `root.hidden = !present`（workspace-git.js:192）恒为 hidden。
 * 本探针拿 scripts/git-fixture.mjs 造出来的真仓库，走真实路径。
 *
 * 前置：宿主必须把夹具目录放进 workdir 白名单。本探针**自己驱动 UI 添加**
 * （「＋ 添加目录…」那条真实用户路径），不要求人工预配。
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const FIXTURE = process.env.FIXTURE_DIR ?? "";
if (!FIXTURE) throw new Error("先跑 `node scripts/git-fixture.mjs`，把它打印的路径用 FIXTURE_DIR 传进来");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);

// ① 服务端认不认这个目录：直接问 git 端点（只读 GET）
const git = await page.evaluate(async (wd) => {
  const r = await fetch(`/api/workspace/git?workdir=${encodeURIComponent(wd)}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}, FIXTURE);
console.log(`① /api/workspace/git → ${git.status} ${JSON.stringify(git.body).slice(0, 160)}`);

// ② 真实路径：把夹具选成工作目录，量芯片在两张脸下的可见性
await page.evaluate((wd) => {
  const sel = document.getElementById("workdir-select");
  if (!sel) return;
  // 目录选择器是自定义控件；这里用它的原生 select（若存在）走真实 change
  sel.value = wd;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}, FIXTURE);
await page.waitForTimeout(2500);

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

console.log("\n② 真机路径（Work 脸 / Code 脸）：");
const seen = [];
for (const [label, sel] of [["Work", "#workspace-face-office"], ["Code", "#workspace-face-code"]]) {
  await page.click(sel).catch(() => {});
  await page.waitForTimeout(1200);
  const p = await page.evaluate(probe);
  seen.push({ label, ...p });
  console.log(`  ${label.padEnd(5)} data-face=${String(p.face).padEnd(5)} hidden=${String(p.hidden).padEnd(5)} display=${p.display.padEnd(5)} 「${p.text}」`);
}

const work = seen.find((s) => s.label === "Work");
const code = seen.find((s) => s.label === "Code");
const ok = work && code && work.hidden === true && code.hidden === false;
console.log(`\n判据：有仓库时 Work 藏、Code 显 → ${ok ? "✅ 真的走过一遍了" : "★★ 没走通，看上面"}`);
console.log("控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();
```

- [ ] **Step 5: 跑探针——这是计划 1 那条缺口的闭合动作**

```bash
node scripts/git-fixture.mjs
```

把打印出的路径加进宿主白名单（UI 的「＋ 添加目录…」，或 `--workdir` 参数），然后：

```bash
FIXTURE_DIR="<上一步打印的路径>" node eval/persona-ux/_audit-20260919/verify-face-git.mjs
```

Expected: ① `present: true` 带分支名 `feat/fixture-branch` 与脏状态；② **Work 脸 `display: none`、Code 脸 `display: flex`**。

> **★ 判据勘误（implementer 落地时抓出，第 8 次"计划文本与代码不符"）**：本计划的初稿把判据写成 `work.hidden === true && code.hidden === false`——**那是恒矛盾的**。`hidden` 由 `root.hidden = !present` 驱动（`workspace-git.js`），**只随 git 数据有无走**：夹具一立，`present` 为真，两张脸的 `hidden` **都是 `false`**。两脸差异只体现在 `display` 上。
> **这个事实我在计划 1 的勘误里亲手写过**（"`[hidden]` 恒胜…量两脸必须摘掉 `hidden` 量"），转身又写了个基于 `hidden` 的判据。
> **落地口径以 `display` 为准**（探针已按此实现并在文件头注明）。

> **若 ② 没走通而 ① 通了**：那说明问题在 UI 那条路径（选中目录的方式、或 `refreshWorkspaceGitChip` 的触发），与本计划无关但**必须报**——那正是"从未被走过"这句话的价值所在。

- [ ] **Step 6: 提交**

```bash
git add scripts/git-fixture.mjs .gitignore eval/persona-ux/_audit-20260919/verify-face-git.mjs
git commit -m "test(ui): 立 git 夹具，把计划 1 那条从未走过的两脸路径真走一遍

终审把「git 支撑的 workdir 夹具」升格成计划 2 的入场条件：宿主上所有
workdir 都不是仓库，两脸 git 规则的内容验过、接线验过，但触发路径
一次都没被执行——测试绿、CSS 对、而真实路径从未跑过。
夹具幂等，探针自己驱动 UI 添加目录，不要求人工预配。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 附件的编号（A1 / A2）

**Files:**
- Modify: `ui/public/app.js`（`:3946-3948` 两个正则；`:4499-4522` `splitUserMessageAttachments`；新增三个纯函数）
- Modify: `ui/public/index.html`（`:4861` `uploaded` 附近；`:4865-4896` `renderUploads`；`:4904-4911` `clearUploads`；`:4921-4950` `removeUploadedFile`；`:4957-5006` `uploadFiles`）
- Test: `test/ui-attachments.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces:
  - `parseAttachmentLine(line: string): {no: number|null, path: string} | null`
  - `stripAttachmentLine(text: string, path: string): string`
  - `splitUserMessageAttachments(text)` 的返回值**新增** `attachmentRefs: {no: number|null, path: string}[]`（`attachments: string[]` **保持不变**，四个既有调用点不受影响）

**背景（一处必须写明的设计取舍）：**
设计案 A1 写的是「粘贴后在光标处插一个**编号 chip**」。但输入框是 `<textarea id="task-input">`（`index.html:365`）——**textarea 里塞不进真的 DOM chip**。所以按**意图**落地：编号是**行内文本**（`Image #1`），视觉在**编号缩略图行**上。

**另一处**：A1 是单张场景、A2 是六张场景。A2 的设计里**并没有**画自动插入——它画的是编号缩略图行 + 用户自己写「这 6 张按顺序 Image #1–#6」。所以本任务**不是**偏离设计，是**分别照 A1 与 A2 落地**：**单张自动在光标处插 `Image #1 `；批量只给编号缩略图，点缩略图才插入**。（批量自动插会在同一个光标点堆出 `Image #1Image #2…`，那是噪音。）

- [ ] **Step 1: 写失败的测试**

新建 `test/ui-attachments.test.ts`：

```ts
// @ts-nocheck
/**
 * 附件的纯函数层（计划 2 · 任务 2）。
 *
 * 附件在架构里是「文本行」——`附件：<路径>`——不是结构化字段。
 * 本任务给它加编号，**但不能破坏历史会话**：旧消息里没有 `#N`，
 * 它们必须照旧解析出来。这一组里那条向后兼容的用例是硬要求。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAttachmentLine,
  stripAttachmentLine,
  splitUserMessageAttachments,
} from "../ui/public/app.js";

describe("parseAttachmentLine：新旧两种附件行", () => {
  it("旧格式（历史会话）：路径在手，编号没有——编一个出来就是假的", () => {
    expect(parseAttachmentLine("附件：uploads/a.png")).toEqual({ no: null, path: "uploads/a.png" });
    expect(parseAttachmentLine("附件: uploads/a.png")).toEqual({ no: null, path: "uploads/a.png" });
  });

  it("新格式：`附件 #3：<路径>`", () => {
    expect(parseAttachmentLine("附件 #3：uploads/pasted-1.png")).toEqual({ no: 3, path: "uploads/pasted-1.png" });
  });

  it("不是附件行就返回 null（别把普通正文吃掉）", () => {
    expect(parseAttachmentLine("看一下 Image #1 里…")).toBeNull();
    expect(parseAttachmentLine("附件列表如下")).toBeNull();
    expect(parseAttachmentLine("")).toBeNull();
  });
});

describe("stripAttachmentLine：按路径删行，两种格式都认", () => {
  it("删掉指向该路径的那一行，别的不动", () => {
    const text = "看一下这个\n附件 #1：uploads/a.png\n其余照旧";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("看一下这个\n其余照旧");
  });

  it("旧格式的行同样删得掉（否则删除附件会留下幽灵行）", () => {
    const text = "看一下这个\n附件：uploads/a.png";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("看一下这个");
  });

  it("路径不同的行不许误删", () => {
    const text = "附件 #1：uploads/a.png\n附件 #2：uploads/ab.png";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("附件 #2：uploads/ab.png");
  });
});

describe("splitUserMessageAttachments：编号进 refs，兼容性进 attachments", () => {
  it("旧消息（无编号）的 attachments 与从前逐字相同——这是向后兼容锁", () => {
    const r = splitUserMessageAttachments("看这个\n附件：uploads/a.png\n附件：uploads/b.png");
    expect(r.attachments).toEqual(["uploads/a.png", "uploads/b.png"]);
    expect(r.attachmentRefs).toEqual([
      { no: null, path: "uploads/a.png" },
      { no: null, path: "uploads/b.png" },
    ]);
  });

  it("新消息带编号；body 保留原行（模型要看到），displayBody 去掉（气泡不重复）", () => {
    const r = splitUserMessageAttachments("看一下 Image #1\n附件 #1：uploads/a.png");
    expect(r.body).toContain("附件 #1：uploads/a.png");
    expect(r.displayBody).toBe("看一下 Image #1");
    expect(r.attachmentRefs).toEqual([{ no: 1, path: "uploads/a.png" }]);
  });

  it("格式放宽之后，`附件列表如下` 这种正文行不许被当成附件行吃掉", () => {
    const r = splitUserMessageAttachments("附件列表如下\n正文");
    expect(r.attachments).toEqual([]);
    expect(r.displayBody).toBe("附件列表如下\n正文");
  });
});

describe("接线锁（计划 1 的教训：锁接线表达式本身，不锁'这一带出现过这个名字'）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("上传写进输入框的是带编号的行", async () => {
    const source = await html();
    expect(source).toMatch(/`附件 #\$\{[^}]+\}：\$\{info\.path\}`/);
  });

  it("删除附件走 stripAttachmentLine（不是自己再写一遍过滤，那样两处会漂移）", async () => {
    const source = await html();
    expect(source).toMatch(/stripAttachmentLine\(/);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run test/ui-attachments.test.ts`

Expected: FAIL —— `parseAttachmentLine is not a function`；接线那两条找不到（正则不匹配）。

> 第三条 `附件列表如下` 那一条现在应该**是绿的**（旧正则 `^附件[：:]` 要求冒号，本来就不吃它）。**它的作用是钉住放宽格式时不许把这个守卫弄丢**——放宽成 `/^附件/` 就会红。这条要留着。

- [ ] **Step 3: 最小实现 —— app.js**

把 `ui/public/app.js:3946-3948` 三条正则改成：

```js
/** 附件行的**形状**判据。新格式带编号（`附件 #3：`），旧格式没有——两种都认。 */
const ATTACH_RE = /^附件(?:\s*#\d+)?[：:]/;
/** 附件行的**捕获**判据。① 编号（旧格式为 undefined）② 路径。 */
const ATTACH_CAPTURE_RE = /^附件(?:\s*#(\d+))?[：:]\s*(.+)$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
```

在 `splitUserMessageAttachments` 之前加三个纯函数：

```js
/**
 * 附件行 → `{ no, path }`；不是附件行返回 null。
 *
 * 认两种格式：`附件：<路径>`（历史会话里的旧格式）与 `附件 #3：<路径>`（A 簇编号）。
 * **旧格式的 `no` 是 null，不补一个顺序号**——历史消息里本来就没有编号，
 * 编一个出来，界面上就会显示一个用户从没见过的数字。
 */
export function parseAttachmentLine(line) {
  const m = String(line ?? "").match(ATTACH_CAPTURE_RE);
  if (!m) return null;
  return { no: m[1] === undefined ? null : Number(m[1]), path: m[2].trim() };
}

/**
 * 从草稿文本里删掉指向某个路径的那条附件行（两种格式都认）。
 *
 * 从前这段逻辑内联在 `removeUploadedFile` 里，只认一种拼法；格式一变，
 * 删除附件就会在输入框里留下一条幽灵行，模型仍然看得见已删的文件。
 */
export function stripAttachmentLine(text, path) {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => {
      const parsed = parseAttachmentLine(line);
      return !(parsed && parsed.path === path);
    })
    .join("\n");
}
```

把 `splitUserMessageAttachments`（`:4499-4522`）改成：

```js
/**
 * 从用户消息里拆出正文与附件行。`body` 仍含附件行（模型看到的原文）；
 * `displayBody` 去掉附件行，给气泡右侧正文用——左侧已经有预览和「附件：」标注。
 *
 * `attachments` 只给路径（**四个既有调用点依赖这个形状，不许改**）；
 * 编号另走 `attachmentRefs`。
 */
export function splitUserMessageAttachments(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  /** @type {string[]} */
  const attachments = [];
  /** @type {{no: number|null, path: string}[]} */
  const attachmentRefs = [];
  /** @type {string[]} */
  const body = [];
  /** @type {string[]} */
  const display = [];
  for (const line of lines) {
    const parsed = parseAttachmentLine(line);
    if (parsed) {
      attachments.push(parsed.path);
      attachmentRefs.push(parsed);
      body.push(line);
    } else {
      body.push(line);
      display.push(line);
    }
  }
  return {
    body: body.join("\n"),
    displayBody: display.join("\n").trim(),
    attachments,
    attachmentRefs,
  };
}
```

> **`ATTACH_RE` 的消费者只有一处**（`app.js:3985` 的 `lines.find((l) => !ATTACH_RE.test(l))`），它靠这条正则跳过附件行找正文——**必须同步放宽，否则新格式的附件行会被当成正文首行**。改完 grep 一遍确认没有别的消费者。

- [ ] **Step 4: 跑测试确认 app.js 那半全绿**

Run: `npx vitest run test/ui-attachments.test.ts`

Expected: 前三组（parse / strip / split）全绿；接线那两条仍红（还没改 index.html）。

- [ ] **Step 5: 最小实现 —— index.html**

**① 序号与重置。** 在 `:4861` 的 `const uploaded = [];` 旁加：

```js
/** 本稿的附件序号（A 簇：编号供按位置引用）。提交清稿时归零——编号是**每稿**的。 */
let attachSeq = 0;
```

`clearUploads()`（`:4904-4911`）开头加一行 `attachSeq = 0;`——**放在那句 `if (uploaded.length === 0) return;` 之前**：用户手动删光附件再提交时，那句会提前返回，编号就永远归不了零。

**② 在光标处插入。** 在 `insertAtCaret` 不存在，新加一个（放在 `renderUploads` 之前）：

```js
/** 在光标处插入一段文本并把光标推到插入内容之后（保持焦点）。 */
function insertAtCaret(el, text) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  el.setRangeText(text, start, el.selectionEnd ?? start, "end");
  el.focus();
}
```

**③ 上传成功处（`:4997-5006`）。** 把 `uploaded.push({...})` 与追加行改成：

```js
      const attachNo = ++attachSeq;
      uploaded.push({
        ...info,
        attachNo,
        // 记住落在哪个工作目录——删除时服务端要按同一个目录验白名单
        workdir: targetWorkdir ?? undefined,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
      // 把路径写进任务描述——模型只有看到路径才知道文件存在。
      // 带上编号：用户正文里写的「Image #2」才与某一条路径对得上。
      const line = `附件 #${attachNo}：${info.path}`;
      taskInput.value = taskInput.value ? `${taskInput.value}\n${line}` : line;
      // 单张才自动插引用；批量只给编号缩略图（A2 的设计）：一次往同一个光标点
      // 堆六条 `Image #N` 是噪音，而"这 6 张按顺序讲一遍"本来就是用户自己写的。
      if (files.length === 1 && file.type.startsWith("image/")) {
        insertAtCaret(taskInput, `Image #${attachNo} `);
      }
```

**④ `renderUploads()`（`:4865-4896`）。** 缩略图带编号、清单行带编号、缩略图可点插入引用：

```js
function renderUploads() {
  if (!uploadList) return;
  const images = uploaded.filter((u) => u.previewUrl && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u.path));
  if (composerMedia) {
    composerMedia.hidden = images.length === 0;
    composerMedia.innerHTML = images
      .map((u) => (
        `<button type="button" class="composer-media-preview" data-upload-cite="${u.attachNo}" ` +
        `title="插入引用 Image #${u.attachNo}" aria-label="插入 Image #${u.attachNo} 的引用">` +
        `<img src="${escapeHtml(u.previewUrl)}" alt="${escapeHtml(u.path)}" />` +
        `<span class="composer-media-no">${u.attachNo ?? ""}</span>` +
        `</button>`
      ))
      .join("");
  }
  composerCompose?.classList.toggle("composer-compose--media", images.length > 0);
  uploadList.hidden = uploaded.length === 0;
  uploadList.innerHTML = uploaded
    .map((u, i) => {
      const name = escapeHtml(u.path);
      // 图片说「Image #N」（用户正文里引用的就是这个词），非图说「附件 #N」
      const tag = u.previewUrl ? `Image #${u.attachNo}` : `附件 #${u.attachNo}`;
      const size = `<span class="knob-hint">${(u.bytes / 1024).toFixed(0)} KB</span>`;
      const previewBtn =
        `<button type="button" class="btn btn--ghost upload-preview" data-upload-preview="${i}" ` +
        `title="预览" aria-label="预览 ${name}">` +
        `<i class="ph ph-eye" aria-hidden="true"></i><span>预览</span></button>`;
      const removeBtn =
        `<button type="button" class="btn btn--ghost upload-remove" data-upload-remove="${i}" ` +
        `title="删除附件" aria-label="删除附件 ${name}">` +
        `<i class="ph ph-x" aria-hidden="true"></i></button>`;
      return `<li class="upload-item"><span class="upload-no">${tag}</span> <code>${name}</code> ${size} ${previewBtn}${removeBtn}</li>`;
    })
    .join("");
}
```

**⑤ `removeUploadedFile`（`:4921-4950`）。** 内联的过滤换成纯函数：

```js
  // 输入框里那条附件行一并删掉，模型才不会看到已删文件。
  // 用纯函数而不是内联过滤：格式有两种，两处各写一遍必然漂移。
  taskInput.value = stripAttachmentLine(taskInput.value, u.path);
```

**⑥ 清单的点击委托（`:5052-5066`）。** 图片缩略图的插入引用与既有的预览/删除共用一个委托：

```js
  uploadList.addEventListener("click", (e) => {
    const removeBtn = e.target instanceof Element ? e.target.closest("[data-upload-remove]") : null;
    if (removeBtn) {
      void removeUploadedFile(Number(removeBtn.getAttribute("data-upload-remove")));
      return;
    }
    const btn = e.target instanceof Element ? e.target.closest("[data-upload-preview]") : null;
    if (!btn) return;
    const u = uploaded[Number(btn.getAttribute("data-upload-preview"))];
    if (u) previewUploadedFile(u);
  });
```

并在 `composerMedia` 上单独挂一个（它是另一棵子树，不在 `uploadList` 里）：

```js
// 点缩略图把「Image #N」插到光标处——A 簇的编号引用就靠这一下
composerMedia?.addEventListener("click", (e) => {
  const btn = e.target instanceof Element ? e.target.closest("[data-upload-cite]") : null;
  if (!btn) return;
  insertAtCaret(taskInput, `Image #${btn.getAttribute("data-upload-cite")} `);
});
```

**⑦ 样式**（`ui/public/styles.css`）。缩略图那个 `button` 要剥掉按钮默认外观（它原来是 `div`）：

```css
/* 编号缩略图：点一下把「Image #N」插进正文（A 簇）。按钮化是为了键盘可达，
   所以外观要还原成裸图。 */
.composer-media-preview {
  position: relative; padding: 0; border: 1px solid var(--border, #ddd);
  border-radius: 4px; background: none; cursor: pointer; line-height: 0;
}
.composer-media-preview:focus-visible { outline: 2px solid var(--accent, #c90); outline-offset: 1px; }
.composer-media-no {
  position: absolute; left: 2px; bottom: 2px; line-height: 1;
  background: rgba(0,0,0,.62); color: #fff; border-radius: 3px;
  padding: 1px 4px; font-size: 10px;
}
.upload-no { color: var(--text-dim, #666); font-size: 11px; }
```

> **CSS 变量门**：本仓 `ui-app.test.ts` 有一条硬门「CSS 变量：引用的必须定义过」。上面用了 `--border` / `--accent` / `--text-dim` 并在 `var()` 里带了兜底值——**先 grep 这三个在 `styles.css` 的 `:root` 里到底有没有**，有就直接引用（去掉兜底），没有就**换成既有的令牌名**，别新造。

- [ ] **Step 6: 跑测试确认全绿**

Run: `npx vitest run test/ui-attachments.test.ts test/ui-file-preview.test.ts test/ui-app.test.ts`

Expected: 全绿。**`test/ui-file-preview.test.ts` 与 `test/ui-app.test.ts` 是这一刀最可能碰坏的两个**——前者锁粘贴命名与拖拽判定，后者里有上传清单行为（删除走 DELETE、失败取舍文案）的用例。

- [ ] **Step 7: 变异验证那两个接线断言真的能红**

把 `index.html` 里那行 `` const line = `附件 #${attachNo}：${info.path}` `` **临时改成**旧的 `` `附件：${info.path}` ``，跑：

Run: `npx vitest run test/ui-attachments.test.ts`

Expected: **红**（接线锁那条）。**还原**，再跑一次确认绿。

> 这一步不是可选的。计划 1 里我写过一条"锁住接线"的断言，结果它被同函数里的一句**注释**喂饱了——只删接线、留下注释，14 条测试全绿。（本任务那两条断言的是**表达式本身**，注释喂不饱它，但**必须实测一次才算证明**。）

- [ ] **Step 8: 提交**

```bash
git add ui/public/app.js ui/public/index.html ui/public/styles.css test/ui-attachments.test.ts
git commit -m "feat(ui): 附件带编号，正文可按位置引用（A 簇）

设计案 A1 写的是「粘贴后在光标处插一个编号 chip」——但输入框是 textarea，
塞不进真的 DOM chip，所以按意图落地：编号是行内文本（Image #1），
视觉在编号缩略图行上。
单张自动插引用（A1），批量只给编号缩略图、点一下才插（A2 画的就是这样）——
一次往同一个光标点堆六条 Image #N 是噪音。
传输行从「附件：<路径>」变成「附件 #N：<路径>」，两种格式都认，
历史会话不受影响（有向后兼容锁）。删除附件改走纯函数 stripAttachmentLine，
不再内联过滤——两种格式各写一遍必然漂移。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 非图附件的 chip、上传的进度与失败出路（A4 / A5）

**Files:**
- Modify: `ui/public/index.html`（`:4856-4896` `uploaded`/`renderUploads`；`:4957-5027` `uploadFiles`；`:5052-5066` 点击委托）
- Modify: `ui/public/styles.css`
- Test: `test/ui-attachments.test.ts`（追加）、`test/ui-attachments.test.ts` 里那条既有用例的**锚点迁移**（`uploadFiles` → `uploadEntry`，判据一字不动）

**Interfaces:**
- Consumes: Task 2 的 `attachSeq` / `insertAtCaret` / `stripAttachmentLine`
- Produces: `uploaded` 条目新增四个字段 —— `file: File`、`status: "uploading"|"done"|"failed"`、`progress: number`（0–100）、`error?: string`；新增 `uploadEntry(entry, ctx): Promise<void>` 与 `retryUpload(index): Promise<void>`

**背景（本机的事实，别在验收时假装它是痛点）：**
宿主跑在 **loopback** 上，20MB 在本地几乎一瞬间就传完——**A5 那条进度条在本机基本看不见**。它仍然值得做（远程访问宿主时看得见，而且重试需要一个能重入的单文件上传函数），但要如实记。**本机天天发生的是另外两件**：① 超大文件**传完才**被服务端拒（20MB 白传一遍）② 失败之后文件从清单里**消失**（`continue` 掉了，用户只看到一句会飘走的错误，还得重新选一次文件）。

- [ ] **Step 1: 写失败的测试**

追加到 `test/ui-attachments.test.ts`：

```ts
describe("上传上限不许有两个真值源", () => {
  it("index.html 的客户端预检常量与 server.ts 的上限相等", async () => {
    const [html, server] = await Promise.all([
      readFile(join(process.cwd(), "ui/public/index.html"), "utf8"),
      readFile(join(process.cwd(), "ui/server.ts"), "utf8"),
    ]);
    const client = html.match(/UPLOAD_MAX_BYTES_CLIENT\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, "");
    const srv = server.match(/UPLOAD_MAX_BYTES\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, "");
    expect(client, "index.html 里没有 UPLOAD_MAX_BYTES_CLIENT").toBeTruthy();
    expect(srv, "server.ts 里没有 UPLOAD_MAX_BYTES").toBeTruthy();
    // 客户端预检只为了"别白传一遍"，真正的闸在服务端、一步都不能省；
    // 但两个数一旦漂移，用户会遇到"本地过了、服务端拒"这种最难解释的失败。
    expect(client).toBe(srv);
  });
});

describe("上传的接线锁（锁表达式本身，不锁'这一带出现过这个名字'）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("走的是能报进度的 XHR，不是 fetch（fetch 没有上传进度）", async () => {
    const source = await html();
    expect(source).toMatch(/new XMLHttpRequest\(\)/);
    expect(source).toMatch(/upload\.onprogress/);
  });

  it("失败的文件留在清单里带重试按钮，不是被 continue 掉", async () => {
    const source = await html();
    expect(source).toMatch(/entry\.status\s*=\s*"failed"/);
    expect(source).toMatch(/data-upload-retry/);
  });

  it("重试与首次上传共用同一个单文件函数——不许有两份 try/catch", async () => {
    const source = await html();
    // 首次上传与重试各写一遍 try/catch 一定会漂移（本仓最常吃的亏）
    expect(source.match(/await uploadEntry\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run test/ui-attachments.test.ts -t "上传上限|上传的接线"`

Expected: FAIL 全部五条 —— 常量不存在、没有 `XMLHttpRequest`、没有 `entry.status = "failed"`、没有 `data-upload-retry`、没有两处 `await uploadEntry(`。

- [ ] **Step 3: 最小实现 —— 单文件上传函数（含进度）**

在 `uploadFiles` 之前加：

```js
/**
 * 客户端的上传上限。**与服务端 ui/server.ts:2598 的 UPLOAD_MAX_BYTES 同源**——
 * 这条预检只为了"别把 20MB 白传一遍再被拒"，真正的闸在服务端，一步都不能省。
 * 两个数漂移会造出"本地过了、服务端拒"这种最难解释的失败；有一条测试钉着它们相等。
 */
const UPLOAD_MAX_BYTES_CLIENT = 20_000_000;

/**
 * 传一个文件，回报进度。
 *
 * 用 XHR 而不是 fetch：**fetch 没有上传进度**（没有 upload 流）。整条链路
 * 只有这一处需要进度，所以只在这一处换掉，别的 fetch 一律不动。
 *
 * @param {File} file
 * @param {string|undefined} workdir
 * @param {(pct:number)=>void} onProgress
 */
function uploadOne(file, workdir, onProgress) {
  return new Promise((resolve, reject) => {
    void (async () => {
      let body;
      try {
        const buf = await file.arrayBuffer();
        // 大文件用 chunk 转 base64——一次性 apply 整个数组会爆调用栈
        let binary = "";
        const view = new Uint8Array(buf);
        for (let i = 0; i < view.length; i += 0x8000) {
          binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
        }
        body = JSON.stringify({
          name: file.name,
          data: btoa(binary),
          ...(workdir ? { workdir } : {}),
        });
      } catch (err) {
        reject(err);
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText); } catch { /* 非 JSON 就是失败 */ }
        if (xhr.status >= 200 && xhr.status < 300 && parsed) resolve(parsed);
        else reject(new Error(humanizeActionFailure("上传", xhr.status, parsed?.error)));
      };
      xhr.onerror = () => reject(new Error("网络中断（宿主不可达）"));
      xhr.onabort = () => reject(new Error("上传被中断"));
      xhr.send(body);
    })();
  });
}

/** 非图附件的类型图标（房子里的图标是 Phosphor，别用 unicode 图形）。 */
function attachmentIcon(path) {
  const ext = String(path).split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "tsv"].includes(ext)) return "ph-chart-line";
  if (["xlsx", "xls"].includes(ext)) return "ph-table";
  if (ext === "pdf") return "ph-file-pdf";
  if (["zip", "tar", "gz", "7z"].includes(ext)) return "ph-file-zip";
  if (["md", "txt", "log"].includes(ext)) return "ph-file-text";
  return "ph-file";
}
```

- [ ] **Step 4: 最小实现 —— 抽取 `uploadEntry`，`uploadFiles` 与 `retryUpload` 共用它**

**同一个逻辑不许有两份**（本计划的 Global Constraint）：序号分配、工作目录、`at` 快照、写入输入框——这四件事必须只有一处。所以先把循环体抽出来：

```js
/**
 * 传一条附件并落账。**首次上传与重试共用这一段**——
 * 序号分配、工作目录、at 快照、写输入框四处各算一遍是漂移的温床，
 * 而"重试"和"首次"除了入口以外**没有任何区别**。
 *
 * @param {{file: File, path: string, bytes: number, status: string, progress: number,
 *          error?: string, workdir?: string, attachNo?: number, autoCite?: boolean}} entry
 * @param {{at: {mode: string, runId: string|null}, targetWorkdir: string|undefined}} ctx
 */
async function uploadEntry(entry, ctx) {
  // 预检：别把 20MB 白传一遍再被服务端拒（服务端那一步仍然要跑，一步都不能省）
  if (entry.bytes > UPLOAD_MAX_BYTES_CLIENT) {
    entry.status = "failed";
    entry.error = `文件过大：${(entry.bytes / 1_000_000).toFixed(1)}MB 超过 ${(UPLOAD_MAX_BYTES_CLIENT / 1_000_000).toFixed(0)}MB 上限`;
    renderUploads();
    return;
  }
  try {
    const info = await uploadOne(entry.file, ctx.targetWorkdir, (pct) => {
      entry.progress = pct;
      renderUploads();
    });
    // 上传是 fire-and-forget 起手的。等它回来时用户可能已经切走了——
    // 那条路径属于另一个工作目录，写进现在的框里就是错配。
    if ((composerMode?.mode ?? "new") !== ctx.at.mode || (composerMode?.runId ?? null) !== ctx.at.runId) {
      entry.status = "failed";
      entry.error = `已上传到原来的工作目录（${info.path}），但你已经切换了对话——没有写进输入框`;
      renderUploads();
      return;
    }
    const attachNo = ++attachSeq;
    Object.assign(entry, info, { attachNo, status: "done", progress: 100 });
    // ★ 顺序不许反：**先插引用、再追加传输行**。
    // 反过来先赋值 `.value` 会把光标推到文末，insertAtCaret 就变成"插在全文末尾"。
    // ★ 焦点守卫也不许丢：输入框没焦点时 selectionStart 是 0，插进去会跑到全文最前面。
    // 这两条是 Task 2 的 fix round 2 挣来的（review 的 Minor 1），**本任务重写这段时
    // 必须原样保留**——计划正文写下时它们还不存在，故此处标注。
    // 单张才自动插引用；批量只给编号缩略图（A2 的设计）。autoCite 在建条目时定，
    // 因为"这一次传了几张"是那一次的信息，重试时不该重新判断。
    if (entry.autoCite && document.activeElement === taskInput) {
      insertAtCaret(taskInput, `Image #${attachNo} `);
    }
    // 把路径写进任务描述——模型只有看到路径才知道文件存在。
    // 带上编号：用户正文里写的「Image #2」才与某一条路径对得上。
    const line = `附件 #${attachNo}：${info.path}`;
    taskInput.value = taskInput.value ? `${taskInput.value}\n${line}` : line;
  } catch (err) {
    // 失败**留在清单里**带原因与重试。从前是 showSubmitError 后 continue——
    // 文件从清单里消失，用户只看到一句会飘走的错误，还得重新选一次文件。
    entry.status = "failed";
    entry.error = err?.message ?? "未知错误";
  }
  entry.autoCite = false;
  renderUploads();
}

async function uploadFiles(files) {
  showSubmitError(null);
  /**
   * 附件落在**哪个工作目录**取决于这次提交去哪儿。
   * 已打开的对话用那场会话绑定的路径；新建才用输入栏下拉。
   */
  const ctx = {
    at: { mode: composerMode?.mode ?? "new", runId: composerMode?.runId ?? null },
    targetWorkdir: composerMode?.workdirLocked
      ? (composerMode.workdir ?? workdirSelect?.value)
      : workdirSelect?.value,
  };
  // 先把每一条挂进清单（status="uploading"），用户立刻看得见"它在动"。
  // 从前是上传成功才 push——一个 20MB 的文件在传完之前，界面上什么都没有。
  const pending = files.map((file) => {
    const entry = {
      file,
      path: file.name,
      bytes: file.size,
      status: "uploading",
      progress: 0,
      workdir: ctx.targetWorkdir ?? undefined,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      autoCite: files.length === 1 && file.type.startsWith("image/"),
    };
    uploaded.push(entry);
    return entry;
  });
  renderUploads();
  for (const entry of pending) await uploadEntry(entry, ctx);
}

/**
 * 重试一条失败的上传。数据还在内存里（`entry.file`），不必让用户重新选文件。
 * 传回**这条原本落在的那个工作目录**，不是当前下拉的值——它就是在那儿失败的。
 */
async function retryUpload(index) {
  const entry = uploaded[index];
  if (!entry?.file || entry.status === "uploading") return;
  entry.status = "uploading";
  entry.progress = 0;
  entry.error = undefined;
  renderUploads();
  await uploadEntry(entry, {
    at: { mode: composerMode?.mode ?? "new", runId: composerMode?.runId ?? null },
    targetWorkdir: entry.workdir,
  });
}
```

- [ ] **Step 5: 最小实现 —— 渲染三种状态**

`renderUploads()` 里 `uploadList.innerHTML` 那半改成按 `status` 分支：

```js
  uploadList.innerHTML = uploaded
    .map((u, i) => {
      const name = escapeHtml(u.path);
      const tag = u.previewUrl ? `Image #${u.attachNo ?? ""}` : `附件 #${u.attachNo ?? ""}`;
      const icon = u.attachNo === undefined
        ? `<i class="ph ${attachmentIcon(u.path)}" aria-hidden="true"></i>`
        : "";
      if (u.status === "failed") {
        // 失败**说清原因**（文件过大 / 网络中断 / 已切走），并给一条出路
        return `<li class="upload-item upload-item--failed">`
          + `${icon}<code>${name}</code> `
          + `<span class="upload-err">${escapeHtml(u.error ?? "上传失败")}</span> `
          + `<button type="button" class="btn btn--ghost upload-retry" data-upload-retry="${i}" `
          + `title="重试" aria-label="重试上传 ${name}">重试</button>`
          + `<button type="button" class="btn btn--ghost upload-remove" data-upload-remove="${i}" `
          + `title="删除附件" aria-label="删除附件 ${name}">`
          + `<i class="ph ph-x" aria-hidden="true"></i></button></li>`;
      }
      if (u.status === "uploading") {
        return `<li class="upload-item"><span class="upload-no">${icon}${tag}</span> `
          + `<code>${name}</code> <span class="knob-hint">${u.progress}%</span></li>`;
      }
      const size = `<span class="knob-hint">${(u.bytes / 1024).toFixed(0)} KB</span>`;
      const previewBtn =
        `<button type="button" class="btn btn--ghost upload-preview" data-upload-preview="${i}" ` +
        `title="预览" aria-label="预览 ${name}">` +
        `<i class="ph ph-eye" aria-hidden="true"></i><span>预览</span></button>`;
      const removeBtn =
        `<button type="button" class="btn btn--ghost upload-remove" data-upload-remove="${i}" ` +
        `title="删除附件" aria-label="删除附件 ${name}">` +
        `<i class="ph ph-x" aria-hidden="true"></i></button>`;
      return `<li class="upload-item"><span class="upload-no">${icon}${tag}</span> <code>${name}</code> ${size} ${previewBtn}${removeBtn}</li>`;
    })
    .join("");
```

点击委托里加一路（放在 `data-upload-remove` 判断之后）：

```js
    const retryBtn = e.target instanceof Element ? e.target.closest("[data-upload-retry]") : null;
    if (retryBtn) { void retryUpload(Number(retryBtn.getAttribute("data-upload-retry"))); return; }
```

样式（`styles.css`）：

```css
/* 上传失败的条目：它还在清单里，带原因与一条出路——不是"报个错就消失" */
.upload-item--failed { color: var(--danger, #b71c1c); }
.upload-err { font-size: 11px; color: var(--danger, #b71c1c); }
```

- [ ] **Step 6: 跑测试**

Run: `npx vitest run test/ui-attachments.test.ts test/ui-app.test.ts`

Expected: `ui-attachments` 全绿；`ui-app` 全绿。

> **★ 勘误（implementer 落地时读原文抓出，第 11 次"计划文本与代码不符"）**：本计划初稿写着"`test/ui-app.test.ts:2921-2948` 附近锁着'上传失败之后清单里没有它'的旧行为，**那条用例要跟着改**"——**那条用例根本不存在**。那一段是「附件清单可删除（壳侧接线）」组，锁的是**删除**行为，与本任务的行为变更无关。
> 实现者**没有照计划去改一条不存在的用例**，`ui-app.test.ts` 一行没动——**这是对的**（"去读原文，别凭计划正文的描述改测试"）。
> **代价**：本条的误导性文字漏进了 `7008eaf` 的提交信息（它保留了计划模板里那句"用例跟着改"），成了**永久记录里的一句不实**。报告已披露，但提交信息改不动（复查包引用它）。
> **教训**：**计划里"某处有 X"这种断言，是最容易错、也最容易漏进永久记录的一类。** 写的时候要么去读、要么写成"先读它再判断"。

- [ ] **Step 7: 活页验收（A4 / A5）**

新建 `eval/persona-ux/_audit-20260919/verify-attach-states.mjs`：造一个**超过 20MB 的假文件**（`Buffer.alloc`，不必真生成内容）走预检、再造一个 `.pdf` 走非图 chip，量：

- 超大文件的条目**带原因且不被清掉**
- 非图 chip 有类型图标、有 `附件 #N`
- 失败条目有 `重试` 按钮且点它真的重发（可以拦 `XMLHttpRequest` 数调用次数）

Expected: 三条都成立，0 控制台错误。

- [ ] **Step 8: 提交**

```bash
git add ui/public/index.html ui/public/styles.css test/ui-attachments.test.ts test/ui-app.test.ts eval/persona-ux/_audit-20260919/verify-attach-states.mjs
git commit -m "feat(ui): 非图附件的 chip、上传进度与失败出路（A 簇 A4/A5）

本机跑 loopback，20MB 在本机几乎一瞬间传完——A5 那条进度条在本机基本
看不见，它值在做（远程访问宿主时看得见，且重试需要一个能重入的单文件
上传函数），但不假装它是本机的痛点。本机天天发生的是另外两件：
① 超大文件传完才被服务端拒——加客户端预检，常量与服务端同源，
   并有一条测试钉着两个数相等（漂移会造出"本地过了、服务端拒"）
② 失败之后文件从清单里消失、用户只看到一句会飘走的错误——改成留在
   清单里带原因与重试

首次上传与重试共用 uploadEntry：序号分配、工作目录、at 快照、写输入框
四处各算一遍是漂移的温床，而两者除了入口没有任何区别。

行为变更（不是回归）：上传失败的取舍从"清掉+提示"改成"留在清单里"，
test/ui-app.test.ts 里锁旧行为的用例跟着改。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 文件树的降噪折叠与展开态记忆（A6）

**Files:**
- Modify: `ui/public/features/file-tree.js`（`FILE_TREE_COPY` `:25-36`；`FILES_RAIL_PREF` `:39`；`expanded` `:175`；`paint` `:210-235`；`renderLevel` `:244-271`；`renderRow` `:273-331`；`reload` `:386-396`；API `:403-409`）
- Modify: `ui/public/index.html`（`:5148-5177` 的接线里可能要给 `onEntriesChanged` 之外的新回调留位——**先读那段再决定**）
- Modify: `ui/public/styles.css`
- Test: `test/ui-layout.test.ts`（追加纯函数锁）、`test/ui-file-tree.test.ts`（既有锁，**先读它再改**）

**Interfaces:**
- Consumes: 无
- Produces（全部纯函数，可单测）：
  - `noiseGroupOf(name: string): string|null` —— 目录名 → 它属于哪个噪音组；不属于则 `null`
  - `foldNoiseEntries(entries: {name,relative,kind}[]): {items: Array<{type:"entry", entry} | {type:"group", key, label, count, members}>}`
  - `readTreeExpanded(storage): Record<string, string[]>` / `writeTreeExpanded(storage, workdir, paths)`
  - `TREE_EXPANDED_PREF = "agent.ui.pref.treeExpanded"`

**背景与两处**如实记录的**取舍**：

**① 「降噪」不是「隐藏」。** `ui/workspace-files.ts:79-84` 的 `shouldSkipName` 只排隐藏目录与凭据名，**本计划不动它**（Global Constraints 口径 3：人在 tests 里干活，仓库树不该替人决定什么不该看）。降噪做成**折成一行计数、点开还在**，而不是不给。

**② `Expand All` 在懒加载树上做不到字面意义。** 树是**逐层拉**的（`loadDir` `:333`，点目录才拉下一层），服务端有 `WORKSPACE_TREE_MAX_DEPTH=8` / `WORKSPACE_TREE_LAYER_MAX=200` 两道闸——"真的全部展开"意味着把整棵树按层拉下来，请求数与叶子数同阶。所以本计划落成：
- **`Collapse All` 一步到位**（`expanded = new Set()`，纯客户端）
- **`Expand All` 展开到第二层**（根 + 根下的目录），够"扫一眼有哪些目录"这个真实用法；再深就用 `@` 搜索，那是为"找具体文件"设计的路径
- **按钮的 `title` 写明这个界限**，别让用户以为点了会全开

> 这与设计案 A6 的字面（「全部展开 · 全部折叠」）**有差异，代价是设计案的意图只落了一半**。若将来要做真的全展开，入口应当是"服务端一次性返回整棵树"（另加一道 size 闸），不是前端循环拉——那是另一个任务，不在本计划。

- [ ] **Step 1: 写失败的测试**

追加到 `test/ui-layout.test.ts`（该文件已有 `css()` 与 `block()` 辅助）：

```ts
// @ts-nocheck
import {
  foldNoiseEntries,
  noiseGroupOf,
  readTreeExpanded,
  writeTreeExpanded,
  TREE_EXPANDED_PREF,
} from "../ui/public/features/file-tree.js";

describe("A6 降噪折叠：折成一行计数，不是不给", () => {
  it("下划线开头的目录按前缀归组（_probe2-p1 / _probe3-p2 同组）", () => {
    expect(noiseGroupOf("_probe2-p1")).toBe("_probe");
    expect(noiseGroupOf("_probe3-p2")).toBe("_probe");
    expect(noiseGroupOf("_qa")).toBe("_qa");
    expect(noiseGroupOf("_tmp-3")).toBe("_tmp");
    expect(noiseGroupOf("__pycache__")).toBe("__pycache__");
  });

  it("正常目录不属于任何组——降噪只收拾噪音，不许碰人写的东西", () => {
    for (const n of ["src", "ui", "test", "eval", "node_modules", "README.md"]) {
      expect(noiseGroupOf(n), `${n} 被误判成噪音`).toBeNull();
    }
  });

  it("成组的折起来，未成组的原样——且**顺序按原位保留**", () => {
    const entries = [
      { name: "src", relative: "src", kind: "directory" },
      { name: "_probe2-p1", relative: "_probe2-p1", kind: "directory" },
      { name: "_probe3-p2", relative: "_probe3-p2", kind: "directory" },
      { name: "_qa", relative: "_qa", kind: "directory" },
      { name: "README.md", relative: "README.md", kind: "file" },
    ];
    const { items } = foldNoiseEntries(entries);
    // 服务端已经排好序（目录在前、localeCompare），渲染层不许再排一次；
    // 组落在**它第一个成员的位置**上，所以顺序是构造出来的、不是重排出来的。
    expect(items.map((it) => (it.type === "group" ? `组:${it.key}` : it.entry.relative)))
      .toEqual(["src", "组:_probe", "_qa", "README.md"]);
    expect(items[1]).toMatchObject({ type: "group", key: "_probe", count: 2 });
    expect(items[1].members.map((e) => e.relative)).toEqual(["_probe2-p1", "_probe3-p2"]);
  });

  it("空输入不吃亏", () => {
    expect(foldNoiseEntries([])).toEqual({ items: [] });
    expect(foldNoiseEntries(null)).toEqual({ items: [] });
  });
});

describe("展开态跨会话记忆（A6）", () => {
  function fakeStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m };
  }

  it("按工作目录分开记——两个项目的目录名会重名", () => {
    const s = fakeStorage();
    writeTreeExpanded(s, "D:/a", ["src", "src/tools"]);
    writeTreeExpanded(s, "D:/b", ["ui"]);
    expect(readTreeExpanded(s)["D:/a"]).toEqual(["src", "src/tools"]);
    expect(readTreeExpanded(s)["D:/b"]).toEqual(["ui"]);
  });

  it("空数组等于删掉这条，不留垃圾键", () => {
    const s = fakeStorage();
    writeTreeExpanded(s, "D:/a", ["src"]);
    writeTreeExpanded(s, "D:/a", []);
    expect(readTreeExpanded(s)["D:/a"]).toBeUndefined();
  });

  it("存储里是坏值时当作没有，不许抛（localStorage 里什么都可能有）", () => {
    const s = fakeStorage();
    s.setItem(TREE_EXPANDED_PREF, "{{{ 不是 JSON");
    expect(readTreeExpanded(s)).toEqual({});
    s.setItem(TREE_EXPANDED_PREF, '{"D:/a":"不是数组"}');
    expect(readTreeExpanded(s)).toEqual({});
  });

  it("工作目录数量有上限，别让它无限长", () => {
    const s = fakeStorage();
    for (let i = 0; i < 40; i++) writeTreeExpanded(s, `D:/w${i}`, ["src"]);
    expect(Object.keys(readTreeExpanded(s)).length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui-layout.test.ts -t "降噪折叠|展开态跨会话"`

Expected: FAIL —— 五个导出都不存在。

- [ ] **Step 3: 最小实现 —— 纯函数层**

在 `ui/public/features/file-tree.js` 的 `FILES_RAIL_PREF` 旁加常量，并在 `childDepth` 附近加纯函数：

```js
/** 目录展开态的跨会话记忆。按工作目录分组——两个项目的目录名会重名。 */
export const TREE_EXPANDED_PREF = "agent.ui.pref.treeExpanded";
/** 记多少个工作目录。超出就丢最老的——这是偏好，不是数据。 */
const TREE_EXPANDED_MAX_WORKDIRS = 20;

/**
 * 目录名属于哪个噪音组；不属于任何组返回 null（A6 的降噪折叠）。
 *
 * 判据是**约定**不是启发式：本仓的临时产物目录一律以下划线开头
 * （`_probe2-p1`、`_qa`、`_tmp-3`），组名取到第一个连字符或数字之前——
 * 于是 `_probe2-p1` 与 `_probe3-p2` 落进同一个 `_probe` 组。
 *
 * **正常目录一律返回 null**：降噪是收拾噪音，不是替人决定什么不该看
 * （仓库树的排除规则 `shouldSkipName` 本计划不动，见 Global Constraints）。
 */
export function noiseGroupOf(name) {
  const n = String(name ?? "");
  if (!n.startsWith("_")) return null;
  const head = n.match(/^[^-\d]*/)?.[0] ?? "";
  return head || null;   // 形如 `_-x` 这种取不出组名的，不折
}

/**
 * 把一层条目折成**有序**的一摞（A6 的降噪折叠）。
 *
 * 返回 `items` 而不是 `{shown, groups}` 两摞：**排序是服务端的事**
 * （`ui/workspace-files.ts:90-96`，目录在前 + `localeCompare("en")`），
 * `file-tree.js` 按返回顺序直接渲染、从不排序（勘查核实过）。两摞并排
 * 会让渲染层不得不决定"组插回哪儿"，那等于在这里再排一次序。
 * 组落在**它第一个成员的位置**上，顺序因此是构造出来的。
 *
 * **只有 ≥2 个成员才成组**——单个 `_qa` 折成一行反而更难找。
 *
 * @param {{name:string, relative:string, kind:string}[]|null|undefined} entries
 * @returns {{items: Array<{type:"entry", entry:object} | {type:"group", key:string, label:string, count:number, members:object[]}>}}
 */
export function foldNoiseEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** 先数一遍：只有 ≥2 个成员的组才折 */
  const counts = new Map();
  for (const e of list) {
    const key = e?.kind === "directory" ? noiseGroupOf(e.name) : null;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  /** @type {object[]} */
  const items = [];
  const placed = new Set();
  for (const e of list) {
    const key = e?.kind === "directory" ? noiseGroupOf(e.name) : null;
    if (!key || (counts.get(key) ?? 0) < 2) { items.push({ type: "entry", entry: e }); continue; }
    if (placed.has(key)) continue;                 // 已在本组里，不重复放
    placed.add(key);
    items.push({
      type: "group",
      key,
      label: `${key} 系列`,
      count: counts.get(key),
      members: list.filter((m) => m?.kind === "directory" && noiseGroupOf(m.name) === key),
    });
  }
  return { items };
}

/**
 * 读展开态记忆。**localStorage 里什么都可能有**（别的版本写的、人手改的、
 * 半截写入的），所以每一层都当坏值处理，读不出来就当没有——偏好丢了是小事，
 * 让文件树整块崩掉是大事。
 */
export function readTreeExpanded(storage) {
  try {
    const raw = storage?.getItem?.(TREE_EXPANDED_PREF);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [wd, paths] of Object.entries(parsed)) {
      if (!Array.isArray(paths)) continue;
      const clean = paths.filter((p) => typeof p === "string" && p);
      if (clean.length) out[wd] = clean;
    }
    return out;
  } catch { return {}; }
}

/** 写展开态记忆。工作目录数超上限就丢最老的（插入序即最老）。 */
export function writeTreeExpanded(storage, workdir, paths) {
  const wd = String(workdir ?? "");
  if (!wd) return;
  try {
    const all = readTreeExpanded(storage);
    const clean = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === "string" && p);
    delete all[wd];                        // 先删再塞：把它挪到插入序的末尾
    if (clean.length) all[wd] = clean;
    const keys = Object.keys(all);
    for (const stale of keys.slice(0, Math.max(0, keys.length - TREE_EXPANDED_MAX_WORKDIRS))) {
      delete all[stale];
    }
    if (Object.keys(all).length) storage?.setItem?.(TREE_EXPANDED_PREF, JSON.stringify(all));
    else storage?.removeItem?.(TREE_EXPANDED_PREF);
  } catch { /* 存储不可写只丢偏好 */ }
}
```

- [ ] **Step 4: 跑测试确认纯函数那半全绿**

Run: `npx vitest run test/ui-layout.test.ts -t "降噪折叠|展开态跨会话"`

Expected: PASS（9 条）。

- [ ] **Step 5: 接进渲染与交互**

**① 展开态改成可持久化。** `expanded`（`:175`）的赋值点有三处（`toggleDir` `:376-381`、`reload` `:390`）。改法：

```js
  /** @type {Set<string>} */
  let expanded = new Set();
  /** 记住展开态（A6）。reload 换目录时从记忆里恢复，不再一律清空。 */
  function persistExpanded() {
    writeTreeExpanded(storage, workdirNow(), [...expanded]);
  }
```

`toggleDir` 的 `expanded.delete(key)` / `expanded.add(key)` 之后各加一行 `persistExpanded();`。
`reload()`（`:386-396`）里那句 `expanded = new Set();` 换成：

```js
      // 换工作目录：从记忆里恢复它的展开态，而不是一律清空（A6 的核心诉求）
      expanded = new Set(readTreeExpanded(storage)[wd] ?? []);
```

**② 组折叠的行。** 在 `renderLevel`（`:244-271`）里把那一层的条目先过一遍 `foldNoiseEntries`，组渲染成一行：

```js
    for (const item of foldNoiseEntries(cached.entries).items) {
      if (item.type === "group") {
        body.appendChild(renderGroupRow(item, parentRel, depth));
        if (expandedGroups.has(groupKey(parentRel, item.key))) {
          for (const member of item.members) {
            body.appendChild(renderRow(member, depth));
            if (expanded.has(member.relative)) renderLevel(member.relative);
          }
        }
        continue;
      }
      const entry = item.entry;
      body.appendChild(renderRow(entry, depth));
      if (entry.kind === "directory" && expanded.has(entry.relative)) {
        renderLevel(entry.relative);
      }
    }
```

> **顺序**：`items` 已经是排好的（组落在它第一个成员的位置上），**渲染层不许再排一次**。勘查核实过：`file-tree.js` **从不排序**，顺序全部来自服务端 `ui/workspace-files.ts:90-96`（目录在前、`localeCompare("en")`）。

`renderGroupRow` 与组折叠态：

```js
  /** 组折叠态（A6）。内存即可——它不像目录展开态那样值得跨会话记。 */
  const expandedGroups = new Set();
  const groupKey = (parentRel, key) => `${parentRel}::${key}`;

  function renderGroupRow(g, parentRel, depth) {
    const row = doc.createElement("div");
    row.className = "ft-row ft-group";
    row.dataset.group = g.key;
    row.style.setProperty("--ft-depth", String(depth));
    // 组键必须带父目录：同一层里两个不同的父目录下都可能有 `_probe` 组，
    // 只用组名做键会让它们互相折叠。
    const key = groupKey(parentRel, g.key);
    const open = expandedGroups.has(key);
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "ft-name ft-group-name";
    btn.setAttribute("aria-expanded", String(open));
    btn.innerHTML = `<i class="ph ${open ? "ph-caret-down" : "ph-caret-right"}" aria-hidden="true"></i>`;
    const label = doc.createElement("span");
    // 文案照设计案 A6：`_probe 系列（29 个目录，已按类型降噪折叠）`
    label.textContent = `${g.label}（${g.count} 个，已降噪折叠）`;
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      if (expandedGroups.has(key)) expandedGroups.delete(key);
      else expandedGroups.add(key);
      paint();
    });
    row.appendChild(btn);
    return row;
  }
```

> `groupKey(parentRel, key)` 与 `expandedGroups` 就定义在上面「`renderGroupRow` 与组折叠态：」那段的第一行——**同一处，别在别处再造一个**。

**③ 两个按钮。** 在 `head`（`:150-169`）里加：

```js
  const allBtn = doc.createElement("button");
  allBtn.type = "button";
  allBtn.className = "files-rail-all";
  allBtn.textContent = "展开";
  allBtn.title = "展开到第二层（整棵树是逐层拉的，真的全开会把每一层都请求一遍）";
  allBtn.addEventListener("click", () => void expandTopLevel());

  const noneBtn = doc.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "files-rail-all";
  noneBtn.textContent = "折叠";
  noneBtn.title = "全部折叠";
  noneBtn.addEventListener("click", () => { expanded = new Set(); expandedGroups.clear(); persistExpanded(); paint(); });
```

```js
  /** 展开到第二层：根 + 根下的目录。再深走 @ 搜索（那是为"找具体文件"设计的路径）。 */
  async function expandTopLevel() {
    const root = cache.get("");
    if (!root) return;
    const dirs = root.entries.filter((e) => e.kind === "directory");
    for (const d of dirs) expanded.add(d.relative);
    persistExpanded();
    paint();
    // 第二层的目录名要看得见，所以把它们的内容也拉回来（这一层是并发的，且服务端每层上限 200）
    await Promise.all(dirs.map((d) => (cache.has(d.relative) ? null : loadDir(d.relative))));
  }
```

**④ 样式**（`styles.css`）：`.ft-group-name`（弱化色 + 括号里的计数用小字）、`.files-rail-all`（head 里的小按钮，与既有的 `.files-rail-toggle` 同一档）。**加之前先 grep 这两个类名在 `styles.css` 里是否已存在**，别造重复。

- [ ] **Step 6: 跑测试，并处理既有锁**

Run: `npx vitest run test/ui-file-tree.test.ts test/ui-layout.test.ts`

Expected: `ui-layout` 全绿。`ui-file-tree` **可能红**——它锁树的 URL / 展开集合 / 人话失败 / `files[]` 拆分。**先读它**（`.plan2-excerpts-tree.md` 的 E1 节是全文），判断是"我们的改动破坏了它的契约"还是"它锁的是旧行为"。**只许改后者**，并且改的时候在提交信息里写明。

- [ ] **Step 7: 活页验收（A6 的真实痛点）**

新建 `eval/persona-ux/_audit-20260919/verify-tree-noise.mjs`：在有 `_probe*` 系列目录的工作目录上量——

- 展开态里 `_probe 系列（N 个，已降噪折叠）` 是**一行**
- 点它，成员显出来
- **刷新页面，展开态还在**（这是 A6 的"跨会话记住"）
- 树宽 ≥200px、目录名可读（计划 1 的成果不许被这一刀弄回去）

Expected: 四条全成立，0 控制台错误。

- [ ] **Step 8: 提交**

```bash
git add ui/public/features/file-tree.js ui/public/styles.css test/ui-layout.test.ts test/ui-file-tree.test.ts eval/persona-ux/_audit-20260919/verify-tree-noise.mjs
git commit -m "feat(ui): 文件树降噪折叠 + 展开态跨会话记忆（A 簇 A6）

降噪是「折成一行计数」不是「不给」：shouldSkipName 本计划不动——人在
tests 里干活，仓库树不该替人决定什么不该看。组判据是约定不是启发式：
本仓的临时产物目录一律下划线开头，组名取到第一个连字符或数字之前。

如实记一处与设计案的差异：设计案要「全部展开」，但树是逐层拉的、
服务端有深度 8/每层 200 两道闸，真的全开等于按层拉整棵树。落成
「展开到第二层」+ 按钮 title 写明界限——够'扫一眼有哪些目录'，
再深走 @ 搜索。要做真的全展开，入口是服务端一次性返回整棵树 + size 闸，
那是另一个任务。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5: 长内容的折叠与留存出口（B5 / B6）

**Files:**
- Modify: `ui/public/core/markdown.js`（围栏分支 `:286-307`；表格分支 `:347-`；顶部常量区）
- Modify: `ui/public/app.js`（`formatSourceExport` `:5140-5146` 旁加 `formatTableExport`；`chatTextFromNode` `:11866-11870` 旁加 `codeTextFromNode`；派发 `:7506-7521` 加两路）
- Modify: `ui/public/styles.css`
- Test: `test/markdown.test.ts`（追加；**既有的 425 行预计会红，见 Step 6**）

**Interfaces:**
- Consumes: `copyChatText` / `onCopyChat`（`index.html:2450-2466` / `:2160`，房子唯一的剪贴板入口）、`highlight()`、`normalizeLang()`
- Produces:
  - `formatTableExport(rows: string[][]): string` —— TSV
  - `codeTextFromNode(node, btn): string`
  - `MD_CODE_FOLD_LINES` / `MD_TABLE_FOLD_ROWS`

**背景（两处按房子既有做法落的调整，不是偷懒）：**

**① 设计案的「导出 CSV」→ 房子的「复制为 TSV」。** 勘查核实：**`ui/public` 里没有任何"前端生成文件"的做法**（`URL.createObjectURL` 全仓只有一处，是图片预览）。房子唯一的文本"导出"是 `formatSourceExport`（`app.js:5140-5146`）——**格式化成 TSV 走剪贴板**。粘进 Excel 是同一条工作流，而新造一套 Blob 下载会在同一件事上留两种做法。**所以落成"复制为 TSV"，复用 `onCopyChat` 通道。**

**② 设计案的「保存为产物」/「在编辑器打开」本计划不做，列单独立项。** 理由：代码块与表格在对话里**没有文件路径**，要变成"产物"必须先落盘，而宿主侧没有任何通用写端点（只有 `POST /api/upload` 落 `uploads/`、`POST /api/fs/mkdir` 只建目录）。"往哪写、叫什么名、要不要过审批门"是一组设计决定，塞进本计划会把它撑破。**B6 的三个动作里，本计划落"复制"与"折叠"，另两个记在此处。**

**③ 表格的折叠用 CSS 隐藏而不是不渲染**——因为"复制为 TSV"要读全部行；不渲染的话复制出来的只有看得见的那部分。

- [ ] **Step 1: 写失败的测试**

追加到 `test/markdown.test.ts`（该文件已有 `renderMarkdown` 的导入与 425 行既有用例）：

> **★ 别漏了导入**（预检扫描抓出的计划缺陷）：`formatTableExport` 与 `codeTextFromNode` 住在 **`ui/public/app.js`**，不在 `markdown.js`。文件名容易让人以为该从 markdown 导。抬头补：
> ```ts
> import { codeTextFromNode, formatTableExport } from "../ui/public/app.js";
> ```
> 若该文件顶部已有 `app.js` 的导入块，**并进去**，别开第二行 import。

```ts
describe("长代码块：折叠 + 语言 + 行数 + 复制（B6）", () => {
  const code = (n) => "```ts\n" + Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join("\n") + "\n```";

  it("短的照旧原样渲染——多数代码块不该被套上一层壳", () => {
    const html = renderMarkdown("```ts\nconst a = 1;\n```");
    expect(html).toContain("md-code--ts");
    expect(html).not.toContain("md-code-rest");
  });

  it("长的折起来：露出前 N 行，其余进 details，并写明还剩几行", () => {
    const html = renderMarkdown(code(60));
    expect(html).toContain("md-code-rest");
    expect(html).toMatch(/再展 \d+ 行/);
  });

  it("头部有语言与行数，复制按钮挂 data-action（派发在 app.js）", () => {
    const html = renderMarkdown("```python\nprint(1)\n```");
    expect(html).toContain("md-block-lang");
    expect(html).toContain("python");
    expect(html).toContain('data-action="copy-code"');
  });

  it("★ 安全纪律不许破：语言名是用户可控的，必须转义", () => {
    const html = renderMarkdown('```<img src=x onerror=alert(1)>\nbody\n```');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("长表格：自身横滚 + 折行 + 复制为 TSV（B5）", () => {
  const table = (n) =>
    ["| # | 值 |", "| --- | --- |", ...Array.from({ length: n }, (_, i) => `| ${i} | ${i * 2} |`)].join("\n");

  it("折起来时**全部行仍然在 DOM 里**（否则复制出来的只有看得见的那半）", () => {
    const html = renderMarkdown(table(60));
    const rows = (html.match(/<tr/g) ?? []).length;
    expect(rows).toBeGreaterThanOrEqual(60);      // 表头 + 60 行 + 可能的折行提示
  });

  it("有复制为 TSV 的按钮", () => {
    expect(renderMarkdown(table(5))).toContain('data-action="copy-table"');
  });

  it("短的表格不加折叠壳", () => {
    expect(renderMarkdown(table(3))).not.toContain("md-table-rest");
  });
});

describe("导出的格式化（纯函数）", () => {
  it("formatTableExport：制表符拼接，换行分列", () => {
    expect(formatTableExport([["a", "b"], ["1", "2"]])).toBe("a\tb\n1\t2");
  });

  it("单元格里的制表符要清掉——否则粘进 Excel 会多出一列", () => {
    expect(formatTableExport([["a\tb", "c"]])).toBe("a b\tc");
  });

  it("codeTextFromNode：折叠时两段代码要接起来，不能只复制看得见的那段", () => {
    document.body.innerHTML =
      '<div class="md-code-block"><pre class="md-code"><code>L1\nL2</code></pre>' +
      '<details class="md-code-rest"><pre class="md-code"><code>L3\nL4</code></pre></details></div>';
    const btn = document.querySelector(".md-code-block");
    expect(codeTextFromNode(btn, btn)).toBe("L1\nL2\nL3\nL4");
  });
});
```

> 最后一条用 `document.body.innerHTML` —— `markdown.test.ts` 跑在什么环境（jsdom 还是 node）**先看文件头部**。**若它是纯 node（无 DOM），把这条移到 `test/ui-patch.test.ts` 或新开一个带 `// @vitest-environment jsdom` 的文件**，别硬塞。

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run test/markdown.test.ts -t "长代码块|长表格|导出的格式化"`

Expected: FAIL —— `md-code-rest` / `md-block-lang` / `data-action="copy-code"` / `formatTableExport is not a function` 等。

- [ ] **Step 3: 最小实现 —— `markdown.js` 的围栏分支**

顶部常量区加：

```js
/** 超过这么多行的代码块默认折起来。正文里铺 300 行会把后面的对话全推到屏外。 */
const MD_CODE_FOLD_LINES = 24;
/** 表格同理。折起来的是**显示**，行仍然全在 DOM 里——复制要读到全部。 */
const MD_TABLE_FOLD_ROWS = 20;
```

把 `:299-305` 那段 `out.push(...)` 换成：

```js
      const raw = fence[1] ?? "";
      const key = normalizeLang(raw);
      const langAttr = raw ? ` data-lang="${escapeHtml(raw)}"` : "";
      const cls = `md-code${key ? ` md-code--${key}` : ""}`;
      // 长的折起来：正文里铺 300 行会把后面对话全推到屏外。
      // 折出来的那截进 `<details>`，**不需要一行 JS**；
      // 但"复制"要拿到两段，所以 codeTextFromNode 是求和的（见 app.js）。
      const head = body.length > MD_CODE_FOLD_LINES ? body.slice(0, MD_CODE_FOLD_LINES) : body;
      const rest = body.length > MD_CODE_FOLD_LINES ? body.slice(MD_CODE_FOLD_LINES) : [];
      out.push(
        `<div class="md-block md-code-block">` +
          `<div class="md-block-head">` +
          // 语言名是用户可控的（围栏后那一串），必须转义——这是本文件的安全纪律
          `<span class="md-block-lang">${escapeHtml(raw || "text")}</span>` +
          `<span class="md-block-count">${body.length} 行</span>` +
          `<button type="button" class="md-block-act" data-action="copy-code" title="复制代码">复制</button>` +
          `</div>` +
          `<pre class="${cls}"${langAttr}><code>${highlight(head.join("\n"), raw)}</code></pre>` +
          (rest.length
            ? `<details class="md-code-rest"><summary>再展 ${rest.length} 行</summary>` +
              `<pre class="${cls}"><code>${highlight(rest.join("\n"), raw)}</code></pre></details>`
            : "") +
          `</div>`,
      );
      continue;
```

- [ ] **Step 4: 最小实现 —— `markdown.js` 的表格分支**

读 `:347-` 那段表格分支的**实际产出**（`.plan2-excerpts-markdown.md` 的 A 节逐字在档），把 `<table>` 包进：

```js
      // 自身横滚（而不是撑破正文）+ 长表折行 + 复制为 TSV。
      // 折行用 CSS 隐藏而不是不渲染：复制要读到全部行。
      // 变量名避开 `body` —— 上面围栏分支用过这个名字，同名会让人以为是一回事。
      const headRows = rows.length > MD_TABLE_FOLD_ROWS ? rows.slice(0, MD_TABLE_FOLD_ROWS) : rows;
      const restRows = rows.length > MD_TABLE_FOLD_ROWS ? rows.slice(MD_TABLE_FOLD_ROWS) : [];
      out.push(
        `<div class="md-block md-table-block">` +
          `<div class="md-block-head">` +
          `<span class="md-block-count">${rows.length} 行</span>` +
          `<button type="button" class="md-block-act" data-action="copy-table" title="复制为 TSV（可直接粘进 Excel）">复制</button>` +
          `</div>` +
          `<div class="md-table-wrap">` +
          `<table class="md">…表头…</table>` +   // ← 逐字保留既有实现，只换容器
          `</div></div>`,
      );
```

> **表格的折叠**：既有实现是一张 `<table>` 一个 `<tbody>`。折行的正解是**两个 `<tbody>`**（HTML 允许多个），第二个带 `md-table-rest` 类，由 CSS 在未展开时隐藏；展开开关放在 head 里的同一个按钮家族。

- [ ] **Step 5: 最小实现 —— `app.js` 的两路派发与两个纯函数**

`formatSourceExport` 旁加：

```js
/**
 * 表格 → TSV。**与 `formatSourceExport` 同一族**：房子的"导出"就是
 * 格式化成 TSV 走剪贴板（`ui/public` 里没有任何前端生成文件的做法）。
 * 粘进 Excel 是同一条工作流，而新造一套 Blob 下载会在同一件事上留两种做法。
 *
 * 单元格里的制表符/换行要清掉——否则粘进 Excel 会多出一列/一行。
 */
export function formatTableExport(rows) {
  return (rows ?? [])
    .map((r) => (r ?? []).map((c) => String(c ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}
```

`chatTextFromNode` 旁加：

```js
/**
 * 复制某一段代码块。**两段都要**：长代码折起来之后 DOM 里有两个 `<pre>`，
 * 只取第一个就只复制了看得见的那半——而"复制"恰恰是为了把整段拿走。
 */
export function codeTextFromNode(node, btn) {
  const block = btn?.closest?.(".md-code-block") ?? node?.querySelector?.(".md-code-block") ?? node;
  const parts = [...(block?.querySelectorAll?.("pre.md-code > code") ?? [])];
  return parts.map((c) => String(c.textContent ?? "")).join("\n").trim();
}
```

派发（`:7506-7521`）加两路：

```js
        if (action === "copy-code") {
          cb.onCopyChat?.(codeTextFromNode(itemNode, actionBtn));
          return;
        }
        if (action === "copy-table") {
          const wrap = actionBtn.closest(".md-table-block");
          const rows = [...(wrap?.querySelectorAll("table.md tr") ?? [])].map((tr) =>
            [...tr.querySelectorAll("th, td")].map((c) => (c.textContent ?? "").trim()));
          cb.onCopyChat?.(formatTableExport(rows));
          return;
        }
        if (action === "table-more") {
          // 折行是**显示**的开关；行一直在 DOM 里（复制要读到全部）
          actionBtn.closest(".md-table-wrap")?.classList.toggle("is-open");
          return;
        }
```

> **这一处必须读 `:7506-7521` 的原文再改**：那段是 `if (action === "copy")` / `"export-sources"` 的既有分支，**新分支要插在同一处、用同样的 `cb.onCopyChat?.()` 通道**。别另起一个事件监听器——那会变成第二套派发。

- [ ] **Step 6: 跑测试，并处理既有锁**

Run: `npx vitest run test/markdown.test.ts test/ui-patch.test.ts test/ui-math.test.ts`

Expected: **`markdown.test.ts` 的既有 425 行预计有红** —— 本任务改了代码块与表格的**外层结构**（多了 `.md-block` 壳）。**逐条读那些红**，判断是"我们的改动破坏了它的契约"还是"它锁的是旧 DOM 形状"。**只许改后者**，并在提交信息里写明改了几条、为什么。

> 勘查核实过一条：`ui-patch.test.ts` 里**没有任何表格渲染的 describe**（表格锁全在 `markdown.test.ts:292-360`），所以它那边大概率不红——**但"大概率"不算证据，跑一遍**。

- [ ] **Step 7: 活页验收（只有真浏览器看得出来）**

新建 `eval/persona-ux/_audit-20260919/verify-long-content.mjs`：造一条含 60 行代码块与 60 行表格的消息，量——

- 代码块头部有语言与行数；点"再展 N 行"能展开；**点"复制"后剪贴板里是全部 60 行**（不是 4 段变 1 段）
- 表格**自身横滚**：`table.scrollWidth > wrap.clientWidth` 且正文不横溢（`document.documentElement.scrollWidth === clientWidth`）
- 点"复制"后剪贴板里是 60+ 行的 TSV
- 0 控制台错误

Expected: 四条全成立。**第二条是 B5 的原话（"表格自身横滚而不是撑破正文"）**——它只有真浏览器量得准。

- [ ] **Step 8: 提交**

```bash
git add ui/public/core/markdown.js ui/public/app.js ui/public/styles.css test/markdown.test.ts eval/persona-ux/_audit-20260919/verify-long-content.mjs
git commit -m "feat(ui): 长代码块与长表格的折叠、横滚与复制出口（B 簇 B5/B6）

两处按房子既有做法落，不是偷懒：
① 设计案的「导出 CSV」落成「复制为 TSV」——勘查核实 ui/public 里没有任何
   前端生成文件的做法（URL.createObjectURL 全仓只有一处，是图片预览），
   房子唯一的文本导出是 formatSourceExport：格式化成 TSV 走剪贴板。
   粘进 Excel 是同一条工作流，新造 Blob 下载只会留两种做法。
② 「保存为产物」/「在编辑器打开」不做（列单独立项）：代码块与表格在对话里
   没有文件路径，要变成产物必须先落盘，而宿主侧没有通用写端点。

表格折行用 CSS 隐藏而不是不渲染——复制要读到全部行，不渲染就只能复制
看得见的那半。代码块折叠同理：codeTextFromNode 把两段接起来。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 产物清单收拢到一个真值源（B2 / B3 的升格手势落在真数据上）

**Files:**
- Modify: `ui/public/index.html`（`:853-877` 那三个函数与 `openedPreviewArtifacts`；`openPendingArtifact` `:959-975`；`initArtifactCanvas` 注入 `:981-985`）
- Test: `test/ui-artifacts.test.ts`（追加接线锁）

**Interfaces:**
- Consumes: `selectPreviewArtifacts` / `ensurePreviewArtifact`（**两个纯函数都已存在于 `app.js`**）、`currentRunArtifacts(runId)`（`index.html:847-851`）
- Produces: `openedPreviewArtifacts(runId)` 语义变更 —— 从「用户点开过的」变成「**这一场的产物 ∪ 用户点开过的**」；新增 `asPreviewTab(path)` 与 `previewTabsCache`

**背景（本计划最值钱的一刀，而且它比看上去小）：**

勘查查出产物在代码里是**三套互不通气的系统**。但真正的病根只有一处：

| 系统 | 数据来源 |
|---|---|
| 对话产物条（第一套） | `currentRunArtifacts(runId)` —— **这一场的全部产物** |
| 预览坞标签条（第三套） | `openedPreviewArtifacts(runId)` —— **只有用户手动点开过的** |

于是**产物条里看得见的东西，在画布的标签条里不存在**。代码里甚至为此打了补丁：`openPendingArtifact`（`:959-975`）在深链进来且标签条为空时，**手动**从 `currentRunArtifacts` 挑一个塞进去。**那个特例就是这两套清单不该分开的证据。**

**而修法不需要新机制**：`selectPreviewArtifacts`（滤掉核查脚本与 node_modules）与 `ensurePreviewArtifact(list, path)`（"已在里面就回原位，否则追加到末尾"）**都已经在 `app.js` 里**，只是没有任何调用点把它们接到标签条上。

**第二套（`#/artifacts` 画廊）本计划不动**，理由：它吃 `?projectId=|workdir=`，是**跨 run** 的约定产物（落地页 / 幻灯 / DESIGN.md 四件，`cite.ts:10-15`），与"这一场写了什么"是两个问题。它的空态文案已经自己说清了分界（`artifacts.js:19`「本次写下的文件在对话的产物条里」）。**收拢的是"同一场对话内的两套"，不是把跨场的也并进来。**

**★ 一个必须先说清的性能陷阱**：`openedPreviewArtifacts` 有 **7 个调用点**（`index.html` 的 814 / 819 / 837 / 855 / 868 / 873 / 5971），其中 5971 是画布宿主的 `getArtifacts`，**在画布的渲染路径上**。从前的实现是一次 Map 查；改完变成"把整条时间线走一遍"——长 run 上每帧走一遍时间线是实打实的退化。**所以缓存不是优化项，是这个改动的必要部分。**

- [ ] **Step 1: 先读三个东西（不许跳过）**

1. `resolveArtifactOpen(list, want)` 的**定义**——它在哪、怎么用 `kind`。
2. `ui/public/features/artifact-canvas.js` 里**对 `kind` 的全部使用**（grep `kind`）——确认画布只认哪几种取值。
3. `index.html:780-810` 与 `:959-975` 的**原文**（`.plan2-excerpts-artifacts.md` 的 C1/C2 节是逐字抄录）。

**为什么先读**：合并两套清单会把 `deriveSessionFiles` 的 `kind`（`"upload"` / `"artifact"`）混进标签条，而标签条今天的 `kind` 只有 `"browser"` / `"preview"`（`rememberPreviewFile` 的写法，`:861-864`）。**画布若按 `kind` 分派，混进来的取值会走错分支**——这正是要归一的地方。

- [ ] **Step 2: 写失败的测试**

追加到 `test/ui-artifacts.test.ts`：

```ts
describe("标签条与产物条共用一个真值源（计划 2 · 任务 6）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("标签条读的是既有派生，不是自己那份'点开过的'", async () => {
    const source = await html();
    expect(source).toMatch(/selectPreviewArtifacts\(/);
    expect(source).toMatch(/currentRunArtifacts\(/);
  });

  it("合并去重走既有的 ensurePreviewArtifact——不许再写一份", async () => {
    const source = await html();
    expect(source).toMatch(/ensurePreviewArtifact\(/);
  });

  it("派生有缓存：标签条在画布渲染路径上，不许每帧走一遍时间线", async () => {
    const source = await html();
    expect(source).toMatch(/previewTabsCache/);
  });
});
```

- [ ] **Step 3: 跑测试确认它失败**

Run: `npx vitest run test/ui-artifacts.test.ts -t "共用一个真值源"`

Expected: FAIL 三条 —— `selectPreviewArtifacts` / `ensurePreviewArtifact` / `previewTabsCache` 在 `index.html` 里都不出现。

- [ ] **Step 4: 最小实现**

把 `index.html:853-877` 那一段改成：

```js
/** 用户点开过的预览标签（网站或本地路径）。它是**补集**，不是全集——见下。 */
const extraPreviewFiles = new Map();

/**
 * 这一场的预览标签条 = **这场对话的产物 ∪ 用户点开过的**。
 *
 * 从前这里只有「用户点开过的」，于是产物条里看得见的东西在画布标签条里
 * 找不到；代码里为此打了个补丁（`openPendingArtifact` 在标签条为空时手动
 * 从 `currentRunArtifacts` 挑一个塞进去）。那个特例就是两套清单不该分开的证据。
 *
 * 用既有的两个纯函数接上，不新增机制：
 *   · `selectPreviewArtifacts` —— 滤掉核查脚本与 node_modules
 *   · `ensurePreviewArtifact`  —— 已在里面就回原位，否则追加到末尾
 *
 * **kind 一律归一**：画布只认 `browser` / `preview` 两种，而
 * `deriveSessionFiles` 给的是 `upload` / `artifact`——不归一的话画布会按
 * 未知取值分派。判据与 `rememberPreviewFile` 逐字相同，只此一处。
 */
const asPreviewTab = (path) => ({
  path: String(path ?? ""),
  kind: isBrowserPreviewPath(path) ? "browser" : "preview",
});

/**
 * 标签条的缓存。**这不是优化项**：`openedPreviewArtifacts` 有 7 个调用点，
 * 其中 `initArtifactCanvas` 的 `getArtifacts` 在画布的渲染路径上。
 * 改之前它是一次 Map 查；改之后它是"把整条时间线走一遍"——不缓存的话，
 * 长 run 上每帧走一遍时间线是实打实的退化。
 */
const previewTabsCache = new Map(); // runId -> { stamp: string, list: {path, kind}[] }

function openedPreviewArtifacts(runId) {
  if (!runId) return [];
  const mine = extraPreviewFiles.get(runId) ?? [];
  // 缓存键：产物条的长度（它随事件增长）+ 手动开过的条数。两样合起来够用，
  // 而且不需要订阅任何东西。（确切取法见下面那条注——**先读原文，别猜**。）
  const stamp = `${currentRunArtifacts(runId).length}|${mine.length}`;
  const hit = previewTabsCache.get(runId);
  if (hit && hit.stamp === stamp) return hit.list;

  // 顺序：这一场的产物在前（它就是这一场的目录），手动点开过的补在后面
  let list = selectPreviewArtifacts(currentRunArtifacts(runId)).map((f) => asPreviewTab(f.path));
  for (const f of mine) list = ensurePreviewArtifact(list, f.path).list.map((t) => asPreviewTab(t.path));

  previewTabsCache.set(runId, { stamp, list });
  return list;
}
```

> **`stamp` 的取法要按原文定**：上面用 `currentRunArtifacts(runId).length` 当键，但 `currentRunArtifacts` **本身就要走一遍派生**——用它当键等于没缓存。**正解**：读 `currentRunArtifacts`（`:840-851`）的原文，看它从哪取 `runStates` 里的 state，把 `stamp` 建立在那个 state 的**时间线长度**上（O(1)），而不是建立在派生结果上。**这一条不许猜**——猜错就等于缓存没生效，而缓存没生效在本地短 run 上根本看不出来。

`openPendingArtifact`（`:959-975`）里那段"标签条为空就手动塞一个"的特例**改完之后可以删**——标签条现在天然非空（只要有产物）。删之前 grep 确认没有别的路径依赖 `pendingArtifact` 的非空分支。

- [ ] **Step 5: 跑测试确认全绿**

Run: `npx vitest run test/ui-artifacts.test.ts test/ui-artifact-canvas.test.ts test/ui-preview-dock.test.ts`

Expected: 全绿。**这三个是本刀最可能碰坏的地方**——`ui-artifact-canvas.test.ts` 有 1255 行，锁着画布的类型分派与路由编解码。

- [ ] **Step 6: 活页验收（只有真浏览器看得出来）**

新建 `eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs`：开一场**有产物**的 run，量——

- **画布标签条里的项数 = 产物条里的项数**（"两套变一套"的直接判据）
- 产物条里的第一项，在标签条里也是**第一个**

> **★ 勘误（终审 I1）**：上面两条判据**不成立**——两侧契约本来就不该相同。
> 产物条是**呈报视图**：按 FILE_GROUPS 分组（图→网站→文档→其他）且逐个
> 验存在性、盘上没了的卡片拿掉；标签条是**导航器**：按 seq 时序、不验
> 存在性（要能开到"写过但盘上没了"的三态卡）。所以两侧**成员可能不同**
> （盘上已删的只在标签条里）、**顺序按设计不同**（时序 vs 分组）。"同一个
> 真值源"指的是**数据来源**（都出自同一份时间线派生），不是两个视图逐项
> 相等——当初把判据写成"清单相同"是计划作者的错。原判据只在特定 run 的
> 特定时刻成立（探针当初选中的 `3221e432`，其 seq 顺序恰好等于分组顺序，
> 是巧合——现在重跑它 exit 1）。探针已改：① 比集合——标签条 ⊇ 产物条，
> 差集（tabs−rail）每一项必须盘上已不存在（差集里出现盘上还在的项 =
> 真 bug，要红）；② 顺序按设计不同，只打印不比对。下方"五条全成立"的
> Expected 相应理解成"按勘误后的判据全成立"。

- 点开一个此前没点过的产物 → 它仍在**原位**（`ensurePreviewArtifact` 的"回原位"语义）
- **连续切标签 20 次，`getArtifacts` 的单次耗时不对时间线长度增长**（用 `performance.now()` 量）
- 0 控制台错误

Expected: 五条全成立。**第四条是缓存那一条的必要性证明**——没有它，前三条全绿而长 run 上每帧走一遍时间线。

- [ ] **Step 7: 提交**

```bash
git add ui/public/index.html test/ui-artifacts.test.ts eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs
git commit -m "refactor(ui): 产物条与预览坞标签条收拢到一个真值源（B 簇收拢）

勘查查出产物在代码里是三套互不通气的系统，但病根只有一处：产物条拿的
是「这一场的全部产物」，标签条拿的却是「用户手动点开过的」，于是产物条
里看得见的东西在画布标签条里不存在。代码里为此打了补丁
（openPendingArtifact 在标签条为空时手动挑一个塞进去）——那个特例
就是两套清单不该分开的证据。

修法不新增机制：selectPreviewArtifacts 与 ensurePreviewArtifact
两个纯函数本来就在 app.js 里，只是没人接上。kind 一律归一到
browser/preview——画布只认这两种，而 deriveSessionFiles 给的是
upload/artifact。

加了缓存：openedPreviewArtifacts 有 7 个调用点，其中画布宿主的
getArtifacts 在渲染路径上；改之前是一次 Map 查，改之后是走一遍时间线，
不缓存就是实打实的退化（活页第四条量这个）。

第二套（#/artifacts 画廊）不动：它是跨 run 的约定产物，与'这一场写了
什么'是两个问题，它的空态文案已经自己说清了分界。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

---

## Self-Review

### Spec coverage（设计案 14 态 → 任务）

| 态 | 落在哪 |
|---|---|
| A1 粘贴单张（编号 chip） | **任务 2**（按 textarea 的意图落地：编号是行内文本 + 编号缩略图） |
| A2 多图（编号连续 + 缩略图行） | **任务 2** |
| A3 生成图内嵌 + 自动入图库 | **未覆盖** —— 见「单独立项」1 |
| A4 非图附件 chip（图标 + 名 + 体积 + ×） | **任务 3** |
| A5 上传中 / 失败（进度 + 原因 + 重试） | **任务 3**（进度如实记为本机看不见） |
| A6 大目录降噪折叠 + 展开态记忆 | **任务 4**（`Expand All` 落成"展开到第二层"，差异有记录） |
| B1 图表内嵌 + 三个留存出口 | **未覆盖** —— 见「单独立项」2 |
| B2 HTML 内嵌（沙箱 iframe） | **已有**（`artifact-canvas.js` 的 html case + `/site` 整站取件），本计划不重做 |
| B3 升格之后（右栏常驻 + 索引卡） | **任务 6**（让它的标签条读真数据；"收回"手势已有） |
| B4 行内 diff + hunk Keep/Reject | **计划 3**（你裁定归 Code 脸） |
| B5 长表格（横滚 + 折行 + 导出） | **任务 5**（导出落成"复制为 TSV"） |
| B6 长代码块（语言 + 行数 + 三个动作） | **任务 5**（落"复制"与"折叠"；另两个动作见「单独立项」3） |
| B7 Mermaid | **未覆盖** —— 见「单独立项」4 |
| B8 数学（KaTeX + 复制 LaTeX） | **已有**（`core/math.js` + `/vendor/katex`），本计划不重做 |

**覆盖率：9 / 14 落地，5 个有明确去向。** 另有 **B2 / B8 两态是"已有、不重做"**——它们在设计案里占两格，但代码里已经成立；计划里写清这一点的价值是**防止实现者以为要从零造**。

### Placeholder scan

无 TBD / TODO。**两处刻意留给实现者的"先读再定"**（写作技能允许且鼓励，因为猜错的代价更大）：
1. 任务 4 Step 5 的 **`sortEntries` 顺序** —— 已改成 `foldNoiseEntries` 返回有序 `items`，**这个"先读"已经消除**。
2. 任务 6 Step 4 的 **`stamp` 取法** —— `currentRunArtifacts` 的原文要读（用它自己当缓存键等于没缓存）。**这是全文唯一一处刻意不写死的地方**，且标明了"不许猜"。

### Type consistency

- `parseAttachmentLine` 返回 `{no: number|null, path: string} | null`；`splitUserMessageAttachments` 返回 `{body, displayBody, attachments: string[], attachmentRefs: {no,path}[]}` —— 任务 2 的实现与测试一致。
- `foldNoiseEntries` 返回 `{items}`，`items` 的元素是 `{type:"entry", entry}` 或 `{type:"group", key, label, count, members}` —— 任务 4 的 Interfaces、测试、`renderLevel`、`renderGroupRow(g, parentRel, depth)` 四处一致。
- `uploadEntry(entry, ctx)` 的 `ctx` 形状 `{at: {mode, runId}, targetWorkdir}` —— 任务 3 里 `uploadFiles` 与 `retryUpload` 两处调用一致。
- `openedPreviewArtifacts(runId)` 返回 `{path, kind: "browser"|"preview"}[]` —— 任务 6 的 `asPreviewTab` 与既有 7 个调用点一致。

### 已知偏差（如实记，落地时按本计划不按设计案字面）

| # | 设计案说 | 本计划落成 | 为什么 |
|---|---|---|---|
| 1 | A1「粘贴后在光标处插一个编号 chip」 | 编号是**行内文本**（`Image #1`），视觉在编号缩略图行 | 输入框是 `<textarea>`，塞不进真 DOM chip |
| 2 | A1 与 A2 都自动插引用 | **单张自动插；批量只给缩略图，点一下才插** | A2 的设计本来就没画自动插入；批量堆六条是噪音 |
| 3 | A6「全部展开」 | **展开到第二层** | 树是逐层拉的、服务端有深度 8/每层 200 两道闸 |
| 4 | B5「导出 CSV」 | **复制为 TSV** | 房子的"导出"就是 TSV 走剪贴板，`ui/public` 没有前端生成文件的做法 |
| 5 | A5 进度条 | **做，但如实记本机看不见** | loopback 上 20MB 一转瞬；本机的真痛是"传完才被拒"与"失败就消失" |
| 6 | 产物的三套系统收拢 | **只收拢同一场对话内的两套** | 第二套是跨 run 的约定产物，是另一个问题 |

### 单独立项（本计划不做，各附勘查给的基线与入口）

0. **★ 折叠的 composer scope 把「工作目录」触发钮盖住了（计划 3 的头号任务）** —— Task 1 探针**被迫绕行**过它一次，reviewer 独立复核属实（还做了两次受控实验）：`styles.css:4764-4772` 的 author `.composer-scopebar { display:flex }` **压过了 UA 对折叠 `<details>` 的隐藏**，Chromium 的折叠内容 slot 让它**只有布局盒、不参与绘制/命中**；而透明 `TEXTAREA#task-input`（`styles.css:5364 background:transparent`）占着同一条 y 带。**折叠时「工作目录」触发钮不可见且点不到。**
   精确定位：DOM `index.html:254`（details）/ `:260`（scopebar）/ `:272`（workdir-trigger）；CSS `styles.css:4764-4772`（病灶规则）/ `:4685-4695`。
   一行修法：`.composer-scope:not([open]) .composer-scopebar { display:none }`，并订正 `index.html:256` 那句"收起的 details 只渲染 summary"（**它错了一半**）。
   **为什么是计划 3 的头条**：计划 3（Code 脸 git/PR 面）的探针**每次都要走工作目录菜单**，修掉它，后续探针才能删掉绕行代码。

1. **图片编辑器（A3）** —— 现在只有 `review-mode.js:1348+` 的**画圈标注**（盖 canvas 层，点评写回输入框），**不产生新图**；无灯箱（grep `lightbox|灯箱` 0 命中）。真正的编辑器（选区 / 横竖比 / Undo）是一整块。
2. **图表内嵌（B1）** —— markdown 管线里**没有图表渲染**；要先决定"图表从哪来"（模型输出什么格式），是渲染能力问题不是排版问题。
3. **「保存为产物」/「在编辑器打开」（B1/B6）** —— 代码块与表格在对话里**没有文件路径**，落盘需要一个宿主写端点，而宿主只有 `POST /api/upload`（落 `uploads/`）与 `POST /api/fs/mkdir`（只建目录）。入口在 `ui/server.ts:9674-9681` 那张路由表。
4. **Mermaid（B7）** —— 全仓零渲染代码（grep 只在 docs/eval 命中），而本仓的渲染链是**手写零依赖**（`markdown.js` / `highlight.js` 顶部注释写明了为什么）。KaTeX 是唯一豁免。加不加 Mermaid 是**技术取向选择**，不只是排版。
5. **`sidebarRailItems()` 接上真实按钮** —— 计划 1 的 I4：它现在是"能见度契约"，没有消费者（真实按钮是 `#new-chat-btn` / `#board-open-btn` / …）。接上的那天要同时补 DOM 侧的可达性测试（计划 1 的 T2-1）。
6. **第二套脸表示的迁移** —— `data-workspace-face` 与两处 `designModeActive = workspaceFace === "office"` 仍在（`index.html:1403` / `4823`）。**计划 3**。
7. **plan-2 的 git 夹具之外的宿主夹具** —— 本计划只立了 git 那一个。附件/产物的活页验收目前靠"造文件"（任务 3 就是这么做的），够用；若将来验收面继续长，值得立一个统一的 `scripts/fixtures/`。

### 本计划不吃的那三条（计划 1 的教训，逐条都对应了具体做法）

1. **CSS 规则与它匹配的 markup 必须一起锁** —— 任务 2/3/6 的接线锁都断言**表达式本身**，不是"这一带出现过这个名字"。
2. **改了断言必须变异验红** —— 任务 2 Step 7 明确要求删掉被锁的那行看它红、再还原。
3. **计划里的每个 `file:line` 都来自真实读取** —— 本计划的锚点取自 `.plan2-survey.md` 与四份 `.plan2-excerpts-*.md`，四位勘查员一共报回 **16 处"与描述不符"**，其中三处会让实现者卡住（`previewUrl` 不是函数、上传测试组比勘查给的宽、**`file-tree.js` 从不排序**）。**那三处如果没查，就会变成计划里的三句假话。**
