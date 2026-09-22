# SDD ledger — plan: docs/superpowers/plans/2026-09-20-plan3-review-actions.md

分支：`feat/review-actions`（自 `main@4b6fc7e`，merge-base 也是它）
工作区：`.superpowers/sdd/2026-09-20-plan3-review-actions/`

---

## Setup 时做的裁决

**Ruling P1 — 宿主不在跑，由控制者在 4201 起审计宿主，全计划探针走 `AUDIT_BASE=http://127.0.0.1:4201`。**
setup 时实测：`4201 → 000`、`4173 → 000`，两个宿主都不在。计划里六个任务都要活页探针，**不能让它们依赖委托方的实例**（他的实例随时会关）。
**为什么是 4201 不是 4173**：4201 是这次走查的隔离宿主（`D:/Work/scratch/fathom-ux-audit-20260918/audit.env`），有自己的 workdir 与 history，**与委托方正在用的那个完全隔离**；计划 2 的探针默认也打它。
**代价（错的话）**：探针测的是隔离环境而非委托方机器——但那本来就是对的（走查不该在你的会话里造数据）。

**Ruling P2 — 不建 worktree，在主目录开分支 `feat/review-actions`。**
技能要求"隔离的工作区"，但它也要求"**绝不在 main 上开工**"——开分支满足后者。不建 worktree 的理由是**这条计划的性质**：七个任务里六个的验收是**活页探针**，而探针要一个**正服务着工作树的宿主**；worktree 会让宿主继续服务 `main` 的文件，于是每个探针都在测旧代码。
计划 1 与计划 2 都是这么做的（分支在主目录里）。
**代价（错的话）**：主目录里同时存在未提交改动时会互相干扰——现在工作区只有 `mcp.json` 一个 `M`（会话前就有，不进仓）。

**Ruling P3 — 计划里 Task 1 探针的默认端口 `4173` 是笔误，改成 `4201`。** 计划 2 的探针全默认 4201；4173 是委托方的实例。已改计划文件。

**Ruling P4 — Task 4 的测试引用了 `mkTmpRepo()` / `git()` 却没给定义，补进计划。** 补的时候加了 `git config user.email/user.name` 两行——**干净机器与 CI 上没有全局身份，`git commit` 会当场失败，而本机（配过）不会**。这类"本机绿、CI 红"的坑在本仓有过先例。已改计划文件。

**Ruling P5 — Task 5 的测试补 jsdom pragma，并订正我写的那句未核实的注释。** 我原话是"`artifact-canvas.js` 是模块级会摸 DOM 的那种文件"——**grep 核实后是假的**：`document`/`window` 只出现在 `initArtifactCanvas` 的函数体里（`:860-861`），文件头注还明写"纯函数层（…路由编解码…）**可单测**"。pragma 留着（零成本 + 文件 1700 行），**但理由改成实话**。已改计划文件。

---

## 预检冲突扫描（技能要求：一张表，不是一句"扫描干净"）

### 一、每个任务自己的文本自洽吗

| 任务 | 检查项 | 发现 |
|---|---|---|
| T1 | 测试的 `block()` 找 `.composer-scope:not([open]) .composer-scopebar`，而 CSS 写成**单行选择器 + ` {`**（`block()` 的匹配形态） | ✅ 自洽 |
| T1 | 两条测试**一锁规则、一锁 markup**，且变异验红**两半各验一次** | ✅ 符合计划 1 的教训 |
| T2 | 测试里"下钻行"的选择器 `.wp-dir, [data-path]` 是**猜的** | ⚠ 计划已标明"先读 `renderDirs` 改成真名"，**不许保留一个猜的选择器让它静静地绿** |
| T3 | `block(source, ".ac-tabs")` 是**首个匹配**——若 `.ac-tabs` 在 CSS 里有多处规则块，拿到的可能不是以为的那个 | ✅ 计划已要求先 grep 数一下 |
| T3 | 断言用负向 `min-width:\s*(?!0\b)\S+` | ✅ 只写 `toMatch(/min-width:/)` 的话现状那行 `min-width: 0` 就能喂饱它 |
| T4 | 测试引用 `mkTmpRepo()` / `git()` 但**没给定义** | ★ **计划缺陷，已补**（Ruling P4） |
| T4 | 探针直连端点（不经浏览器），判据四条含越界 400 | ✅ |
| T5 | 测试没写环境 pragma | ★ **已补**（Ruling P5） |
| T5 | `parseArtifactRoute` 的返回形状从 `{runId,index,full}` 变成 `{runId,path,index,full}` → **调用点必须同任务内改完**（`index.html:1973/2193/965`） | ✅ 计划把四处写在同一任务里 |
| T6 | `deriveTouchedFiles` 收 `write_file`，而既有的 `editHunksFromTimeline` **不收**——两处口径不同 | ✅ **刻意**，计划写了理由（`write_file` 正是 git patch 能补上旧版的那一类） |
| T6 | 折叠态**不显示行数**，与设计案 态 3 的 `+197 −0` 不一致 | ✅ **刻意的偏差**，计划如实记了理由（同步/异步的形状约束） |
| T7 | 测试要 `RAIL_PANELS`（该文件已有 `export`），但**测试文件现有的 import 列表里没有它** | ⚠ 追加 describe 时**要一起补 import** |

### 二、跨任务：共享文件或接口的对

| 对 | 共享 | 一个产出 / 另一个消费 | 发现 |
|---|---|---|---|
| T1 × T3 × T6 × T7 | `ui/public/styles.css` | 各加**不同前缀**的选择器：`.composer-scope…` / `.ac-tabs` / `.chat-change-card*` / 面板 | ✅ 无选择器重叠 |
| T1 × T3 × T7 | `test/ui-layout.test.ts` | 各追加 describe | ✅ 顺序执行，无冲突 |
| T5 × T6 × T7 | `ui/public/index.html`（6349 行） | T5 改路由 / T6 加状态与动作 / T7 加右栏 tab | ⚠ **同一文件的不同区域，必须顺序执行**（技能本就禁止并行实现者） |
| T4 → T6 | `fetchFilePatch(workdir, path, fetchImpl)` | T4 产、T6 消费 | ✅ 签名一致 |
| T4 → T6/T7 的探针 | 夹具白名单 | 需 `.git-fixture/git-repo` 在宿主白名单上 | ⚠ **环境前置**：setup 时跑一次计划 2 的 `verify-face-git.mjs`（它走真实 UI 路径把夹具加进白名单） |
| T6 → T7 | `renderChangeCard` 里的文件列表 + hunk 视图 | T7 **抽出来复用**，不许写第二份画法 | ⚠ **★ 跨任务交接，最容易漏** |
| T6 → T7 | 「在右栏审阅 →」按钮 | T6 明写"**别造一个空按钮**"，接线由 T7 补 | ⚠ **★ 若不carry，这条按钮会永远不接线** |
| T6 → T7 | `deriveTouchedFiles` / `buildRevertMessage` | T6 产、T7 复用 | ✅ |
| T1 → T2/T5/T6/T7 的探针 | composer scope | T1 修掉幽灵控件后，探针**不必再"先展开 scope"** | ✅ 计划 2 的既有探针保留绕行也仍然可用（不许改既有探针） |
| T4 → T6/T7 | patch 的语义（工作区相对 HEAD） | 界面文案与注释必须照这个口径 | ⚠ 计划明写"**不许简写成『本场改动』**" |

**扫描结论：无任务互相矛盾、无与 Global Constraints 冲突、无"计划强制而评审会判为缺陷"的项**（比如"断言空的测试"或"逻辑块逐字复制"）。上表 5 处 ⚠ 里，3 处（T2 的选择器、T3 的首个匹配、T4/T5 的两处）已有护栏或已订正；2 处（**T6→T7 的两个交接**）**必须写进 T7 的派单**，否则会漏。

---

## 任务进度

（每个任务完成时追加一行 `Task <N>: complete (commits <base7>..<head7>, review clean)`）

**Setup 完成**：
- 分支 `feat/review-actions` 起于 `4b6fc7e`（main）。
- **审计宿主已由控制者起在 4201**（`npx tsx --env-file-if-exists=.env --env-file-if-exists=D:/Work/scratch/fathom-ux-audit-20260918/audit.env ui/serve.ts`），`curl / → 200`。
- **夹具白名单已预热**：跑了一次计划 2 的 `verify-face-git.mjs`（`AUDIT_BASE=4201`、`FIXTURE_DIR=D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo`），**退出码 0**，两脸判据复跑绿，`/api/workspace/git` 对夹具返 200（白名单门已过）。
- 七个任务的 brief 全部预先切好（`task-N-brief.md`）。

**Task 1: dispatched**（implementer，sonnet，agent `a9226b93d708ee0dc`）—— BASE `4b6fc7e`。
派单里带了两条对 brief 的裁定：①「先探针后修」从"可选但强烈建议"**升级为必需**（计划 1/2 里三条真回归全是"纯函数绿 + 接线锁绿而走不通"，只有真点才现形）；② `block()` 按 `\n<选择器> {` 取首个匹配，所以 CSS 规则必须单行行首——brief 给的就是那个形态，**照抄别改写**。

**★ Ruling T1-A（实现者 mid-task 提问 · 实证抓到一处计划 bug）—— 那条 markup 测试改用标签级断言。**
实现者报：brief 逐字写的 `block(source, "<details class=\"composer-scope\" id=\"composer-scope\"")` 不可能匹配——`block()` 找的是 `\n<选择器> {`，**天生匹配不了 markup**；它的 `indexOf = -1`。
**我自己复验过**（`indexOf = -1`，真实的 details 行有 4 格缩进并以 `>` 结尾）——**它说得对**。
**最刺眼的一点**：计划自己第 234 行就写着 `block()` 的匹配机制，下一句还是"这里要找的是 markup，所以传进去的是标签本身"。**知道机制、照样按"以为的写法"写**——这就是这一夜反复出现的那一个形状。**brief 自己 Step 2 的预期还写着第二条"可能通过"，与 Step 4 的"两条都 PASS"自相矛盾**，实现者把这两处也一并点了出来。
**裁定**：采纳它的方向（regex 代替 `block()`），但**用比它提的更强一层**的写法——它提的是"抠出整个 details 块再 `toContain`"，而**那个块里就有 HTML 注释**（`index.html:255-259`），块级 `toContain` 照样可能被注释喂饱（正是同文件 `:96-104` chip 注释警告的退化）。改成**标签级断言**（`scopeBlock.match(/<div…composer-scopebar…>/)`）。
**代价（错的话）**：断言从"块级"收紧到"标签级"，比锁的东西**更严**——若将来有人把 scopebar 从 div 换成别的标签，这条会红而实际未必坏。可接受（改标签本来就要重看这条规则）。
计划文件已订正并提交（`e90aadb`）；**brief 是订正前的快照**，所以裁定正文里带上逐字代码发给了实现者。

**★ Ruling T1-B（同一条链上更深的一处 · 实现者实证，我复验过）—— 我那条正则对「改名」变异是装饰，补负向前瞻。**
实现者实测：`\bcomposer-scopebar\b` 对 `class="composer-scopebar-x"` **照样匹配**——`\b` 在 `r|-` 处成立（`-` 是非词字符），后面的 `[^"]*` 把 `-x` 吃掉。**于是变异 5.b 不红（22 条全绿）**。
**它的分析我复验过，成立。** 补 `(?![\w-])`（覆盖 `-x` / `_foo` / 数字后缀等现实改名形态；HTML5 的 class 理论上还能含 `.` 之类，但那些字符在 CSS 里本来就要转义，不追这一层——**我第一版提交信息里把"够"说过头了，已改**）。
**★ 这是同一句话的第三次现形**：断言要锁「类名恰好是它」，不是「这一带出现过这个名字」。前两次是计划 1 的 CSS/markup 两半、计划 2 的调用/引入两半。
**★ 顺手扩了一处**：`test/ui-layout.test.ts:96-104` 那条既有 chip 断言有**同一个弱点**（`workspace-git-chip-x` 也照样绿，而两脸的两条 CSS 规则就都匹配不到了）。**让它一并改**（同文件一行），并要求在报告里写明"为什么动了一条不在 brief 里的断言"——reviewer 会看到。
**★ 控制者纪律**：这条我**没有自己改仓库文件**（技能明写控制者修 finding 会跳过审查），只改了计划；`test/ui-layout.test.ts` 的改动走实现者 + 审查。
计划已订正并提交（`93eec26`）。
**代价（错的话）**：`(?![\w-])` 挡住的是"类名续写"这一种改名；若将来把类换成完全不同的名字、或在同一元素上新增一个以它开头的类，锁的表现不同——但那时**第一条（CSS 规则）与这条一起会给出信号**，不至于静默。

**Task 1: DONE**（commit `2b170c9`，四文件 +152/−3）
- 实现者自报：聚焦 22/22 绿；全量 3701 条 **13 failed 均为干净 HEAD 复现的基线**（**它用 stash 对比验证的**，零新增）；**变异验红两半都红**（5.b 按 T1-B 裁定三段留档）；活页探针**修后退出 0**，**撤 CSS 后 ① 红（幽灵盒 618×28 复现）退出 1**。
- **它报的第四条顾虑值得记**：「探针补一行 onboarding 跳过（不补则欢迎页被遮罩挡死、② 永远超时）」——**这是我探针代码里的一个真缺陷**（我只清了 `composerScope`，没设 `onboardingDone`；计划 2 的探针都有那一行）。它自己补上了。
- **★ 它在一个任务里连抓我两处**（T1-A 的 `block()` 坏调用、T1-B 的正则漏匹配），**两处都在动手前先做了最小实证**（`indexOf = -1`、`\b` 的边界行为），两份原始输出都留了档。

Task 1: review dispatched（sonnet）—— 包 `review-4b6fc7e..2b170c9.diff`（3 笔：实现者 1 笔 + **我两笔计划订正** `e90aadb`/`93eec26`，只动 `docs/`）。
派单里交代了两件事实（不是替它判断）：① **brief 是订正前的快照**，核对规格以订正后的计划为准；② **请它独立判断 T1-A/T1-B 两条裁决本身对不对**，裁决错了就照常报、那是控制者的错。另点名要它特别判两件事：**那两条断言真的能红吗**（尤其前瞻对各种改名形态漏不漏）、**探针那条判据是不是真的对着幽灵控件**（而不是对着别的东西）。

Task 1: review 结 —— **Spec ❌ / 质量 Needs fixes —— 0 Critical、1 Important、2 Minor**

**★ 那一处 Important 是同一个洞的第三次现形，而这次在我的正则里。** 审查者抓到：我给 T1-A 写的 `scopeBlock` 用了裸 `\bcomposer-scope\b`——**我刚在 T1-B 里修掉那个弱点，一行之隔又犯一次**。把 details 的类改成 `composer-scope-x` → **幽灵控件复活，而两条新测试都保持绿**。已补前瞻（三条断言现在都带：`scopeBlock` / `barTag` / chip 那条），计划已写清**"这不是三条独立的小事，是同一个弱点的三个位置"**（commit `bac4b8a`）。

**审查者独立验证了我的两条裁决（不是照收）**：
- **T1-A**：它去读 `block()` 的源码（`test/ui-layout.test.ts:28-34` 的 `text.indexOf(\`\n${selector} {\`)`），确认**结构上匹配不了 markup**（标签以 `>` 结尾、永远不是 ` {`）。
- **T1-B**：它把前瞻对着**整个变异空间**试了 —— `-x` / `2` / `_` / `--` 都红（经 `\b` 或前瞻），`composer-scopebar is-active`（尾随多类）保持绿**是对的**（CSS token 匹配仍成立），`x-composer-scopebar`（前缀）保持绿**也是对的**。**无泄漏。**
- 它还独立核了特异性：`.composer-scope`(0,1,0) + `:not([open])`(0,1,0) + `.composer-scopebar`(0,1,0) = (0,3,0) 压过 author 的 (0,1,0) ✓。

**⚠️ 那条我解掉了**（审查者要求控制者复核）：实现者报的全量 **13 failed** 高于记忆里的 12。它 §七 的做法是 **`git stash push -u` 撤到干净 HEAD、单独跑那 5 个文件 → 12**；全量里多出的第 13 条（ui-server「跨 run 资源互斥」）**在基线重跑中通过**——即"轮换抖动"那一类。**⇒ 干净 HEAD = 12，本树 = 13，零新增** ✓。**它没有我的记忆，是从原始行为自己推出这条模型的。**

**探针判据审查者确认"真的是对着幽灵控件"**：修前原始输出 `details.open=false · scopebar display=flex · 盒 618×28`，c1 是**由 `#composer-scopebar` 自己的 computed style 与 rect 算的**（正是缺陷的那个盒子），不是 details/summary/textarea。

Task 1: minor (deferred) — `test/ui-layout.test.ts:125` 的 `[\s\S]*?<\/details>` 非贪婪截断脆弱（今天 `index.html` 只有一个 `<details>`，被截断的风险是"若将来在 scopebar 里嵌一个 details"；建议加一句注释或按 id 锚定）——**留给 final review 分诊**。
Task 1: minor (deferred) — `verify-composer-scope.mjs:69,73` 的固定 `waitForTimeout`（本仓惯例，失效方向是假红不是假绿）——**留给 final review**。

Task 1: fix round 1/5 dispatched（resume 原实现者）—— 只有那一处 Important（`scopeBlock` 补前瞻）；要求覆盖测试 `test/ui-layout.test.ts` + 变异三段留档（details 类改名 → 红）。两条 Minor **明确告知不进这轮循环**（防它顺手改）。

Task 1: fix round 1/5（1 addressed / 0 open — `scopeBlock` 补 `(?![\w-])` 前瞻；commits `2b170c9`..`5d3c711`）
- 报告里的三段留档：**旧正则 + `composer-scope-x` 改名 → 22 全绿**（坑的实证）→ **补前瞻后 → 1 failed / 21 passed（红）** → **还原 → 22 绿**；且 `index.html` 变异还原后与提交态**逐字节一致**。
- 它没有顺手改那两条 Minor ✓（按指示记账本不动）。

Task 1: scoped re-review dispatched（sonnet）—— 包 `review-2b170c9..5d3c711.diff`（2 笔：修复 1 笔 + 我的一笔计划提交 `bac4b8a`）。
**派单里点名要它别用"测试绿"回答**（那正是这条 finding 的由来——**改之前也是绿的**），要它**对着正则本身推理**，并独立判断上一轮那个穷举结论（`-x`/`2`/`_`/`--` 红、尾随多类与前缀保持绿）对 `composer-scope` 这个 token 是否同样成立。

Task 1: fix round 1/5 re-review 结 —— **All findings addressed，无新 Critical/Important breakage** ✓
- 它**没有看灯**：拿 node 把 HEAD 的真实 pattern 对着变异空间**逐个跑了一遍**，列出红集与绿集（红：`-x`/`--x`/`2`/`_`/`x`/`s`/`scop`/`xcomposer-scope`/`x_composer-scope`/删类；正确绿：`is-active` 尾随多类、`scope-field composer-scope`、`composer-scope-x composer-scope`）。
- **★ 但它交回一处残留泄漏**（见下面的裁决）。

**★ Ruling T1-C（同一弱点的第四次现形，而这次是"只挡了一半"）—— 三条断言的左界改用 lookbehind。**
定向复查逐字：`hyphen-prefix (x-composer-scope, my-composer-scope) stays green while CSS would not match`——根因是 **`\b` 只挡得住词字符前缀**（`x_composer-scope` 会红），**挡不住 `-` 前缀**（`-` 是非词字符，`\b` 在 `-|c` 处成立）。**左界断言只挡了一侧，于是绿不能证明任何事。**
**★ 它同时指出：上一轮审查把 `x-composer-scopebar` 判成"特性不是漏"，那个理由站不住**——同一个 `\b…\b` 形状、同一个边界不对称。**我采纳，这条算我上一轮没抓住。**
**裁定**：三条断言（`scopeBlock` / `barTag` / chip 那条）左界全部改成 `(?<![\w-])`，与右界的 `(?![\w-])` 对称。计划已订正并提交（`b0868af`），并写明**这是同一个弱点的第四次现形**（前三次：CSS/markup 两半、调用/引入两半、只挡后缀）。
**★ 为什么不让它过去**（它本可以过去——定向复查把它标成"accepted family stance, not a defect in this fix"）：这一条的整个身份就是"**不能变红的锁是装饰**"，在这里对它自己网开一面，就等于把它降级成一句口号。
**代价（错的话）**：`(?<!…)` 是 ES2018+（Node 18 与现代浏览器都支持，本仓不受影响）。若将来有环境不支持 lookbehind，`test/ui-layout.test.ts` 会在**加载期**就抛，而不是静默失效——**失效方向是响的**。

Task 1: fix round 2/5 dispatched（resume 原实现者）—— 只有那一处；要求覆盖 `test/ui-layout.test.ts` + **四组后缀/前缀变异全红** + **两组反证仍绿**（原名、多类 token 真在），外加 chip 那条的前缀变异。

Task 1: fix round 2/5（1 addressed / 0 open — 三处左界 `\b` → `(?<![\w-])`；commits `5d3c711`..`1ba36a1`）
- **五红两绿**：A `composer-scope-x` / B `x-composer-scope` / C `composer-scopebar-x` / D `x-composer-scopebar` / E `x-workspace-git-chip` 全红；反证 原名 22 passed、多类名 `class="scope-field composer-scope"` 22 passed（**后顾没收得过紧** ✓）。
- 变异循环后 `index.html` **逐字节还原**（`git diff` 为空），`check-eol` ✅ CRLF=246 裸LF=0。
- **它自己标注了一处诚实项**：「修复前『x- 前缀未变红』的实证来自审查员侧，本报告如实标注本轮验证只覆盖修复后状态」——**它没有把别人的证据冒充成自己的**。

Task 1: scoped re-review（round 2）dispatched（sonnet）—— 包 `review-5d3c711..1ba36a1.diff`（2 笔：修复 1 笔 + 我的计划提交 `b0868af`）。
派单里点名：**"22 条绿"在这里几乎不携带信息**（改之前也是绿的），要它**真的枚举**（node + HEAD 的真实 pattern），**前缀与后缀两侧都当重点**，并明确分开"正确的绿（token 真在、CSS 仍匹配）"与"可能是漏的绿"；另要它判 `(?<!…)` 的兼容性与**失效方向**（静默失效还是加载期报错）。

Task 1: fix round 2/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- 它**对着工作树而不是 diff 验的**（`grep` 确认这个家族里没有半锁的 `\b` 残留）。
- **枚举（node v22，21×3 矩阵 + 1 伪装）**：红集 = `[\w-]` 内的一切嵌入（连字符两侧、词字符两侧、类删除、换 token）；**正确绿集** = 精确 token、多类前缀/后缀、值内前导空格（**后顾没过度收紧**，它独立复现了实现者的反证）。
- **`(?<!…)` 兼容性**：本仓支持（Node 18+ 的 V8 完整支持定长负向后顾；本机 v22 实测可用）。**★ 失效方向是"响着挂"**：正则字面量在**脚本解析期**编译，语法不支持就是**加载期 SyntaxError、整个模块解析失败**——**不会静默失效**，是安全的一侧。
- **它又交回一处规格之外的残留**：`.` / `:` / `/` 嵌入（`x.composer-scope`）仍绿，而 CSS 匹配不到——因为**计划 T1-C 逐字规定的就是 `[\w-]`**。它自己把这条划到"新的计划项、不在本修复轮范围内"，并给了彻底堵法（按 class 属性值切分，或把边界限定在 `[\s"]`）。

**★ Ruling T1-D —— 这一处停在这里（park，附理由与正解），Task 1 收工。**
**判据（诚实地说，这是关于"可达性"的判断，不是原则）**：`-` 是人在类名里**真的会用**的字符（`is-active`、BEM 的 `--modifier`），所以"连字符拼接的变体"是**可能真实发生的改名形状**——那条我修。而 `x.composer-scope` 里那几个字符**谁也不会写**（CSS 里还得转义），为它再开一轮的期望收益为负；**且正解是换机制**（按属性值切分 / 边界限定 `[\s"]`），那是该对整个家族做一次的事，不是热循环里的第三轮补丁。
**代价（错的话）**：若真有人把类改成 `x.composer-scope` 这种形状，这三条断言会**假绿**，而那两处 CSS 规则会失效、幽灵控件复活。**已连同正解记进这里，交给 final review 分诊**——它能看到完整的两侧（我的理由 + 复查者的判据）。

**Task 1: complete（commits `4b6fc7e`..`1ba36a1`，review clean，1 parked）**
- 净效果：一行 CSS 修复 + 一句说反的注释订正 + 两条新锁 + 一条既有弱锁加固 + 一个新探针（修后 exit 0；撤 CSS 后 ① 红、幽灵盒 618×28 复现）。
- **本任务的过程本身就是它的产出**：实现者抓到我两处（`block()` 坏调用、正则漏后缀），审查者抓到第三处（我自己的 `scopeBlock` 漏后缀），定向复查抓到第四处（漏前缀）。**同一个弱点四个位置，全部由"不能变红的锁是装饰"这一条判据串起来。**

**Task 2: dispatched**（implementer，sonnet）—— BASE `1ba36a1`。
派单里带了两条裁定与两条环境提示：
- ①「先探针后修」升级为必需，**本任务尤其重要**——这个 bug 的形状是"**静默覆盖**"，**测试绿不绿根本说明不了它在真机上还发不发生**；
- ② brief 里那个下钻行选择器 `.wp-dir, [data-path]` **是猜的**，升级成硬要求：**去读 `renderDirs`（`:649` 被调用）用真名**，不许留一个猜的选择器静静绿着；
- ③ 探针**必须跳过 onboarding 遮罩**（`agent.ui.pref.onboardingDone`）——**上一个任务在这上面栽过一次**，不设的话欢迎页被遮罩挡死、判据永远超时；
- ④ 全量会红 11–13 条是既有基线，**判据是"零新增"不是"全绿"**，并给了上一个实现者那套 `git stash push -u` 的基线证明法。

**Task 2: DONE**（commit `e992b47`，3 files +245/−6）
- 聚焦 31/31 绿（2 条新 TDD）；**两处变异都验红**（5.a 去掉守卫 → 粘贴测试红；5.b 去掉下钻处的 clear → `expected 'D:\root' to be 'D:\root\child'`）；**全量 11 failed = 恰好那 11 条确定性基线，零新增**。
- **活页探针 3 条判据全绿（exit 0）**；**"先探针后修"复现了计划 2 那次的覆盖、逐字节一致**（放行后输入框变成 `web-a` → ① 红、exit 1）✓。
- **★ 它报了四条偏差，其中两条是真发现**：
  - **③ brief 的 test 2 里那个假 fetch 会让 5.b 变异静默绿**（它对任何路径都返回同一个 `path`，"没清脏标记"这个缺陷观察不到）→ 它改成按路径区分。**这是计划缺陷，而且形状与 Task 1 那四处同源：一条锁不出它能红。**
  - **④ 它在 brief 列的三个程序性导航之外补了第四个 clear（面包屑点击）**——同样是程序性导航，**不补的话这个修复会新弄坏"输入框跟着面包屑走"**。**我的计划漏了一处程序性导航。**
  - ① `initWorkdirPicker` 的真实签名是 `({}, { fetch })`（brief 写的是单参）② 真实的下钻行是 `button.wp-dir`、路径在 `title`（brief 猜的 `.wp-dir, [data-path]` + `dataset.path` **一个都找不到**）。

Task 2: review dispatched（sonnet）—— 包 `review-1ba36a1..e992b47.diff`（1 笔）。
派单里要它**逐条判那四处偏差**（尤其 ③ 那个"brief 会让变异静默绿"的判断，要它自己核；以及 ④ 是必要补全还是范围外扩），并特别判两件事：**那两条测试真的能红吗**（5.b 是"守卫过界会把导航弄坏"的唯一防线）、**这个修复会不会新弄坏什么**（脏标记是闭包内状态，换 run / 连开两次的生命周期对吗）。

Task 2: review 结 —— **Spec ✅ / 质量 Approved —— 0 Critical、0 Important、4 Minor**
- ⚠️（提交信息无法从 diff 核）→ **控制者已核**：`git log -1 --format=%B e992b47` 格式与尾注都合规 ✓。
- **四处偏差全部判"对"**，且三处有硬证据：① 签名经源码（`workdir-picker.js:457/460`）+ **RED 输出收到 `'D:\start-dir'` 反证 fetchImpl 真接上了**（若按 brief 写会 undefined、`load()` 早退、**第一条假绿**）；② 选择器经 `renderDirs` 实读（只写 `wp-dir` 与 `title`，全文无 `data-path`）；③ **审查者独立推演证实** brief 的 test 2 会让 5.b 静默绿；④ 面包屑补 clear 被判**必要补全、非范围外扩**（不补的话本修复确实新弄坏它）。
- **审查者的独立工作（不是照收）**：**枚举了文件内全部 7 处 `load()` 调用点**——crumb/drill/openPicker/mkdirHere/up/go/enter，**6 处导航全清，唯一不清的 `mkdirHere` 是原地刷新**（POST 目标是 `currentPath` 而非输入框值）**判断正确** ✓；脏标记生命周期**无泄漏**（openPicker 每次 open 先清、`renderToken` 令牌检查在守卫之前、换 run = 新闭包）；5.a/5.b 的变异输出与它**独立推演逐字吻合**；行尾**独立字节核验** ✓。

Task 2: minor (deferred) ×4 —— **Ruling T2-A：全部记账本、不进循环。**
判据（要说明白，免得被读成双标）：**Task 1 那一族我一路在修，是因为那把锁本身就是它的交付物**；这里的交付物是**修复**（已验），下面这几条是**新探针的 instrumentation 缺口**，属另一个严重度类。
1. `verify-picker-paste.mjs:72-74` 的哨兵「作废」**只是日志不是行为**——字节不同步时只 `console.log` 然后继续跑、**仍可 exit 0**，与同文件 `gated=false` 处的显式 `exit(1)`（`:107-111`）不一致。（**同一族的"不能失败的哨兵"，但危害面窄：只在"宿主服务了另一个恰好也过判据的文件"时才假绿。**）
2. 探针掐的是"页面里第一个带 path 参数的 fs/list"，不锁"被掐的是浮层起点加载"（缓解：URL 打进输出、`gated=false` 会 fail-loud）。
3. **只有下钻那一处 clear 被变异锁定**——up/go/enter/crumb 四处 clear 无覆盖（brief 只要求删一处，故不算违规，但删掉其余任一无物可红）。
4. 报告 §七 里 `check-eol` 的「字节」列与实际不符（疑为字符数）；**行尾结论本身已被审查者独立字节核验证实无误**，仅是报告精度问题。

Task 2: minor (deferred) —— **提交信息少写了一处**：它写「程序性导航（下钻/上一级/前往）」**三处**，而代码清了**四处**（含它补的面包屑）——它照抄了我给的模板措辞。**Ruling T2-B：不为此开修复轮**（一句描述、代码是权威、账本与审查报告都记了这第四处），但记在这里，**并说明这个疏漏的源头是我给模板时列的是三处**。

**Task 2: complete（commits `1ba36a1`..`e992b47`，review clean）**

**Task 3: dispatched**（implementer，sonnet）—— BASE `e992b47`。
派单里带了三处裁定：
- ① **Step 1「量一个数」是必须的，且不许假装量过**——那条 `min-width` 常量的**全部价值就是它的依据**；真的去量坞头里除标签条外所有成员的固定成本，把数写进 CSS 注释；**量不出来就照实说"未实量"**（别写一个看着像量过的注释）。
- ② 改之前**先 grep 数 `.ac-tabs` 在 CSS 里有几处规则块**（`block()` 是首个匹配，多块时会拿错）——**报回来**。
- ③ **负向断言要验它真的有效**：把 `(?!0\b)` 临时去掉看第一条变绿（只写 `toMatch(/min-width:/)` 的话，现状那行 `min-width: 0` 就喂饱它、测试永远绿）。
另明写两条禁令：**不许动 `railPolicy.js`**（D3 里那个作废修法的理由）、**不许改既有的 `verify-artifact-tabs.mjs`**（它会打印 `tablist scrollLeft`，改了谁在滚那行值会变，但它只打印不判据）。

Task 3: **DONE_WITH_CONCERNS**（commit `edebe8b`）—— 它的第一条顾虑**推翻了我计划里的机制说法**。
- **实量（活页，非编）**：坞头固定成本 **190px**（padding 32 + 收起键 32 + 加号键 32 + 放大键 70 + gap 8×3），坞 159 → **余量 −31**；第一个短标签实宽 79.9 → `min-width: 6rem`，数全写进 CSS 注释。
- 24/24 绿；TDD 红→绿 + 负向断言有效性验证 + **两处变异验红**；全量隔离复跑稳定 11 条基线、零新增；check-eol ✅。
- **活页探针**：修前 ① clientWidth=0 红、② 被 `BUTTON.btn` 接走红；修后四条全绿（96px / 命中 / scrollWidth 286>159 / 0 错误）。

**★ Ruling T3-A（实现者实量推翻了我的机制叙述）—— 订正计划里"横滚永远轮不到"这句假话（五处 + 提交信息副本）。**
它的顾虑逐字：`固定成员 190>159，坞头滚动条修前已在，判据 ③ 不是前后判别器`。
**我复算了它的实量**（32+32+32+70+24=190 ✓ > 159）——**它对**。坞头修前就溢出、本来就在滚；**真坏掉的是标签条宽度为 0**（930px 内容在 0 宽盒子里一个像素也露不出来）。**三个代价**：① 计划里那句机制错（连带 Step 1 的算式**可能是负的**，实测 −31）；② 探针判据 ③ 被当成"前后判别器"用，**它不是**（修前也成立）——它是好的**回归护栏**，但理由必须改；③ `.ac-tabs` 号位偏了三处（实读只有 `:9602`）。
**裁定**：五处全订正（含 Step 8 提交信息里的副本——**它带着同一句假话**），计划已提交（`e6d7c30`）；并如实写明"实现者实量后指出了这一点"。
**★ 值得记的一句**：`实现者已经把仓库里那条注释改对了`——它写的是实量数字、没有那句假机制。**所以这一笔只动计划。**
**代价（错的话）**：那条 `min-width: 6rem` 的依据是"第一个短标签实宽 79.9 + 余量"；若别的语言/字体下标签显著更宽，96px 可能装不下第一个标签的完整文字——但那时**判据 ②（中心点命中）仍会成立**（标签有宽度、可点），只是显示被截——属可接受的退化。

Task 3: fix round 1/5 dispatched（resume 原实现者）—— **只改探针头部那两行**（`③ …证明修法走的是作者写的那条路` → 重新定性为回归护栏、并明写真正的判别器是 ①②）；要求跑一次探针证明**输出未变**（本轮只改注释）。CSS 注释**保留它自己的版本**（它写得对，去掉假机制句、带实量数字）。

Task 3: fix round 1/5（1 addressed / 0 open — 探针头部措辞；commits `edebe8b`..`56b5158`）
- 改后重跑探针 **exit 0、四条输出与改前逐行相同**（96px / 命中 / 286>159 / 零）✓ ——**这正是"本轮只改注释"的证据**；`check-eol` ✅ CRLF=245 裸LF=0。

**Task 3: review dispatched（覆盖实现 + 修复轮整体）**（sonnet）—— 包 `review-e992b47..56b5158.diff`（3 笔：实现 + 我的计划订正 `e6d7c30` + 注释修复 `56b5158`）。
**★ 顺序说明**：技能的正常次序是"先任务审查、再修复轮"。这里是**实现者报 DONE_WITH_CONCERNS、而那条顾虑推翻了计划的机制叙述**，所以我先处理了它（订正计划 + 一轮注释修复），**再派一次覆盖全范围的任务审查**——比拆成两次更省，而且审查者能看到完整的因果。
派单里交代了三件事实并要求**独立核**：① **"坞头修前已在滚"这个推翻对不对**；② 判据 ③ 的重新定性对不对；③ 并要求核三件事——**那条 `min-width: 6rem` 的依据算式**（`32+32+32+70+24` 是不是 190、这些成员是不是真在坞头里）、**两条测试真的能红吗**（尤其负向断言的证据）、**`.ac-tabs` 是否真的只有一处规则块**（`block()` 是首个匹配）。

Task 3: review 结 —— **Spec ❌ / 质量 Needs fixes —— 0 Critical、1 Important、1 Minor**
- **那三点判决全部成立**，而且它的核法比我要求的更硬：
  - **推翻是对的**：CSS 层面 `.ac-tabs` 是坞头里**唯一 `flex-shrink` 非 0 的成员**（其余全是 `flex: 0 0 auto`）⇒ 修前 `scrollWidth(190) > clientWidth(159)` 已成立 ✓。
  - **常量的依据成立**，且它做了**闭合校验**：修后 `scrollWidth 286 = 190 + 96` **一分不差** ——「若有第五个占位成员，这账合不上」。它还核了 `.ac-title` 不在坞头里（挂在坞根且 `sr-only` 出流）✓。
  - **负向断言那条推演得很细**：新块注释里的 `min-width:0，`（**全角逗号是非词字符，`0\b` 成立**）也被负向断言挡住——**注释文本不会误喂饱断言** ✓；变异 A（删行）后块里只剩注释那处 → 无匹配 → 红 ✓。
  - 行尾**独立字节复验** ✓；还查清了报告里"字节 X/Y"与文件实际字节数不同是 `check-eol.mjs:64` 打印 `string.length`（UTF-16 单元）而非 UTF-8 字节——**不是造假，差值全对得上**（它连这个都去核了）。

**★ 那条 Important 指出的是我上一轮的错判。** 我说"实现者写的 CSS 注释是对的、保留"——审查者证明**我错了**：`styles.css:9609` 保留的那句「**但那个横滚只在成员都不能再缩时才触发**」**正是被推翻的那句**，而 `:9618`「坞头随即横滚，作者写的横滚意图才真的生效」**暗示修后才开始滚**——**与同一条注释里自己的 190>159 自相矛盾**；`test/ui-layout.test.ts:252-253` 的 docstring 同样是订正前文案。**⇒ 订正只传到计划与探针，没传到出货文件。**
它的话比我说得准：*"无行为影响，但本计划的存在意义就是清 doc/事实漂移，且 **CSS 注释是后人先读的东西**。"*

Task 3: minor (deferred) —— 我那次订正留下的三处编辑残渣（残行 / 缩进不齐 / 三处旧号位）——**★ 我当场清了**（见下）。

**★ Ruling T3-B —— 控制者清自己订正的残渣（`fd49d96`）。**
审查者报、我自己 grep 复核：`e6d7c30` 那次订正留下 ① 多一行「标签一个也看不见。」（原块 4 行、替换给 3 行）② 新插三行缩进是 ` * ` 而周围是 `   * ` ③ `.ac-head` 号位写 9535-9546（**实读 9551**）、`.ac-tab-add` 写 9646-9651（**实读 9677**）。
**这不是"控制者不该改文件"的例外**——`fd49d96` 只动**计划**（控制者自己的产物），仓库文件一律走实现者 ✓。
**代价（错的话）**：无行为影响；若号位写错，后来者按它去读会读错行——而这次正是靠"回原始处 grep"发现的。

Task 3: fix round 2/5 dispatched（resume 原实现者）—— 只有那一处 Important：**把订正传进两个出货文件**（`styles.css:9609` 与 `:9618` 各一句、`test/ui-layout.test.ts:252-253` 的 docstring），逐字给了替换文本；要求**跑聚焦测试 + 探针证明输出未变**（本轮只改注释）+ `check-eol`。

Task 3: fix round 2/5（1 addressed / 0 open — 三处注释订正；commits `56b5158`..`88500a8`）
- 聚焦 24/24；**探针 exit 0、四条输出与上一轮逐行相同** ✓；`check-eol` 三文件 ✅ 裸LF=0、与 HEAD 逐字节相同。
- 它自报：**"审查者的点成立：那句假机制与同一条注释里的 190>159 自相矛盾，已清"** ✓。

Task 3: scoped re-review（round 2）dispatched（sonnet）—— 包 `review-56b5158..88500a8.diff`（2 笔：注释修复 + 我的残渣清理 `fd49d96`）。
**派单里点名的重点不是"改没改"，而是"改后的话是不是真的了"**：逐句判三处有没有**新的**不实/过强陈述、三处彼此之间与 CSS 规则本身是否自洽、与探针实测（修前 ③ 绿/① 红、修后 ① 0→96）是否对得上——**这一条 finding 的由来就是"注释说了它证明不了的东西"，所以复查的目标是那件事不再发生**。

Task 3: fix round 2/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- 它**逐句**核了改后的措辞，且全部**对着探针实测**：说「那条横滚滚的是坞头自己那一行」与修前 ③ 绿一致 ✓；说「这条下限改的是标签条自己的宽」与修后 ① 0→96 一致，**且没有声称 `.ac-tabs` 的 `overflow-x:auto` 被移除** ✓；说「不再关在一个 0 宽的盒子里」**措辞精确到"脱离 0 宽盒"而不是"不再溢出/不再滚动"** ✓。
- 它还点出第三处的修正**因果**：原句的"才"错挂在"横滚触发"上，现在挂在"内容脱离 0 宽盒"上——**"关键修正"**。
- 全仓 grep 五个旧短语，`ui/`、`test/`、`eval/` **零残留** ✓。

**★ Ruling T3-C —— 复查者又在计划里找到三处同源的残渣，我清了（`0dfc148`）。**
它的警告逐字：*"计划是后续任务逐字照抄的规格，这两个模板若被下一个实现者逐字复制，**本轮 finding 的病灶（订正没传遍）会在出货文件里复发**。"*
三处：① Step 2 的测试 docstring 模板尾句仍是旧假机制（而上一行我已订正——**自相矛盾**）② Step 8 提交信息模板**整行重复**（我那次 splice 加了行、原行没删）③ 同模板尾句仍是旧说法。
**★ 这轮最有价值的一句是：订正本身也要被复查。** finding 的由来是"我的订正没传遍出货文件"，而复查者在**计划里**找到了同一个病的另外三处。

Task 3: minor (deferred) —— **已落库的提交 `edebe8b` 的提交信息里带着那句旧尾句**（它逐字用了我的模板，而模板当时还是旧的）。**不改写历史**（会动后续所有 SHA 与已出的复查包引用），记账本留痕。

**Task 3: complete（commits `e992b47`..`88500a8`（+ 控制者的 `e6d7c30`/`fd49d96`/`0dfc148` 三笔计划提交），review clean）**

**Task 4: dispatched**（implementer，sonnet）—— BASE `0dfc148`。**第一个有实质新代码的任务**。
派单里带了四条裁定：① **Step 1「先读 `git()` 执行器」不许跳过**（它有自己那套"git 不可用一律降级、不抛"的语义，抄错会让整条链在非 git 目录上抛）；② **Step 6 里我给的 `resolveInWorkdir` 调用是按语义写的、不是读来的**——它的真实签名在 `src/tools/fs-util.ts:63`，但**返回什么、拿不到时抛还是返 null 我没读**，要它去读；③ 路由与 handler 照 `ui/server.ts:9450-9465` 与 `:11653-11657` 的既有写法抄，别自创；④ 「先探针后修」不适用（这是新增能力），但**判据 ③（非 git 目录）要真的另找一个目录打**，别拿同一件事重复验。
另要求：**六条降级/边界都有测试**，其中"未跟踪"与"`write_file` 覆盖"两条是**核心断言**（它们锁的正是"这条链补上了事件流补不上的那个洞"），并至少挑两条做变异验红。

**★ 环境事故与处置（Task 4 跑着的时候）**：后台 bash 任务报"completed (exit 0)"——**那是 shell 包装器退出了，node 子进程活在原地**（记忆里那条"Windows 停后台任务杀不干净 node 子进程"的镜像）。我按"先认准是谁"的纪律查了：`netstat` 找到 PID 36312 LISTENING 在 4201，PowerShell 拿命令行**逐字匹配我起的那条**（`ui/serve.ts` + audit.env），父进程 33340 是 tsx 包装器。
- `curl` 第一次返 `000`（瞬时），**重试即 200**，`/styles.css` 也 200 ⇒ **宿主是好的，不动它**。
- `preview_start("fathom-audit")` 报"端口已占用"——**那是对的**（检测到已在跑的服务），不是失败。
- **★ 已主动告知实现者**：若碰到连接错误/超时，**重试一次、别据此报 BLOCKED**（`TIME_WAIT` 显示它确实试着连过）。
- **未做的处置与理由**：没有 `taskkill`。它的命令行与我起的那条逐字一致、服务也正常响应——**杀一个正在正常工作的进程，风险大于收益**。
- **风险留痕**：宿主**不再挂在任何 harness 任务下**，它若真死了不会有通知；后续任务若报连不上，我按 `netstat → PowerShell 认命令行 → taskkill //T` 处置。

Task 4: **interim** —— 实现者停在自己那个后台全量测试上（"once it lands I'll do the zero-new comparison, re-run the two mutation experiments, commit, and write the report"）。**它还会再报一次**，等它；**不预测、不抢跑**。已看到的状态：工作树是它那六个文件 + 预存的 `mcp.json`（它没碰）✓。

Task 4: **DONE**（commit `98d8baf`，6 files +463/−2）
- 聚焦 27/27；两条变异各自**只**红对应那条测试（`expected +0 to be 3` / `expected false to be true`）；`tsc --noEmit` 干净；全量 16 failed = 11 基线族 + 5 条 load 抖动（**隔离复跑那三个文件 28/28 全绿**）⇒ **零新增**；`check-eol` 六文件 ✅ 裸LF=0。
- **活页探针 exit 0，四条判据全绿**（行号 hunk / 未跟踪全 `+` / 非 git 人话 / 越界 400）。**控制者独立复核**：`GET /api/workspace/git/diff?…&path=src/app.js` 返 200，内容带 `@@ -1 +1 @@` 与 ± 行；不带参数返 400 ✓。
- **★ 它报了三条 brief 缺陷，全是我的错**：① **`resolveInWorkdir` 越界时是「抛」不是「返 null」**（我那段圈禁代码是按语义猜的）② **`.root \|\| listed.path` 过不了 typecheck**（联合类型里没有 `root`）③ 无类型的 `git` 助手在严格 tsc 下不过。
- **它另报两条要传下去的事实**：④ **git 2.54 会给 `@@` 头追加 section heading**，它逐字保留、截断测试用前缀匹配（**消费方将来要解析这个 header，任务 6 必须知道**）⑤ **handler 按「仓库 root」解析 `path`**（按 brief 写），它明确提示"消费方必须知道这个契约"。
- 它没写 `progress.md` ✓（那是控制者的账本，它认出来了）。

**★ Ruling T4-A（我自己计划里的错）—— 计划不许把署名尾注写死。**
它报：提交信息逐字用了 brief，**只除了署名行**——它环境强制它署 `Claude Sonnet 4.6`，而计划写的是 Opus 4.8 那个。
**这是我的错，不是它的**：我把那条署名行写进了 Global Constraints 的硬规则、又在七个任务的模板里逐字复制——而**执行者是各自的子代理，各有各的署名要求**。**一条计划约束若与执行环境冲突，该改的是计划。**
**裁定**：8 处硬编码全换成占位说明 + Global Constraints 那条写明原因（`0fd12cb`）；**前面三个任务已提交，不改写历史**。
**代价（错的话）**：若环境**没有**强制署名行，模板里的占位说明会让实现者停下去问——**响着停，不是静默错**，可接受。

Task 4: review dispatched（sonnet）—— 包 `review-0dfc148..98d8baf.diff`（1 笔）。
派单里要它判**三条 brief 缺陷改得对不对**（尤其第 1 条：**抛异常那条路径有没有测试覆盖、有没有把异常漏成 500**）、以及它报的两条契约（`@@` 头带 section heading 的处置、handler 按仓库 root 解析 path），并特别判四点：**那两条核心断言真的锁住了那个洞吗**（未跟踪全 `+` / `write_file` 式覆盖）、**六条降级都有测试吗**、**两条变异验红对应的是不是被锁的行为**、**越界返 400 而不是 500**。

Task 4: review 结 —— **Spec ✅ / 质量 Approved —— 0 Critical、1 Important、5 Minor**
- **它把三条 brief 勘误全判为正确**（亲读 `src/tools/fs-util.ts:63-93` 确认"词法越界抛 / symlink 越界抛 / root 不存在抛"，确实**抛不是返 null**）；事实 ④（git 2.54 section heading）的处置判对（**所有对 git 产出的 header 断言都用前缀正则**，精确等值只用于自己合成的未跟踪 header）；**七条测试、四条降级、两组变异、EOL 逐字节全部验真**。
- **它自己核了变异的判别力**：变异 A（`??`→`ZZ`）→ 未跟踪判据失效 → `added` 收 0 对期望 3 ⇒ 与 `expected +0 to be 3` 吻合；变异 B（上限改 `MAX_SAFE_INTEGER`）→ 截断永不触发 ⇒ `expected false to be true` ✓ **两条都只红被瞄准的那一条**。

**★ Ruling T4-B —— 订正计划里那半句假话，并把契约写进计划（`41529a5`）。**
审查者抓到（Important）：计划里「path 必须是相对 root 的、**且落在 workdir 内**」——**后半句在 workdir 是仓库子目录时是假的**：圈禁按 root 查，相对 root 的 `../sibling` **能通过圈禁却逃出 workdir**。**更要紧的是契约本身没写进消费者会读的地方**——下一任务若按 workdir 相对传 path，**会静默取错文件，不是报错**（本仓最贵的那类）。
**代价（错的话）**：若我把契约写反了，任务 6/7 会照错的写——但它现在被写进了三处注释 + 计划，**任何一处被读到时都能发现矛盾**。

**★ Ruling T4-C —— 一条 Minor 我裁定「也进这一轮」。** Minor #2（`path` 指向**目录**时 `readFileSync` 抛 EISDIR、不在任何 try/catch 内 → **漏成 500**）。
**理由要说明白**（免得被读成双标）：规则说 Minor 不进循环是**为了防 churn，不是为了放过一个 500**；而它的修法与 #1 同处、边际成本一行。
**另加一条证据要求**（Minor #5）：brief 指定的两条核心断言里，「`write_file` 式整文件覆盖」那条**没被变异验红**——审查者已用推演证明它有判别力，但**推演不是原始输出**，要补一组。

Task 4: minor (deferred) ×3 —— `maxBuffer 1MB` 先于 256KB 截断炸（降级成 GIT_FAIL_NOTE 而非 `truncated:true`）· 已删除的跟踪文件因 `existsSync` 门在先而给"盘上没有这个文件"（brief 继承的限制，非实现错误）· handler 无单测（与既有 `workspaceGitGet` 风格一致，brief 指定由活页探针覆盖）——**留给 final review 分诊**。

Task 4: fix round 1/5 dispatched（resume 原实现者）—— #1 契约写进两处 docstring + 圈禁改成同时落在 root 与 workdir 内；#2 目录路径不许漏 500；#5 补一组核心断言的变异原始输出。**要求重跑活页探针**（尤其判据 ④ 越界 400——**它改了圈禁，这条必须重验**），**并新增一条判据**：`path` 指向目录时不是 500。

**★ Ruling T4-D（预防性，控制者侧）—— 把 root 契约提前写进 T6/T7 消费方会读的位置（`729dc13`）。**
T4 审查那条 Important 的实质是"**契约没写在消费者会读的地方**"。我趁 T4 修复轮在跑，grep 了计划里同一个病**还没发作**的那一半：那条契约（`path` 相对**仓库 root**）**只出现在 Task 4 的几行里**，而 **T6 的 Interfaces、两处调用点、T7 的 Consumes 一个字都没提**。
补到四处消费者会读的位置（T6 Interfaces / T6 展开取 patch 那步 / T6 Step 7 展开体 / T7 Consumes）+ Self-Review 的类型一致性那条。**契约在计划里从 0 处变成 4 处。**
**★ 这条的意义不在内容（契约本身是 T4 定的），而在位置**：同一个契约写在做的人读不到的地方，等于没写。
**代价（错的话）**：只是多几行字；若我理解错了契约，T4 的三处注释与计划的四处会互相矛盾——**矛盾可被发现，静默取错文件不可**。

Task 4: fix round 1/5（3 addressed / 0 open — 契约三处 + 圈禁双检 + 目录不 500 + 变异 C 证据；commits `98d8baf`..`481d7b6`）
- **★ 它纠正了我的一个指示**：我说"用 `isInside`"，它去读发现**那是私有未导出的**（`src/tools/fs-util.ts:96`），于是**没有为它改 `fs-util.ts`**，改用公开的 `resolveInWorkdir` 做第二道（其 docstring 支持绝对路径，lexical+symlink 同一套逻辑）。**我给的指示没核过导出性——它核了。**
- 三处 docstring 写上契约 ✓（**我 grep 复核**：`workspace-git.ts:229` / `server.ts:11677` / `workspace-git.js:27`）；圈禁双检 `resolveInWorkdir(root, rel)` + `resolveInWorkdir(listed.path, abs)`；`statSync().isFile()` 拦目录（EISDIR 不再漏 500）。
- **变异 C**（强制走未跟踪合成）把核心 `write_file` 测试打红（`expected false to be true`）✓ —— **Minor #5 的证据补上了**。
- 聚焦 28/28；`tsc` 全绿；全量 12 failed **全在基线家族**、零新增；**探针五条判据全绿**（④ 双检后仍 400 ✓、⑤ 目录 200 + note 非 500 ✓）。
- 它自报一条抖动（既有测试「discard 后切换」聚焦时曾负载超时一次，单独跑 797ms 过）——**如实标注为抖动非回归** ✓。

Task 4: scoped re-review（round 1）dispatched（sonnet）—— 包 `review-98d8baf..481d7b6.diff`。
派单里点名要判三件事：① **圈禁双检真的堵住了吗**（判那个组合能不能挡住"相对 root 能到、但落在 workdir 之外"，以及有没有引入**新的误拒**）；② **它改用 `resolveInWorkdir` 做第二道的选择对不对**（有没有把语义搞偏、把"不存在也当越界"之类混进来）；③ 目录守卫**拦的时机**与**返回的不是另一个 500**。另要它判变异 C 的原始输出是不是真的对应那条断言。

Task 4: fix round 1/5 re-review 结 —— **All findings addressed，无新 Critical/Important** ✓
- 三条都验到底：**逃逸例走了一遍双检**（第一道归一化后落在 root 内 → 通过，**那正是原洞**；第二道 `isInside(root/sub, root/sibling)` → false → 400）✓；**误拒排查**（workdir==root 平凡通过、子目录的正常路径通过、**Windows 大小写不影响**——`path.win32.relative` 双方 lowercase）✓；守卫时机（`rev-parse` 已包 try/catch、`existsSync` 不抛、守卫正好卡在 EISDIR 源之前）✓；变异 C 的失败测试名/断言值/断言顺序三处逐字吻合 ✓。
- **★ 它判我的建议更差**："若按控制者建议**只导出 `isInside`，symlink 逃逸变体反而拦不住**"——`resolveInWorkdir` 的 lexical 层就是 `isInside`，**外加 realpath 层** ⇒ 实现者的选择比我的指示好。

**★ Ruling T4-E —— 计划里 handler 片段的代码还是旧的（订正没传遍，第三次长在我自己的产物里，`7f7c723`）。**
复查者的越界观察逐字：「我那笔 `41529a5` 改了片段**上方**的注释，但片段**本身**仍留着 `if (!abs)` 假 null 检查与 `.root || listed.path`（过不了 tsc 那行）——**计划文本与它自己的新注释自相矛盾，未来实现者照抄会复现本轮刚修掉的两个坑**。」
**对。这是同一个病在本计划里的第三次**：① `styles.css` 的注释（任务 3）② 计划的 docstring 模板（T3-C）③ 计划的**代码片段**（现在）。**三次都是别人审出来的。**
订正：`.root ||` → `gitSnap.present ? gitSnap.root : listed.path`；`if (!abs)` → try/catch 双检；**并补一条警告**：**"传错基准会拿到 400"这句话是错的**——`workdir=root/sub` 时传 workdir 相对的 `sub/file.txt`，双检全过、**静静地返回另一个文件的 patch**。

**★ Ruling T4-F —— 一条 Minor 我裁定进这一轮。** `workspace-git.js:28-29` 那句「workdir 相对路径会被 400 挡下」**说得过满**：真实失效形态是**静默取错**，不是 400。
**理由**：它写在**消费方会读的 docstring** 里、给出的是**一个错的失效模型**（"传错会看到 400"，而实际不会）——**与本任务那条 Important 同一个形状**（契约写在了消费者会读的地方，但**写的是错的**）。而这一整份计划的意义就是消灭这一类。

**Task 4: fix round 2/5 dispatched**（resume 原实现者）—— 只改那一处 docstring，照计划里刚补的口径写；要求跑一次聚焦测试 + `check-eol` 证明无行为变化。

Task 4: fix round 2/5（1 addressed / 0 open — docstring 那处；commits `481d7b6`..`43b9371`）
- 只改 `ui/public/features/workspace-git.js` 的 `fetchFilePatch` 注释；聚焦 `12 passed`；`check-eol` ✅ CRLF=446 裸LF=0、与 HEAD 逐字节同。
- **控制者复核**：那段现在既写了契约（path 相对仓库 root + 从 `/api/workspace/git` 拿 `root` 再拼），**也写了真实失效形态**（"传错基准不会报错，会静默取错…双检全过…返回另一个文件的 patch"）✓。

Task 4: scoped re-review（round 2）dispatched（sonnet）—— 包 `review-481d7b6..43b9371.diff`。
**派单里要它逐句核那段话的每个断言是不是真的**（这一整条 finding 的由来就是"docstring 里写了错的失效模型"），并点名要它**自己去读 `probeWorkspaceGit` 的返回类型**确认那个「先拿仓库根再拼 path」的指引对不对——**不许信报告**。

Task 4: fix round 2/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- 它**逐句核了那段话的每个断言**：`path` 相对 root ✓（handler 实读 `server.ts:11690-11698`）；**"先拿仓库根再拼 path"的指引对**——它自己去读了 `publicWorkspaceGit`（`src/workspace-git.ts:362-372`）确认 `present:true` 时确实带 `root` ✓；那个例子**逐环验过**（两道圈禁都与"文件是否存在"无关地通过 ⇒ "双检全过"成立）✓。
- **★ 但它交回半格过宽**：「传错基准**不会报错**」作为**全称句**宽了——错基准里**越出边界**的形状（传 `../x.txt`）**仍会 400**；只有**落在边界内**的才是静默取错。**而那句话是我上一轮逐字指定的**——上一轮我刚因为它"过满"开了一轮。

**★ Ruling T4-G —— 收紧那句全称（`5f4e072`，计划侧）+ 第 3 轮修复（仓库侧），并声明这是 T4 的最后一轮措辞修复。**
改成双侧对照（越出边界 → 400；落在界内 → 静默取错），并点明服务端**无法识别"基准传错了但恰好落在界内"**——**那正是它静默的原因**。
**★ 我同时给了这条裁决一个上界**：**后续复查若再提"某个词的精度"，记账本交 final review，不再开轮。**
理由：**这一条的价值已经拿到了**（"失效形态是静默取错"这件事说清楚了），而**措辞精度的边际收益开始低于轮次成本**；更要紧的是**循环必须有界**，否则"把每句话都改到精确"会变成不收敛的自我指涉。
**代价（错的话）**：那句在仓库里比严格事实宽半格，直到 final review 或有人重读时被改；而**计划里那份已是精确版**，两者不一致本身是可见的。

Task 4: fix round 3/5 dispatched（resume 原实现者）—— 只改那半句话，照计划 `5f4e072` 的口径；要求跑聚焦测试 + `check-eol` 证明无行为变化。

Task 4: fix round 3/5（1 addressed / 0 open — 那半句；commits `43b9371`..`f1dcde2`）
- 只改 `workspace-git.js` 的 ★ 警告段，按计划口径逐字；聚焦 `12 passed`；`check-eol` ✅ CRLF=449 裸LF=0、与 HEAD 逐字节同。
- **控制者复核**：那段现在与计划逐字一致、且是**双侧对照**（越出边界 → 400；界内 → 静默取错，并点明服务端无法识别"恰好落在界内"）✓。
- 实现者确认收口：「按协调者明示，T4 措辞类到此收口，后续交 final review」✓。

Task 4: scoped re-review（round 3，窄范围）dispatched（sonnet）—— 包 `review-43b9371..f1dcde2.diff`（2 笔：一行注释 + 我的计划提交）。
派单里**明确限定了范围**：只判两件事（**改后那段是不是双侧对照、两侧都对**；**有没有引入新的不实/过强表述**），并**明写不许提超出这两点的措辞建议**（「控制者已明示：T4 的措辞类问题到此收口，再有的记进账本交最终审查」）——**这是给这条循环上界的执行动作**。

Task 4: fix round 3/5 re-review 结 —— **All findings addressed** ✓，但抓到我给的例子**归属错了**。
复查者逐字：「`resolveInWorkdir(root, "../x.txt")` → `path.resolve` 得 root 的父级/x.txt → `isInside` 失败 → **第一道就抛**。真正由**第二道**挡下的是'留在 root 内但逃出 workdir'的形状，如 `sub/../x.txt`。修复作者把例子串改成了裸 `../x.txt`，却保留了'第二道'的归属，**这一处小失实是新引入的**（旧文无此句）。」

**★ Ruling T4-H —— 那是事实错误不是措辞精度，修（计划 `62f05a2` + 第 4 轮）。**
**我自己用 node 核了一遍**（`root=D:/repo`、`workdir=D:/repo/sub`，**第一次核时我拿正斜杠比 `path.resolve` 的反斜杠结果、自己错了**，归一后）：
| rel | 绝对路径 | 谁挡 |
|---|---|---|
| `../x.txt` | `D:/x.txt` | **第一道** |
| `sub/../x.txt` | `D:/repo/x.txt` | **第二道** |
| `file.txt` | `D:/repo/file.txt` | **第二道** |
| `sub/file.txt` | `D:/repo/sub/file.txt` | 双检全过 ⇒ 静默取错 |
**⇒ 复查者是对的，而且第二道不冷门**：连 root 层一个普通文件都归它管。
**★ 这一处是我在"改到精确"的过程中新引入的**——正是 T4-G 那个上界所预言的：**每一次改到精确都可能引入新的不精确。**
**代价（错的话）**：读者排错时会去看错的那道守卫；但**可观测行为（400 / 静默）两侧都是对的**，所以危害限于"理解"，不限于"结果"。

**★ Ruling T4-I —— 第 4 轮我偏离了技能的一条规则，理由记下。**
技能说「第 4-5 轮改用**新实现者 + 更强的模型**」，理由是"循环活过三次通常意味着实现者看不见自己的问题"。**这里不是那种情况**：实现者两次都**照我说的做了**，**错的是我的指示**（两次都是——先是指定了一句全称句、再是给了一个归属错的例子）。⇒ **继续 resume 原实现者**（它上下文完整，而这是三个词的改动）。
**代价（错的话）**：若真正的病因其实是它看不见自己的问题，那么这一轮会白跑——但**下一轮就是第 5 轮**，按规则无论如何要换人，**损失封顶一轮**。

Task 4: fix round 4/5 dispatched（resume 原实现者）—— 按形状分开说（哪个例子归哪道守卫），逐字给了替换文本；**并声明了最终边界**：T4 到此收口，后续无论措辞还是正确性一律记账本交 final review，**除非它会让 T5/T6/T7 做错事**。

Task 4: fix round 4/5（1 addressed / 0 open — 守卫归属；commits `f1dcde2`..`1d4ec84`）
- 只改 `workspace-git.js` 的 ★ 警告段，按计划 `62f05a2` 口径逐字；聚焦 `12 passed`；`check-eol` ✅ CRLF=450 裸LF=0、与 HEAD 逐字节同。
- **控制者复核**：那段现在按形状分开说（`../x.txt` → 第一道；`sub/../x.txt` / root 层 `file.txt` → 第二道；`sub/file.txt` → 双检全过 ⇒ 静默），与我用 node 核出的真值表逐行一致 ✓。

Task 4: scoped re-review（round 4，窄范围）dispatched（sonnet）—— 包 `review-f1dcde2..1d4ec84.diff`。
**★ 一处措辞上的自我校正**：我原本要在派单里写"不许再提别的"——那是**预先判定**（技能明写不许叫 reviewer 别报某事）。改成**范围说明 + 路由说明**：*"本轮的检查面就是这一处归属；**超出这个范围的发现请照常报出来**——管理方式不同而已：我记进账本交最终全分支审查（而不是再开一轮）。**没有什么是你不该说的。**"*
**差别是实质的**：前者是"别报"，后者是"照报、只是我不再开轮"——**而后者才能拿到信息**。

Task 4: fix round 4/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- 它**自己把四个例子的路径归一化重推了一遍**（对着 `fs-util.ts:63-93` 的真实实现：`path.resolve` 先词法折叠 `..`、绝对路径覆盖 base；以及 handler 那两次真实调用），**四个归属全对** ✓，且"是哪一道挡取决于形状"的总括句成立 ✓。
- **它留了两条边角注记**（**按我的路由说明进了账本、不占轮次**）：
  1. 若**仓库 root 恰是盘根**（如 `D:\` 本身是 git root），`path.resolve` 会把 `..` 钳在根内 → `../x.txt` **不逃出 root** → 那时归**第二道**挡。⇒ 注释里"连 root 都逃出去"在**该极端形状下不成立**（而对常见形状成立）。
  2. 若那文件是**指向圈外的 symlink/junction**，第一道调用内的 realpath 检查（`fs-util.ts:76-81`）会**先抛** → 归属变第一道。⇒ 注释的归属针对的是**纯 `..` 归一化形状**，此前提下成立。

**Task 4: complete（commits `0dfc148`..`1d4ec84`，review clean，4 轮修复全清）**
- 交付：`probeFilePatch` + 契约注释（三处）+ `GET /api/workspace/git/diff` + `fetchFilePatch` + 7 服务端 + 2 前端测试 + 一个新探针（四条判据 + 目录 200 非 500）。
- **★ 四轮修复的账**：第 1 轮修的是**真缺陷**（契约没写在消费者会读的地方 + 目录漏 500）；**第 2/3/4 轮修的全是注释里的一句话**——而其中**两次的错源是我**（我指定了一句全称句、我给了一个归属错的例子）。
- **★ 这一段的元教训**（已写进计划的 Global Constraints）：**"改到精确"会引入新的不精确**——所以**循环必须有界，而上界得由控制器自己执行**（光说不够，要写进派单、要改成"照报但不开轮"的措辞）。

Task 4: minor (deferred) ×5 —— maxBuffer 1MB 先于 256KB 截断炸 · 已删除文件给"盘上没有这个文件" · handler 无单测 · **上面那两条边角注记** —— **留给 final review 分诊**。

**Task 5: dispatched**（implementer，sonnet）—— BASE `1d4ec84`。

**★ 控制者在等待期间看到的一件事（计划缺陷，等实现者报告确认）**：它的工作树里有 `M test/ui-artifact-canvas.test.ts`——**而我的计划 Files 列表里没有这个文件**（只写了新建 `test/ui-artifact-route.test.ts`）。**改寻址形态必然要动既有测试里按下标寻址的断言**，而我的 Self-Review 里那节"与既有测试的冲突预判"**给 T3/T4/T7 都写了、唯独漏了 T5**。
**它自己认出来并处理了**（工作树是证据）。**等它报告——若它没主动说这件事，我会追问**（"改了 brief 没列的文件"是必须报备的那类）。

**环境复查（等待期间）**：宿主仍活着（`/` 与 `/api/runs` 都 200）✓ —— 它是无人管的，T6/T7 还要用它。分支自 main 已有 26 笔提交。

Task 5: **DONE**（commit `53a99b9`，5 files +415/−34）
- **TDD**：route 测试 RED 4/7（**brief 预测 3 条红**——第 4 条红是因为**旧返回形状里没有 `path` 键**，实现者把这条差异也记了）→ GREEN 7/7；连同 canvas 测试 100/100。
- **两处变异原始留档**：5.a → **恰好安全绳那条红**；5.b → 测试 1-3 红；都还原复验绿 ✓。
- **★ 它撞上并修好了 CRLF 陷阱**：「caught and repaired **3 EOL drifts** pre-commit, incl. a **`sed -i` CRLF→LF incident** — **mutations re-done via node**」✓ —— 正是本仓记忆里那条（整文件重写的工具会把 CRLF 写成 LF），**它自己发现、自己改回去、并且把受影响的变异重做了一遍**。
- 活页探针（真点真改地址栏，run `94f58b8a` / 7 产物）：**①②③④ 全过 + ⑤ `?full` 往返过** ✓；④ 的"有话说"落在画布兜底卡上，**它如实记了一条预期的 fetch 404**。
- 全量 `12 failed / 3695 passed` 全在已知基线族、零新增 ✓（多出的那一条在隔离下 10/10 过，是 load 抖动）。

**★ 它报了 6 条 brief↔repo 偏差，全是我的问题**：
1. **★ brief 漏了写出点**——`applyHash` 的跨 run 改写、`onSwitch`/`onExpandChange` **也是写 hash 的地方**，不改的话**它们还在写下标形态**（我的计划只列了四处）。**这是最要紧的一条："hash 是唯一的寻址真值源，所以每一个写它的地方都必须写路径形态"——而我的清单不全。**
2. **brief 6.c 把 `full` 丢了**——会弄坏既有的「`?full` 往返」契约（放大态深链）。
3. 既有 `test/ui-artifact-canvas.test.ts` 的改动**不在 brief 的文件列表里**（**控制者在工作树里独立看到了这一点**）。
4. brief 的行号普遍偏了 ~+7..+33。
5. brief Step 7 把目录名写成 `_audit_20260919`（正确形式是带连字符的 `_audit-20260919`）。
6. 判据 ④ 的"announceStatus / 0 控制台错误"预期与"先记住再解析"的实际机制不符。

Task 5: review dispatched（sonnet）—— 包 `review-1d4ec84..53a99b9.diff`（1 笔）。
派单里要它**逐条判那 6 条偏差**（尤其①漏掉的写出点是否真实存在、改得对不对；②`full` 是否真被丢了），并特别判五点：**`openCanvas` 的签名真的没动吗**、**旧形态真的仍认且新旧两条路都能红吗**、**含 `/`／空格／`?`／`#`／中文的路径往返对吗**、**两处变异对应的是不是被锁行为**、**★ 并要它自己数一遍 diff 里所有写 hash 的点、判断还有没有漏网的**（"brief 就是漏了才被抓"）。另要它判那条**探针运行时的 fetch 404** 是"预期"还是真缺陷。

Task 5: review 结 —— **Spec ❌ / 质量 Needs fixes —— 0 Critical、1 Important、5 Minor**
- **它逐条判那 6 条偏差全部属实、改得对** ✓；**自己数了一遍全部 4 个写 hash 的点（`index.html:954/2232/6335/6345`）——没有漏网** ✓；并判**实现者的 `artifactRefForIndex` 退回数字形态比 brief 的 `?? ""` 更好**（后者会写出正则不认的死链）✓。
- 它独立**字节复核**了 5 个文件的行尾（零裸 LF，与报告逐字吻合）✓；判那条 **fetch 404 是"预期"**（"文件缺失"在画布里的正常表现）✓。

**★ Ruling T5-A —— 那条 Important 的根因在我的计划里（第四次"计划与它自己的话自相矛盾"，`9d19be5`）。**
审查者抓到：`openPendingArtifact` 的路径分支**成功时从不清 `pendingArtifact`**——我给的判据是 `pendingArtifact === before`，而**成功时它不被替换，判据永不为真** ✗。**而同一段下面那句 ★ 写的就是"旧的是 open 返回 true 才清"** ✗✗。
**后果链（审查者逐环追）**：`openPendingArtifact()` 在**每次渲染末尾**被无条件调用 ⇒ 每次状态推送都重开画布 ⇒ `renderCurrent()` 重取 + deck 重置 + **`dock.closeBtn.focus()` 抢焦点** ⇒ **在跑着的 run 里，每次状态推送都把焦点从输入框抢到画布关闭钮上，而回车会关掉画布**。
**订正**：`openArtifactByPath` 改成**返回布尔**，路径分支据此清 ✓。
**这才是这一夜最有价值的一条 finding**：它**不是文档漂移，是一个真实的、用户能感觉到的交互 bug**——而它的形状**恰恰是我在计划里警告过的那一个**（"这一段最容易写错"），**我写下了警告却没让代码做到**。
**代价（错的话）**：`openArtifactByPath` 的返回值改动会影响它的既有调用方（已要求逐个确认）。

Task 5: fix round 1/5 dispatched（resume 原实现者）—— 改 `openArtifactByPath` 返回布尔 + 路径分支据此清；**★ 并要求在"跑着的 run"上重验**（审查者明说现有探针抓不到：它跑在空闲 run 上、稳定后没有渲染再发生），另加一条单测锁"成功时清、失败时留"。

Task 5: fix round 1/5（1 addressed / 0 open — 路径分支的清理语义；commits `53a99b9`..`7a6ecce`）
- `openArtifactByPath` 改返回布尔、路径分支成功才清（计划 6.c 逐字）；**其余 11 个调用方逐个 grep 核对**，忽略返回值无害。
- **★ 它的"跑着的 run"验证做得比要求的更硬**：先报环境限制（**宿主 LLM 认证坏、现造 run 全死，5 连败**），改用**猴子补丁 `EventSource` 重放靶 run 真实 657 条事件流**（`page.route` fulfill 喂不动 SSE，已弃）——
  **对称对**：修复前 `DOCK-CLOSE ×12`、取件 **17→74 ★红**；修复后 `#task-input ×12`、取件 **10→10 ✅**，五条全成立（空闲 run 旧四条同轮全过）。
  **真事件流 RED**（`abf42461`）：`DOCK-CLOSE ×6`、**17→19** ✓。
  ⇒ **它先证明了 bug 真的发生、再证明修复后不发生**——"先探针后修"的完整形态，而它是在一个很难跑的环境里做到的。
- **诚实标注一处**：`openPendingArtifact` 内联在 `index.html` 的 module script 里、**不导出**（`:522`）⇒ jsdom 无法 import，**单测替代不了**，只记进账本。
- 聚焦 `2 passed / 100 passed`；全量 12 = 基线零新增（**轮换位 stm32-mutex 经 `git stash` 撤到干净 HEAD 复现**，证明 pre-existing）✓；`check-eol` 双 ✅。

Task 5: scoped re-review（round 1）dispatched（sonnet）—— 包 `review-53a99b9..7a6ecce.diff`。
派单里点名四件事：① 修复对不对（`openArtifactByPath` 的返回值在**所有分支**上都正确吗，尤其"解析不到 → `announceStatus`"那条）；② **要它自己数一遍调用点**、判断有没有哪个**本该用返回值却忽略了**；③ **★ 那条"跑着的 run"的证据成不成立**——特别是**猴子补丁 `EventSource` 有没有"用测试替身把某个维度整个抹平"的风险**（那是本仓已知的七类缺陷之一）；④ 核那条"`openPendingArtifact` 不导出"的说法。

Task 5: fix round 1/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- **修复对不对**：`openArtifactByPath` 三出口布尔齐全（空 runId/path → false；canvas 分支 → true；尾路 announce → false）✓；它**追到下游把唯一的理论假阳性排除了**（`hash===target` 分支里 `artifactCanvasApi` 尚为 null 不可能发生——`initArtifactCanvas` 在模块体同步执行、三个触发点全在其后）✓。
- **其他调用方**：**它自己数了一遍——11 个**，与报告逐一相符，全是"打开并忘记"（点击 / 回调 / 写后自动开），失败时 `announceStatus` 已给反馈 ✓。
- **★ "跑着的 run"那条证据成立，且替身没有抹平被测维度** ✓：它核实 mock 拦的**正是生产通道**（`new EventSource('/api/runs/…/events')`，`index.html:3245`），重放帧走 app 自己的 `message/delta/replay_done` 处理器 → replay gate → batcher → `reduceEvents` → `renderDetailWithState` → 渲染末尾 `openPendingArtifact`（`:2364`）——**被测机制全在生产代码上行使**；**"被压缩的只有传输节奏"**（3ms/条 vs 真 run 分钟级），而那是**把更多渲染压进采样窗**；预修 RED（DOCK-CLOSE ×12、17→74）证明替身有判别力 ✓。
- **"jsdom 无法 import"**：属实（`index.html` 全文件零 `export`；test/ 下无任何测试把它当模块 import）✓。

**Task 5: complete（commits `1d4ec84`..`7a6ecce`，review clean）**
- 交付：`encodeArtifactHash` 对象形态 + `parseArtifactRoute` 双侧形态（旧数字仍认）+ 宿主四处调用点 + 两处 brief 漏掉的写出点 + 既有测试更新 + 7 条新单测 + 一个新探针。
- **★ 这条 finding 的意义**：它是这一夜**唯一一个真实的用户可感交互 bug**（跑着的 run 里焦点被反复抢到画布关闭钮上），而**它的形状恰恰是计划里警告过的那一个**——**"我写下了警告，却没让同一段的代码做到它"（第四次）**。

**★ 环境事实（对 T6/T7 的预警）**：**审计宿主不能造新 run**（LLM 认证坏，T5 实现者实测 5 连败）。而 T6 的计划里写的是"用 git 夹具造一场真跑过编辑的会话"——**那条路走不通**。T5 的实现者蹚出了替代路（**猴子补丁 `EventSource` 重放既有 run 的真实事件流**，且已被复查者判定"没有抹平被测维度"）。**派 T6 时必须带上这条。**

**Task 6: dispatched**（implementer，sonnet）—— BASE `7a6ecce`。

Task 6: **DONE**（commit `c624c20`，7 文件 +1159）
- 交付：`app.js`（`deriveTouchedFiles` / `buildRevertMessage` / `toRepoRootRelative` / 渲染链三处 / `renderChangeCard` / **导出的 `renderPatchHunksHtml`**）、`index.html`（`reviewedAtSeq` + 三回调 + 宿主取件）、`styles.css`（**187 行全挂 `body[data-face="code"]`**，CSS 画形状零 dingbat）；「在右栏审阅 →」**不接**，留给 T7 ✓。
- 全量 `11 failed | 3708 passed` = **零新增**（基线 12 减轮换位 `approval_expired`，standalone 绿）✓；**变异 A/B 各自恰好红目标测试**，并**额外演示了一条陷阱**：「同款过滤行出现 3 处、改错地方红不了」。
- 探针两次全绿（mock 只截 `/api/runs/<死 run>/events`、重放 `6139d6d8` 真实流并改写路径）；**"撤掉"三问含逐字对比** ✓；判据 ⑥ 严格 0 控制台错误 ✓。
- **它报的三条**：① **宿主 LLM 认证死 ⇒ 判据 ① 按 mock 改编**（强调"死 run 档案 0 触碰"），建议认证恢复后对真 run 复跑；② **它改了 `scripts/git-fixture.mjs`**（判据 ② 的上下文行前提，夹具原来是单行文件）——**不在 brief 的 Files 里**，它自己判断后随提交进了，并说 T4 探针复跑无回归；③ **它还改了 `test/ui-patch.test.ts`**（也不在 Files 里，**但控制者的计划预判过**："改 `deriveChatItems` 之后先跑全量"）；brief 基线写 11、实际 12。

Task 6: review dispatched（sonnet）—— 包 `review-7a6ecce..c624c20.diff`（1 笔，7 文件 74.5KB）。
派单里要它**逐条判那三条偏差**（尤其**改了计划 2 留下的夹具生成器**——有没有影响别的消费者），并特别判六点：**那两条核心断言真的锁住了吗**（"只收成功的编辑" / "拿不到行号就不提行号"）、**渲染链三处真的齐了吗且 key 是常量**、**`chatItemSig` 真的随已阅集合变化吗**、**★ "撤掉"那三问**（只写进输入框 / 没导航 / **没发送**——**只做到第一问的实现也能骗过只问第一问的探针**）、**dingbat 与 `data-face`**（187 行 CSS 是不是全挂在 code 脸下）、**T6→T7 的两个交接**（按钮真没接线？hunk 画法真被导出？）。

Task 6: review 结 —— **Spec ✅ / 质量 Approved —— 0 Critical、0 Important、4 Minor**
- **六判据的代码侧逐条核实为真**：两条核心断言锁对且**变异对照到位**（它还核了"同款过滤在 `app.js` 出现 3 处、改错的那份 12 条全绿"这个对照）；渲染链**三处齐且 key 是常量**（`"changecard"`，线程视图里祖先 run 的卡被 `skipLead` 跳过）；`chatItemSig` **随已阅集合变**（`changecard:…:rev:${排序的 path@seq}`），且 changecard 有**专属展开态保全**（重画不闪关）；**撤掉三问从代码看全对**（只有 `taskInput.value=` + input 事件 + focus + 光标末尾，**无 hash 改动、无 `requestSubmit`、无 `selectRun`**）；dingbat 与 `data-face` 合规；**T7 两个交接都对**。
- **它主动夸了一处**：`toRepoRootRelative` 是**计划文件表之外主动补的第四产出**（配 6 条单测），"做在了该做的地方"——那正是契约 1「传错基准会静默取错」要求的接线保险 ✓。
- 三条偏差**全判为必要且范围最小** ✓（尤其改了计划 2 的夹具生成器：它全仓 grep 确认**没有任何代码或探针断言旧内容或旧 diff 形状**，且 T4 探针的判据在新形状下仍满足）。

**★ Ruling T6-A —— 两脸差异必须写成「成对的两条」（计划 `0ade58c`；另一处 Minor 一并修）。**
审查者抓到：187 行 CSS 全挂 code 脸、**没有 work 脸的成对规则** ⇒ 这张卡在 Work 脸**以无样式的裸 `<details>` 出现**。而**计划与派单里写的就是"挂在 code 脸下（Work 脸不该出现）"**——**实现者照做的正是这个；计划只说了结果、没说形态**。
**这与计划 1 那条「CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁」是同一个形状，只是换了个地方。**
**另一处 Minor 一并修**：探针的逐字比对 `q1e` **只打印、不进裁决**（"将来消息变成'包含路径但不逐字'仍会 ✅"）——**一条只打印的检查不是锁**。
**代价（错的话）**：work 脸那条规则若写错选择器，卡片在两边都不出现——**而探针本轮新增的"Work 脸下不出现 / Code 脸下出现"双向判据会当场抓到**。

Task 6: fix round 1/5（2 addressed / 0 open — work 脸成对规则 + `q1e` 成门；commits `c624c20`..`6eadcbc`）
- Fix ①：`body[data-face="work"] .chat-change-card { display: none; }` 插在 change-card 那一组开头，带「两脸成对，只写一半等于没锁」注释（+3 行，EOL 干净）✓。
- Fix ②：`c3 = q1 && q1e !== false && q2 && q3` —— **`q1e` 现在真的成门了** ✓。
- **负向验证（它主动做的）**：故意把撤销消息改一个字 → **③ 恰好红在 `q1e`、其余六条绿、exit 1**；`index.html` 还原后**与 HEAD 逐字节相同** ✓。
- **★ 它自己抓到一条比我要修的两条更值钱的**：新增**判据 ⑦**——因为**"修 ① 之前探针一直在 Work 脸上跑那颗裸卡"** ⇒ **六条判据全绿，而卡片根本没有样式**。⑦ 的做法是：**boot 时把 `workspaceFace` 钉成 code**（否则 ①②③④⑤ 会和脸搅在一起），再**真点脸切换控件、两边都断言**（office：卡在 DOM、`display:none`、boundingBox null；回 code：`display:block`）✓。
- 聚焦 `ui-review-hunks` 12/12；全量 `11 failed | 3708 passed` = 基线零新增 ✓。
- **一处流程偏差**：它第一次报 "No commit made"（改动都在工作树里但没提交）——**控制者核过后要求提交**，于是有了 `6eadcbc` ✓。

**★ 这是这一夜第三次"探针看不见那个维度"**：
| 任务 | 探针过了，但它看不见什么 |
|---|---|
| T3 | 判据 ③ **不是前后判别器**（修前也成立） |
| T5 | 探针跑在**空闲 run** 上，抓不到"每次渲染重开"那条 |
| T6 | 探针跑在 **Work 脸**上，量的不是那张有样式的卡 |
**三次的共同形状：探针过了，但它量的东西比它以为的少。** 而三次都是**有人重新读了一遍探针**才发现的——**这一次是它的作者自己**。

Task 6: scoped re-review（round 1）dispatched（sonnet）—— 包 `review-c624c20..6eadcbc.diff`。
派单里要它判四件事：① Fix ① 的选择器/位置对不对、**有没有可能把 Code 脸也藏掉**（写错就两边都不出现）；② `q1e` 在什么条件下会是 `undefined` 而不是 `false`（那会让 `!== false` 恒真）；③ **判据 ⑦ 是不是真的两边都断言**，以及**它声称的"修 ① 之前探针一直在 Work 脸跑"从 diff 能不能证实**；④ 那条负向验证的成色。

Task 6: fix round 1/5 re-review 结 —— **All findings addressed，无新破坏** ✓
- **Fix ① 对，且不会藏掉 Code 脸**：选择器是**精确属性匹配** `[data-face="work"]`；`deriveFace`（`app.js:2942-2946`）只可能返回 `"work"`/`"code"`，两个属性值互斥、特异性相同、无级联冲突 ✓。
- **Fix ② 对**：`q1e` 是 `null` 或布尔、**永远不会是 `undefined`** ✓；`null` 的唯一来源（探针的动态 import 失败）是**既有的大声降级**（会打印「★ 导入失败——判据 ③ 退化成子串对比」），**不是本次引入** ✓。
- **★ 判据 ⑦ 两边都断言，且那条"声称"被验成"事实"**：钉脸行是 `+` 行（旧探针无任何钉脸）✓；key 与 `PREF_WORKSPACE_FACE`（`index.html:4786`）逐字一致 ✓；boot 读它、**缺省 fallback `"office"`**（`:5083`）⇒ `data-face="work"` ⇒ **修复前 ①-⑤ 确实全在 Work 脸的裸 `<details>` 上量**（`textContent` / `boundingBox` / `click` / `waitForSelector` 在无样式 details 上全都能过）✓。并指出**钉脸若失效不会静默绿**（①-⑤ 在 `display:none` 卡上 click 会超时红）✓。
- **负向验证成色好**：篡改点在**消费端**（`onChangeCardRevert` 加 `"!"`），而探针的 `expectedMsg` 来自**未动的 app.js 纯函数**——**恰好撕裂逐字比对的缝** ✓。

**Task 6: complete（commits `7a6ecce`..`6eadcbc`，review clean）**
- 交付：两个纯函数 + 渲染链三处 + `renderChangeCard` + **导出的 `renderPatchHunksHtml`**（T7 复用）+ `reviewedAtSeq` + 三回调 + 187 行 CSS（**成对**）+ 一个新探针（**七条判据**）。
- **T7 要接的两处已在报告里写明**：按钮**未接线**（T7 补）、hunk 画法从 **`renderPatchHunksHtml`** 抽 ✓。

**Task 7: dispatched**（implementer，sonnet）—— BASE `6eadcbc`。

Task 7: **DONE**（commit `5e967e1`，9 文件 +963/−76）—— **七个任务全部实现完毕**。
- 交付：`RAIL_PANELS` 加 `review` + tabbed 三分支 + `split` 不参与分列；tab 行第三只按钮 + 槽位 + `paintRightRail` 接线；**「在右栏审阅 →」接线**（T6 刻意留下的那处）；面板内容**复用 `renderPatchHunksHtml`**；两处测试；新探针 `verify-review-panel.mjs`（532 行）。
- 全量 `12 failed / 3720 passed` —— 12 条**全部落在已知基线族**（ui-handoff ×4、cloud-sync-env ×2、ui-patch CRLF 针 ×3、run-crash-inject ×1、ui-server stm32 ×1 = 11 确定 + ui-message-queue ×1 轮换抖动），**零新增** ✓；`ui-a11y` 92/92 ✓；探针 T6 7/7、T7 10/10 ✓；9 文件 check-eol 裸LF=0 ✓。
- **★ 它报了一条最有说服力的证据**：**T6 探针 ④ 真红抓到连带回归**——卡结构改造后 `patchConversation` 保住展开状态的选择器**落空**（点已阅**整卡合上、已阅标不可见**），**已修并加 `ui-patch` 回归锁** ✓。
  ⇒ **那是"探针自己挣来的回报"**：T7 改结构时踩了 T6 的展开态保全，而 T6 那条探针**当场变红**。
- **两处要解释的**：① **越界改了 T6 的探针**（计划写着"不许改已有探针"）——理由：**a11y 返工改了卡 DOM**，只改一行选择器（`.chat-change-card > summary` → 新结构）它才点得开卡；**判法/阈值/注入口径一字未动**，且改后**照常真红抓到那条回归**。② **a11y 返工**（brief 没写）：T6 的卡引入 **26 条 `nested-interactive`**，**既有 axe 套件抓到**、它清干净 ✓。

**★ 会话中断的处置（记一笔）**：会话断过一次，T7 的实现者被中断。**处置是"先看现场、别猜"**：核出工作树里三个 M（`rail-policy.js` / `index.html` / `ui-rail-policy.test.ts`）、没报告没探针没提交 ⇒ **resume 原实现者**（不重派、不丢它的活）✓。**零损失的原因是每一步的产物都在仓里（32 笔提交）与账本里（523 行），而不在上下文里**——这正是账本存在的理由。
**另一处小插曲**：它一度**在轮询一个错的日志文件**（测试早跑完、结果在另一个文件里）——**"等一个不会来的信号"是分布式工作里最贵的一种卡住**，而它发生的原因是**"跑完了"这个事实没有明确的落点**（不像提交有 SHA、报告有文件）。

Task 7: review dispatched（sonnet）—— 包 `review-6eadcbc..5e967e1.diff`（1 笔，9 文件 80.9KB）。
派单里要它**逐条判那两处要解释的**（越界改 T6 探针的理由立不立得住；a11y 返工是否必要、在不在范围内、有没有把 T6 的意图改坏），并判六点：**`split` 下真不参与分列吗**、**那条按钮的接线两半都在吗**、**hunk 画法有没有第二份**、**★ 两脸 CSS 成对吗**（work 脸那份 `display:none` 在不在）、**★ 探针"两边都量"了吗**（钉脸 / 两视口 / 两处都点）、**那条连带回归真的修好了吗且新锁真的锁住行为吗**。

---

## 终审材料：deferred minor 与 parked 的合并清单

（技能要求：把账本里所有 deferred/parked 交给最终全分支审查**逐条分诊"哪些必须合并前修"**。散落的行已汇总到这里，一处看全。）

### A. parked（有裁决、明确不改，附理由）

1. **T1-D · `.`／`:`／`/` 嵌进类名时三条断言仍绿**（`x.composer-scope`）——**park，附正解**。判据是**可达性**：`-` 是人真会用的字符（`is-active`、BEM），所以连字符变体我修；而 `.`/`:`/`/` 谁也不会写（CSS 里还得转义）。**正解是换机制**（按 class 属性值切分、或把边界限定 `[\s"]`），该对整个家族做一次，不是热循环里的第三轮补丁。
2. **T4-G 的措辞上界**：T4 后续若再提"某个词的精度"一律记账本、不开轮——**已执行**（T4 共 4 轮修复，后 3 轮改的都是注释里的一句话）。

### B. deferred minor（按任务）

**T1**：`test/ui-layout.test.ts:125` 的 `[\s\S]*?</details>` 非贪婪截断脆弱（今天 `index.html` 只有一个 `<details>`）· `verify-composer-scope.mjs:69,73` 的固定 `waitForTimeout`（失效方向是假红不是假绿）。

**T2 ×4**：`verify-picker-paste.mjs:72-74` 的哨兵**只记日志不是行为**（字节不同步时仍可 exit 0）· 探针掐的是"第一个带 path 的 fs/list"而非"浮层起点加载" · **只有下钻那一处 clear 被变异锁定**（up/go/enter/crumb 四处无覆盖）· 报告 §七 里 `check-eol` 的「字节」列是 `string.length` 而非 UTF-8 字节。**另**：`e992b47` 的提交信息写"程序性导航（下钻/上一级/前往）**三处**"，而代码清了**四处**（漏了面包屑）——**源头是我给的模板措辞**。

**T3**：`edebe8b` 的提交信息里带着那句被推翻的旧尾句（它逐字用了我的模板）——**不改写历史**（会动后续所有 SHA 与已出的复查包引用）。

**T4 ×5**：`maxBuffer 1MB` **先于** 256KB 截断炸（降级成 `GIT_FAIL_NOTE` 而非 `truncated:true`，截断只在 256KB–1MB 区间生效）· 已删除的跟踪文件因 `existsSync` 门在先而给"盘上没有这个文件"（brief 继承的限制）· handler 无单测 · **两条边角注记**：仓库 root 恰为盘根时 `..` 被钳住 ⇒ `../x.txt` 不逃出 root（那时归第二道）；文件是指向圈外的 symlink 时 realpath 检查先抛（归第一道）。

**T6 ×2（本轮新增）**：`Number(lastSeq) || 0`（`lastSeq` 为 0 时记 0，`seen === f.lastSeq` 仍可比，实无影响）· **mock 改编的共享规则盲区**——探针的 `touchedOf` 是与应用**同一条收法的第三份实现**（共享规则 bug 会两边同错而假绿），已由单测里手写 timeline 锁死规则兜底；**宿主 LLM 认证恢复后应对真 run 复跑**。

### C. 两处"应当知道"的环境/流程事实（不是缺陷）

- **宿主 LLM 认证坏**（`audit.env` 那套），**不能造新 run**——T5/T6/T7 的探针全部改用"重放既有 run 的真实事件流"，且**两次复查判定该手法"没有抹平被测维度"**。
- **会话中断过一次**（T7 期间），恢复方式是"先看现场、别猜"：核工作树 → resume 原实现者 ⇒ **零损失**。**原因是产物都在仓里与账本里，不在上下文里。**

Task 7: review 结 —— **Spec ✅ / 质量 Approved —— 0 Critical、0 Important、4 Minor**
- **六点硬判据全部在 diff 里有据可查地成立** ✓：`split` 不参与分列（`rail-policy.js:138-139` 未动）· `tabbed` 下 review → `tree=0 && preview=0`（`:191-199`）· **接线两半都在**（`app.js:10899` 画挂钩、`index.html:2544-2549` 接 `showRailPanel("review")`，且**接线锁把两半按"同文件 200 字符内"锁成一条**）· **无第二份 hunk 画法**（唯一 `renderPatchHunksHtml`，文件行一份两处消费，挂钩由同一函数产出**逐字一致**）· **两脸成对**（tab 藏 + 槽藏两条都在，另加 work 脸 `panel=review` 落回树的兜底**防右列变空缝**）· 探针**钉脸 + 两视口 + 两处都真点**。
- **两处越界的判决**：① 改了 T6 探针**一行选择器** ⇒ 判"**先斩后奏、理由成立**"（约束的目的——不许削弱既有门——被证明未违反；新选择器指的是**同一个语义对象**、不是放宽门）② **a11y 返工判必要且在范围内**，外层保留 `.chat-change-card` 类名 ⇒ **两脸成对规则与所有后代选择器语义原样存活**。
- **★ 它纠正了一处归因**：报告说"**T6 的卡引入了 26 条红**"——**不准**。T6 的结构本身 a11y 干净，**违规是 T7 把按钮塞进 `<summary>` 才产生的** ✓。
- **那条最有力的证据核实为真** ✓：`patchConversation` 两处选择器（`app.js:7516/7531`）确已跟到新结构；**回归锁是真行为锁不是锁名字**（旧选择器 ⇒ `cardOpen` 读到 null ⇒ 重画后卡合上 ⇒ 断言红；末条"已阅标画在文件行里"堵死了"根本没重画"的假绿）；**全仓 grep 无残留死选择器** ✓。

Task 7: minor (deferred) ×4 —— 探针头部写"判据九条"实有**十条**（文档口误）· **判据 ⑧ 只真点过 tree/review 两只 tab**，preview 的"点得到"靠几何近似（brief 原话"三只按钮都点得到"没完全兑现）· **★ `split`（1600）下点「在右栏审阅 →」零可见响应**（槽按边界断言隐藏、只剩偏好落盘）——brief 明示"本计划不做"，**但全分支评审值得注意这条 UX 缝** · 报告归因措辞（见上）。

**Task 7: complete（commits `6eadcbc`..`5e967e1`，review clean）**
**★ 七个任务全部实现完毕**：33 笔提交、564 行账本、约 40 条裁决。

**Final whole-branch review: dispatched**（opus，按技能要求上最强模型）—— 包从 MERGE_BASE `4b6fc7e` 起，并**指向本账本的「终审材料」一节**（deferred/parked 汇总）让它逐条分诊"哪些必须合并前修"。

**Final whole-branch review 结 —— 0 Critical、4 Important、6 Minor；裁决「With fixes」**
包 `review-4b6fc7e..5e967e1.diff`（33 笔 / 27 文件 / +4144−109，326KB，它**分四遍读完**）。

**★ 它做的独立核验**（不是照账本收的）：整读了 `src/tools/fs-util.ts:63-100`（三层：词法 `isInside` + `realpathOfNearestExisting`（dangling/权限 fail-closed）+ `realpathOfRoot`）· **自己重跑了两遍全量 + 四遍隔离**（140/140 绿；3 条 ui-patch 红它用 base/HEAD 两个 blob 的行尾计数证明它在基线同样红）· `styles.css` 的**逐字节 EOL 分析** · grep 全仓确认无残留死选择器 / 无 dingbat 命中。

**★ 它明确说：没有一条裁决需要推翻**（抽查 T1-A/B/C/D、T3-A、T4-B/D/E/H/I、T5-A、T6-A 后认为判据与结论都成立），并**背书了两条**：T1-D 的「可达性判据」是对的；T4-G 给自己上的「循环必须有界」是对的、且执行得干净。

**四个 Important（全部落在本分支招牌那一族里）**：
- **I1 · 「下一个 hunk」的键在容器内不唯一** ⇒ 展开 ≥2 个文件时**滚到别的文件**（`data-hunk-idx` 按文件起、查找按容器做）。**零覆盖**——T6 探针只有"单 hunk 文件→按钮 disabled"的旁证，那条路径永远走不到 bug。形状正是「键控补丁的键不唯一」。
- **★ I2 · 安全边界里承重的那一半没有可执行检查**：判据 ④ 的 `../../etc/passwd` **在第一道就被抛掉**；所有探针/测试的 workdir 都是**仓库根本身** ⇒ **第二道恒真通过**。**删掉 `resolveInWorkdir(listed.path, abs);` 全套绿。** 而注释里"界内错基准→静默取错"那句**全仓只有注释、没有一条检查**。
- **I3 · 未跟踪分支把整个文件读进内存、没有上限**（兄弟端点 `file-preview` 有 10MB 上限）⇒ workdir 里的大未跟踪件会瞬时吃掉数倍于文件大小的分配，**同进程里 run 还在跑**。不是逃逸，是资源耗尽。
- **I4 · split 档下「在右栏审阅 →」点了没有可见反应** —— 宽屏下的**头号 CTA 是个死按钮**。它在报告里判明：*"这不是实现走样，是计划的边界直接产生的一条 UX 缝"*，并给了最小修法（split 下**说话或藏起来**），**明确说别在这里给 split 开列**（那属单独立项的三列空间预算）。

**六条 Minor**：M1 `artifact-canvas.js:7` **是 T5 漏改的最后一份副本**（同族的「订正没传遍」）· M2 `test/ui-layout.test.ts:276` 的 docstring **说了一句被出货 CSS 自己否掉的话**（同族）· M3 patch 缓存无上限且 key 里没有 workdir（它构造不出可达路径，故 Minor）· M4 Work 脸 `panel=review` 落回树时 tab 态不同步 · M5 T5 探针判据 ④ 的「有话说」半只**可能被残留播报喂饱**（**同族：探针过了但它量的比它以为的少**）· M6 接线锁是"200 字符内出现过"式的（它核了目前**不是**被注释喂饱的 ⇒ nit）。

**它的终审材料分诊（20 条逐条判，不许漏项）**：**2 条判"合并前必须修"**——#10（handler 无单测）**以 I2 的形态修**、#17（split 死 CTA）**以 I4 的最小形态修**；其余 18 条判"可以留"，每条都给了理由。**它把我的汇总表逐条走完了，没有漏项。**

**它还提了一条我没想到的**：`changeCardPatchCache`（`index.html:2394/2425/2402/2347`）**键里没有 workdir**，而取 workdir 的链路会**回落到"另一个目录"**——那时 `toRepoRootRelative` 会算出**界内但错基准**的路径，服务端双检放行、**静默取成同名文件**（正是契约 1 的失效形态）。它说**可达性构造不出来**（`renderDetailWithState` 只在列表里已有该 run 时跑）故只列 Minor。

**Final fix: dispatched**（一个 fixer 带**完整清单**，按技能要求不是每条一个）—— I1/I2/I3/I4 + M1 + M2（后两条是同族的一行）。**要求 I1/I2 各做一次变异验红**——终审原话：*"否则又会得到三条『不能变红的锁』"*。

**Final fix: DONE**（commit `6fc396a`，9 文件 +301/−15；`mcp.json` 未入库；**控制者核过**：`ui/server.ts` 与 HEAD 逐字节一致 ⇒ **第二道圈禁那一行没被顺手改掉**）
- **★ 三组变异验红，尤其 I2**：**删掉第二道圈禁 →「圈禁第二道活着」红（`expected 200 to be 400`）→ 还原 4/4** ✓ —— **那条承重的安全线，现在有了一条能红的检查**（终审的判词是"删掉它全套绿"）。
- I1 探针 ⑧ **红→绿**（它说"容器级滚错文件被**行序无关**陷阱抓住"）· I3 尺寸闸短路 → 红（`expected true to be false`）→ 还原 17/17 ✓。
- 三个探针全绿（file-patch 七条 / change-card 八条 / review-panel 十条）；聚焦 3 文件 57/57；全量 13 失败全落基线族、**零新增** ✓；九个文件 check-eol 裸LF 全 0 ✓。
- **它自报的取舍**：I3 的二进制判定（NUL）**只对已读前缀成立**（超长文件尾部的 NUL 判不出、会按文本合成）——**已写进代码注释**，是"与 tracked 截断同口径"的有意取舍 ✓。**I4 是话术级修复**，split 档真开一列仍是三列预算的单独立项 ✓。

**Final scoped re-review: dispatched**（sonnet）—— 包 `review-5e967e1..6fc396a.diff`（1 笔，9 文件 41KB）。
派单里点名四件事：① **I1 的新判据能不能真的走到 bug**（终审说过旧覆盖"永远走不到"）；② **★ I2 的新检查真的钉住了第二道吗**——**那个红是不是真由那条线引起的**（不是别的检查顺便红了）；③ I3 的降级形状与既有口径一致吗、那个取舍有没有写进注释；④ I4 选的是"说话"还是"藏起来"、**有没有把窄档的正常路径弄坏**。另核 M1 是否真清零、M2 那句话是否被改对。

**Final scoped re-review 结 —— 六项里五项 ADDRESSED，I4 NOT ADDRESSED（缺陷原样存在）**
- **I1 ADDRESSED** ✓：`scope = btn.closest(".chat-change-file") ?? container`；前提确证（`renderPatchHunksHtml` 每文件体各调一次、idx 按文件从 0 起；两处容器都有 `.chat-change-file` 祖先；无祖先时回退 container 与旧行为一致）✓。**它的判据 ⑧ 是节点同一性断言**（`t === trap`，trap 注入进**按钮所在文件体**）——**行序只决定陷阱放哪**，退回容器全局找必中另一个文件 ⇒ **无论行序怎么翻都会红** ✓。
- **★ I2 ADDRESSED，且判别性被钉死** ✓：try 块内**只有两条** `resolveInWorkdir`，该输入上 400 的**唯一来源是第二道那条线**（第一道对 `README.md` 不抛；白名单门是 403、缺 path 是 400 但 rel 非空）⇒ **删掉它 `probeFilePatch` 恒返 200**，那个红 `expected 200 to be 400` **精确由那行引起** ✓。且探针 ⑥ + ⑦ + handler 四条用例把"删第二道才红、删别的保持绿"的判别性也钉住了 ✓。
- **I3 ADDRESSED** ✓：与 tracked 截断同尺同形状（`truncated:true` 无 note），UI 复用现成的截断提示；NUL 取舍已入注释、方向安全（最坏是 ≤256KB 的乱码 patch，有界、有文案、**有红锁**——尾部 NUL 测试整读必判 binary 而红）✓。
- **★ I4 NOT ADDRESSED**：见下裁决。
- **M1 ADDRESSED** ✓（全仓 grep `<index>` 零命中）· **M2 ADDRESSED** ✓（docstring 改成与出货 CSS 同口径）· **无新破坏** ✓。

**★ Ruling T-Final-1 —— I4 park，按技能要求交给委托方（不开第二轮修复波）。**
I4 的修法是**话术级**，而话落在 `#status-announcer`（`.sr-only`，1px clip 视觉隐藏）⇒ **对明眼用户零可见变化**，那个"split 档下头号 CTA 是死按钮"**原样存在**。**而两条锁都是文本锁**（单测正则锁文案、探针只查 `textContent`）——**测不出"可见与否"，所以都绿**。
**技能明写「There is no second fix wave — residual load-bearing findings surface to your human partner」**⇒ 不派 fixer，**连两个选项交给委托方**：① 改用**可见**提示（可见 toast / 公告条）② 或按"藏起来"备选**在 split 档把该 CTA 藏掉**。两者都在既有口径内（**不许在这里给 split 真开一列**——那属单独立项的三列空间预算）。
**★ 这是这一族缺陷的第六个变体，而它比前五个更隐蔽**：前五个是"锁不出它能红"，**这个是"修了，但修在一个看不见的通道上"**——**而两条锁都验证了那个通道有内容**。

**Final scoped re-review: 完成。** 记录转录 → 清工作区 → 交给委托方。
