# 计划 3 · 审阅动作（Code 脸的核心）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Code 脸真的能**审**——把「这次改了什么」从事件流里那条**没有位置**的对比，换成**有行号、有上下文行、逐 hunk** 的真 patch，并在它上面长出一套审阅动作（已阅 / 撤掉 / 下一个 hunk），再给它一个**召出的**右栏视图；顺带清掉三处挡在探针路上的遗留缺陷。

**Architecture:** 三块地基 + 一块新面。
1. **三处遗留**（composer scope 的幽灵控件 / workdir-picker 的抢跑回写 / 窄坞标签条归零）各自独立、都有活页实锤，先修因为它们挡着后面所有探针的路（计划 2 的探针已经为它们绕行过一次）。
2. **真 patch 端点**：`git diff -U3` 给出**行号与上下文行**，补上事件流那条链**结构上拿不到**的东西（`write_file` 覆盖场景没有旧版、`edit_file` 的 old/new 串没有位置）。两个来源各有各的活，**谁也不替谁**。
3. **内嵌 diff 与审阅动作**：改动默认内嵌在对话流里（调研约束 §7.2「内嵌优先于侧栏」），动作长在 hunk 上。
4. **召出的右栏审阅视图**：只在召出时存在。

**★ 两个已裁定的取向**（委托方 2026-09-20 拍板，理由写在「关键决策」里）：

- **「撤掉」不发写请求，而是发一条定位消息给 agent**（B 方案）。宿主没有文件写端点，而加一个意味着工作区多一个写者；顺着 B 推下去，**Keep 与 Mark as Reviewed 会塌成同一件事**，所以设计案的三件套（Keep · Reject · 下一个）落成**两件**：**已阅 · 撤掉 · 下一个 hunk**。
- **PR 面不在这份计划里**（读状态 / commit message 生成 / 进度 tab 归计划 4）。

**Tech Stack:** 原生 ESM（`ui/public/*.js`，无构建步）、纯 CSS、TypeScript 宿主（`ui/server.ts` / `src/workspace-git.ts`）、vitest + jsdom 做单测、Playwright 做活页验收。

**Spec（设计案，逐屏拍板的那一份）:**
- `.superpowers/brainstorm/198-1789817065/content/scheme-a-code-3states.html`（Code 脸三态：**态 2 内嵌 diff + hunk 动作**、**态 3 召出的 diff/PR 面板**）
- `.superpowers/brainstorm/198-1789817065/content/states-B-richcontent.html`（B4 行内 diff —— 计划 2 裁定归 Code 脸）
- 调研依据：`eval/persona-ux/_audit-20260919/RESEARCH-AGENT-UI.md`
  - **§3**「Work 脸 / Code 脸的差异」→ 三处分化：中栏内容形态 / 右列内容 / **GitHub 的出现面**
  - **§4**「Code 脸与 GitHub 的配合」→ diff 审阅那一行（hunk 级动作 / Mark as Reviewed / 冲突）
  - **§7**「三条被调研钉死的约束」→ ①对话宽度 60–73% ②**右列内容驱动、内嵌优先于侧栏** ③**Code 脸恒有 GitHub、Work 脸完全不出现**
- **代码现状（本计划的地基）**：`.superpowers/plan3-grounding/`（**已 gitignore 的草稿区**）——见下节。

**前两份计划**：`docs/superpowers/plans/2026-09-19-scheme-a-skeleton.md`（计划 1，骨架）、`docs/superpowers/plans/2026-09-19-plan2-attachments-artifacts.md`（计划 2，附件与产物条）。两份都已落在 `main`。本计划**承接它们的骨架，不重做**。

---

## 关键决策（已裁定，实现者不必再论证，但**必须照做**）

### D1 ·「撤掉」= 一条定位消息，不是一个写请求

设计案写的是「hunk 级的 Keep/Reject 就在行上（**Zed 的做法**）」。**Zed 的 Reject 真的把文件写回盘上**，而本宿主**没有通用文件写端点**——计划 2 勘查过，只有 `POST /api/upload`（落 `uploads/`）与 `POST /api/fs/mkdir`（只建目录），入口在 `ui/server.ts` 的路由表。

加一个写端点意味着：**工作区多一个写者**。agent 正在跑时 UI 回退 → agent 下一次 `edit_file` 的 `old_string` 失配而失败，而那个失败对 agent 来说是**无法解释的**（它没动过那个文件）。而且它是新的攻击面。

**所以：「撤掉」= 在输入框里生成一条定位到 hunk 的消息，由 agent 执行。**

```
点「撤掉」→ 输入框里出现：
把 ui/public/app.js 第 11456 行起那 12 行新加的撤掉
（用户可改可删，按 Enter 发出——与计划 2 的 nextStep 是同一套机制）
```

**★ 顺着它推下去的收获**：Keep 的意思就是"我看了，不用撤"——**那正是 Mark as Reviewed**。所以设计案的三件套塌成两件，少一个机制：

```
✓ 已阅   ·   ✕ 撤掉   ·   下一个 hunk ↓
```

- **已阅**：纯前端状态，跟着 run 走，**文件/hunk 再被改动时自动失效**（调研 §4 抄 Copilot 的那条）。
- **撤掉**：往输入框塞一条消息（**不发送**，留给用户过目——它是一条会被 agent 执行的自然语言指令，不该悄悄发出去）。
- **下一个 hunk**：纯滚动定位。

### D2 · patch 的来源是 `git diff`，**不是**事件流

两个来源各有各的活，**谁也不替谁**：

| | 事件流（`editHunksFromTimeline`，已有） | `git diff`（本计划新增） |
|---|---|---|
| 有 | 这场 run 改了**哪些**路径、改了**什么内容**（`edit_file` 的 `old_string`/`new_string`，**字节精确**） | **行号**、**上下文行**、hunk 边界 |
| 没有 | **位置**（哪一行） | **run 归属**（混着用户自己的未提交改动、上一场 run 的改动） |
| 盲区 | **`write_file` 覆盖场景拿不到旧版**（代码注释自己写着） | 非 git 目录**完全没有** |

**所以**：patch 端点给的是**「工作区相对 HEAD」的真 patch**，语义**如实标注**；"这场 run 碰过哪些路径"仍由事件流那条链给（`collectTouchedPaths`，已有）。**内嵌 diff 卡只对"本场碰过的路径"出现，但卡片里画的是那个路径的工作区 patch。**

**★ 这一条同时补上了那个洞**：`write_file` 覆盖的文件在事件流里没有旧版可比，但在 `git diff` 里**整个新内容都是 `+` 行** —— 这正是设计案要的画法。

### D3 · 窄坞标签条：修 CSS 的**意图违背**，不动 `railPolicy`

`.ac-head` 的注释（`styles.css:9551`）逐字写着：

> `/* split 档预览列可能只有 ~141px：头里的「放大」等键够不着时允许横滚，`
> `   不让它越列而过（走查 UX-C1 的同族边角） */`

是 `.ac-tabs { flex: 1 1 0; min-width: 0 }` 让它成了坞头里**唯一能被压到 0 的成员**——固定成员（收起键 / 加号键 / 放大键 / padding / gap）加起来 **190px** 已经超过坞的 **159px**，于是 flex 把唯一可缩的那个压到了 **0**，930px 的标签一个也看不见。

**★ 这里原本写的是"横滚永远轮不到"，那是错的**：坞头修前**就已经在滚**（固定成员自己就溢出）。真正坏掉的是**标签条宽度为 0**，不是"横滚没发生"。**实现者实量后指出了这一点**，本计划已订正。

**为什么不改 `railPolicy`**（我原本的修法，已作废，理由如实记下）：`RAIL_MAX_PX = 360`（`rail-policy.js:25`）而 `TREE_MIN_PX = 200`（`:41`）→ **`preview = 360 − 200 = 160`，在可达的任何 rail 宽度下都是这个数**。所以"给预览列一个地板"会让 **split 在任何视口下都不再发生**；而抬高 rail 上限又撞上调研 §7.1「对话宽度必须回到 60–73%」。**底下那个更大的问题（1440–1600 视口下，三列布局的空间本来就不够）记进「单独立项」，不在本计划里动。**

---

## Global Constraints

计划 1 与计划 2 的全部约束继续有效，**逐条列出以便实现者不必翻旧计划**。

### 从计划 1 继承

- **正文度量用 `em` 不用 `ch`**。一个中文全角字 ≈ 1em；`ch` 是拉丁"0"的宽度。度量常量只写一处：`:root { --measure: 40em }`。
- **CSS 变量：引用的必须定义过**。`ui-app.test.ts` 有一条硬门，新变量必须同时在 `:root` 有默认值。
- **禁用 unicode dingbat 做状态图标**（`✻ ✽ ✢ ∙ ◆ ○ ✓ ✕ ■`）：Windows 下字体回落不一致。**状态点一律用 CSS 画的形状。**
  **★ 对本计划的影响**：设计案里那个 `✓ 已阅 / ○ 未阅` 与 `● PR 检查中`，**落地时必须换成 CSS 形状**，不许直接写这两个字符。
- **两脸的差异只收在 `body[data-face="work|code"]` 一个属性上**，不许在别处再判断"现在是哪张脸"。
  **★ 而且要写成成对的两条**（一边显、一边 `display:none`）——**只挂一半不是"另一边不出现"，是"另一边以无样式形态出现"**（T6 实测：187 行 CSS 全挂 code 脸，于是这张卡在 Work 脸以裸 `<details>` 出现）。
- **中文文案**：界面文案全中文；代码注释中文。
- **每个任务结束必须提交**，commit message 用 `type(scope): 中文描述`（本仓既有格式），结尾带**你所在环境要求的署名尾注**。
  **★ 不要照抄计划模板里的那行**（2026-09-20 实测，T4）：子代理各自有环境强制的署名规则，计划里写死的那行会被覆盖——**那一刻实现者的做法是对的，是计划错了**。
- **不许改 `eval/persona-ux/**` 的既有档案**（精确口径见下）。

### 从计划 2 继承（**每一条都有对应的实战事故**）

- **★ CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁。** 计划 1 里元素 id 被当成类写进选择器（规则空转）、又只锁了 CSS 文本没锁 markup（删掉那个类，303 条测试全绿而 bug 复活）。
- **★ 断言要锁"接线表达式本身"，不是"这一带出现过这个名字"。** 一句注释喂得饱 `toContain`。
- **★ "使用"与"引入"是两件事。** `stripAttachmentLine` 连着三笔提交没 import，过了**六道关**；最后是活页探针真去点了一下删除才现形。`test/ui-shell-imports.test.ts` 是通用护栏。
- **★ 改了测试/断言必须变异验红**：把被锁的那行删掉，看它红不红，再还原。**写完直接绿什么都不证明。**
- **★ 行尾与内容核验用字节，不用 `git status`**：`node eval/persona-ux/_audit-20260919/check-eol.mjs [文件…]`。
- **★ 行尾漂了怎么修**：`git checkout HEAD -- <path>` **修不好它**（stat 缓存跳过写入）。正解是 `rm -f <path> && git checkout HEAD -- <path>`。
- **★ 计划正文里的每个 `file:line` 锚点都必须来自真实读取。** 本计划的锚点全部由本次勘查（`.superpowers/plan3-grounding/`）**回原始处逐条核过**；落笔时若勘查与计划正文不符，**以仓库为准并回写勘误**。
- **★ 别用 `git worktree` 建测试基线做跨目录对比**：本仓的 `cli-*` 是 spawn 活页测试，换目录行为就变。
- **★ 每个任务的探针都必须真去点。** 计划 2 里 `write_file` 覆盖场景的洞、`stripAttachmentLine` 的洞、长内容折叠的洞，**三条都是"纯函数绿 + 接线锁绿"却走不通**，只有真点才现形。

### 本计划新增

- **`ui/public/index.html` 内联了主壳的全部控制器逻辑（6349 行）**；`ui/public/app.js`（12161 行）是 **Harness Web UI（会话详情渲染层）**，由 `index.html:2238` 的 `renderRunDetail(state, {...})` 调进主壳。**两者不是"HTML + JS"的分工**——在壳里找控制器去 `index.html`，在会话流里找渲染去 `app.js`。
- **patch 是"工作区相对 HEAD"，不是"本场 run 专属"**。代码、注释、界面文案都必须这么说，**不许简写成"本场改动"**。
- **不许新增前端渲染依赖**（`core/markdown.js` / `core/highlight.js` 是手写零依赖的；KaTeX 是唯一豁免）。diff 的行着色是**纯 CSS + 逐行建元素**，与 `changes-panel.js` 的既有做法一致。
- **不许新增持久化实体**。「已阅」是前端状态（跟着 run 走）；patch 每次现取。
- **★ 订正本身也要被复查——它自己会长出新的漂移。**（2026-09-20 的实测，本计划里出现了**三次**，而三次都是**别人审出来的**：）
  1. **任务 3**：我把计划里的假机制句改了，**却没改仓库里 `styles.css` 的同一句**——出货文件里那句话与它自己的实测数字（`190 > 159`）自相矛盾。
  2. **T3-C**：我清残渣时，又改了计划里 Step 2 的 docstring 模板，**却没改下面 Step 8 的提交信息模板**——同一个假尾句还留着。
  3. **T4-E**：我改了 handler 片段**上方**的注释（写明"越界是抛、要包 try/catch"），**却把片段本身的代码留着**——里面还是 `if (!abs)` 的假 null 检查与过不了 tsc 的 `.root ||`。**实现者照抄就会复现刚修掉的两个坑。**
  **规矩**：**凡是"把这个说法改对"，先 grep 它的全部副本**（注释 / 模板 / 文档 / 代码片段 / 提交信息），**改完再 grep 一遍确认清零**。
  **为什么这条比前几条更狠**：前几条说的是"锁要能红"，这一条说的是**"订正本身没有看门人"**——它不像测试那样有绿灯可看，**唯一的检出方式是有人重新读一遍**。

### 关于 `eval/persona-ux/**` 的口径（计划 2 定过，继续有效）

- **不许改**：`_audit-20260915/**`、`walks/**`、以及 `_audit-20260919/` 里**已有的**报告与探针（含 `verify-artifact-tabs.mjs` / `verify-face-git.mjs` / `check-eol.mjs`）。
  **★ 注意**：`verify-artifact-tabs.mjs:301-303` 会打印 `tablist scrollLeft=（…）`。本计划 Task 3 改了谁在滚，**那行打印的值会变——它只打印不判据**（探针自己的注释：「记进报告，不拦验收」），所以探针不用改，也不许改。
- **可以新增**本计划自己的探针到 `eval/persona-ux/_audit-20260919/`。

---

## 文件结构

| 文件 | 职责 | 本计划里怎么动 |
|---|---|---|
| `ui/public/styles.css` | 全部样式 | **任务 1/3/6/7**：折叠 scope 的幽灵、坞头不再被压到 0、内嵌 diff 卡、审阅面板 |
| `ui/public/index.html` | **主壳**（含内联控制器） | **任务 1/5/6/7/8**：订正错注释、深链、待发送文本、召出的面板接线 |
| `ui/public/features/workdir-picker.js` | 添加目录浮层 | **任务 2**：用户动过输入框之后不许被异步回写覆盖 |
| `src/workspace-git.ts` | 服务端 git 探测 | **任务 4**：新增 `probeFilePatch`（真 patch 解析） |
| `ui/server.ts` | 宿主（路由表 + handler） | **任务 4**：新增 `GET /api/workspace/git/diff` |
| `ui/public/features/workspace-git.js` | 前端 git 芯片 | **任务 4**：新增 `fetchFilePatch` |
| `ui/public/features/artifact-canvas.js` | 产物画布 + 深链 | **任务 5**：深链从下标改按路径 |
| `ui/public/app.js` | **Harness Web UI**（会话流渲染 + 纯函数派生层） | **任务 6/7**：内嵌 diff 的派生与渲染、已阅状态、撤掉消息 |
| `test/ui-layout.test.ts` | 计划 1 的骨架锁 | **任务 1/3** 追加 |
| `test/ui-workdir-picker.test.ts` | 浮层回归锁（**已存在**） | **任务 2** 追加 |
| `test/workspace-git.test.ts` | 服务端 git 探测锁（**已存在**） | **任务 4** 追加 |
| `test/ui-workspace-git.test.ts` | 芯片回归锁（**已存在**） | **任务 4** 追加 |
| `test/ui-artifact-route.test.ts` | **新建**：深链编解码锁 | 任务 5 |
| `test/ui-review-hunks.test.ts` | **新建**：审阅动作的纯函数锁 | 任务 6/7 |
| `eval/persona-ux/_audit-20260919/verify-*.mjs` | **新增**：本计划的活页验收探针 | 任务 1/2/3/4/5/6/7 |

**任务之间的文件重叠说明**（避免实现者以为要一次改完）：任务 6 与 7 都碰 `app.js` / `index.html` / `styles.css`，但**任务 6 只做对话流里的内嵌卡与状态，任务 7 只做右栏那个面板**。任务 7 依赖任务 6 导出的状态读取函数（见 Interfaces）。

---

## 任务之间的依赖

```
任务 1（composer scope）──┐
任务 2（picker 抢跑）   ──┤ 三处遗留：互不依赖，但都排在前面
任务 3（窄坞标签条）   ──┘
                          ↓
任务 4（真 patch 端点）─── 任务 5（按路径寻址）── 任务 6（内嵌 diff）── 任务 7（召出的面板）
                                ↑                                        ↑
                          任务 6 依赖路径形态的深链            任务 7 用任务 6 的状态读取
```

**任务 5 排在任务 6 之前**是刻意的：任务 6/7 的卡片要能深链到某件产物/某个文件，**先让深链按路径寻址**，后面就不必先按下标写一遍再改。

---

### Task 1: 折叠的 composer scope 不再画一个点不到的幽灵控件

**Files:**
- Modify: `ui/public/styles.css`（在 `.composer-scopebar` 规则块之后，约 `:4828`）
- Modify: `ui/public/index.html:255-258`（订正那句与实测矛盾的注释）
- Test: `test/ui-layout.test.ts`（在 `"两脸差异只收在 [data-face] 上"` 那个 describe 之后追加一个 describe）
- Create: `eval/persona-ux/_audit-20260919/verify-composer-scope.mjs`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯样式修复，不导出任何东西）

**背景（这是计划 3 的头号任务，不是"顺手一提"）**

`#workdir-trigger`（`index.html:272`）被包在 `<details class="composer-scope" id="composer-scope">`（`index.html:254`，**无 `open` 属性 = 默认收起**）的 `#composer-scopebar`（`:260`）里。

**用户可见的病症**：scope 收起时，「选择目录」那行字**照样画出来**（看着像一个能点的控件），**但点它没反应**——落点被同一条 y 带上的透明 `TEXTAREA#task-input` 接走。实测（计划 2 Task 1 的探针）：**25/25 次 `elementFromPoint` 采样全命中 textarea**。

**机制（读出来的，不是推测）**：

1. author 规则 `.composer-scopebar { display: flex; … }`（`styles.css:4820-4828`）**压过了 UA 对折叠 `<details>` 内容的隐藏**——所以收起的 details 里，那个 scopebar **仍有布局盒**；
2. `.submit-bar, .composer-scopebar { overflow: visible }`（`styles.css:5063-5066`）**允许它溢出自己的盒子**；
3. 于是它的内容溢进输入行那一条 y 带（`composer-layout.json` 实测：details 盒 `y:778 h:29`，而 `#workdir-trigger-text` 的文字在 `y:812`——**在 `#composer-compose` 的 807–843 里**）；
4. 而 `TEXTAREA#task-input`（`styles.css:5420`）**背景透明**、DOM 顺序在后 → **画在它上面、接走点击**。

**★ 那条注释说的是反的**（`index.html:255-258`）逐字：

> `<!-- 能力条（2026-09-19 三轮走查 L1）：**必须在 summary 里**。`
> `     收起的 details 只渲染 summary，…`

「**收起的 details 只渲染 summary**」**与实测相反**——计划 2 的 reviewer 独立复核后的精确措辞是：*说"仍渲染 scopebar"只在**布局**意义上成立（有矩形、computed flex），严格说其内容**不绘制***（`sdd/plan2/progress.md:86`）。两者表面矛盾，而**用户可见的结论不变：收起时那行字看得见、点不到。**

**一行修法**：`.composer-scope:not([open]) .composer-scopebar { display: none; }`

特异性 `:not([open])` 计入其参数 → `(0,3,0)` > `.composer-scopebar` 的 `(0,1,0)`，**与书写顺序无关**，不会被既有规则翻盘。

---

- [ ] **Step 1: 写失败测试**

在 `test/ui-layout.test.ts` 里追加（**放在 `"两脸差异只收在 [data-face] 上"` 那个 describe 结束之后**）：

```ts
/**
 * 折叠的 scope 不许留"看得见、点不到"的幽灵控件（计划 3 · T1）。
 *
 * 两条一起锁：规则本身，**以及规则匹配的那半 markup**——计划 1 的教训是
 * 只锁 CSS 文本，删掉 markup 里的类，303 条测试全绿而 bug 复活。
 */
describe("折叠的 scope 不留幽灵控件", () => {
  it("scope 收起时 scopebar 必须真的不渲染", async () => {
    const source = await css();
    const rule = block(source, ".composer-scope:not([open]) .composer-scopebar");
    expect(rule).toMatch(/display:\s*none/);
  });

  it("那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）", async () => {
    const source = await html();
    // ★ **不要用 block()**：它按 `\n<选择器> {` 找的是 **CSS 规则块**，
    // 拿它去抠 markup 会永远抛「找不到选择器」——这一条最初就是那么写的，
    // 而成因是"知道机制、却按「以为的写法」写"。照本文件 :96-104 那条 chip
    // 测试的写法：**取标签再断言**，不在整份文件上 toContain。
    const scopeBlock = source.match(/<details[^>]*class="[^"]*(?<![\w-])composer-scope(?![\w-])[^"]*"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(scopeBlock, "index.html 里找不到 .composer-scope 那个 details 块").not.toBe("");

    // 再收紧到标签级：scopebar 与触发钮必须**真的在那个块里**。
    // 块内就有 HTML 注释（:255-259），所以这里也不能用块级 toContain——
    // 注释能喂饱它，那正是 chip 那条注释警告的退化。
    const barTag = scopeBlock.match(/<div[^>]*class="[^"]*(?<![\w-])composer-scopebar(?![\w-])[^"]*"[^>]*>/)?.[0] ?? "";
    expect(barTag, "scopebar 不在那个 details 里——那条 CSS 规则就匹配不到它了").not.toBe("");
    const trigTag = scopeBlock.match(/<button[^>]*id="workdir-trigger"[^>]*>/)?.[0] ?? "";
    expect(trigTag, "触发钮不在那个 details 里").not.toBe("");
  });
});
```

**★ 第二条为什么这么写**：它断言的是**嵌套关系**（scopebar 与触发钮都在那个 details 里）——**这正是那条 CSS 规则能不能命中它们的前提**。把 scopebar 挪到 details 外面，第二条会红，而第一条照样绿。

**★ `block()` 只能用在 CSS 上。** 它按 `\n<选择器> {` 匹配，**天生匹配不了 markup**。本计划里 `block()` 的合法用法只有 `.ac-tabs` 与 `.ac-head`（都在任务 3）。


**★ 那个负向前瞻不是装饰（实现者实证抓到，我一并复验过）。**
`\bcomposer-scopebar\b` 对 `class="composer-scopebar-x"` **照样匹配**——
`\b` 在 `r|-` 处成立（`-` 是非词字符），后面的 `[^"]*` 把 `-x` 吃掉。
少了前瞻，「把类改名」这个变异**不会让第二条红**，那条锁就退化成装饰。
**这正是本仓反复出现的那句话**：断言要锁「类名恰好是它」，不是「这一带出现过这个名字」。

**★ 同族的弱锁仓库里还有一处**：`test/ui-layout.test.ts:96-104` 那条 chip 断言
（`/class="[^"]*\bworkspace-git-chip\b[^"]*"/`）有**同一个弱点**——
把类改成 `workspace-git-chip-x`，它照样绿，而两脸的两条 CSS 规则就都匹配不到了。
**本任务顺手补上它**（同一个文件，一行改动），并在报告里说明为什么动了一个不在 brief 里的断言。

**★ 它的护法与前两条同形，也必须前后缀都挡**：`(?<![\w-])workspace-git-chip(?![\w-])`。

**★ 这个洞在这一个任务里出现了三次——第三次在我自己的正则里。**
我给 T1-A 写的 `scopeBlock` 用了裸 `\bcomposer-scope\b`，**是刚在 T1-B 里修掉的那个弱点，一行之隔又犯一次**；任务审查独立抓到（它同时验证了 T1-A 与 T1-B 两条裁决本身是对的——T1-A 它去读 `block()` 的源码确认结构上匹配不了 markup，T1-B 它把前瞻对着整个变异空间试了 `-x` / `2` / `_` / `--`，无泄漏）。
**所以本任务的三条断言（`scopeBlock`、`barTag`、chip 那条）都必须带前瞻**——这不是三条独立的小事，是同一个弱点的三个位置。

**★ 第四次是“只挡了一半”。** 修复轮 1 的定向复查把修正后的正则对着整个变异空间跑了一遍，发现**连字符前缀**（`x-composer-scope`）仍然保持绿——而 CSS 根本匹配不到那种类名。根因是 `\b` 只挡得住**词字符**前缀（`x_composer-scope` 会红），挡不住 `-` 前缀（`-` 是非词字符，`\b` 在 `-|c` 处成立）。**左界改用 `(?<![\w-])`**，两侧字符集就对称了。
**⇒ 教训是：一个边界断言只挡了一侧时，绿不能证明任何事**——这与本仓“锁了半边等于没锁”是同一句话。
- [ ] **Step 2: 跑测试，确认它红**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: **两条都 FAIL**。第一条 `找不到选择器 .composer-scope:not([open]) .composer-scopebar`（`block()` 抛错）；第二条……**可能通过**——因为 markup 现在是好的。

**★ 这就是为什么必须有 Step 3 的变异验红**：第二条锁的是"现状没被破坏"，它现在就该绿。**真正要证明的是"它能红"**，而那是 Step 3.b。

- [ ] **Step 3: 实现**

3.a 在 `ui/public/styles.css` 的 `.composer-scopebar { … }` 块**之后**（约 `:4828` 那个 `}` 与 `:4830` 的 `.composer-mode-block {` 之间）插入：

```css
/**
 * 折叠时必须**真的不渲染**，否则是一个"看得见、点不到"的幽灵控件（计划 3 · T1）。
 *
 * author 的 display:flex 压过了 UA 对折叠 <details> 内容的隐藏，所以 scope
 * 收起时 scopebar 仍留着布局盒；`overflow: visible`（见 .submit-bar 那条）
 * 又允许它溢出自己的盒子、落进输入行那一条 y 带，而透明的
 * TEXTAREA#task-input 画在它上面接走点击——实测 25/25 次 elementFromPoint
 * 全命中 textarea，于是「选择目录」那行字看得见、点不到。
 *
 * display:none 直接掐掉盒子，不给它溢出的机会。特异性 (0,3,0) > (0,1,0)，
 * 与书写顺序无关。
 */
.composer-scope:not([open]) .composer-scopebar {
  display: none;
}
```

3.b 在 `ui/public/index.html` 把 `:256` 那句**说反的**注释改掉。改前（逐字）：

```
      <!-- 能力条（2026-09-19 三轮走查 L1）：**必须在 summary 里**。
           收起的 details 只渲染 summary，`#composer-scopebar` 与输入行同在 y=807
           被后者盖住——挂那儿等于挂进柜子里。这里只放弱态（看不见图 / 核查关），
           由 capabilityChips 过滤，常态零占位。 -->
```

改后：

```
      <!-- 能力条（2026-09-19 三轮走查 L1）：**必须在 summary 里**。
           为什么：收起的 details 里，#composer-scopebar 仍有布局盒（author 的
           display:flex 压过 UA 对折叠内容的隐藏），它溢进输入行那一条 y 带、
           被透明的 TEXTAREA#task-input 接走点击——挂那儿等于挂进柜子里
           （计划 3 · T1 把那个盒子用 display:none 掐掉了，但"能挂的只有
           summary"这条结论不变）。这里只放弱态（看不见图 / 核查关），
           由 capabilityChips 过滤，常态零占位。 -->
```

- [ ] **Step 4: 跑测试，确认它绿**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: **两条都 PASS**。

- [ ] **Step 5: 变异验红（两半各验一次，**这一步不是可选的**）**

5.a 删掉 Step 3.a 那整条 CSS 规则 → 跑 → **第一条必须红**（`block()` 抛"找不到选择器"）→ 还原。
5.b 把 `index.html:260` 的 `class="composer-scopebar"` 改成 `class="composer-scopebar-x"` → 跑 → **第二条必须红** → 还原。

**★ 5.b 是这一步的重点**：它证明第二条不是"永远绿"的装饰。**只做 5.a 等于只验了一半**（计划 1 的原话：「CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁」）。

还原后 `git diff` 必须只剩 Step 3 的两处改动；跑一次 `node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/styles.css ui/public/index.html` 确认行尾没漂。

- [ ] **Step 6: 写活页探针并跑**

新建 `eval/persona-ux/_audit-20260919/verify-composer-scope.mjs`：

```js
/**
 * 折叠的 composer scope 到底还画不画那个幽灵控件（计划 3 · T1）。
 *
 * 为什么必须有它：这一条的**单元测试锁不住**。`block()` 能证明"规则在"，
 * 但证明不了"盒子真的没了"——那要靠布局。计划 1 与计划 2 各有一条
 * "纯函数绿 + 接线锁绿而真实路径走不通"的洞（`.workspace-git-chip`、
 * `stripAttachmentLine`），所以这里**真去量**。
 *
 * 判据（三条）：
 *   ① 收起态：scopebar 的布局盒是空的（display:none / rect 全 0）
 *   ② 展开态：scopebar 有盒，且触发钮中心点**真的命中它自己或它的后代**
 *      —— 这一条是老 bug 的直接反证（老 bug 时那里命中的是 textarea）
 *   ③ 全程 0 条控制台错误
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "_verify-shots");
await mkdir(OUT, { recursive: true });

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
// 欢迎页就够：这条缺陷在欢迎页与 run 页都成立，而欢迎页不需要 run id
const URL = `${BASE}/#/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 200)));

console.log(`靶：${URL}`);
await page.addInitScript(() => {
  try {
    // 逼到"从未展开过"的初始态——展开态是记在 localStorage 里的
    localStorage.removeItem("agent.ui.pref.composerScope");
  } catch {}
});
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const geom = `(() => {
  const details = document.getElementById("composer-scope");
  const bar = document.getElementById("composer-scopebar");
  const trig = document.getElementById("workdir-trigger");
  if (!details || !bar || !trig) return { missing: true };
  const cs = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  const tr = trig.getBoundingClientRect();
  const cx = Math.round(tr.x + tr.width / 2);
  const cy = Math.round(tr.y + tr.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    open: details.open,
    barDisplay: cs.display,
    barW: Math.round(r.width), barH: Math.round(r.height),
    barY: Math.round(r.y),
    trigW: Math.round(tr.width), trigH: Math.round(tr.height),
    trigY: Math.round(tr.y),
    hitTag: hit ? hit.tagName : null,
    hitIsTrigger: Boolean(hit && (hit === trig || trig.contains(hit))),
    hitIsTextarea: Boolean(hit && hit.tagName === "TEXTAREA"),
  };
})()`;

console.log("\n=== ① 收起态（默认）===");
const g0 = await page.evaluate(geom);
if (g0.missing) { console.log("★ 找不到 composer-scope / scopebar / workdir-trigger"); await browser.close(); process.exit(1); }
console.log(`  details.open=${g0.open} · scopebar display=${g0.barDisplay} · 盒 ${g0.barW}×${g0.barH} @y=${g0.barY}`);
console.log(`  触发钮盒 ${g0.trigW}×${g0.trigH} @y=${g0.trigY}`);
const c1 = g0.barDisplay === "none" && g0.barW === 0 && g0.barH === 0;
console.log(`  ${c1 ? "✅ scopebar 真的不渲染（盒子是空的）" : "★ 还有盒子——幽灵控件还在"}`);

console.log("\n=== ② 展开态（点 summary）===");
await page.click("#composer-scope > summary");
await page.waitForSelector("#composer-scope[open]", { timeout: 5000 });
await page.waitForTimeout(300);
const g1 = await page.evaluate(geom);
console.log(`  details.open=${g1.open} · scopebar display=${g1.barDisplay} · 盒 ${g1.barW}×${g1.barH} @y=${g1.barY}`);
console.log(`  触发钮中心命中：<${g1.hitTag}> · 命中触发钮本身=${g1.hitIsTrigger} · 命中 textarea=${g1.hitIsTextarea}`);
const c2 = g1.open && g1.barH > 0 && g1.hitIsTrigger;
console.log(`  ${c2 ? "✅ 展开后触发钮真的点得到（老 bug 时这里命中的是 textarea）" : "★ 展开了还是点不到"}`);

console.log("\n=== ③ 控制台 ===");
console.log(errs.length ? errs.slice(0, 5) : "零");

await page.screenshot({ path: join(OUT, "composer-scope.png"), fullPage: false });
await browser.close();

if (c1 && c2 && errs.length === 0) {
  console.log("\n✅ 三条全成立：① 收起态无盒 ② 展开态可点 ③ 0 控制台错误");
  process.exit(0);
}
console.log("\n★ 有判据没成立，见上。");
process.exit(1);
```

Run: `node eval/persona-ux/_audit-20260919/verify-composer-scope.mjs; echo "退出码=$?"`

**先探针后修**（可选但强烈建议）：把 Step 3.a 的 CSS 临时注释掉再跑一次，**看 ① 红**——那才是"这条探针真的抓得住那个 bug"的证明。跑完把 CSS 还原。

- [ ] **Step 7: 提交**

```bash
git add ui/public/styles.css ui/public/index.html test/ui-layout.test.ts eval/persona-ux/_audit-20260919/verify-composer-scope.mjs
git commit -m "fix(ui): 折叠的 scope 不再画一个看得见、点不到的幽灵控件

author 的 display:flex 压过了 UA 对折叠 details 内容的隐藏，于是 scope
收起时 scopebar 仍留着布局盒、overflow:visible 让它溢进输入行那一条 y
带，透明 TEXTAREA 画在它上面接走点击——实测 25/25 次 elementFromPoint
全命中 textarea。display:none 直接掐掉盒子。

顺带订正 index.html 一句说反的注释（「收起的 details 只渲染 summary」）。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 2: 打开目录浮层立刻粘贴，不许被起点目录静默覆盖

**Files:**
- Modify: `ui/public/features/workdir-picker.js`（`load()` `:627-652`、`openPicker()` `:658-667`、以及「前往」与下钻两个程序性导航处）
- Test: `test/ui-workdir-picker.test.ts`（在 `describe("initWorkdirPicker")` `:360` 里追加）
- Create: `eval/persona-ux/_audit-20260919/verify-picker-paste.mjs`

**Interfaces:**
- Consumes: 无
- Produces: 无（闭包内状态，不导出）

**背景**

`openPicker(startPath)`（`workdir-picker.js:658`）会 `void load(startPath ?? null)`；`load()` 是异步的，回来时**无条件**回写输入框（`:651` 逐字）：

```js
    if (path !== null) pathInput.value = currentPath ?? "";
```

宿主打开浮层时传的是**真实目录**（`index.html:5390` `onAddRequest: () => workdirPickerApi?.open(workdirSelect.value || null)`）——所以 `path !== null` 成立。**用户打开浮层立刻粘贴**，粘贴落在回写之前 → 被起点目录盖掉 → 前往去了旧目录，「选这个目录」变成 no-op。

**守卫为什么没拦住**：`renderToken`（`:469-470`，注释逐字「连续点下钻时，慢的那次 fetch 回来不许覆盖快的」）**只做 load↔load 互斥**，它对"用户已经动过输入框"一无所知。`pathInput` 上唯一的监听是 keydown-Enter（`:756-762`）。

计划 2 用 `page.route` 掐住 `/api/fs/list` 1.5 秒做了**确定性复现**（`sdd/plan2/task-1-report.md:188-193`）：

```
fill 刚落地（fs/list 仍被掐着）： "D:\…\.git-fixture\git-repo"
fs/list 放行后：                  "D:\Work\scratch\fathom-ux-audit-20260918\web-a"
粘贴被起点目录静默覆盖，实锤。
```

**修法**：一个"用户动过输入框"的脏标记。

- `pathTyped = true`：在 `pathInput` 的 `input` 事件里。
- `load()` 回写那一行加守卫：`if (path !== null && !pathTyped) …`。
- **程序性导航要清掉它**（下钻、上一级、「前往」）——那些是用户明确要走的方向，输入框**应该**跟着变。
- `openPicker()` 里清掉它（新开的浮层是干净的）。

**为什么不能"回写时判断输入框是不是空的"**：用户可能先粘贴、再点下钻、再回来——空/非空判断会把合法的导航也挡掉。**判据必须是"用户动过"，不是"框里有东西"。**

---

- [ ] **Step 1: 写失败测试**

在 `test/ui-workdir-picker.test.ts` 的 `describe("initWorkdirPicker")`（`:360`）里追加。**先读 `:361-400` 那两条既有用例，照它们的写法建浮层**（`initWorkdirPicker` + 假 `fetchImpl`）。新增用例：

```ts
  it("打开浮层后立刻粘贴：异步回写不许覆盖它（计划 3 · T2）", async () => {
    /** 用一个可控的 fetch：第一次 /api/fs/list 挂起，直到我们放行。 */
    let release;
    const gate = new Promise((r) => { release = r; });
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("/api/fs/list")) {
        await gate;                      // ← 起点目录的响应，掐住
        return {
          ok: true,
          json: async () => ({ path: "D:\\start-dir", parent: null, dirs: [] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const api = initWorkdirPicker(document.body, { fetchImpl });
    api.open("D:\\start-dir");           // 宿主真实打开方式：带起点目录

    // 用户抢在响应前面粘贴
    const input = document.querySelector(".wp-path-input");
    input.value = "D:\\pasted-by-user";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    release();                            // 起点目录的响应现在才落地
    await flush();
    await flush();

    expect(input.value).toBe("D:\\pasted-by-user");   // ← 不许被覆盖
  });

  it("程序性导航（下钻）仍然会把输入框带过去——脏标记只挡异步回写（计划 3 · T2）", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("/api/fs/list")) {
        return {
          ok: true,
          json: async () => ({
            path: "D:\\child", parent: "D:\\root",
            dirs: [{ name: "deeper", path: "D:\\child\\deeper" }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const api = initWorkdirPicker(document.body, { fetchImpl });
    api.open("D:\\root");
    await flush(); await flush();

    // 先让用户动一下输入框（脏），再下钻——下钻是明确的方向，输入框该跟着变
    const input = document.querySelector(".wp-path-input");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const childRow = [...document.querySelectorAll(".wp-dir, [data-path]")]
      .find((el) => el.dataset?.path === "D:\\child\\deeper");
    if (!childRow) throw new Error("没找到下钻行——先读 :361-400 看浮层的行选择器是什么");
    childRow.click();
    await flush(); await flush();

    expect(input.value).toBe("D:\\child");
  });
```

**★ 第二条不是凑数**：它锁的是"脏标记**没有过界**"。不做它的话，最省事的实现（`load()` 里一律不回写）也能让第一条绿，**而那会把下钻弄坏**——正是计划 1/2 反复出现的那种"锁了半边"。

**★ 行选择器那行是刻意的"先读再定"**：`.wp-dir` 与 `[data-path]` 是我按命名习惯猜的，**跑起来它可能找不到**。找不到时**去读 `renderDirs`（`:649` 调用）看真实的类名**，改成本仓的真名——**不许保留一个猜的选择器让它静静地绿**。

- [ ] **Step 2: 跑测试，确认它红**

Run: `npx vitest run test/ui-workdir-picker.test.ts`
Expected: 第一条 **FAIL**（`expected 'D:\\start-dir' to be 'D:\\pasted-by-user'`）；第二条 **PASS**（现状下钻本来就好）。

- [ ] **Step 3: 实现**

3.a 在 `workdir-picker.js` 里 `currentPath` 那个变量附近加声明：

```js
    /**
     * 用户是否**动过**路径输入框（计划 3 · T2）。
     *
     * 为什么需要它：`load()` 是异步的，回来时无条件回写输入框（下面那行）。
     * 宿主打开浮层时传真实起点目录，于是**打开后立刻粘贴**会被起点目录
     * 静默盖掉、前往去了旧目录。`renderToken` 只做 load↔load 互斥，
     * 对"用户已经动过输入框"一无所知。
     *
     * 判据必须是"用户动过"，**不能是"框里有东西"**——用户可能先粘贴、
     * 再下钻、再回来，空/非空判断会把合法的导航也挡掉。
     */
    let pathTyped = false;

    pathInput.addEventListener("input", () => { pathTyped = true; });
```

3.b `load()` 的回写那一行加守卫（`:651`）：

```js
    // 用户动过输入框就别回写了——他正在编辑，异步的起点目录不许盖掉他
    if (path !== null && !pathTyped) pathInput.value = currentPath ?? "";
```

3.c **程序性导航处清标记**：在三处显式导航（下钻的行点击、上一级、「前往」按钮/回车的提交处理器）**发起 `load()` 之前**加：

```js
    pathTyped = false;   // 这是用户明确要走的方向，输入框该跟着变
```

3.d `openPicker()`（`:658`）里也清一次：

```js
    pathTyped = false;   // 新开的浮层是干净的
```

- [ ] **Step 4: 跑测试，确认它绿**

Run: `npx vitest run test/ui-workdir-picker.test.ts`
Expected: 全绿（既有 20 条 + 新 2 条）。

- [ ] **Step 5: 变异验红**

5.a 把 3.b 的守卫去掉（回到 `if (path !== null) …`）→ 跑 → **第一条必须红** → 还原。
5.b 把 3.c 的 `pathTyped = false;` 删掉一处 → 跑 → **第二条必须红** → 还原。

- [ ] **Step 6: 活页探针（用计划 2 那条确定性复现的手法）**

新建 `eval/persona-ux/_audit-20260919/verify-picker-paste.mjs`。**按 `sdd/plan2/task-1-report.md:188-193` 记的手法写**：用 `page.route` 掐住 `/api/fs/list` 约 1.5 秒，让粘贴先落地，然后放行，**量输入框的值有没有被换掉**。

判据三条：① 粘贴后放行，输入框仍是粘贴的值（**这一条就是老 bug 的反证**）；② 下钻之后输入框跟着变成新目录；③ 0 控制台错误。

**先探针后修**：把 3.b 的守卫临时去掉再跑，**看 ① 红**——那是"这条探针真的抓得住"的证明。

- [ ] **Step 7: 提交**

```bash
git add ui/public/features/workdir-picker.js test/ui-workdir-picker.test.ts eval/persona-ux/_audit-20260919/verify-picker-paste.mjs
git commit -m "fix(ui): 目录浮层的异步回写不再盖掉用户刚粘贴的路径

打开浮层会异步 load(起点目录)，load() 回来时无条件回写输入框，于是
打开后立刻粘贴会被起点目录静默覆盖、前往去了旧目录。renderToken 只做
load↔load 互斥，对"用户已经动过输入框"一无所知。

加一个 pathTyped 脏标记：用户动过就不回写；程序性导航（下钻/上一级/
前往）与新开浮层清掉它。判据是"用户动过"而不是"框里有东西"——后者会
把合法导航也挡掉。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 3: 坞头的标签条不再被挤成 0 宽

**Files:**
- Modify: `ui/public/styles.css:9602` 附近（`.ac-tabs` 的规则块；**实读只有这一处**）
- Test: `test/ui-layout.test.ts`（追加一个 describe）
- Create: `eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯样式修复）

**背景（读出来的机制，不是推测）**

`.ac-head`（`styles.css:9551`）是坞头，它**自己就有横滚**：

```css
.ac-head {
  display: flex; align-items: center; gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  …
  min-width: 0;
  /* split 档预览列可能只有 ~141px：头里的「放大」等键够不着时允许横滚，
     不让它越列而过（走查 UX-C1 的同族边角） */
  overflow-x: auto;
}
```

**作者本来就想让它横滚。** 而 `.ac-tabs`（实读在 `:9602`，**全文只此一处规则块**）是：

```css
.ac-tabs {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  gap: 2px;
  overflow-x: auto;
  align-items: stretch;
}
```

坞头里**除它之外每个成员都有硬地板**：`.ac-tab-add { flex: 0 0 auto; width: 32px; min-width: 32px }`（`:9677-9682`）、关闭/放大键是按钮（min-content 地板）、`gap: 8px` × 3、`padding-inline: 16px` × 2。**只有标签条能压到 0**，于是 flex 把它压到 0。

**为什么横滚救不了它**：坞头的 `overflow-x: auto` 确实在滚（固定成员 190 > 坞 159），**但它滚的是它自己那一行——标签条被压成 0 宽，它自己的 930px 内容在那个 0 宽盒子里，一个像素也露不出来**。修的是那个盒子，不是滚动。

实测（视图 1600×900，railWidth 落在 `RAIL_MAX_PX = 360`，`tree = max(200, 198) = 200` → `preview = 160`，坞量到 159）：

```
命中几何：关闭钮中心被 SPAN. 接住 · tablist scrollLeft=165（scrollWidth=930 clientWidth=0）· 坞 hidden=false w=159
```

**★ 为什么不改 `railPolicy`**：`preview = railWidth − tree`，而 `railWidth ≤ RAIL_MAX_PX = 360`、`tree ≥ TREE_MIN_PX = 200` → **在可达的任何 rail 宽度下 preview 都 ≤ 160**。给预览列加地板会让 split 在任何视口下都不再发生；抬高 `RAIL_MAX_PX` 又撞上调研 §7.1「对话宽度必须回到 60–73%」。**底下那个更大的问题记进「单独立项」，这里只把作者写的横滚意图恢复出来。**

**修法**：给 `.ac-tabs` 一个**读得懂的下限**，让它不再是唯一能被压到 0 的成员。

---

- [ ] **Step 1: 量一个数（**不许猜**）**

先跑一次现况，把坞头的**固定成本**量出来：

Run: `npx playwright --version` 确认可用后，**在 Task 3 的探针里加一段一次性测量**（或直接用已有的 `verify-artifact-tabs.mjs` 的输出对照）。要量的是：**坞头里除标签条之外的所有成员加起来占多少 px**（padding 32 + 加号键 32 + 关闭/放大键 + gaps）。

拿 159px 的坞做基线算 `坞宽 − 固定成本 = 标签条实得`。**注意这个差可能是负的**（实测就是 `159 − 190 = −31`），负值意味着**固定成员自己就溢出了坞头、坞头本来就在横滚**——那时标签条实得 0。

**把量到的固定成本写进下面那条 CSS 的注释里**（这是这个常量的依据，不是拍脑袋）。若量不出来（探针起不来），**用 96px（`6rem`）作初值并在注释里写明"未实量、按一个短标签的宽度取的"**——照实说，别假装量过。

- [ ] **Step 2: 写失败测试**

在 `test/ui-layout.test.ts` 追加：

```ts
/**
 * 窄坞下标签条不许被压成 0（计划 3 · T3）。
 *
 * 坞头自己就有 overflow-x:auto（它的注释写着「头里的键够不着时允许横滚」），
 * 但那条横滚滚的是坞头自己那一行：.ac-tabs 被写成 flex:1 1 0 + min-width:0，
 * 是坞头里唯一能被压到 0 的成员（固定成员加起来 190px 已超过坞的 159px）。
 * 给它一个下限，那 930px 的内容才不再关在 0 宽的盒子里。
 */
describe("窄坞下的标签条", () => {
  it("标签条有下限，不再是唯一能被压到 0 的成员", async () => {
    const source = await css();
    const rule = block(source, ".ac-tabs");
    expect(rule).toMatch(/flex:\s*1\s+1\s+0/);      // 仍然吃剩余空间
    expect(rule).toMatch(/min-width:\s*(?!0\b)\S+/); // 但不再允许压到 0
  });

  it("坞头仍然自己横滚（那条注释说的意图没被这条修复顶掉）", async () => {
    const source = await css();
    const rule = block(source, ".ac-head");
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });
});
```

**★ 第二条是防"修一处坏一处"**：如果实现者顺手动掉了 `.ac-head` 的 `overflow-x`（比如想"只让标签条滚"），第二条会红。

**★ 那个负向断言 `(?!0\b)` 是必要的**：只写 `toMatch(/min-width:/)` 的话，**现状那一行 `min-width: 0` 就能喂饱它**，测试永远绿。

- [ ] **Step 3: 跑测试，确认它红**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: **第一条 FAIL**（现状是 `min-width: 0`），第二条 PASS。

**★ 验证一下那个负向断言真的有效**：把 `(?!0\b)` 临时去掉再跑一次，**看第一条变绿**——那证明红是断言造成的，不是别的原因。看清了再装回去。

- [ ] **Step 4: 实现**

在 `ui/public/styles.css` 的 `.ac-tabs` 规则里加一行（把 Step 1 量到的数填进去）：

```css
.ac-tabs {
  display: flex;
  flex: 1 1 0;
  /**
   * ★ 不许压到 0（计划 3 · T3）。
   *
   * 坞头自己有 overflow-x:auto（见 .ac-head 的注释：「头里的键够不着时
   * 允许横滚」），但那条横滚滚的是坞头自己那一行——而这里原本 min-width:0，
   * 让它成了坞头里**唯一**能被压到 0 的成员（固定成员加起来 190px 已超过坞的
   * 159px），于是 tablist clientWidth=0、930px 的标签一个也看不见。
   *
   * 这个下限 = 坞头固定成本（padding 32 + 加号键 32 + 关闭/放大键 + gaps）之外
   * 至少留得下一个短标签的宽度。
   */
  min-width: 6rem;
  gap: 2px;
  overflow-x: auto;
  align-items: stretch;
}
```

- [ ] **Step 5: 跑测试，确认它绿**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: 两条都 PASS。

- [ ] **Step 6: 变异验红**

删掉 Step 4 加的那行 `min-width: 6rem;` → 跑 → **第一条必须红** → 还原。
再单独把 `.ac-head` 的 `overflow-x: auto;` 删掉 → 跑 → **第二条必须红** → 还原。

- [ ] **Step 7: 活页探针（**这一条是本任务的真正验收**）**

新建 `eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs`：

1. 起视口 **1600×900**（**与实测那条同条件**——split 档、railWidth 360、坞 159px）；
2. 打开一个有 ≥5 件产物的 run（**用 git 夹具或既有 run**；`AUDIT_RUN` 环境变量可覆盖，缺省挑一个产物最多的）；
3. 判据：
   - **① `.ac-tabs` 的 `clientWidth > 0`**（现状是 0）——**这是老 bug 的直接反证**；
   - **② `.ac-tabs` 的第一个标签的中心点，`elementFromPoint` 命中它自己或它的后代**（不是被兄弟接走）；
   - **③ 坞头 `scrollWidth > clientWidth`**（横滚仍然成立——**注意这不是前后判别器**：实测修前它就已经成立，因为固定成员自己就溢出。它是**回归护栏**，不是本修复的证据）；
   - **④ 0 条控制台错误**。

**先探针后修**：把 Step 4 那行临时删掉再跑，**看 ① 红**——证明这条探针抓得住。

- [ ] **Step 8: 提交**

```bash
git add ui/public/styles.css test/ui-layout.test.ts eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs
git commit -m "fix(ui): 窄坞下的标签条不再被挤成 0 宽

坞头自己有 overflow-x:auto（注释写着「头里的键够不着时允许横滚」），
但那条横滚滚的是坞头自己那一行——而 .ac-tabs 原本 min-width:0，是坞头里
唯一能被压到 0 的成员（固定成员加起来 190px 已超过坞的 159px），于是
tablist clientWidth=0、930px 的标签一个也看不见。

给它一个下限，那 930px 的内容才不再关在 0 宽的盒子里。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 4: 真 patch 端点（有行号、有上下文行）

**Files:**
- Modify: `src/workspace-git.ts`（新增接口与 `probeFilePatch`）
- Modify: `ui/server.ts`（路由表 + handler）
- Modify: `ui/public/features/workspace-git.js`（新增 `fetchFilePatch`）
- Test: `test/workspace-git.test.ts`（服务端追加）、`test/ui-workspace-git.test.ts`（前端追加）

**Interfaces:**
- Consumes: `src/workspace-git.ts` 既有的 `git()` 私有执行器（**先读它**：`:30-48` 附近，看它怎么切参数、怎么处理超时与错误）
- Produces:
  - `src/workspace-git.ts`：
    ```ts
    export interface PatchLine { sign: " " | "-" | "+" | "\\"; text: string }
    export interface PatchHunk { header: string; lines: PatchLine[] }
    export interface FilePatch {
      present: boolean;          // 这个目录是不是 git 仓库
      path: string;              // 相对 root 的正斜杠路径
      tracked: boolean;          // 是不是被 git 跟踪（未跟踪走合成路径）
      binary: boolean;
      added: number;             // 计入 patch 的 + 行数
      deleted: number;
      hunks: PatchHunk[];
      truncated: boolean;        // 超过上限被截断
      note?: string;             // 给用户看的一句人话（非 git / 文件不存在 / 二进制…）
    }
    export async function probeFilePatch(root: string, relPath: string): Promise<FilePatch>
    ```
  - `ui/server.ts`：路由 `GET /api/workspace/git/diff?workdir=&path=` → `{ type: "workspaceGitDiff", workdir, path }`
  - `ui/public/features/workspace-git.js`：`export async function fetchFilePatch(workdir, path, fetchImpl)` → `FilePatch | null`

**背景与语义（★ 实现者必须照这个口径写注释与文案）**

- 这份 patch 是 **「工作区相对 HEAD」**，**不是「本场 run 专属」**。它混着用户自己的未提交改动与上一场 run 的改动。
- **「这场 run 碰过哪些路径」由事件流那条链给**（`ui/server.ts` 的 `collectTouchedPaths`，已有）——**两条链各有各的活，谁也不替谁**：
  - 事件流（`app.js:10149 editHunksFromTimeline`）：本场改了**哪些**路径、改了**什么内容**（`edit_file` 的 old/new 串，字节精确），**但没有位置**，且 **`write_file` 覆盖场景拿不到旧版**（那段代码的注释自己写着）。
  - `git diff`（本任务）：**有行号、有上下文行**，但**没有 run 归属**、非 git 目录**完全没有**。
- **★ 这条链补上的正是那个洞**：`write_file` 覆盖的文件在事件流里没有旧版可比，但在 `git diff` 里**整个新内容都是 `+` 行**。

**四条诚实降级**（都要有，且都要有测试）：

| 情形 | `FilePatch` 该长什么样 |
|---|---|
| 不是 git 仓库 | `present: false`，`hunks: []`，`note: "这个目录不是 git 仓库，看不了工作区改动"` |
| 文件不存在 | `present: true`，`hunks: []`，`note: "盘上没有这个文件"` |
| 二进制 | `binary: true`，`hunks: []`，`note: "二进制文件，不给逐行改动"` |
| 超过上限 | `truncated: true`，`hunks` 保留前 N 个 hunk |

---

- [ ] **Step 1: 先读既有执行器**

读 `src/workspace-git.ts` 的 `:1-72`（`git()` 私有执行器 + `probeWorkspaceGit`），**照它的写法**写 `probeFilePatch`——尤其是：超时怎么给（`ui/server.ts:1373` 的 `GIT_PROBE_TIMEOUT_MS = 3000` 是另一处，**这里要用 `workspace-git.ts` 自己那套**）、失败怎么静默降级（该文件的原则是"git 不可用一律降级，不抛"）。

**这一步不许跳过**：抄错执行器的语义会让整条链在非 git 目录上抛异常。

- [ ] **Step 2: 写失败测试（服务端）**

在 `test/workspace-git.test.ts` 追加。**测试自己在临时目录造仓库**（`mkdtempSync` + `execFileSync`），**不依赖 `.git-fixture/`**（那是活的，会被别的计划重建）。先把这个文件头部的 import 补齐（**按文件现有的 import 风格改**，下面是我按它已有用法写的）：

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 造一个只属于本次测试的空仓库（在系统临时目录里，跑完不必清）。 */
function mkTmpRepo() {
  const root = mkdtempSync(join(tmpdir(), "plan3-patch-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  return root;
}

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
```

**★ 那两行 `git config` 不是可选的**：CI 与干净机器上没有全局 `user.email`/`user.name`，`git commit` 会当场失败，而本机（配过）不会——**这是"本机绿、CI 红"的经典坑**。


```ts
describe("probeFilePatch：工作区相对 HEAD 的真 patch（计划 3 · T4）", () => {
  it("改过的文件给出带行号与上下文行的 hunk", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "a.txt"), "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    writeFileSync(join(root, "a.txt"), "1\n2\n3\nCHANGED\n5\n6\n7\n8\n9\n10\n");

    const p = await probeFilePatch(root, "a.txt");
    expect(p.present).toBe(true);
    expect(p.tracked).toBe(true);
    expect(p.added).toBe(1);
    expect(p.deleted).toBe(1);
    expect(p.hunks.length).toBe(1);
    expect(p.hunks[0].header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);   // ← 有行号
    // 上下文行（sign === " "）必须存在——这正是"没有位置"那条链给不了的东西
    expect(p.hunks[0].lines.some((l) => l.sign === " ")).toBe(true);
    expect(p.hunks[0].lines.some((l) => l.sign === "-" && l.text === "4")).toBe(true);
    expect(p.hunks[0].lines.some((l) => l.sign === "+" && l.text === "CHANGED")).toBe(true);
  });

  it("★ write_file 覆盖的那种改法也给得出来（事件流那条链在这里是瞎的）", async () => {
    const root = mkTmpRepo();
    writeFileSync(join(root, "b.txt"), "old\n");
    git(root, "add", "-A"); git(root, "commit", "-m", "init");
    writeFileSync(join(root, "b.txt"), "整份换掉\n第二行\n");   // 整文件覆盖

    const p = await probeFilePatch(root, "b.txt");
    expect(p.deleted).toBe(1);
    expect(p.added).toBe(2);
    expect(p.hunks[0].lines.filter((l) => l.sign === "+").map((l) => l.text))
      .toEqual(["整份换掉", "第二行"]);
  });

  it("未跟踪文件：整个文件都是 + 行", async () => { /* … */ });
  it("不是 git 仓库：present=false 且给一句人话", async () => { /* … */ });
  it("二进制文件：binary=true、不给逐行", async () => { /* … */ });
  it("超长文件：truncated=true 且留前 N 个 hunk", async () => { /* … */ });
});
```

**★ 第二条是本任务的**核心**断言**——它锁的正是"这条链补上了事件流补不上的那个洞"。**别的都可以省，这条不能。**

- [ ] **Step 3: 跑，确认它红**

Run: `npx vitest run test/workspace-git.test.ts`
Expected: **FAIL**，`probeFilePatch is not a function` 或 `is not exported`。

- [ ] **Step 4: 实现 `probeFilePatch`**

要点（**不写死实现，但要满足**）：
- 用 `git diff -U3 --no-color HEAD -- <relPath>` 取 tracked 文件的 patch；
- **未跟踪**（`git status --porcelain -- <relPath>` 首两字符是 `??`，或直接用 `git ls-files --error-unmatch` 判）→ **自己合成**：读文件、逐行 `+`、header 写 `@@ -0,0 +1,N @@`。**不要用 `git diff --no-index /dev/null <path>`**——`/dev/null` 在 Windows 上不可靠；
- 解析：按行扫，遇 `@@ ` 开新 hunk（header 逐字保留）；hunk 体内的行按首字符分 ` `/`-`/`+`；`\ No newline at end of file` 记成 `sign: "\\"`；
- 上限：patch 文本超过 `MAX_PATCH_BYTES`（取 **262144**）→ `truncated: true`，只保留已解析完整的前若干个 hunk；
- 二进制：`git diff` 输出含 `Binary files` 或 `GIT binary patch` → `binary: true`；
- 文件不存在：`existsSync` 先判，给 `note`；
- **任何 git 失败都不许抛**：降级成 `present: false`（若连仓库都不是）或 `hunks: []` + `note`。

- [ ] **Step 5: 跑，确认它绿**

Run: `npx vitest run test/workspace-git.test.ts`

- [ ] **Step 6: 加路由与 handler**

6.a 路由表（`ui/server.ts`，紧挨既有的 git 路由 `:9450-9465` **之后**加）：

```ts
    const workspaceGitDiffMatch = method === "GET" && url.match(/^\/api\/workspace\/git\/diff(?:\?(.*))?$/);
    if (workspaceGitDiffMatch) {
      const params = new URLSearchParams(workspaceGitDiffMatch[1] ?? "");
      return { type: "workspaceGitDiff", workdir: params.get("workdir"), path: params.get("path") };
    }
```

6.b handler（紧挨 `case "workspaceGitGet"` `:11653-11657` **之后**加）：

```ts
      case "workspaceGitDiff": {
        const listed = listedWorkdir(route.workdir);
        if (!listed.ok) return json(res, listed.status, { error: listed.error });
        const rel = typeof route.path === "string" ? route.path.trim() : "";
        if (!rel) return badRequest(res, "缺少路径（path）");
        // 圈禁：path 是**相对仓库 root** 的（不是相对 workdir——workdir 可能是
        // 仓库的子目录）。**必须同时落在 root 与 workdir 之内**：只看 root 的话，
        // 相对 root 的 `../sibling` 能通过圈禁却逃出 workdir。
        // resolveInWorkdir **越界时是抛、不是返 null**（fs-util.ts:69/78），
        // 所以这里要包 try/catch，越界返 400 而不是漏成 500。
        // **★ 但"传错基准会拿到 400"这句话是错的**：workdir=root/sub 时，调用方若传
        // workdir 相对的 `sub/file.txt`，它作为 root 相对路径是 root/sub/file.txt——
        // **双检全过**，于是静静地返回**另一个文件**的 patch。
        // **★ 但这条不是全称**：错基准里**越出边界**的形状仍会被挡下、返 400——
        // **是哪一道挡取决于形状**：`../x.txt`（连 root 都逃出去）是**第一道**挡；
        // `sub/../x.txt` 或 root 层的 `file.txt`（留在 root 内、逃出 workdir）是
        // **第二道**挡；**只有落在边界内的**错基准才是静默取错。所以消费方必须自己
        // 保证基准一致——服务端**无法识别**"基准传错
        // 了但恰好落在界内"这种情形，那正是它静默的原因。
        // probeWorkspaceGit 的联合类型里，present:false 那条**没有 root**
        const gitSnap = await probeWorkspaceGit(listed.path);
        const root = gitSnap.present ? gitSnap.root : listed.path;
        try {
          const abs = resolveInWorkdir(root, rel);      // 第一道：落在 root 内
          resolveInWorkdir(listed.path, abs);           // 第二道：也落在 workdir 内
          return json(res, 200, await probeFilePatch(root, rel));
        } catch {
          return badRequest(res, "路径越出了工作目录");
        }
      }
```

**★ `resolveInWorkdir` 的签名先读**（`src/tools/fs-util.ts:63` `resolveInWorkdir(workdir, p, extraRoots?)`）——它**返回什么**（抛？还是返回 null？）要照它的真实语义写，**别照我上面猜的写**。

- [ ] **Step 7: 写前端取数并测**

在 `ui/public/features/workspace-git.js` 加：

```js
/**
 * 取某个文件**工作区相对 HEAD** 的真 patch（计划 3 · T4）。
 *
 * 语义如实：这不是"本场 run 专属的改动"，它混着用户自己的未提交改动。
 * 「本场碰过哪些路径」是另一条链（事件流）的事。
 */
export async function fetchFilePatch(workdir, path, fetchImpl = fetch) {
  if (!workdir || !path) return null;
  try {
    const res = await fetchImpl(
      `/api/workspace/git/diff?workdir=${encodeURIComponent(workdir)}&path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;   // 取不到就不给卡，不炸会话流
  }
}
```

在 `test/ui-workspace-git.test.ts` 追加两条：地址编码正确；`!res.ok` 与抛错都返回 `null`。

- [ ] **Step 8: 活页探针**

新建 `eval/persona-ux/_audit-20260919/verify-file-patch.mjs`：**不经过浏览器**，直接 `fetch` 端点（Node 18+ 有全局 fetch）。判据：

- **① 对 `.git-fixture/git-repo` 里那个改过的文件**（`src/app.js`，夹具造出来的 `M`）**拿到 ≥1 个 hunk，且 header 匹配 `@@ -…+…@@`**；
- **② 未跟踪的 `src/new-file.js` 拿到全 `+` 的 hunk**；
- **③ 一个非 git 的 workdir 拿到 `present: false` 且 `note` 是人话**（用宿主自己的项目根或临时目录）；
- **④ 路径越界（`../../etc/passwd`）被 400 挡住**。

- [ ] **Step 9: 提交**

```bash
git add src/workspace-git.ts ui/server.ts ui/public/features/workspace-git.js test/workspace-git.test.ts test/ui-workspace-git.test.ts eval/persona-ux/_audit-20260919/verify-file-patch.mjs
git commit -m "feat(ui): 真 patch 端点——工作区相对 HEAD 的行号与上下文行

事件流那条链给的是本场 run 的编辑内容（字节精确、但没有位置），
write_file 覆盖场景根本拿不到旧版；git diff 给的是行号与上下文行，
但没有 run 归属。两条链各有各的活，谁也不替谁。

这条补上的正是那个洞：write_file 覆盖的文件在 git diff 里整个新内容
都是 + 行。四条降级都有：非仓库 / 文件不在 / 二进制 / 超长。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 5: 深链从"按下标"改成"按路径"

**Files:**
- Modify: `ui/public/features/artifact-canvas.js`（`encodeArtifactHash` `:318`、`ARTIFACT_ROUTE_RE` `:333`、`parseArtifactRoute` `:341` 的返回形状）
- Modify: `ui/public/index.html`（`openArtifactByIndex` `:932`、`openPendingArtifact` `:965`、`parseRoute` `:1967-1978`、`pendingArtifact` `:2193`、以及 `:959-963` 那句说反的注释）
- Test: `test/ui-artifact-route.test.ts`（**新建**）
- Create: `eval/persona-ux/_audit-20260919/verify-artifact-route.mjs`

**Interfaces:**
- Consumes: `ui/public/app.js:9697` 的 `export function resolveArtifactOpen(list, path)`（**已有**，返回 `{mode:"canvas", index} | {mode:"none"}`）
- Produces（`artifact-canvas.js`）：
  ```js
  /**
   * @param {string} runId
   * @param {number|{path:string}} ref  数字 = 旧的下标形态（兼容）；对象 = 按路径
   * @param {{ full?:boolean }} [opts]
   */
  export function encodeArtifactHash(runId, ref, opts = {})
  // → "#/run/<id>/artifact/<encodeURIComponent(path)>" 或 "#/run/<id>/artifact/<n>"

  /**
   * @returns {{ runId:string, path:string|null, index:number|null, full:boolean }|null}
   *   path 与 index **恰好一个非 null**：路径形态给 path，旧的下标形态给 index。
   */
  export function parseArtifactRoute(hash)
  ```

**背景：静默指错，不是报错**

现在的形态是 `#/run/<id>/artifact/<index>`（`artifact-canvas.js:311` 的注释逐字：「index 是宿主产物清单里的 0 基序号」）。而那份清单是**会话态派生的**（`index.html:813-816` 逐字）：

> `这一场的预览标签条 = **这场对话的产物 ∪ 用户点开过的**，再减去用户关掉的。`

**它可以增、也可以减**（`forgetPreviewFile` 会 filter 掉条目）。于是**同一个 URL 在不同会话状态下解析到不同的文件**；越界只靠 `wrapIndex`（`:363-366`）取模兜——**不报错，只是静静地指到另一个文件**。计划 2 的终审还发现了另一条位移向量：合并之后产物段排在 `mine` 段**之后**，会话进行中新产物落盘会让既有下标**整体右移**。

**而按路径的基础设施已经在了**：`openArtifactByPath`（`index.html:944`）→ `resolveArtifactOpen`（`app.js:9697`）→ 下标。**缺的只是"地址里写路径"。**

**★ 改动全在边界上**：`openCanvas(index, opts)`（`artifact-canvas.js:1665`）的签名**一个字都不用动**——内部仍然按下标寻址（对着活的清单），只有 **hash 的编码与解码**换成路径。这是本任务最重要的设计约束：**别去改画布内部的寻址，那会牵扯 `wrapIndex`、`◀ ▶`、关标签后的落点（`:368-380`）一整串。**

---

- [ ] **Step 1: 写失败测试**

新建 `test/ui-artifact-route.test.ts`：

```ts
// @vitest-environment jsdom
// @ts-nocheck
/**
 * 产物深链的编解码（计划 3 · T5）。
 *
 * 为什么从下标改成路径：那份清单是**会话态派生**的（产物 ∪ 点开过的 − 关掉的），
 * 可增可减，越界还被 wrapIndex 取模兜住——于是同一个 URL 在不同会话状态下
 * **静静指到另一个文件**，不报错。路径不会动。
 *
 * 用 jsdom 环境：与同族的 `test/ui-preview-dock.test.ts` / `test/ui-file-preview.test.ts`
 * 一致。**严格说这条不是必需的**——本文件的纯函数层（头注写明「可单测」）
 * 不摸 DOM，`document` / `window` 只出现在 `initArtifactCanvas` 的函数体里。
 * 留着是因为它零成本，而这个文件 1700+ 行，模块体里再长出一点 DOM 访问
 * 就会让 node 环境下的 import 当场炸。
 */
import { describe, expect, it } from "vitest";
import {
  encodeArtifactHash,
  parseArtifactRoute,
} from "../ui/public/features/artifact-canvas.js";

describe("产物深链：按路径", () => {
  it("路径形态：斜杠被转义，段里没有裸斜杠", () => {
    const hash = encodeArtifactHash("run-1", { path: "shots/a b.png" });
    expect(hash).toBe("#/run/run-1/artifact/shots%2Fa%20b.png");
    expect(hash.split("/artifact/")[1].split("?")[0]).not.toContain("/");
  });

  it("往返：编码再解码拿回同一个路径", () => {
    for (const p of ["a.txt", "shots/深 空.png", "有?问号#井.txt", "CJK/中文名.md"]) {
      const back = parseArtifactRoute(encodeArtifactHash("r", { path: p }));
      expect(back?.path).toBe(p);
      expect(back?.index).toBeNull();
    }
  });

  it("放大态：?full 不影响路径解析", () => {
    const back = parseArtifactRoute(encodeArtifactHash("r", { path: "a/b.txt" }, { full: true }));
    expect(back?.path).toBe("a/b.txt");
    expect(back?.full).toBe(true);
  });

  it("★ 旧的下标形态仍然认（历史会话里的链接不许断）", () => {
    const back = parseArtifactRoute("#/run/run-1/artifact/3");
    expect(back?.index).toBe(3);
    expect(back?.path).toBeNull();
  });

  it("数字形态仍然编得出来（别处可能还在用）", () => {
    expect(encodeArtifactHash("run-1", 3)).toBe("#/run/run-1/artifact/3");
  });

  it("不匹配的 hash 返回 null", () => {
    expect(parseArtifactRoute("#/run/abc/loop")).toBeNull();
    expect(parseArtifactRoute("#/settings")).toBeNull();
    expect(parseArtifactRoute("")).toBeNull();
  });

  it("非法转义不抛，按原样留着", () => {
    expect(() => parseArtifactRoute("#/run/r/artifact/%E4%B8%AD")).not.toThrow();
    expect(() => parseArtifactRoute("#/run/r/artifact/%")).not.toThrow();
  });
});
```

**★ 第四条（旧形态仍认）是本任务的安全绳**：历史会话、收藏、别人发过来的链接都可能是数字形态。**改了编码不改解码**，那些链接会静静地指到别处——**正是本任务要消灭的那种失败**。

- [ ] **Step 2: 跑，确认它红**

Run: `npx vitest run test/ui-artifact-route.test.ts`
Expected: 前三条 FAIL（现在的 `encodeArtifactHash` 只认数字，传对象会变成 `NaN`；`ARTIFACT_ROUTE_RE` 的 `(\d+)` 不认路径）。第四条 PASS（旧形态现在当然认）。

- [ ] **Step 3: 实现（`artifact-canvas.js`）**

3.a `encodeArtifactHash`：

```js
/**
 * 路由编码：`#/run/<id>/artifact/<路径>`，放大态追加 `?full`。
 *
 * **为什么是路径不是下标**：那份清单是会话态派生的（这一场的产物 ∪ 点开过的
 * − 关掉的），可增可减；越界还被 wrapIndex 取模兜住，于是同一个 URL 在不同
 * 会话状态下**静静指到另一个文件**，不报错。路径不会动。
 *
 * 路径整段 encodeURIComponent（斜杠变 %2F），所以段里不会有裸斜杠——
 * 正则的 `[^/?]+` 才切得开。数字形态仍然编得出来（兼容旧调用点）。
 *
 * @param {string} runId
 * @param {number|{path:string}} ref
 * @param {{ full?:boolean }} [opts]
 * @returns {string}
 */
export function encodeArtifactHash(runId, ref, opts = {}) {
  const id = encodeURIComponent(String(runId ?? ""));
  const seg = ref && typeof ref === "object"
    ? encodeURIComponent(String(ref.path ?? ""))
    : String(Math.max(0, Math.trunc(Number(ref) || 0)));
  const base = `#/run/${id}/artifact/${seg}`;
  return opts?.full ? `${base}?full` : base;
}
```

3.b 正则与解码：

```js
// 路径形态整段被 encodeURIComponent 过，所以段里不会出现裸 `/` 或 `?`
const ARTIFACT_ROUTE_RE = /^#\/run\/([^/]+)\/artifact\/([^/?]+)(?:[/?].*)?$/;

/**
 * 路由解码。不匹配返回 null。
 *
 * **两种形态都认**：纯数字段 = 旧的下标形态（历史会话、别人发来的链接），
 * 其余 = 路径形态。`path` 与 `index` **恰好一个非 null**。
 * 越界不归这里管（清单在宿主手里）。
 *
 * @param {string} hash location.hash
 * @returns {{ runId:string, path:string|null, index:number|null, full:boolean }|null}
 */
export function parseArtifactRoute(hash) {
  const m = ARTIFACT_ROUTE_RE.exec(String(hash ?? ""));
  if (!m) return null;
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const raw = m[2];
  const isLegacyIndex = /^\d+$/.test(raw);
  return {
    runId: dec(m[1]),
    path: isLegacyIndex ? null : dec(raw),
    index: isLegacyIndex ? Number.parseInt(raw, 10) : null,
    full: /[?&]full(?:&|=|$)/.test(String(hash ?? "")),
  };
}
```

- [ ] **Step 4: 跑，确认它绿**

Run: `npx vitest run test/ui-artifact-route.test.ts`
Expected: 全绿。

- [ ] **Step 5: 变异验红**

5.a 把 `parseArtifactRoute` 里的 `isLegacyIndex` 分支改成一律当路径（`path: dec(raw), index: null`）→ 跑 → **第四条必须红** → 还原。
5.b 把 `encodeArtifactHash` 的 `encodeURIComponent` 去掉 → 跑 → **第一条必须红**（段里出现裸斜杠）→ 还原。

- [ ] **Step 6: 接上宿主（`index.html`）**

6.a `parseRoute`（`:1973`）—— 现在读 `route.index`，改成把两个都带上：

```js
  if (artifact) return { kind: "artifact", runId: artifact.runId, path: artifact.path, index: artifact.index, full: artifact.full };
```

6.b `:2193` 的 `pendingArtifact` 赋值：

```js
    pendingArtifact = { runId: route.runId, path: route.path, index: route.index, full: Boolean(route.full) };
```

（`:771` 那处 JSDoc 类型同步改成 `{ runId:string, path:string|null, index:number|null, full?:boolean }`）

6.c `openPendingArtifact()`（`:965`）—— **路径优先，下标兜底**：

```js
function openPendingArtifact() {
  if (!pendingArtifact) return;
  const { runId, path, index, full } = pendingArtifact;
  if (runId !== selectedRunId) return;
  // 路径形态：走已有的那条"路径 → 下标"的解析（它会把这一份记成标签）
  if (path !== null && path !== undefined) {
    // openArtifactByPath 返回"是否真的开上了"——**不能用 pendingArtifact 有没有被替换来判**：
    // 成功时它不会替换 pendingArtifact，那个判据永不为真，于是**每次渲染都会重开一次画布**
    // （重取内容 / 重置 deck 位置 / **并且抢焦点**——openCanvas 末尾会 dock.closeBtn.focus()）。
    if (openArtifactByPath(runId, path, { full: Boolean(full) })) pendingArtifact = null;
    // 没开成（找不到）就留着等下一次渲染
    return;
  }
  // 旧的下标形态：原样
  if (artifactCanvasApi?.open(index, { full: Boolean(full) })) pendingArtifact = null;
}
```


**★ 所以 `openArtifactByPath` 要改成返回布尔**（是否真的开上了：走 `resolved.mode === "canvas"` 那条路为 `true`，走到 `announceStatus("找不到该产物")` 那条为 `false`）。**这是本任务的一部分，不是可选的。**

**★ 而“用 `pendingArtifact` 有没有被替换来判成败”是错的**（计划最初就那么写，被任务审查抓到）：成功时它不被替换，判据永不为真，于是**每次渲染都重开一次画布**——而 `openPendingArtifact()` 在**每次渲染末尾**被无条件调用，`openCanvas` 末尾又会 `dock.closeBtn.focus()`。**后果是在跑着的 run 里，每次状态推送都把焦点从输入框抢到画布关闭钮上。**
1
**★ 这一段是整任务最容易写错的地方**：`openArtifactByPath` 自己会调 `openArtifactByIndex`，而后者会写 hash；**`pendingArtifact` 什么时候清**必须与旧路径的语义一致（旧的是"open 返回 true 才清"）。**写完必须跑 Step 7 的活页探针**，纯函数测不到这里。

6.d `openArtifactByIndex`（`:932`）—— **写出去的地址改成路径形态**（这是"URL 稳定"的来源）：

```js
/** 打开画布：走 hash 路由，浏览器前进/后退天然可用 */
function openArtifactByIndex(runId, index) {
  const list = openedPreviewArtifacts(runId);
  if (!runId || list.length === 0) return;
  enteredCanvasFromApp = true;
  const at = ((Math.trunc(index) % list.length) + list.length) % list.length;
  const target = encodeArtifactHash(runId, { path: list[at]?.path ?? "" });
  if (location.hash === target) {
    artifactCanvasApi?.open(index);
    return;
  }
  location.hash = target;
}
```

**★ 注意这里自己算了取模**（而不是去 import `wrapIndex`）：`wrapIndex` 在 `artifact-canvas.js` 里**是导出的**（`:363` `export function wrapIndex`），所以**更干净的写法是 import 它**——两条取模逻辑是同一个语义，不该有两份。**实现时优先 import**；只有当你读到 `index.html` 已经 import 了 `artifact-canvas.js` 的别的东西、加一个名字不费事时才这么做（它确实 import 了：`parseArtifactRoute`）。

6.e 把 `:959-963` 那句说反的注释改掉。改前逐字：

```
 * 从前这里还有一个特例——标签条为空时手动从 currentRunArtifacts 挑一个塞进去；
 * 那是「两套清单不互通」打的补丁。标签条现在天然含这一场的产物，删掉特例后
 * 深链 index 就是合并清单的下标，open 里 wrapIndex 兜越界，语义不变。
```

改后：

```
 * 从前这里还有一个特例——标签条为空时手动从 currentRunArtifacts 挑一个塞进去；
 * 那是「两套清单不互通」打的补丁。标签条现在天然含这一场的产物，那个特例已经删掉。
 *
 * **深链在计划 3 · T5 之后是按路径的**（`#/run/<id>/artifact/<转义路径>`）：
 * 从前按下标时，"合并清单的下标"会随会话状态整体位移，而 wrapIndex 把越界
 * 取模兜住——**静默指到另一个文件，不报错**。数字形态仍然认（历史链接），
 * 但新写出去的一律是路径。
```

- [ ] **Step 7: 活页探针（**这一条才是本任务的验收**）**

新建 `eval/persona-ux/_audit_20260919/verify-artifact-route.mjs`：

1. 打开一个有 ≥3 件产物的 run，点开第 2 件产物；
2. **判据 ①**：地址栏是**路径形态**（`/#/run/<id>/artifact/` 后面那一段**不是纯数字**），且解码回来等于那一份的路径；
3. **判据 ②**：**刷新页面**，打开的还是那一件（这条测的是"深链真的能复原"）；
4. **判据 ③**：**把地址改成一个旧的下标形态**（`…/artifact/1`），回车，**打开的是清单里第 1 件**（旧链接仍然工作）；
5. **判据 ④**：**把地址改成一个不存在于清单里的路径**，回车 → **不崩、有话说**（应当是 `announceStatus("找不到该产物")` 那条），且 0 控制台错误。

**★ 判据 ① 必须是"不是纯数字"而不是"等于某个具体路径"**：具体路径取决于那一场的产物，写死了会在别的 run 上假红。

- [ ] **Step 8: 提交**

```bash
git add ui/public/features/artifact-canvas.js ui/public/index.html test/ui-artifact-route.test.ts eval/persona-ux/_audit-20260919/verify-artifact-route.mjs
git commit -m "fix(ui): 产物深链从按下标改成按路径——不再静默指到别的文件

那份清单是会话态派生的（这一场的产物 ∪ 点开过的 − 关掉的），可增可减，
越界还被 wrapIndex 取模兜住——于是同一个 URL 在不同会话状态下静静指到
另一个文件，不报错。计划 2 的合并还带来一条位移向量：产物段排在 mine
段之后，新产物落盘会让既有下标整体右移。

路径形态整段 encodeURIComponent；**旧的下标形态仍然认**（历史会话与他人
发来的链接），新写出去的一律是路径。openCanvas 的签名一个字没动——
内部仍按下标对着活清单寻址，只有 hash 的编解码换了形态。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 6: 对话流里的「本场改动」卡 + 审阅动作

**Files:**
- Modify: `ui/public/app.js`（**四处**：`deriveChatItems` `:8736`、条目键派生 `:9102-9119`、`renderChatItem` `:10473`、`chatItemSig` `:7816`；外加两个新导出纯函数）
- Modify: `ui/public/index.html`（已阅状态的容器；撤掉 → 输入框）
- Modify: `ui/public/styles.css`（卡片与 hunk 的样式）
- Test: `test/ui-review-hunks.test.ts`（**新建**）
- Create: `eval/persona-ux/_audit-20260919/verify-change-card.mjs`

**Interfaces:**
- Consumes:
  - `ui/public/features/workspace-git.js` 的 `fetchFilePatch(workdir, path, fetchImpl)`（**任务 4 产出**）
    **★ `path` 是相对「仓库 root」的，不是相对 workdir——workdir 可能是仓库的子目录。**（任务 4 的契约，消费方必须照它传。）
  - `ui/public/app.js:10149` `editHunksFromTimeline(state)`（**已有**，`Map<path, {oldText,newText}[]>`）
- Produces（都在 `ui/public/app.js`）：
  ```js
  /**
   * 本场碰过、且值得给卡片的路径（同步纯函数）。
   * @returns {{ path: string, edits: number, lastSeq: number }[]}  按 lastSeq 升序
   */
  export function deriveTouchedFiles(state)

  /**
   * 「撤掉」要发的那句话（同步纯函数，只生成文本，**不发送**）。
   * @param {{ path:string, header:string, added:number, deleted:number }} hunk
   * @returns {string}  例：把 ui/public/app.js 第 11456 行起新加的 12 行撤掉
   */
  export function buildRevertMessage(hunk)
  ```
- Produces（`ui/public/index.html` 模块级，**不外传**）：
  ```js
  /** runId → Map<path, 已阅时的 lastSeq>；再被改动（lastSeq 变了）自动失效 */
  const reviewedAtSeq = new Map();
  ```

**★ 渲染链的形状（读出来的，决定实现方式）**

```
renderRunDetail(app.js:5413) → ensureDetailSkeleton(:5546，换 run 才整建)
  → patchConversation(:7451) → deriveChatItems(:8736)  ← 同步纯函数
    → patchList(:7496) → renderChatItem(:10473) → 一个 div.chat-item
```

**三处一起改才算插进去**：`deriveChatItems` 里产条目、条目键派生里给稳定 key、`renderChatItem` 里加 case。做完这三处，**`patchList` 的节点复用与 `details` 展开态保全自动就有了**——`dom/patch.js:4-8` 的硬规矩是「已存在 key 的节点永不重建，只更新」。

**★ 硬约束：`deriveChatItems` 是同步的，patch 是异步取的。** 所以：

- **折叠态只带同步拿得到的东西**：路径、改动次数（来自 `editHunksFromTimeline`）。**不显示行数**——那是 patch 里的，展开时才取。
- 展开某个文件时才 `fetchFilePatch`，取回来再画进卡片体。**传 `path` 时注意**：它是相对**仓库 root** 的（见 Interfaces）——`deriveTouchedFiles` 给的是 run 事件里的路径，**接线时要确认两者的基准一致**；不一致的话它会静静地取不到（或取错），**不报错**。
- 取不到（非 git 目录、文件不在）**就给一句人话**，卡片不消失。

**★ 与设计案的一处偏差，如实记**：设计案 态 3 的折叠头写了 `+197 −0`，本计划**折叠态只写「改文件 3 个」**，行数在展开后与右栏面板里才有。理由就是上面那条形状约束——**为了合上那个数字去同步造一份行数统计，等于给同一条链造第二个真值源。**

**★ 审阅动作落地成两件（D1 的裁定）**：

```
✓ 已阅   ·   ✕ 撤掉   ·   下一个 hunk ↓
```

- **已阅**：纯前端，`reviewedAtSeq`。**记的是"你在哪个 seq 上阅过"**——`lastSeq` 变了就自动失效（调研 §4 抄 Copilot 的那条「文件被再次改动时标记自动清除」）。
- **撤掉**：`buildRevertMessage` 生成一句话 → **写进输入框**（`taskInput.value = …`，**不发送**）→ 焦点与光标到末尾。照 `index.html:6317-6323`（点评追加）的既有写法。
- **下一个 hunk**：卡片内部滚动定位，不改 hash。

**⚠ 两处未核实（实现者必须自己读，别照抄我这句话）**

1. `ui/public/features/reading-mode.js` 每次渲染后对 `#conversation` 做 DOM 后处理（`index.html:2314-2319`）。**它会不会改写或隐藏新插入的条目，勘查没读它的匹配逻辑。** 实现前先读它，并让活页探针**在阅读模式开着与关着两种情况下都量一次卡片在不在。**
2. `test/ui-patch.test.ts` 里可能有"对话条目按 key 复用"的既有锁。**改 `deriveChatItems` 之后先跑全量**，别等提交时才发现。

---

- [ ] **Step 1: 写失败测试（两个纯函数）**

新建 `test/ui-review-hunks.test.ts`：

```ts
// @ts-nocheck
/**
 * 「本场改动」卡的同步派生与撤掉文案（计划 3 · T6）。
 *
 * 这一层能测的只有纯函数：卡片真正画出来、真的取到 patch，得靠活页探针
 * （app.js 的渲染链在 jsdom 里跑不起来）。
 */
import { describe, expect, it } from "vitest";
import { deriveTouchedFiles, buildRevertMessage } from "../ui/public/app.js";

const toolCall = (seq, name, input, id = `t${seq}`) => ({ type: "tool_call", seq, name, input, toolUseId: id });
const okResult = (seq, id) => ({ type: "tool_result", seq, toolUseId: id, resultIsError: false });

describe("deriveTouchedFiles", () => {
  it("只收成功的编辑，按最后触碰的 seq 升序", () => {
    const state = {
      timeline: [
        toolCall(1, "edit_file", { path: "a.txt", old_string: "x", new_string: "y" }, "A"),
        okResult(2, "A"),
        toolCall(3, "edit_file", { path: "b.txt", old_string: "x", new_string: "y" }, "B"),
        okResult(4, "B"),
        toolCall(5, "edit_file", { path: "a.txt", old_string: "y", new_string: "z" }, "C"),
        okResult(6, "C"),
      ],
    };
    expect(deriveTouchedFiles(state)).toEqual([
      { path: "b.txt", edits: 1, lastSeq: 3 },
      { path: "a.txt", edits: 2, lastSeq: 5 },
    ]);
  });

  it("失败的编辑不算（改的是别的东西）", () => {
    const state = {
      timeline: [
        toolCall(1, "edit_file", { path: "a.txt", old_string: "x", new_string: "y" }, "A"),
        { type: "tool_result", seq: 2, toolUseId: "A", resultIsError: true },
      ],
    };
    expect(deriveTouchedFiles(state)).toEqual([]);
  });

  it("write_file 也算碰过（哪怕事件流拿不到它的旧版）", () => {
    const state = {
      timeline: [
        toolCall(1, "write_file", { path: "c.txt", content: "整份" }, "A"),
        okResult(2, "A"),
      ],
    };
    expect(deriveTouchedFiles(state).map((f) => f.path)).toEqual(["c.txt"]);
  });
});

describe("buildRevertMessage", () => {
  it("有行号时说得具体：文件 + 行号 + 增删行数", () => {
    const msg = buildRevertMessage({
      path: "ui/public/app.js",
      header: "@@ -11455,6 +11456,18 @@",
      added: 12, deleted: 1,
    });
    expect(msg).toContain("ui/public/app.js");
    expect(msg).toContain("11456");          // 取新文件的起始行
    expect(msg).toContain("12");
  });

  it("没有行号（旧下标形态 / 非 git）时退化成不提行号，但不许说假话", () => {
    const msg = buildRevertMessage({ path: "a.txt", header: "", added: 3, deleted: 0 });
    expect(msg).toContain("a.txt");
    expect(msg).not.toMatch(/第\s*\d+\s*行/);   // ← 不许编一个行号出来
  });

  it("是一句可以直接发出去的指令（能独立成句）", () => {
    const msg = buildRevertMessage({ path: "a.txt", header: "@@ -1,1 +1,2 @@", added: 1, deleted: 0 });
    expect(msg.trim().length).toBeGreaterThan(6);
    expect(msg).not.toContain("\n");
  });
});
```

**★ 第二条是本任务最该有的一条断言**：`buildRevertMessage` 拿不到 `@@` 时必须**不提行号**——**不许编一个**。这条链上"看着像真的"的假话最容易发生，而它的代价是 agent 去改了错的地方。

- [ ] **Step 2: 跑，确认它红**

Run: `npx vitest run test/ui-review-hunks.test.ts`
Expected: FAIL，`deriveTouchedFiles is not a function`。

- [ ] **Step 3: 实现两个纯函数（`ui/public/app.js`）**

要点：
- `deriveTouchedFiles`：复用 `editHunksFromTimeline` 的收法（只收成功的 `edit_file` / `write_pptx`），**但要额外收 `write_file`**（它没有 old/new，但确实碰了文件，而且**正是 git patch 能补上旧版的那一类**）。按 `lastSeq` 升序返回。
- `buildRevertMessage`：从 `header`（形如 `@@ -11455,6 +11456,18 @@`）里取**新文件起始行**（`+` 后面那个数）。取不到就**不提行号**，用"这几个改动"这样的说法。句子要能独立发出去（不换行、有主语）。

- [ ] **Step 4: 跑，确认它绿**

Run: `npx vitest run test/ui-review-hunks.test.ts`
Expected: 全绿。

- [ ] **Step 5: 变异验红**

5.a 把 `deriveTouchedFiles` 里"只收成功的编辑"那个判断去掉 → 跑 → **第二条必须红** → 还原。
5.b 让 `buildRevertMessage` 在 `header` 为空时也输出一个行号（比如硬编码 `第 1 行`）→ 跑 → **第三条必须红** → 还原。

- [ ] **Step 6: 插进渲染链（**三处一起改**）**

6.a `deriveChatItems`（`:8736`）：在事件循环**结束之后**，若本场有触碰文件，**追加**一个条目：

```js
    kind: "changecard",
    key: "changecard",
    files: deriveTouchedFiles(state),
```

**★ key 必须是常量 `"changecard"`**（每场最多一张）。这是个**常量 key**，`patchList` 就不会重建它——展开态与已取的 patch 都保得住。

6.b 条目键派生（`:9102-9119`）加一条：`changecard` 的 key 就是它自己的 `key` 字段（照 `tool:` 那几条的写法）。

6.c `renderChatItem`（`:10473`）加 case：`case "changecard": return renderChangeCard(it);`

6.d `chatItemSig`（`:7816-7843`）加一条签名，**必须随"已阅集合"变化**（否则点了已阅卡片不重画）：签名里带上本场已阅路径的排序串与各自的 seq。

- [ ] **Step 7: 画卡片**

在 `app.js` 加 `renderChangeCard(it)`：

- **折叠头**（`<details class="chat-change-card">`）：
  `▸ 改文件 3 个` + 右侧 `在右栏审阅 →`（一个 `[data-review-panel]` 按钮）。
  **不写行数**（见上面的形状约束）。
- **展开体**：逐文件一行 `路径` + 一个展开键；点开才 `fetchFilePatch` 取 patch（**`path` 相对仓库 root**，见 Interfaces），取回来画：
  - 文件级的 `已阅` 标记（来自 `reviewedAtSeq`，seq 不符就不画）
  - 每个 hunk：`@@ … @@` 头 + 逐行（`sign` 决定 class，**上下文行要有、要淡**），动作行 `已阅 · 撤掉 · 下一个 hunk ↓`
- **取不到**：体里给一句人话（用 `FilePatch.note`），**卡片留着**。

**★ 禁用 unicode dingbat 那条在这里最容易踩**：`✓` 与 `✕` **不许**直接写进 HTML（Windows 字体回落不一致）。用 CSS 画的形状（`::before` + border/transform），照本仓既有状态点的做法。

CSS 加进 `styles.css`（新类前缀 `.chat-change-card*`），**hunk 行复用 `changes-panel.js` 已有的 `.chg-hunk-line--del/--add` 颜色变量**（先读 `styles.css:8966-8991` 看它们用了哪些变量，别再造一套色）。

- [ ] **Step 8: 接宿主（`ui/public/index.html`）**

8.a 模块级加：

```js
/**
 * 已阅标记：runId → Map<path, 已阅时的 lastSeq>（计划 3 · T6）。
 *
 * **记的是"你在哪个 seq 上阅过"**，不是"阅过了"——文件再被改动时
 * lastSeq 变了，标记自动失效（调研 §4 抄 Copilot 的「文件被再次改动时
 * 标记自动清除」）。照 unreadRuns 的范式：模块级容器、页面存活期常驻。
 */
const reviewedAtSeq = new Map();
```

8.b 卡片里的三个动作接到这三处：

| 动作 | 接线 |
|---|---|
| 已阅 | 写 `reviewedAtSeq`，然后**重渲染一次**（照 `index.html:2275-2277` `dismissedUnverified` 那个既有写法） |
| 撤掉 | `taskInput.value = buildRevertMessage(hunk)`；`taskInput.focus()`；光标到末尾（照 `:1716-1717` 与 `:6317-6323`） |
| 下一个 hunk | 卡片内部 `scrollIntoView`，**不改 hash** |

8.c 「在右栏审阅 →」：`showRailPanel("review")` + `saveRailPref({ collapsed: false })`（**任务 7 产出的面板**；若任务 7 尚未落地，这条按钮先不接线——**由任务 7 补上，别在本任务里造一个空按钮**）。

- [ ] **Step 9: 跑全量**

Run: `npx vitest run`
Expected: **与基线一致**（11 确定失败），**零新增**。

- [ ] **Step 10: 活页探针（**本任务真正的验收**）**

新建 `eval/persona-ux/_audit_20260919/verify-change-card.mjs`。**用 git 夹具造一场真跑过编辑的会话**，判据：

1. **卡片在**：对话流里存在 `.chat-change-card`，且折叠头里的文件数**等于**服务端那条链给的触碰路径数；
2. **展开取到真 patch**：展开一个文件后，体里出现 `@@ ` 头，且**至少有一行上下文行**（`sign === " "` 的那些）——**这一条是"真 patch 而不是事件流对比"的直接证据**；
3. **撤掉真的进了输入框**：点「撤掉」后，`#task-input` 的值包含那个路径，**且页面没有被导航走**（`location.hash` 不变）、**也没有被发送出去**（会话里没有多出一条 user 消息）；
4. **已阅会失效**：标一个文件已阅 → 让 agent（或直接改盘）再改一次那个文件 → 重渲染后**标记没了**；
5. **阅读模式两种都量**（见上面那处未核实）：`reading-mode` 开着与关着，卡片都在；
6. **0 控制台错误**。

**★ 第 3 条刻意分成三问**：进了输入框 / 没导航 / 没发送。**只问第一问的话，一个"点了就自动发出去了"的实现也能过**——而那正是 D1 最不想看到的（它会悄悄替用户发一条自然语言指令）。

- [ ] **Step 11: 提交**

```bash
git add ui/public/app.js ui/public/index.html ui/public/styles.css test/ui-review-hunks.test.ts eval/persona-ux/_audit-20260919/verify-change-card.mjs
git commit -m "feat(ui): 对话流里的「本场改动」卡 + 已阅/撤掉/下一个 hunk

插卡落点是渲染链的三处一起改：deriveChatItems 产 kind、条目键派生给
稳定 key、renderChatItem 加 case——三处齐了才有 patchList 的节点复用与
details 展开态保全。

deriveChatItems 是同步的而 patch 是异步取的，所以折叠态只带路径与文件数
（不显示行数），展开某个文件时才取它的真 patch。设计案折叠头上的 +197 −0
因此没落——为合上那个数字再同步造一份行数统计，等于给同一条链造第二个
真值源。

「撤掉」只把话写进输入框，不发送（D1）：它是一条会被 agent 执行的自然
语言指令，不该悄悄发出去。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

### Task 7: 右栏召出的「改动」审阅面板

**Files:**
- Modify: `ui/public/core/rail-policy.js`（`RAIL_PANELS` `:78`、tabbed 分支 `:191-195`）
- Modify: `ui/public/index.html`（右栏 tab 行 `:204-229`、tab 点击接线 `:5654-5662`、`paintRightRail` `:5543`）
- Modify: `ui/public/styles.css`（面板样式）
- Modify: `ui/public/app.js`（把 `renderChangeCard` 里"画文件列表 + hunk"那部分抽出来复用）
- Test: `test/ui-rail-policy.test.ts`（追加）、`test/ui-layout.test.ts`（追加）
- Create: `eval/persona-ux/_audit-20260919/verify-review-panel.mjs`

**Interfaces:**
- Consumes: 任务 4 的 `fetchFilePatch`（**`path` 相对仓库 root**，见任务 6 的 Interfaces）；任务 6 的 `deriveTouchedFiles`、`buildRevertMessage`、`reviewedAtSeq` 的玩法
- Produces: `RAIL_PANELS` 变成 `["tree", "preview", "review"]`；`showRailPanel("review")` 可用

**★ 语义**：这一格是**设计案 态 3 的右栏**（「右栏**只在召出时存在**」）。设计案那个面板内部有三只页签（**改动 / PR / 进度**）——**本计划只做「改动」**，PR 与进度归计划 4。**所以面板本体不做内部页签**（一只页签的页签条是噪音）。**这一句是刻意的取舍，别自作主张补上另两只。**

---

- [ ] **Step 1: 写失败测试（策略层）**

在 `test/ui-rail-policy.test.ts` 追加：

```ts
describe("右栏的第三只面板：改动（计划 3 · T7）", () => {
  it("RAIL_PANELS 认得 review", () => {
    expect(RAIL_PANELS).toContain("review");
  });

  it("tabbed 下选 review 时 tree 与 preview 都是 0", () => {
    const r = side(1200, { panel: "review" });
    expect(r.layout).toBe("tabbed");
    expect(r.preview).toBe(0);
    expect(r.tree).toBe(0);
  });

  it("split 下 review 不参与分列（它只在 tabbed 出现）", () => {
    const r = side(1600, { panel: "review" });
    expect(r.tree + r.preview).toBe(r.railWidth);   // split 仍按 tree/preview 分
  });
});
```

**★ 第三条是"边界"断言，不是"功能"断言**：split 下 `review` 该不该占一列，**本计划不做**（那会撞上 D3 里那个"三列本来就挤"的问题）。锁住"它不参与分列"比不锁好——将来谁想让它在 split 里出现，会先看见这条测试并读到这段理由。

- [ ] **Step 2: 跑，确认它红**

Run: `npx vitest run test/ui-rail-policy.test.ts`
Expected: 第一条 FAIL（`RAIL_PANELS` 里没有 `review`）；第二、三条**可能也红**（因为 `:119` 的回落把不认识的 panel 归成 `"tree"`）。

- [ ] **Step 3: 实现策略层**

3.a `rail-policy.js:78`：

```js
/** 右列的面板。tree/preview 互斥（tabbed）或并排（split）；review 只在 tabbed 出现（计划 3 · T7）。 */
export const RAIL_PANELS = /** @type {const} */ (["tree", "preview", "review"]);
```

3.b tabbed 分支（`:191-195`）**先读现在的确切写法再改**——它现在大概是 `if (panel === "tree") { tree = railWidth } else { preview = railWidth }`。改成三段显式分支：

```js
  } else if (panel === "tree") {
    tree = railWidth;
  } else if (panel === "preview") {
    preview = railWidth;
  } else {
    // review：既不占树也不占预览列——它画在右栏自己的槽里
    tree = 0;
    preview = 0;
  }
```

**★ 改完之后 `panel` 回落那条（`:119`）的语义没变**（不认识的 panel 仍归 `"tree"`）——跑 Step 1 那三条确认。

- [ ] **Step 4: 跑，确认它绿** + 全量确认零新增

Run: `npx vitest run test/ui-rail-policy.test.ts && npx vitest run`

- [ ] **Step 5: 接 DOM（`index.html`）**

5.a 右栏 tab 行（`:204-229`）加第三只按钮，**照那两只既有按钮的写法**（`role`、`aria-pressed`、`aria-controls`、`data-rail-panel`）：

```html
        <button type="button" class="right-rail-tab" data-rail-panel="review"
          id="rail-tab-review" aria-pressed="false" aria-controls="right-rail-review">改动</button>
```

5.b 槽位：**先读 `:204-229` 与 `paintRightRail:5583-5584`**，看 `#right-rail-preview` 是怎么做显隐的（`split && preview === 0` 时 `hidden`），**照同一个办法**给新槽 `#right-rail-review` 做显隐。**槽里挂什么由 `paintRightRail` 之外的模块自己 append**——这是那个文件既有的分工（「它只写 `data-*`/CSS 变量/ARIA，内容本体由各 feature 自己挂进槽位」）。

5.c `showRailPanel("review")` 要能唤回：**先读 `:5654-5662`** 那只 `preview` tab 的 `preview:reveal` 派发，照它给 `review` 加一条等价的（**若不需要唤回就不加**——别为了对称加一个没人听的信号）。

5.d **三只按钮在窄档会不会挤坏**？跑 Step 7 的探针在 1600 与 1200 两个宽度各量一次。

- [ ] **Step 6: 面板内容（复用任务 6 的画法）**

**先读任务 6 写出来的 `renderChangeCard`**，再把"文件列表 + 单个文件的 hunk 视图"抽成一个可复用的函数（比如 `renderFileHunks(files, opts)`），**卡片与面板都调它**。

**★ 抽法不许制造第二份画法**：如果任务 6 的实现把 hunk 的画法内联在卡片里，**这个任务负责把它抽出来**，而不是在面板里再写一遍。**这是本任务唯一有风险的地方**——抽的时候两边的 `data-*` 挂钩名必须一致，否则 Step 7 的探针在面板里点「撤掉」会点空。

- [ ] **Step 7: 活页探针**

新建 `eval/persona-ux/_audit_20260919/verify-review-panel.mjs`：

1. **召出**：点「改动」tab → `#right-rail` 的 `data-panel` 变成 `review`，槽可见；
2. **有内容**：面板里出现本场碰过的路径，**数量与服务端那条链一致**；
3. **动作在面板里也能用**：在**面板里**点「撤掉」→ 输入框拿到那句话（**卡片里也要在同一份探针里点一次**——两处都验，防止抽函数时只接对了一处）；
4. **收得回去**：切回「文件」tab 或点收起键 → `review` 槽不可见；
5. **两个视口**（1600 与 1200）：tab 行不挤坏、三只按钮都点得到；
6. **0 控制台错误**。

- [ ] **Step 8: 提交**

```bash
git add ui/public/core/rail-policy.js ui/public/index.html ui/public/styles.css ui/public/app.js test/ui-rail-policy.test.ts test/ui-layout.test.ts eval/persona-ux/_audit-20260919/verify-review-panel.mjs
git commit -m "feat(ui): 右栏召出的「改动」审阅面板

设计案 态 3 的右栏——「只在召出时存在」。RAIL_PANELS 加第三个 kind；
它在 tabbed 档占满右栏，在 split 档不参与分列（那会撞上三列本来就挤
的问题，本计划不碰）。

面板内部不做页签：设计案画的是「改动 / PR / 进度」三只，本计划只做
「改动」——PR 与进度归计划 4。

hunk 的画法与对话流里那张卡共用一份（从任务 6 抽出来的），两边 data-*
挂钩名一致，探针在两处各点一次。

Co-Authored-By: <按你所在环境要求的署名尾注>"
```

---

## Self-Review（写完后的自查，技能要求）

### 1. 规格覆盖（对着设计案与调研逐条点）

| 设计案/调研说 | 落在哪 |
|---|---|
| **态 2** 内嵌 diff + hunk 级的动作就在行上 | **任务 6**（卡片 + hunk 动作行） |
| **态 3** 顶部 `● PR #5 检查中` + `+197 −0 · 3 files` | **部分**：`+N −M · N files` 落在任务 6 的展开态与任务 7 的面板里；**折叠态只有文件数**（形状约束，见任务 6 的偏差记录）。**PR 状态归计划 4** |
| **态 3** 「在右栏审阅 →」 | **任务 7**（任务 6 里那条按钮由任务 7 接线；任务 6 明写"别造空按钮"） |
| **态 3** 文件行可 Mark as Reviewed，**再被改动会失效** | **任务 6**（`reviewedAtSeq` 记 seq，seq 变即失效） |
| **态 3** 右栏**只在召出时存在** | **任务 7**（复用右栏既有的内容驱动 + handle/scrim/Esc 那套） |
| **态 1** 顶栏常驻分支 + 改动状态；起步卡 修 bug / 看改动 / 开 PR | **不在本计划**——顶栏 git 芯片与两脸规则**计划 1 已落地**（`styles.css:11112-11114`）；**起步卡归计划 4**（与 PR 一组） |
| **§4** commit message 生成 / PR 状态色 / 冲突解决 / 署名规则 | **计划 4**（D 与「审阅归 3，PR 归 4」的裁定） |
| **§4** diff 三态（inline / side-by-side / automatic） | **不在本计划**——单独立项（见下） |
| **§7.1** 对话宽度 60–73% | **不在本计划**——计划 1 已做（`--measure: 40em`），且 D3 明确不动 rail 预算 |
| **§7.2** 内容驱动、**内嵌优先于侧栏** | **任务 6**（内嵌卡是主入口）+ **任务 7**（侧栏是升格） |
| **§7.3** Code 脸恒有 GitHub、Work 脸完全没有 | **已在**（计划 1 的 `body[data-face]` + 芯片）；本计划新增的卡片与面板**也必须收在 `data-face` 上**——**任务 6/7 的 CSS 必须写成成对的两条**（`body[data-face="code"]` 那份 + `body[data-face="work"] { display: none }` 那份）；**只挂 code 脸一半，Work 脸就会以无样式的裸元素出现** |

**★ 上面最后一行是自查里补出来的一条硬要求**：任务 6 与 7 的 CSS 我在正文里没写死"挂在 data-face 下"。**实现者要照计划 1 的规矩做**（两脸的差异只收在 `body[data-face]` 上，不许在别处判断"现在是哪张脸"）。**验证方式**：Work 脸下打开同一场会话，卡片与「改动」面板**都不该出现**。

**★★ 而"成对"这件事必须写明——只说结果、不说形态，等于只说了一半（2026-09-20 实测，T6）：**
我在这条里只写了"**必须挂在 `body[data-face="code"]` 下**（Work 脸不该出现）"，派单里也是这么写的——**实现者照做了：187 行 CSS 全挂 code 脸**。但**没有 work 脸的成对规则**，于是这张卡在 Work 脸会以**无样式的裸 `<details>`**（默认 disclosure 三角）出现。
**仓内既有范式就是成对的**（`styles.css:11145` 附近，计划 1 定的）：
```css
body[data-face="work"] .workspace-git-chip { display: none; }
body[data-face="code"] .workspace-git-chip { display: flex; }
```
**⇒ 规矩**：两脸差异**必须写成成对的两条**（一边显、一边 `display:none`），**"只挂一半"不是"Work 脸不出现"，是"Work 脸以无样式形态出现"**——这与计划 1 那条「CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁」是同一个形状，只是换了个地方。

### 2. Placeholder 扫描

无 TBD / TODO。**三处刻意的"先读再定"**（技能允许且鼓励，因为猜错的代价更大），都标明了"不许猜"：

1. **任务 2 Step 1** 的下钻行选择器（`.wp-dir, [data-path]`）——按命名习惯猜的，**读 `renderDirs` 改成真名**。
2. **任务 3 Step 1** 的 `min-width` 常量——**先去量坞头的固定成本**；量不出来就用 96px 并在注释里写明"未实量"。
3. **任务 6 Step 7** 的 hunk 行配色变量——**读 `styles.css:8966-8991`**，别再造一套色。

另有三处标了 **⚠ 未核实**（任务 4 Step 1 的 `git()` 执行器语义、任务 6 的 `reading-mode.js` 与 `ui-patch.test.ts`），都是"读它再动手"而不是"照我写的做"。

### 3. 类型一致性

- `deriveTouchedFiles` 返回 `{path, edits, lastSeq}[]` —— 任务 6 的测试、`renderChangeCard`、任务 7 的面板三处一致。
- `fetchFilePatch(workdir, path, fetchImpl)` 返回 `FilePatch | null` —— 任务 4 定义、任务 6 消费一致；**`path` 的基准是仓库 root**，任务 6/7 两处调用都必须照这个传。
- `FilePatch.hunks[].lines[].sign` 的取值 `" " | "-" | "+" | "\\"` —— 任务 4 定义、任务 6 的行着色消费一致。
- `encodeArtifactHash(runId, ref, opts)` 的 `ref` 是 `number | {path}` —— 任务 5 的测试与 `index.html:935` 的调用点一致。
- `parseArtifactRoute` 返回 `{runId, path, index, full}` —— 任务 5 的测试、`index.html:1973`、`:2193`、`openPendingArtifact` 四处一致。

### 4. 与既有测试的冲突预判

- **任务 3 改 `.ac-tabs` 的 CSS 文本**：`test/ui-layout.test.ts` 的 `block()` 是**首个匹配**——`.ac-tabs` 在 `styles.css` 里只该有一处规则块（**实现前先 grep 数一下**；若有多处，`block()` 拿到的可能不是你以为的那个）。
- **任务 7 改 `RAIL_PANELS`**：`test/ui-rail-policy.test.ts` 里若有断言"面板恰好只有两只"，会红——**那是应该红的**，改测试并写明理由。
- **任务 4 加路由**：`test/ui-server.test.ts` 可能有一张"路由表清单"式的锁。**跑全量确认零新增，红了先读那条测试再说。**

---

## 单独立项（本计划不做，各附本次勘查给的基线与入口）

1. **★ 1440–1600 视口下三列布局的空间本来就不够**（D3 的底层问题）——`RAIL_MAX_PX = 360`（`rail-policy.js:25`）而 `TREE_MIN_PX = 200`（`:41`）→ split 的预览列**永远是 ~160px**；抬高 rail 上限又撞上调研 §7.1「对话宽度必须回到 60–73%」。**三条可能的出路**（都要单独做）：重定 split 的触发条件 / 让 rail 上限随视口分档 / 砍掉 split 只留 tabbed。**这不是排版微调，是右列的空间契约。**

2. **diff 的三种形态**（调研 §4：inline / side-by-side / **automatic 按宽度切**）+ 偏好记忆——本计划只做 inline。side-by-side 要另做一套行对齐。

3. **「保存为产物」/「在编辑器打开」**——代码块与表格在对话里**没有文件路径**，落盘需要一个宿主写端点，而宿主只有 `POST /api/upload` 与 `POST /api/fs/mkdir`（`ui/server.ts:9674-9681` 那张路由表）。

4. **`patchNextSuggestion` 是一个不存在的函数**——`app.js:5462` 的注释引用了它，全仓只有那一处。**同类：任务 1 订正的那句注释**。值得单独扫一遍全部"注释里提到的名字"，看还有多少是假的。

5. **`sidebarRailItems()` 接上真实按钮**（计划 1 的 I4）——它现在是"能见度契约"，没有消费者。

6. **第二套脸表示的迁移**——`data-workspace-face` 与两处 `designModeActive = workspaceFace === "office"` 仍在（`index.html:1403` / `4823`）。

7. **宿主夹具的统一化**——计划 2 立了 git 那一个（`scripts/git-fixture.mjs`）；本计划的探针又要造"真跑过编辑的会话"。若验收面继续长，值得立一个统一的 `scripts/fixtures/`。

---

## 本计划不吃的那四条（计划 1/2 的教训，逐条对应了具体做法）

1. **CSS 规则与它匹配的 markup 必须一起锁** —— 任务 1 是**唯一**一条改 CSS 规则的任务，所以它的测试**明写了两条（规则 + markup）**，且变异验红**两半各验一次**。
2. **断言要锁"接线表达式本身"** —— 任务 3 的第一条断言用的是 `min-width:\s*(?!0\b)\S+` 这个**负向**写法。**只写 `toMatch(/min-width:/)` 的话，现状那行 `min-width: 0` 就能喂饱它**，测试永远绿。
3. **改了断言必须变异验红** —— 每个任务都有独立的"变异验红"步骤，且**都指明了删哪一行、期望哪一条红**。
4. **每个探针都必须真去点** —— 任务 1/2/3/6/7 各有一条"**先探针后修**"的可选步骤（把修复临时撤掉看探针红）。**这不是可选的礼节**：计划 2 里三条真回归（`write_file` 的洞、`stripAttachmentLine` 的洞、长内容折叠的洞）**都是"纯函数绿 + 接线锁绿"而走不通**，只有真点才现形。

**还有一条从计划 2 的事故里长出来的**：**派单本身也要 grep**。计划 2 里我在派单里写下"三处 `designModeActive`"，实为两处，**reviewer 照单全收**。本计划的实现者应把每个 `file:line` 当**提示**而非权威，**符号是权威**。

