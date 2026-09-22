# 最终全分支审查 —— `fix/capability-visibility`

**范围**：`cc77d28`（merge-base，`git merge-base main HEAD` 核过）… `13f8759`，**6 commits，128326 字节**
**包**：`review-cc77d28..13f8759.diff`
**审查者**：opus（技能要求"以能力最强的可用模型派发"，非会话默认）
**裁决**：**With fixes** —— 0 Critical、4 Important、8 Minor

> 范围**比"计划 1"大**：含 A+B（`61995c6`），它是计划 1 的 BASE 之前就在分支上的。
> 按整支派，因为**这才是会合进 main 的全部内容**。

**审查者的方法**（据其自述）：读计划 + 四个 勘误 块、读账本全部 12 条 Ruling/Park、读包与逐提交 diff、读 Spec（`schemes-overview` / `scheme-a-work-3states` / `scheme-a-code-3states`）与走查报告；**自己跑了受影响套件与全量**；用 Playwright 只读探了 4201；对新的结构性测试做了**内存变异**。全程零写入。

---

## Strengths（审查者自述，逐条）

1. 四个任务全部如约落地，偏差都是**诚实的那种**（逐条重推过：`--measure: 40em` 在第一个 `:root` `styles.css:172`、`.conversation` 在 `6688`、死的 `min(112ch,100%)` 已删；48px 条 + 六选择器 hider + 竖排规则 `styles.css:387-410`；`TREE_MIN_PX=200` 与 `Math.min(railWidth, Math.max(TREE_MIN_PX, round(railWidth*splitRatio)))` `rail-policy.js:160`；`deriveFace`→`body.dataset.face` `index.html:2344` + 两条脸规则 `styles.css:10975-10976` + 类挂钩）。
2. **计划对 Spec 的 40em 偏差是正确的，不是图省事**：Spec 自己的行文说"正文一行 ≤ 38 个中文字（舒适区）"，而它的线框写 760px——14px 下两者自相矛盾。40em = 560px = 14px 下 40 个中文字，落在 Spec 声明的区间**内**；760px 不在。
3. **删除零残渣**：grep 十个被删导出 + `data-next-*` / `.next-actions` / `patchAssemblyBar` / `patchNextActions` / `applyNextActionChip`，命中只在**新测试文件的文档注释里**。
4. **A+B 打对了缝**：12 天的死法是"纯函数对 + 挂载点在 + **没人调它**"；修法把调用挪进 composer 同步路径，并留下同源锁（`ui/server.ts` 的 `suggestsVision: nameSuggestsVision(pub.model)` + 一条断言**每个**模型都等于该函数的判决，而不是抄一份清单）。
5. **`13f8759` 是分支里最强的新测试**：标签级提取躲开了"这词在注释里也出现"的退化，经变异验证。
6. **活页独立验证**：树 200px 且目录名可读、preview 82/122/160px、`data-face` 真点击三态翻转、摘 `hidden` 后 none/flex 正确、**芯片放在 `<summary>` 里不会误触 `<details>`**（它专门查了这个真实风险）、0 控制台错误、390/700/900/1100/1440/1920 全无横向溢出。它还查了一条没人列过的：**≤700px 且偏好里记着收起时，48px 条渲染正常、图标全在、无溢出**（此前在那里左栏直接消失）。
7. **全量自跑：3630 条、12 失败——逐条对上文档化基线**（cloud-sync-env×2、run-crash-inject×1、ui-handoff×4、ui-patch×3、ui-server×2）。零新增、本次无抖动。`ui-patch` 那 3 条是既有的 CRLF-vs-`\n` 断言族，与本分支无关。
8. `taskCompletionFromObject` 的**故意不对称**（装饰性字段永不得否决完成）与钉住它的测试；幽灵句的保守规则（无建议就不劫持 Tab、打字/运行就清掉陈旧建议）都是对的。

## Important（合并前修）

**I1. 首页"核查关"芯片与 composer 自己的开关互相矛盾——一句假话，已活页复现。**
`index.html:2348` `patchCapabilityBar(selectedState ?? {}, harnessSnapshot)`。没有选中 run 时 `capabilityChips`（`app.js:6299`）看到 `verify === undefined` → **无条件**渲染"核查关"。但"下一条 run 会不会核查"的真值是 `#verify-toggle`，用户可改、且有默认值（Settings → 独立核查，`index.html:3423` ← `composerDefaults`）。活页：勾上复选框前后芯片文字都是 `["核查关"]`，`verifyChecked: true` 而芯片仍说 off；`verifyToggle` 上**没有 `change` 监听**，无法自愈。
**为什么重要**：这个元素的**全部职能**就是如实说明能力，而这个分支的存在理由就是"能力悄悄变了"。另：`app.js:6307` 那句"verify——开着是默认"**前提是反的**（真默认是关），于是这枚胶囊对**几乎每个用户**都常显，与设计的"只在弱态占位 / 常态零占位"冲突。
**审查者给的修法**：从复选框取源 + 加 `change` 监听重画；否则至少在没有 run 时不渲染。

**I2. "防再次脱钩"的锁没锁在调用点上——那个 12 天的失败模式仍然裸奔。**
`test/ui-capability-visibility.test.ts:113-133`。三条断言查的是：两个容器在不在 `index.html`、`app.js` 还硬不硬编码 `assembly: null`、`app.js` 引用的 id 在不在 `index.html`。**没有一条断言 `index.html` 真的调了 `patchCapabilityBar`。** 测试自己 import 进来手动调（`:79`），所以**删掉 `index.html:2348` 那一行，12 条测试全绿而能力条再次死掉**——正是这个提交要防的"纯函数对、挂载点在、缝在谁调用它"。仓库已有正确范式：`test/ui-next-suggestion.test.ts` 锁 `expect(html).toContain("deriveNextSuggestion")`。
**修**：那个 describe 里加一条，如 `expect(html).toMatch(/syncComposer[\s\S]*?patchCapabilityBar\(/)`。

**I3. `test/ui-layout.test.ts:53` 的 48px 断言有洞：`/width:\s*48px/` 也匹配 `min-width: 48px`。**
对真文件做内存变异证明：**删掉 `width: 48px` 声明**（一个很像样的"min-width 覆盖了"清理）测试**照绿**，而条子回落到 `.sidebar { width: 280px }`——**收起态悄悄退化成 280px 宽的、内容全藏的宽面板**。
**修**：`/(?<!-)\bwidth:\s*48px/`，或把 `min-width` 单独断言。同一失败族，只是这里还没关上。

**I4. `sidebarRailItems()` 写了但没接线，且 JSDoc 是句现在时的假话。**
`app.js:4873`。没有生产代码读它（grep 只有测试与 JSDoc）；它的 id 是**逻辑名**（`new-chat`）而真实按钮是 `#new-chat-btn` / `#board-open-btn` / …；JSDoc 说"DOM 侧由 index.html 的控制器**按 id 找按钮**"——`index.html` **没这回事**。**这是 R11 族的第五次**，而分支自己的教条说这种句子毒掉整份文档的可信度。
**严重度有限**（它没法"死"——它从没活过；看得见的条子是 CSS + 既有 DOM，已活页验证）。
**处置**：**现在改 JSDoc**（一行：它是契约、当下无消费者、点名真实元素 id），**DOM 侧测试单独立项**。

## Minor（8 条）

- **M1 启动闪帧**：在**能看图**的宿主上，欢迎页会先显示一格假的"识图 未配"，直到 `/api/harness` 落地（实测：第一次采样在、约 100–200ms 后消失）。`harnessSnapshot` 为 null → `backing == null` → "未配"。**当前测试反而把这个锁住了**（"按最保守的口径"），但本仓自己的规矩（"窗口未知就写窗口未知，不编一个数"）主张未知不该渲染成一个确定状态。
- **M2 计划文本缺口（计划层，非实现）**：**Ruling 6**——split 的 preview 规则**必须排在空槽 hider 之后**（两条都是 `(0,3,0)`）——**根本不在计划里**（Task 3 里 grep 特异性/空槽/hider：零命中），尽管账本标着"已回写进计划"。只有 CSS 注释带着它。**照计划字面做的人会写出一个静默无效的修复**——正是计划自己的失败模式。相关：Self-Review 仍在引用从未创建的 `railColumnsFor`。
- **M3** `styles.css:1570-1571`：无 JS 时的默认值 `--rail-tree-w: 144px` 仍是**旧的** `railWidth × 0.5` 公式，而注释声称"与 core/rail-policy.js 的常量同源"——树的下限现在是 `TREE_MIN_PX = 200`。今天不可达（JS 总会写这两个变量），但它是一份**陈旧的政策常量副本**。
- **M4 被本分支弄成假话的旧注释**：`index.html:1316`"左栏 width 在收起态量不到（display:none）"——收起态现在是可量的 48px（守卫的**行为**仍然是对的，它说的**理由**不对了）；`styles.css:6675`"放宽到 108ch"——该文件里 `ch` 已不存在、度量是 40em。
- **M5** `executor-model-picker.js`：`VISION_CAVEAT` 带 markdown 反引号，却用 `textContent` 渲染，界面上真的显示出 `` `view_image` ``（见 `shots/verify-C-picker-flag.png`）；详情段还读作"看不见图：这个执行模型看不见图：…"（tag 与 caveat 共享一个开头从句）。纯观感；隔壁的 why 面板用的是 `renderMarkdownInline`。
- **M6** `RESEARCH-AGENT-UI.md` §1.9 记着我们抄的那条约定还差两处：只有 `Tab`（Claude Code 也接受 `→`），且没有显式跳过规则。`→` 别名在同一"输入为空 + 有建议"守卫下是安全的，一行。
- **M7** `test/ui-capability-visibility.test.ts:123` 标题仍说"parts.assembly 指向的 id"——那个挂载点已不存在。
- **M8** 识图格的 why 文案（`deriveAssemblyBar` 的 `visionUnconfiguredWhy`）仍只讲 `AGENT_VISION_MODEL` / `describe_image` 那一半解法；"换个能看图的执行者"那半只活在模型选择器里。走查报告已记；一句话就能补上。

## Deferred-minors 分诊

| # | 账本条目 | 裁决 |
|---|---|---|
| T1-1 | `block()` 首匹配脆弱 | **放着** —— helper 的通用弱点，helper 里已注明 |
| T1-2 | `styles.css:6675` 注释 108ch | **合并前修**（1 行；R11 同族，且本分支让它更假） |
| T1-3 | implementer 报告行号略偏 | **放着**（纯外观，散文） |
| T2-1 | CSS 文本断言看不到 DOM 漂移 | **单独立项** —— 但审查者点名的**具体**修法（解析 index.html、断言每个契约 id 都有可达按钮）值得在 `sidebarRailItems` 有第一个消费者时做 |
| T2-2 | 逻辑 id / 无消费者 / JSDoc 夸大 | **合并前修 JSDoc 那一行**；接线 = 单独立项（= I4） |
| T2-3 | "display:none 钉整组，删一个选择器仍绿" | **放着——而且那条主张是错的。** 审查者对真文件做了变异：**删除、改名、或增删任何一行选择器都会让测试红**（六行选择器串必须精确匹配；把 `display:none` 去掉也红）。只有**错误信息**能更好。提出值得肯定，但测试没有担心的那么弱 |
| T3-1 | split 后 preview 成了可见的空列 82–160px | **单独立项** —— 真实（它量到 122px、1px 边框、两个坞都藏），但修法是**政策形状**的改动（给 `railPolicy` 一个 `hasPreviewContent` 入参），且这个取舍是**有意识地裁过的** |
| T3-2 | 0×0 的真修复没有自动锁 | **合并前修** —— 既有 `样式锁（styles.css）：split 真并排` describe 里加 2 行正则。**本组里性价比最高的一条**：规则**顺序**恰恰是未来某次清理会毁掉的东西 |
| T3-3 | 承重注释漏了 1670-1671 的孪生 `display:none` | **合并前修**（一个从句，与 T3-2 一起做） |
| T3-4 | `RAIL_MIN_PX ≥ TREE_MIN_PX` 耦合未记 | **合并前修**（`TREE_MIN_PX` 注释里一个从句；本组最便宜）——或放着，`Math.min` 守卫让它不会崩 |
| T3-5 | 被改的比率用例对预算敏感 | **放着** —— 可接受；若有人碰预算，断言夹紧值会是更好的契约测试 |
| T4-1 | `eca67a0` 提交正文重复 | **放着** —— 不改写已被审查包引用的历史 |
| T4-2 | 冗余的 `body[data-face="code"] … { display: flex }` | **放着** —— 双保险，且是 work 规则的对称对手 |
| T4-3 | "唯一判据"是目标态；`data-workspace-face` + 2× `designModeActive` 还在 | **单独立项 / 计划输入** —— JSDoc 已在分支内修正 ✓；另给计划的 Global Constraint 加个脚注，免得计划 2 从一个本分支尚未满足的前提上论证 |
| Park | 没有 `.gitattributes` 而 `core.autocrlf=true` | **单独立项** —— 既有；它正是逼出 helper 的 CRLF 归一化、并造成 12 条基线失败里 3 条的原因 |
| Park | git 支撑的 scratch workdir 夹具 | **单独立项——但要立成计划 2 的入场条件。** 它在这里不挡任何东西；但没有它，Code 脸的整个 git 家族（分支、脏状态、PR）会继续只在"摘掉 hidden"的人工口径下签收——**正是本仓已记档的那类缺陷的镜像** |
| Park | L3 逐图审批 / L4 审批时底栏 / L5 外壳资源无 `Cache-Control` / visionWhy 单边 | **单独立项** —— 都不挡。**L5 值得尽快排**：它能让任何前端修复对用户不可见（除非硬刷新），而它已经骗过审查者一次 |

**没有任何 Park 项该挡这次合并。**

## Recommendations

1. **合并前**（都小，一次做完）：I1（芯片取源 + 重画监听 + 测试）、I2（调用点锁）、I3（宽度正则加 lookbehind）、I4 的 JSDoc 一行，加上 T3-2 / T3-3 / T3-4 / T1-2 的注释与锁一行。**总 diff ≈ 25 行，除 I1 外零生产行为风险。**
2. **单独立项**：DOM 侧能见度契约测试（T2-1 / T2-2）、内容驱动的 preview 列（T3-1）、第二套脸表示的迁移（T4-3 → 计划 2/3 输入）、`.gitattributes`、计划 2 的 git 夹具。
3. **立下一份计划时，把账本里"已回写进计划"的说法当作未经验证、直到 grep 过** —— M2 是个活的counterexample：账本说抓出并修了三处，Ruling 6 漏了过去。
4. **保留控制者立的那些口径规矩**：行尾用字节核、收起态/浮动元素的可见性用命中测试、"摘掉 hidden"只用于读规则**内容**——这三条救了本分支免于假绿，而它们**一条都不在 CI 里**。

## Assessment

**Ready to merge?** **With fixes.**

**Reasoning**：四个计划任务全部如约落地、勘误诚实且有代价，A+B 的复活端到端验过（含 48px 条的命中测试与幽灵句的采纳路径），删除没留下悬空引用，它自己的全量跑出**恰好 12 条基线失败、零新增**。剩下的是**一句活页复现的屏幕假话**（"核查关"芯片 vs composer 自己的开关）和三处便宜的测试锁洞——**一次小修就能做完，除此之外这个分支与 `main` 之间没有别的东西挡着**。
