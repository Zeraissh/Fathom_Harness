# Agent Harness Web UI 优化方案

> 来源：`eval/persona-ux/_verify-shots/ui-review-20260922/report.md`（19 张真实截图 + 几何量测的用户视角审视）。
> 本文件是**执行台账**，延续 `ui-upgrade-plan.md` 的 T 编号（从 T13 起），逐项勾选推进。
> 工程约束与 `ui-upgrade-plan.md` 完全一致：**服务端零依赖、前端零构建**；新功能做成 `ui/public/features/*.js` 独立模块；视觉只用设计令牌；4 主题下都成立；每项完成须 `npm run typecheck` + 相关 vitest 绿。

---

## 一、优化目标（用户视角的四感）

| 感受 | 当前差距 | 优化后应达到 |
|---|---|---|
| **委托感** | 没有跨会话“待你处理”聚合，多任务必须逐个翻 | 一眼看到所有需要我决策的事，一键直达 |
| **透明感** | 对话流信息密度失控，结论被过程淹没 | 默认聚焦模式，过程一键展开 |
| **掌控感** | 错误只有红字没有下一步；命令面板命令太少 | 错误带动作入口；高频操作都进 Ctrl+K |
| **产出感** | 产物是“下载链接”，嵌在对话流里 | 产物画布内联预览、可迭代 |

**总原则**：先修信任（P0），再压密度（P1），最后长最终形态（P2）。骨架 bug 不修，任何新功能都会放大不信任。

---

## 二、P0 —— 修复信任（本周内完成）

> 理由：这四项都会让用户觉得“界面在说谎”或“界面是半成品”，不修复则后续一切白费。

### T13 深色主题覆盖层颜色统一

- **问题**：深色主题下命令面板是白底（证据 `13-chat-code-dark-1440.png`）；设置弹窗、通知中心等高层容器可能同样漏继承。
- **改法**：
  - 全局审计所有 `z-index` 提升的容器（命令面板、modal、toast、通知抽屉、右键菜单），确认根节点在 `data-theme` 作用域内；
  - 命令面板背景改用 `--surface-elevated` 语义 token，禁止写死 `#fff`；
  - 加一条 vitest/UI 测试：切深色主题后命令面板 `getComputedStyle` 背景色属于暗色域。
- **验收**：4 主题 × {命令面板, 设置弹窗, 通知中心} 截图各 1 张，无白底穿帮。

> **✅ 已完成（2026-09-22，提交 `786d182`）**
>
> - **落点**：`ui/public/styles.css`（Layer 2 新增 `--surface-elevated`；`.palette-dialog` 背景改用它）。
> - **测试**：`test/ui-overlay-theme.test.ts`（8 条）——`--surface-elevated` 四主题可解析 / 命令面板底色必须走该令牌 / 深色三主题相对亮度 < 0.2 且与暖纸不同色且正文对比度 ≥ 4.5 / 高 z-index 审计面非空 / 组件层无不透明字面底色 / 覆盖层令牌四主题可解析 / 真 jsdom 行为锁：面板是 `<html data-theme>` 的后代 / 静态锁：其余五个覆盖层模块挂在 `doc.body`。
> - **变异验证**：① `.palette-dialog` 背景改 `#fff` → 红 2 条；② `--surface-elevated` 钉死成浅色 `#FAF9F5` → 红 1 条（暗色域）；③ 命令面板挂到游离节点 → 红 2 条。
> - **与计划原文的偏差（重要）**：**计划陈述的问题不成立**。复核 `13-chat-code-dark-1440.png` 发现**整页都是浅色**，面板里勾着的是「主题：跟随系统」——那一刻宿主根本不在暗色主题下；对照 `18-audit-office-face-dark-1440.png`（真切到暗色时整页含覆盖层都是暗的）可知覆盖层继承没问题。审计结论：所有 `z-index` 抬升的容器都挂在 `document.body` 下（即在 `<html data-theme>` 作用域内），组件层也没有任何写死的不透明底色。因此本项做的是**把「它不会发生」钉成常驻门禁**，而不是修一个不存在的 bug。
> - **判据替换（jsdom 测不到的维度）**：jsdom 不做样式级联也不解析 `var()`，`getComputedStyle(dialog).backgroundColor` 恒为空串。改成**解析 `styles.css` 的令牌链 + WCAG 公式实算相对亮度**（沿用 `test/ui-app.test.ts` AC5 对比度门禁的手法）。**守得住**：四主题下令牌链的最终色值、组件层不写死颜色、覆盖层挂载点。**守不住**：真实浏览器的样式级联与层叠上下文。
> - **变异验证顺带修了门禁本身**：第一版审计只看「自己声明了 `z-index` 的那条规则」，把 `.palette-dialog` 改 `#fff` 它照样绿——真正那块不透明的面是**子元素**（`z-index` 在父层 `.palette-overlay` 上）。判据已改成整个组件层。
> - **未做**：4 主题 × 3 容器的截图存档（见文末「本轮未做的事」）。

### T14 历史 run 的 review 面板“假空”修复

- **问题**：主区显示“改文件 12 个”，右列 review 面显示“本场还没处理过任何文件”——根因是 touched files 按**当前宿主工作目录**计算，而该 run 的目录是别的项目。
- **改法**：
  - `deriveTouchedFiles` 改为按 **run 自身记录的工作目录**（run meta 里已有）计算；
  - 若该目录不在宿主白名单内，面板显示“该运行的工作目录是 X，与当前不同”+「切换」按钮，而不是“没处理过任何文件”；
  - 服务端 `/api/runs/:id/changes` 增加 `workdir` 参数校验（仍走圈禁纪律）。
- **验收**：打开工作目录不同的历史 run，review 面显示真实文件清单或明确的目录切换提示；配测试覆盖两种分支。

> **✅ 已完成（2026-09-22，提交 `f3c5938`）**
>
> - **★ 真因与计划原文不同**：计划推测根因是「touched files 按当前宿主工作目录计算」。读码后不成立——`deriveTouchedFiles` 只读 `state.timeline`，与工作目录无关；`03-chat-code-rail-review.png` 里 composer 显示的也正是该 run 自己的 `liquid-demo` 目录，两边本来就是同一个。**真因在范围**：对话是整条谱系拼起来的（`deriveThreadChatItems`），而那里写的是 `if (skipLead && it.kind === "changecard") continue;`——`skipLead` 即 `i > 0`，于是**留下根 run 那张卡、丢掉包括 tip 在内的其余**（与它上一行注释说的「「本场改动」是本场（tip）的卡」正好相反）；而 `paintReviewPanel` 读的是 `runStates.get(tip)` 一个 run。截图那场对话的 tip 那轮限流秒挂、0 个文件 ⇒ 主区说「改文件 12 个」（根 run 的），右栏说「本场还没碰过任何文件」（tip 的）。
> - **落点**：
>   - `ui/public/app.js`：新增 `deriveThreadTouchedFiles(runs, runStates, tipId)` + `THREAD_SEQ_STRIDE`；`deriveThreadChatItems` 改为整条谱系只挂一张改动卡；`renderReviewPanel` 新增 `runWorkdir`/`hostWorkdir` 与目录不同分支。
>   - `ui/public/index.html`：`paintReviewPanel` 改用谱系口径、传两个目录、签名把目录对算进去；新增 `switchToRunWorkdir()` 与 `switch-workdir` 委托；`changesApi.setRun(runId, run 自己的 workdir)`。
>   - `ui/public/styles.css`：`.right-rail-review-elsewhere` / `.right-rail-review-switch`。
>   - `ui/public/features/changes-panel.js`：`setRun` 第二参数拼 `?workdir=`；400 时照抄服务端原话。
>   - `ui/server.ts`：`GET /api/runs/:id/changes` 接受可选 `?workdir=`，不在白名单 400 / 不是本 run 的目录 400（附 `runWorkdir`）；**声明不能换根**，逐路径 `resolveInWorkdir` 的圈禁纪律不变。
> - **测试**：`test/ui-review-thread-scope.test.ts`（新增 15 条，含★复现现场、卡与面板同源、两条空态分支、切换钮真 DOM 挂钩与转义、5 条宿主接线静态锁）；`test/ui-changes-endpoint.test.ts`（+4 条 `?workdir=` 校验）；`test/ui-changes-panel.test.ts`（+3 条渲染锁）。
> - **变异验证**：6 次——谱系收窄到 tip（红 4）、恢复 `skipLead &&`（红 2）、目录分支短路（红 2）、`paintReviewPanel` 退回单 run 口径（红 1）、签名去掉目录对（红 1）、服务端去掉目录不符的 400 + 前端去掉 `?workdir=` 与 400 分支（红 3）。
> - **文案复查**：「本场改动」只在注释里，界面上的卡头是「改文件 N 个」；唯一用户可见句「本场还没碰过任何文件。」语义从「这个 run」变成「这场对话」——与用户看到的对话范围一致，更准。
> - **已知余留**：谱系里若各 run 的工作目录不同，取 patch 仍按选中 run 的目录算（`deriveThreadTouchedFiles` 已按文件记了 `runId`，但逐行 patch 还没按文件各自的 run 取）。实践中同一场对话共享目录，列进 backlog 而非本轮修。

### T15 窄屏召出钮位置重组

- **问题**：900px 下四只召出钮被挤到标题行，与“聚焦/完整”阅读模式、返回箭头混行，用户分不清是页面操作还是右列开关。
- **改法**：
  - 窄屏（<1024px）时召出钮从 `.back-bar` 移出，改为**右下角悬浮按钮组**（或标题行右侧独立分组，与阅读模式按钮之间加分隔符）；
  - 保持同键开/关、浮层行为不变。
- **验收**：900px 截图中召出钮与标题/阅读模式不再混行；宽屏行为回归不变。

> **✅ 已完成（2026-09-22，提交 `885ee84`）**
>
> - **落点**：`ui/public/styles.css` 新增 `@media (max-width: 1024px)`——`.back-bar { flex-wrap: wrap }`；`order` 让 [标题][聚焦/完整] 留在第一行、召出钮行落到第二行；`.rail-surface-bar` 窄档 `flex-basis:100% / margin-left:0 / justify-content:flex-end` 并加 `border-top` 分隔线。**零 JS 改动。**
> - **测试**：`test/ui-narrow-summon.test.ts`（15 条）——解析器自检 / 四个窄档的「占满一行 + 分隔线 + 父容器换行」/ 四个窄档的排序不变量 / 四个宽档「一条都不生效、`margin-left` 仍是 auto」/ 媒体查询里不许改召出钮的 `display` / plan 4 骨架不回退（同键开关、钮行仍在 `.back-bar`、菜单仍向下弹）。
> - **变异验证**：① `.rm-switch` 的 `order` 改 3 → 红 4 条（排序）；② 删掉 `flex-wrap: wrap` → 红 4 条（占满一行）；③ 断点放宽到 1280px → 红 3 条（解析器自检 + 两个宽档）。
> - **与计划原文的偏差**：计划写的是「**移出 `.back-bar`**，改右下角悬浮按钮组」。实际改成**在 `.back-bar` 内换行成独立一行 + 分隔线**，三条理由：① 右下角已被 composer 的三只动作钮与 `.scroll-nav` 的「回到最新」占满，再叠一组必然打架；② 钮行的 DOM 位置是 plan 4 的成果，有两条专门的锁盯着（`ui-rail-policy` 的 3-H「不在右列里」与 G1「钮行闭串邻接 `.back-bar` 闭串」），真搬出去就得改那两条锁 = 回退 plan 4 骨架，与本轮硬约束冲突；③ `--rail-float-top` 量的是 `.back-bar` 下沿，换行后头部自然变高、浮层自动往下让，钮不会被浮层盖住，不需要额外接线。**审视报告原话也正是「窄屏时给召出钮单独一行」**，计划验收「不再混行」由此满足。
> - **另注**：`max-width: 1024px` 含 1024 本身（计划写的是 `<1024px`），差一像素，按 CSS 惯例取含端点。
> - **判据替换**：jsdom 不真跑媒体查询、强制元素宽度也不触发，所以改成**解析 `styles.css` 后按给定视口宽度做小型级联**。**守得住**：给定宽度下这几条声明谁赢、窄档产生「钮行自成一行」的 flex 前提、宽档一条不生效。**守不住**：真实浏览器里的最终像素（行高、是否恰好不再重叠）。
> - **未做**：900px 真实视口截图（见文末「本轮未做的事」）。

### T16 Work 脸命名统一（`office` → `work`）

- **问题**：UI 文案叫 Work，代码变量 `workspaceFace = "office"`，存储键 `agent.ui.pref.workspaceFace`——计划/代码/UI 三处两套名字，plan 5/6 派单必混淆。
- **改法**：
  - 内部枚举值 `office` 统一改名 `work`；
  - localStorage 旧值 `office` 做一次迁移读取（读到旧值自动改写新值），不清空用户偏好；
  - 计划文档与注释中统一术语。
- **验收**：`grep -r '"office"' ui/` 仅剩迁移兼容分支；旧 pref 值能正常迁移。

> **✅ 已完成（2026-09-22，提交见下）**
>
> - **迁移边界收成一个函数**：`normalizeWorkspaceFace`，前端在 `ui/public/app.js`、服务端在 `ui/history.ts`（同名同义，测试逐项比对两份实现）。语义是**「office 永远认得，只是不再产出」**；认不出返回 `null`，由调用方决定回退（避免「没声明」与「声明了 code」被同一个 falsy 吞掉）。同时新增 `WORKSPACE_FACES` / `WorkspaceFace` 类型。
> - **枚举值改名**：`ui/public/index.html`（DOM 属性 `data-workspace-face="work"`、id `#workspace-face-work`、默认值、全部比较）、`ui/public/app.js`、`ui/server.ts`（类型、POST 校验与准入、归档读写、列表摘要、两处追问继承）、`ui/history.ts`（meta 类型）。
> - **标识符与术语一并统一**：`officeCatalogOpen→workCatalogOpen`、`openOfficeCatalog→openWorkCatalog`、`officeDesignChip→workDesignChip`、`OFFICE_STARTER_JOBS→WORK_STARTER_JOBS`、`OFFICE_MORE_DRAFTS→WORK_MORE_DRAFTS`、`data-office-more→data-work-more`、`wantOffice→wantWork`、`runBelongsToOffice→runBelongsToWorkFace`，相关注释同步。
> - **两条迁移路径**：① localStorage `agent.ui.pref.workspaceFace` 读到 `office` → 照常进 Work 脸并**当场改写成 `work`**（不清空偏好；本来就是新值则不写）；② `agent.ui.pref.workdirByFace` 的键 `office` 读得到、写回时改名并 `delete` 旧键。服务端侧：POST 仍接受 `office` 并归一后落盘；磁盘上的旧档案 `workspace: "office"` 读回来是 `work`。
> - **测试**：`test/ui-workspace-face-rename.test.ts`（新增 15 条：10 项归一表 × 前后端一致 / 枚举集合无 office / 两条 localStorage 迁移静态锁 / **验收门禁：`ui/` 里非注释的 `office` 代码行逐条在白名单里，新增一处即红，且白名单不许有陈货** / DOM 属性与 CSS 三处同名）。既有测试同步更新：`ui-faces`（+1 条新旧值同路）、`ui-app`（+1 条载荷归一锁）、`ui-patch`、`ui-a11y`、`ui-server`（+1 条旧档案读回锁）。
> - **变异验证**：① 前端 `normalizeWorkspaceFace` 去掉 office 分支 → 红 5 条（含跨文件的 faces/app）；② 服务端同样去掉 → 红 3 条；③ 启动时不改写旧偏好（`needsMigration=false`）→ 红 1 条；④ 在 `app.js` 里塞一个新的 `"office"` 字面量 → 白名单门禁变红。
> - **变异验证顺带修了一条假绿**：新增的「旧档案读回」用例原本用 `packName: "design"` 的夹具，去掉服务端 office 分支后它仍绿——因为 `packName==="design"` 的兜底替它算出了 `work`。夹具已改成非 design 的 run，现在只有迁移本身能让它绿。
> - **与计划原文的偏差**：无功能偏差。范围上**只改 `ui/`**（计划验收口径）；`cross-app/` 的静态副本仍用旧值（它本就是已漂移的镜像，且它发的 `office` 会被服务端归一，功能不受影响）——列入 backlog。`docs/superpowers/plans/*` 与 `eval/persona-ux/**` 是历史记录，按约定未改。

---

## 三、P1 —— 压密度、给到“可放心委托”及格线（两周内）

### T28 「这次 run 碰过哪些文件」两套口径合一（委托方点名，优先于 T17）

- **问题**（P0 收工时发现，见文末第七节第 3 条）：服务端 `collectTouchedPaths` 收全部 `tool_call`（含失败的），客户端 `deriveTouchedFiles` 只收成功的，同一个 run 在 T8 变更面板与 T7 审阅面板显示不同数字（现场 25 对 12），而两处文案都在说"改了 N 个文件"。
- **改法**：现场读码确认两侧真实差异 → 定一侧当事实源并写清理由 → 两侧同提交改 → 加一条跨两侧的一致性锁（同一份事件流，两条路径给出同一个清单）。

> **✅ 已完成（2026-09-23，提交哈希见第八节 P1 提交表）**
>
> - **★ 真实差异有四条，不是一条**（现场读码所得，转述里只有第一条）：
>   ① **失败的调用**：服务端收，客户端不收（`resultIsError` 过滤）；
>   ② **还没回结果的调用**（在飞 / 等批准 / 被拒）：服务端收，客户端不收（没有 result 直接 `continue`）；
>   ③ **verifier 段**：服务端收（它压根不看 `source`），客户端不收——verifier 事件被 `reduceEvent` 分流进 `verifierTimeline`，而 `deriveTouchedFiles` 只读 `timeline`；
>   ④ **路径形态**：客户端 `input.path ?? input.file_path` 且把 `\` 折成 `/`，服务端只认 `input.path` 且按原文分组——Windows 上 `src\a.txt` 与 `src/a.txt` 在服务端是两条、客户端是一条，而响应里的 `path` 又被 `relative()` 归一，于是**两条重复行同名**。
> - **事实源 = 客户端那一侧（成功才算碰过）**，三条理由：① 失败的写入**没有改变磁盘**，把它算进"碰过"会把审查者指去找一个不存在的改动；② 仓库里同族的三个派生函数本来就都是这个口径（`deriveArtifacts`「没成的不是产物」、`deriveWrittenPaths`「只信成功的 tool_result」、`editHunksFromTimeline`），**服务端是唯一的异类**；③ **`collectTouchedPaths` 只有一个调用方**（`/api/runs/:id/changes`），没有别的依赖方需要"含失败"的语义，所以不必拆成两个概念。"试过但失败了"这件事由 Tools 面的 errors 负责，不许再叫"改了 N 个文件"。
> - **落点**：
>   - `ui/server.ts`：`collectTouchedPaths` 先收一遍 `tool_result` 建 `toolUseId → 成不成` 表，再收调用；新增 `isVerifierEventSource`（与 `app.js` 同名内部函数逐字同义）与 `normalizeTouchedPath`（`path ?? file_path` + 反斜杠归一）；endpoint 文档注释同步。
>   - `ui/public/features/changes-panel.js`：模块头写清两处口径的边界；分区标签 `变更` → **`本轮变更`** + `summary.title`。
>   - **客户端一行没改**——它本来就是事实源。
> - **★ 现场撞到的第二条轴（范围），按"不许两个数字同名"处理**：T14 把对话卡与右栏「改动」面板都改成了**整条谱系**（`deriveThreadTouchedFiles`），而 T8 那个分区读 `/api/runs/:id/changes`，永远只是**选中那一个 run**。有追问的对话里两个数字**本就该不同**，不是 bug。所以没去动架构（让端点吃谱系是另一件事），而是把范围写进标签：一个 run 那侧叫「本轮变更」，整场对话那两侧保持「改文件 N 个」。这条**守不住**"用户真的会注意到标签差异"——只是消除了"两个数字都自称同一件事"。
> - **测试**：`test/ui-touched-files-parity.test.ts`（新增 14 条）——★ 同一份事件流两侧逐字段相同 / ★ 这份清单就是"成功才算"那一份（防两边一起错）/ 轴 ① 失败不收 / 轴 ② 无回执不收 / 轴 ③ verifier 段不收 / **轴 ③a main 调用 + verifier 回执** / **轴 ③b verifier 调用 + main 回执** / 轴 ④ 反斜杠与 `file_path` 归一 / rework 与子任务段照旧算进来（收窄的只有 verifier）/ 空流两侧都空 / ★ 走真实 HTTP 端点：`changes.length` 与逐路径 `count` 都等于客户端派生 / 三条命名锁。`test/ui-changes-endpoint.test.ts`：夹具改造（`rawCall`/`rawResult`/`okCall`/`failedCall`，旧夹具只发 `tool_call` 现在正确地收不到文件）+ 新增 4 条口径用例。
> - **变异验证（7 次，每个可变异形态逐一跑）**：① 删成功过滤 → 红 6 条；② 删「收调用那遍跳过 verifier」→ **第一次绿！**；③ 删「收结果那遍跳过 verifier」→ 也绿。**两个守卫互相兜底，"verifier 调用 + verifier 回执"这一种夹具分不开它们**——补了轴 ③a/③b 两条跨段夹具后，②→红 1（③b）、③→红 1（③a）；④a 删 `file_path` 别名 → 红 4；④b 删反斜杠归一 → 红 4；⑤ 把"没有回执"当成功（`!== true` 改 `=== false`）→ 红 5；⑥ 标签退回「变更」→ 红 1。
>   **教训重演**："抓到一个变异"不等于覆盖——这里是**两个冗余守卫**的形态，第一版测试对它们完全不敏感。
> - **已知余留**：`changes-panel` 的 `knownWrites` 兜底（API 列表为空时用 `conversationArtifactFiles` 顶上）走的是 `deriveArtifacts`，工具面多一个 `memory_write`，且是**谱系**范围——空态兜底路径上口径仍不同。它只在"档案取不到"时出现且不显示数字之外的断言，列进 backlog。另：`index.html` 深链直达那条路径 `changesApi.setRun(selectedRunId)` 漏传第二参数（不发 `?workdir=`，少一道服务端核对），也列进 backlog。

### T17 对话流默认“聚焦”阅读模式

- **现状**：T12 已做双模式，但默认仍是“完整”，链接墙刷屏（证据 `02-chat-code-rail-collapsed-1440.png`）。
- **改法**：新会话默认进入“聚焦”（结论 + 关键步骤 + 错误 + 待决策项），用户切换后记住偏好（已有 pref 机制）。
- **验收**：新开会话首屏不再出现连续工具输出刷屏；切换偏好持久化。

> **✅ 已完成（2026-09-23，提交哈希见第八节 P1 提交表）**
>
> - **真因与计划一致**（这次计划说对了）：`readReadingMode` 的 fallback 就是 `"full"`，注释写着"保守默认：完整模式是现状"。默认值本身就是那个问题。
> - **★ 现场发现两处必须一起改，否则「记住偏好」是假的**——这是本项真正的技术内容，不是改一个常量：
>   ① **偏好读取是两态，不是三态**：旧实现 `raw === "focus" ? "focus" : "full"` 把「从没选过」与「显式选了完整」折成同一个值。缺省一改成 focus，**所有显式选过完整的老用户当场被覆盖**。改成三态：`"full"`→完整、`"focus"`→聚焦、其余→`READING_MODE_DEFAULT`。
>   ② **`setMode` 值没变就不落盘**：缺省变 focus 之后，点「聚焦」通常"值没变"，旧实现在那里早退、一个字都不写——用户的显式选择与"从没选过"在 storage 里长得一模一样，下次再改缺省又把他冲掉。改成**无论值变没变都落盘**，值没变时只是不重算 DOM、不重复播报。
> - **落点**：`ui/public/features/reading-mode.js`——新增 `READING_MODE_DEFAULT`（导出，供测试与呈现层引用）与 `hasReadingModePref`（分得开"从没选过"与"选过"，呈现层不许把缺省说成用户的选择）；`readReadingMode` 改三态；`setMode` 无条件落盘；模块头与函数注释同步。`features/settings.js` 与 `index.html` **零改动**——它们本来就走 `readReadingMode`，缺省一改自动跟上（设置页的单选按钮在未设偏好时现在勾「聚焦」）。
> - **测试**：`test/ui-reading-mode.test.ts` 由 26 → **30 条**。新增 6 条：★ 未设偏好 → 缺省聚焦（含非法残值）/ ★ 显式选过完整必须照办 / ★ `hasReadingModePref` 四态表 / ★ **走真实控制器的行为锁**（空 storage 起 `initReadingMode`，只调宿主会调的 `update()`，断言 4 个过程元素真被藏、2 条摘要行真插入，且**没有偷偷把缺省写成用户的选择**）/ ★ 显式选过完整的老用户初始化就是完整 / ★ 点「聚焦」值没变也落盘。改 3 条既有：「完整模式不做处理」显式切 full、`syncFromStorage` 先落 full、radio 语义按新缺省断言。
> - **变异验证（4 次）**：① `READING_MODE_DEFAULT` 退回 `"full"` → 红 5 条；② `readReadingMode` 退回两态 → 红 4 条（含设置中心同源那条）；③ `setMode` 值没变不落盘 → 红 2 条；④ `hasReadingModePref` 改成"非 null 就算" → 红 1 条。
> - **判据守不住什么**：jsdom 不做布局，所以"首屏不再刷屏"只能用**可数代理**（被藏元素数 4、摘要行数 2）证明折叠真发生了，**量不出真实像素高度**。真实视口取证仍是 P0 遗留的截图缺口。
> - **文案复查**：搜过"默认完整 / 保守上线 / 完整模式是现状"三处措辞，全部改掉或改准；`settings.js` 那句「对话将默认用完整模式」说的是"你这次选择成为以后的默认"，语义没变，保留。

### T18 同类型卡片自动折叠成组

- **改法**：对话流渲染层加一个 grouping pass——连续 ≥3 条同类型工具输出（链接 / 文件读取 / 工具调用）折叠为“链接列表（12）”可展开组卡；组内保留搜索。
- **落点**：`ui/public/features/transcript-grouping.js`，纯前端变换，不改事件流。
- **验收**：含 12 个连续链接的 run，主区首屏高度缩短 ≥50%；展开组卡内容完整；配测试。

> **✅ 已完成（2026-09-23，提交哈希见第八节 P1 提交表）**
>
> - **★ 真因与计划原文不同（两处）**：
>   ① 计划说「连续 ≥3 条**同类型工具输出**」，读作"主区有 12 张独立的链接卡"。复核 `02-chat-code-rail-collapsed-1440.png`（本轮亲读了图）后不成立——那面墙是**一张卡里的一张 12 行表**：`renderChatItem` 的 `case "sources"` 产出的 `<aside class="chat-sources">`，底下还挂着「导出链接列表」按钮（截图里看得见）。每行看着占两行高，是因为「来源」列在窄栏里把 `r.title || "链接"` 的兜底字样折成了"链"/"接"——12 行里 12 个一模一样的"链接"，这正是报告说的"每个链接都带'链接'前缀"。
>   ② **连续工具调用早就被折叠了**：`app.js` 的 `collapseToolGroups` 把相邻 `tool` 项收成一个 `kind:"tools"`，`renderToolGroup` 只铺 featured 那一步。照计划字面再做一遍"连续工具折叠"是纯空转。
>   **所以本项折的是"同类型的重复"这件事本身**，不是"工具输出"这个类别：① 卡内同构行列表（来源表 `tbody > tr` ≥3）→ 整表收起、只留一条「链接列表（12）」+ 展开后组内搜索；② 兄弟卡片连续 ≥3 张同签名 → 收起成一条摘要行 + 组内搜索。
> - **落点**：`ui/public/features/transcript-grouping.js`（新建，纯函数层 + DOM 层）、`ui/public/styles.css`（`.tg-box/.tg-summary/.tg-search/.tg-empty/.tg-hidden`，沿用 reading-mode 的视觉语言，零裸色值）、`ui/public/index.html`（动态 import + `renderDetailWithState` 里排在 `readingModeApi.update` **之后**的调用点 + 深链直达补一次）。**app.js 一行没改**，事件流与 transcript 格式没碰。
> - **工程纪律（两条，都是现场逼出来的）**：
>   · **不包 wrapper，只用「兄弟摘要行 + 成员加隐藏类」**——`#conversation` 的子节点由 `patchList` 按键管着，包一层会让它找不到节点。这是抄 reading-mode 的 `.rm-summary` 做法。
>   · **必须排在 reading-mode 之后，且绕开它已经藏掉的东西（`.rm-hidden`）**——两个后处理器在同一个容器上干活。T17 之后缺省是聚焦，连续思考/工具本就归 reading-mode 管，本模块不去折第二遍（有专门一条锁 + 一次变异）。
> - **结论类一律不折**：`itemSignature` 只认白名单（来源表 / 产物卡 / 工具组 / 思考 / 状态提示 / 动作提示），用户消息、助手正文、裁决、审批、计划、改动卡、段分界一律返回 `null`。与 reading-mode 的 `classifyUnit` 同一保守方向：漏折是小事，误折结论是大事。行折叠目标也是白名单（**只有来源表**）——正文 Markdown 里的表是结论的一部分，折了就是把答案藏起来（有一条锁钉住"不许 `querySelectorAll('table')`"）。
> - **★ 判据降级（必须诚实记）**：计划验收写的是「主区首屏高度缩短 ≥50%」。**jsdom 没有布局、不做样式级联、不解析 `var()`，`offsetHeight` 恒为 0，这个数量不出来**。改成**可数代理**：同一份含 12 条链接的事件流走**真实渲染链**（`reduceEvents` → `deriveChatItems` → `renderChatItem`）后跑折叠，断言可见行数 **12 → 0**、顶上多一条「链接列表（12）」、整表挂上 `.tg-hidden`；兄弟卡片那侧断言可见卡数 **4 → 0**。**这个代理守不住真实像素高度**——它只证明"折叠真的发生了、该藏的藏了、该露的能露回来"，不证明首屏矮了多少。真实视口取证仍是 P0 遗留的截图缺口。
> - **测试**：`test/ui-transcript-grouping.test.ts`（新增 **28 条**）——纯函数层 10 条（签名白名单正反、`findRuns` 阈值/锚点打断/多段/畸形、摘要措辞、查询匹配）；走真实渲染链 9 条（★ 现场复现"一张 12 行表而非 12 张卡"且来源列全是兜底字样 / ★ 可数代理 12→0 / 展开内容完整（12 条 URL 逐条在） / ★ 组内搜索筛得动 / 未命中明说 / ★ 查询跨收起保留 / 幂等 / 展开态跨重算不丢 / 少于阈值不折）；兄弟卡片 4 条（★ 可数代理 4→0 / ★ 结论不折 / 组内搜索 / 两段不串组）；与 reading-mode 共处 2 条；宿主接线与样式 5 条（含 ★ 调用顺序锁、零裸色值、`!important` 隐藏、不 import app.js / 不碰 fetch·EventSource）。
> - **变异验证（5 次）**：① `GROUPING_MIN` 3→2 → 红 3 条；② `itemSignature` 白名单破功（什么都可折）→ 红 2 条（含"结论不折"）；③ 去掉"绕开 `.rm-hidden`" → 红 1 条（与 reading-mode 共处）；④ `clearProcessed` 不清旧摘要行 → 红 1 条（幂等）；⑤ 宿主调用顺序挪到 reading-mode 之前 → 红 1 条（顺序锁）。
> - **写测试时和实现打了一架，如实记**：第一版断言"收起再展开回到全量"，红了。查下来是**注释在说谎而不是代码错了**——搜索框内容跨收起保留，行却回全量，等于输入框写着 `topic-7`、底下铺 12 行，自相矛盾。结论：保留查询才对，改注释与判据，不改行为。（同族第二例：`buildBox` 第一版给行列表塞了 `searchText: () => ""` 的空实现 + 第二个监听器，属于"参数名说一件事、实际干另一件"，重构成统一的 `filter(query, collapsed)` 回调。）

### T19 命令面板补全高频命令

- **现状**（`12-command-palette.png`）只有：新建对话、搜索对话、快捷键帮助、主题切换。
- **补充命令**：切换工作目录、打开设置、停止当前运行、切换 Work/Code 脸、跳运行指挥中心、查看记忆面板。
- **验收**：面板命令 ≥10 条；每条有可命中的模糊搜索关键词；键盘全程可达。

### T20 “待你处理”跨会话聚合入口强化

- **现状**：T4 通知中心已有聚合基础，但入口不明显；审批/ask_user/计划门只在当前会话 action-dock 出现。
- **改法**：
  - 侧栏顶部固定“待你处理（N）”条，跨会话聚合五类事件（审批待决 / ask_user / 计划门 / 运行完成 / 预算耗尽），点击直达干预点；
  - 有待决项时给召回条加呼吸点（用 `--status-warning` token，不用彩色 emoji）。
- **验收**：同时跑 2 个 run 制造待决事件，不打开会话也能在侧栏看到数量并一键跳转。

### T21 错误卡增加动作入口

- **现状**：整屏两行红字（“限流，SDK 重试已耗尽”），没有下一步（证据 `14-audit-code-rail-collapsed-1440.png`）。
- **改法**：错误卡底部加按钮组——「重试」「查看事件日志」「复制错误详情」；限流类错误额外给「降低并发后重试」提示文案。
- **验收**：错误状态下截图出现动作按钮；「复制错误详情」产出含 runId + 错误栈的文本。

---

## 四、P2 —— 长出设计稿最终形态（按原计划推进 + 三项差异化）

> P2 不与 plan 5/6/7 重复，而是把它们纳入台账并补三块超越计划的体验。

### T22 计划 5：左栏两脸分组差异

- Work 脸：Pinned / Tasks 分组；Code 脸：按项目名分组。
- 前置：侧栏条目压缩到 2 行（标题 + 状态/时间），一屏容量翻倍。
- 依据：设计稿 `docs/superpowers/specs/2026-09-20-two-face-shell-redesign-design.md` §3。

### T23 计划 6：Work 脸右列工作台四段

- Progress / Working folder / Scratchpad / Context 四段替换当前“暂时挂树”。

### T24 计划 7：Code 脸 Changes/Preview + PR 条 + Files 搜索框

- 输入框上方 PR 条；Files 面板加搜索框。

### T25 产物画布升级

- HTML 产物 iframe 内联预览（sandbox）、表格/图片原生渲染、版本切换 tab——从“下载链接”变成“一等公民”。（延续 T10 的方向，覆盖更多产物类型。）

### T26 运行指挥中心

- 侧栏顶部“运行中”聚合：各 run 进度、预算消耗、待审批数卡片，点击直达。

### T27 主动通知

- 运行完成 / 需要决策时，Electron 原生通知（或浏览器 Notification）主动找用户，补齐“委托感”最后一环。

---

## 五、执行顺序与依赖

```
P0:  T13 → T14 → T15 → T16        （互不阻塞，可并行，一周内清完）
P1:  T17 → T18 → T19 → T20 → T21  （T17/T18 影响渲染层，先做；T19/T20/T21 独立）
P2:  T22 → T23 → T24              （按原计划顺序）
     T25/T26/T27                  （T26 依赖 T20 的聚合数据，T27 依赖 T4 通知基础）
```

每项完成后：`npm run typecheck` ✅ + 相关 vitest ✅ + Playwright 截图存档到 `eval/persona-ux/_verify-shots/`（沿用 `local-web-ui-review` skill 的取证流程）。

---

## 六、明确不做的事（防止范围蔓延）

1. **不重写前端**：保持零构建原生 ES modules，不引入框架/打包器/CDN。
2. **不改事件流协议**：T17/T18 都是渲染层变换，不动 SSE 与 transcript 格式。
3. **不动设计 token 体系**：所有新 UI 只用现有 token；发现缺 token 时先补 token 再写样式。
4. **不破坏已守住的骨架**：同键开/关、浮层↔占宽列、两脸召出钮差异是 plan 4 的成果，任何优化不得回退这些行为。

---

## 七、P0 执行台账（2026-09-22 收工）

### 提交

| 提交 | 内容 |
|---|---|
| `786d182` | T13 覆盖层主题一致性——补 `--surface-elevated` 语义令牌 + 常驻审计门禁 |
| `f3c5938` | T14 review 面板「假空」——范围收口 + 工作目录分支 + 服务端口径校验 |
| `885ee84` | T15 窄屏召出钮自成一行 |
| （本提交） | T16 Work 脸命名统一 `office` → `work` + 本台账 |

### 数字

- `npm run typecheck`：开工前后都是 **0 错**。
- `npm test` 全量：开工前基线 **11 文件 / 47 条失败**、3716 通过；P0 全做完 **6 文件 / 23 条失败**、3802 通过。
  **新增失败 0 条**（逐条比对测试名）；基线里有而这次没有的 24 条全部落在 git 依赖 / 超时敏感的用例上（`workspace-git`、`ui-github-pr-api`、`run-crash-inject`、`ui-server` 的几条长跑），是既有 flaky，不是本轮修好的。
- 稳定复现的既有红：`test/cloud-sync-env.test.ts`（12 条，需要 bash）、`test/ui-patch.test.ts`（3 条）、`test/ui-handoff.test.ts`（4 条）等——**开工前就红，与本轮无关**。
- 本轮新增测试文件 4 个共 **53 条**（`ui-overlay-theme` 8 / `ui-review-thread-scope` 15 / `ui-narrow-summon` 15 / `ui-workspace-face-rename` 15），另往既有文件补 **10 条**（`ui-changes-endpoint` +4、`ui-changes-panel` +3、`ui-faces`/`ui-app`/`ui-server` 各 +1），合计 **63 条**；每组都做了变异验证（逐条记在各项台账里）。

### 本轮未做的事（诚实记账）

1. **视觉截图未做**。计划验收提到把截图存进 `eval/persona-ux/_verify-shots/`。本轮**没有起宿主截图**，原因：起真实宿主 + Playwright 的既有探针（`eval/persona-ux/_audit-20260919/*.mjs`）都绑着特定的重放 run id 与夹具目录，要复用得先重建那套夹具；而 Windows 上后台 node 子进程杀不干净会变僵尸、污染共享资源（仓库既有纪律），代价与本轮四项的收益不成比例。
   **替代判据**：T13 = 从 `styles.css` 解析令牌链 + WCAG 相对亮度实算（暗色三主题 < 0.2、与暖纸不同色、正文对比度 ≥ 4.5）+ 组件层无不透明字面底色 + 真 jsdom 的挂载点行为锁；T15 = 从 `styles.css` 按视口宽度做小型级联，断言窄/宽两档的声明胜负与排序不变量。
   **这些判据守不住的**：真实浏览器的样式级联、层叠上下文、最终像素（行高、是否恰好不再重叠）。**下一轮若起宿主，这两项应当补一次真实视口取证。**
2. **`cross-app/` 的静态副本没跟着改名**（T16）。它本就是已漂移的镜像；它发出的 `workspace: "office"` 会被服务端归一，功能不受影响。
3. **谱系内跨目录取 patch**（T14）：一场对话里若各 run 的工作目录不同，逐行 patch 仍按选中 run 的目录算。`deriveThreadTouchedFiles` 已按文件记了 `runId`，接上去不难，但实践中同一场对话共享目录，本轮未做。
4. **P1 / P2 一项未动**，按派单只做 P0。

### 过程中发现的、值得进 P1 或 backlog 的新问题

1. **审视报告的两条根因判断都不准**（T13 完全不成立、T14 指错了地方），但**现象都是真的**。→ 纪律：报告给现象，根因要现场复核；否则会「修一个不存在的 bug」或「修错地方还以为修好了」。
2. **`deriveThreadChatItems` 的注释与代码相反**已经活了很久（注释说「是本场（tip）的卡」，代码留的是根 run 的）。→ 值得对 `app.js` 里其它「注释断言了一件事、代码做另一件」的地方做一轮定向排查。
3. **服务端与客户端对「这次 run 碰过哪些文件」有两套口径**：服务端 `collectTouchedPaths` 收全部 `tool_call`（含失败的），客户端 `deriveTouchedFiles` 只收成功的。同一个 run 在 T8 变更面板与 T7 审阅面板会显示不同的数量（现场截图里就是 25 vs 12）。→ **这是下一个「界面在说谎」的候选**，建议进 P1。
4. **`ui-patch` / `cloud-sync-env` 等既有红长期存在**，让「零新增失败」只能靠逐条比对测试名来判断。→ 建议给 CI 加一份「已知红名单」，新增即失败。
5. **窄屏断点分散**：`isNarrow()` 是 700、预览坞是 900、右列按预算算（≈936）、本轮新增 1024。→ 四套断点没有共同事实源，建议收进一处常量（P1 候选）。

---

## 八、P1 执行台账（2026-09-23）

> 逐项细节写在各项标题下面的「✅ 已完成」块里，这里只登记提交与数字。
> **哈希登记纪律**：一条提交的哈希只能由**下一条**提交来登记（自己写自己的哈希必然对不上——
> P0 那轮靠"（本提交）"绕过，本轮改成表格）。

### 提交

| 提交 | 内容 |
|---|---|
| `79c553a` | T28 「碰过哪些文件」两侧口径合一 + 跨两侧一致性锁 |
| `d00f64c` | T17 对话流缺省切到「聚焦」（顺带修掉让「记住偏好」形同虚设的两处） |

