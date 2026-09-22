# SDD ledger — plan: docs/superpowers/plans/2026-09-19-scheme-a-skeleton.md

分支 `fix/capability-visibility`（BASE `61995c6`，merge-base main = `cc77d28`）
工作区 `.superpowers/sdd/2026-09-19-scheme-a-skeleton`

## 预检扫描（dispatch 前跑一次）

### 逐对：共文件 / 共接口

| 对 | 共享 | 一产一耗 | 结论 |
|---|---|---|---|
| T1 × T2 | `styles.css`（T1 改 `.conversation`/`:root`；T2 改 `.sidebar` 两块）· `test/ui-layout.test.ts`（T1 **建**、T2 追加） | T1 产 `--measure`，T2 不消费 | 无冲突；顺序依赖已满足（顺序执行） |
| T1 × T3 | `styles.css`（T1 `.conversation`；T3 `.right-rail` 一族） | — | 无冲突 |
| T1 × T4 | `styles.css`（T4 末尾追加 `[data-face]`）· `test/ui-layout.test.ts`（T4 追加） | — | 顺序依赖已满足 |
| T2 × T3 | `styles.css`（`.sidebar` vs `.right-rail`） | — | 无冲突 |
| T2 × T4 | `app.js`（T2 加于 `renderRunList` 前；T4 加于 `deriveComposerMode` 前）· `test/ui-app.test.ts`（都追加） | — | 无冲突 |
| T3 × T4 | `core/rail-policy.js` 只有 T3 碰 · `app.js` 只有 T4 碰 | — | 无冲突 |

### 逐任务：自身一致性

| 任务 | 测试 vs 实现 | 文件声明 vs 后续触碰 | 结论 |
|---|---|---|---|
| T1 | `--measure: 40em` + `min(var(--measure),100%)` + `margin: 0 auto` ↔ 实现三处一致 | 一致 | ✅ |
| T2 | 断言 6 个 id + CSS `width:48px` 无 `display:none` ↔ 实现一致 | **★ 缺 DOM 接线**（见 Ruling 2） | ⚠ |
| T3 | 测试打 `railColumnsFor` ↔ 计划实现新增该函数 | **★ 与 `railPolicy` 重复**（见 Ruling 1） | ⚠ |
| T4 | `deriveFace` 4 例 + `[data-face]` CSS ↔ 实现一致 | `workspaceFaceExplicit` 计划已自 hedge（不存在则 null） | ✅ |

### 裁决

**Ruling 1（T3，载荷重 · 已回写进计划）**
计划原文让 T3 **新增** `railColumnsFor()` 到 `core/rail-policy.js`，并让 CSS 读 `--rail-tree-w/--rail-preview-w`。
**实际：`railPolicy()`（同文件 102–166 行）已经是 tree/preview 的唯一真值源**——第 150 行 `tree = Math.round(railWidth * splitRatio)` 正是"窗口越宽树越窄"的根因（railWidth 夹在 240–360，×0.5 = 120–180，与实测 141/161/180 严丝合缝）；
且控制器 `index.html:5260-5261` **已经在写**那两个变量。
按原样做会造出**两个真值源**——正是本仓反复吃的亏（"散落的 if 会各自漂移"）。
**改为：修改 `railPolicy` 的 split 分支（149–151 行）；测试改打既有的 `railPolicy()`，不新增函数。**
Caveat：若 `railPolicy` 的入参形状不适配（它吃 `viewportWidth/sidebarWidth/splitRatio`，不吃 `railWidth`），需要把 tree 的下限规则写成对 `railWidth` 的函数、在 `railPolicy` 内调用——**仍是一个真值源**。

**Ruling 2（T2，次要 · 已回写进计划）**
计划 T2 只写了纯函数 `sidebarRailItems()` + CSS，**没写谁把它渲染成图标条**——CSS 收成 48px 后里面会空着。
**实际：图标按钮已经在 DOM 里**（`.sidebar-top-tools` 的 `#notifications-btn`/`#home-spend`/`#theme-picker`；`.sidebar-footer--icons` 的 `#board-open-btn`/`#artifacts-open-btn`/`#schedules-open-btn`/`#memory-btn`/`#settings-open-btn`；`.sidebar-search` 的 `#new-chat-btn`）——不需要新建 DOM，**需要的是让这几行在收起态竖排、并藏掉行内的标签与输入**。
**改为：`sidebarRailItems()` 保留为"能见度契约"（可测）；CSS 补竖排规则，并明确列出保留哪些容器、藏掉哪些。**
Caveat：`#home-spend`、`.run-search-row`、`#workspace-face` 在 48px 里放不下，必须藏——若产品上想保留其一，改这一条即可。

## 任务台账

Task 1: dispatched (implementer, haiku —— brief 含完整代码，属转写+测试档) — BASE 61995c6

**Ruling 3（T2，次要 · 预检后自查发现 · 已回写进计划）**
我为 Ruling 2 补 CSS 时写进了两个不存在的选择器（`.sidebar-search-row` 0 命中，是我编的），且漏了 `#new-chat-btn` 里的 `<span>新建对话</span>` 与 `.sidebar-brand`——48px 宽时它们会把图标挤掉。
**险处**：计划里的 `block()` 辅助函数只从 **CSS 文本**里抠块，**不校验选择器是否真存在于 DOM**——编错的选择器会让 CSS 变成空转，而测试照样绿。
**改为**：选择器逐个核过真实 DOM（`.sidebar-search` 的结构是 `#new-chat-btn` + `.run-search-row`）；测试的选择器串与 CSS 逐字对齐。
Caveat：`.run-list` 在 DOM 里同时有 `#run-list.run-list`，按类选ok；若将来 id 与类分叉，测试的文本匹配会先红。

Task 1: 等待中（无报告、无提交）

**Ruling 4（T1，计划缺陷 · 载荷重 · 已回写进计划）**
计划的 `block(source, selector)` 取**第一个**匹配；而 `styles.css` 里 `:root` 有**两份**（20 行令牌块 / 1541 行 rail 默认值）、`.conversation` 也有**两份**（4488 一行式 / 6653 完整块）。计划正文却指向第二份——**测试与正文互相矛盾**。implementer 按"测试是先行契约"处理，做了三处偏差：
① `--measure` 落**第一个 `:root`**（令牌块，语义上也对）② 删掉 4488 那条**同特异性、更早、两个属性都被覆盖**的死规则 ③ 正文注释里的 `132ch` 字面触发测试自带的 `not.toMatch(/\d+ch/)`，改写注释但保留 WHY。
**裁决：三处偏差全部接受**——语义正确的家优先于行号指引；删死规则符合本仓"根因修掉，补丁就是负债"；注释改写是被测试守卫逼出来的，必要。
**代价**：若将来有人在第一个 `:root` 之前再插一个 `:root`，`block()` 会静默读错块——但那是 helper 的通用弱点，不是本任务引入的。
**已回写**：计划 Task 1 的落点改成"第一个 `:root`（令牌块）"，并注明删 4488 死规则。

**基线补充（implementer 实测，采纳）**：`ui-workspace-git-api` 在**全量并行**下也会失败，**基线里就有**（隔离单跑 5/5 过）——又一条已知 flake。基线记法从"12 条"改为"12 条稳定 + 该文件并行抖动"。

Task 1: implementer 报 DONE_WITH_CONCERNS（commit 8370ab1，3/3 绿，全量为基线的严格子集 = 零新增）
Task 1: task reviewer 已派（sonnet；brief=原始版 + 附计划事后更正，不预判）
Task 1: review package = review-61995c6..8370ab1.diff

Task 1: review 结 —— Spec ✅ / 质量 Approved / 零 Critical / 零 Important
Task 1: minor (deferred): test/ui-layout.test.ts:32-37 —— block() 首次文本匹配天然脆弱，未来若有人在更早处重复 .conversation/:root，测试会静默读错块（今天正确，计划指定）
Task 1: minor (deferred): styles.css:6643-6648 —— .detail-layout 上方注释写「放宽到 108ch」，与改动前的 132ch 对不上、且 ch 已不存在；**先于本任务存在**，留给后续碰这个文件的任务刷新
Task 1: minor (deferred): implementer 报告里的散文行号略偏（--measure 写 169 实为 172 等），按内容指认的块都对，纯外观
Task 1: ⚠️ 已解 —— commit body 含 `Co-Authored-By: Claude Haiku 4.5` ✓；reviewer 点名的 block() 风险已核：Task 2/4 的选择器当前各出现 0–1 次，不受影响
Task 1: complete (commits 61995c6..8370ab1, review clean)
Task 2: dispatched (implementer, haiku) — BASE 8370ab1

**Ruling 5（T2，计划缺陷 · 载荷重 · 已回写进计划）**
计划 Task 1 的 `block()` 用 `indexOf('\n' + selector + ' {')`：① **匹配不了多行选择器**（T2 的 brief 正好要断言三个多行规则块）② 仓里没有 `.gitattributes` 且 `core.autocrlf=true`，`styles.css` 是 `i/lf w/crlf`——测试串里的 `\n` 在 CRLF 工作树上永远匹配不到，**同一份代码本地红、CI 绿**。
implementer 用 6 行把 `\r\n`→`\n` 归一化修掉（改的是 T1 的测试文件）。
**裁决：接受**——helper 原样是**潜在计划缺陷**（它对 T2 的 brief 根本不可用）；归一化是唯一在 CRLF 工作树与 LF 检出下**都成立**的修法；把工作文件转 LF 会在下次 `core.autocrlf=true` 检出时回归。
**代价**：改了已完成任务的测试文件——但该改动**落在 T2 的 diff 内**（8370ab1..df577d5），T2 reviewer 会连它一起判，不存在未评审改动。
**顺带一条仓级发现（Park，不在本计划范围）**：仓里没有 `.gitattributes`，而 `core.autocrlf=true`——行尾归一化靠机器配置，不靠仓库。要根治得加 `.gitattributes`（`*.css text eol=lf` 之类），但那会动全仓归一化，超出本计划，留给单独一刀。

Task 2: implementer 报 DONE_WITH_CONCERNS（commit df577d5；聚焦 299/299 绿；全量 11 < 基线 12，零新增；活页实测收起 48px / 无横溢 / 新对话键仍在 / 6 个图标按钮可达 / 0 控制台错误）
Task 2: task reviewer 已派（sonnet；brief=原始版 + 附计划更正，不预判）

Task 2: review 结 —— Spec ✅ / 质量 Approved / 零 Critical / 零 Important
Task 2: minor (deferred): test/ui-layout.test.ts:55-72 —— 结构性断言只在 **CSS 文本**变化时失败；将来有人重命名 DOM 元素（如 #workspace-face）功能会静默坏而 CI 照绿。**reviewer 的具体建议**：加一条小测试解析 index.html、断言每个契约 id 都有可达按钮。**交给最终 review 分诊是否合并前必修**
Task 2: minor (deferred): app.js:4846-4863 —— 契约里的 id 是逻辑名（new-chat/board/…），真实按钮是 #new-chat-btn/#board-open-btn/…，且当下**还没有消费者**；JSDoc 的"按 id 找按钮"略微高估了未来消费者要做的接线（brief 逐字要求）
Task 2: minor (deferred): test/ui-layout.test.ts:66-75 —— 那条 display:none 断言钉的是**整组**，从六个选择器里删掉一个测试仍绿；逐选择器循环会是严格改进（brief 逐字要求）
Task 2: ⚠️ 已解（控制者独立实量，1440×900，点真收起键）——展开 312px / 收起 **48px** display:flex / 横向溢出 body=0 sidebar=0 / **八个按钮全部可见且全在侧栏内**（含 implementer 没列的 notifications-btn 与 theme-picker）/ 控制台零错误。截图 shots/sidebar-collapsed-task2.png
Task 2: complete (commits 8370ab1..df577d5, review clean)
Task 3: dispatched (implementer, sonnet —— 改的是唯一致源 railPolicy，有回归面) — BASE df577d5

**Ruling 6（T3，计划缺陷 · 载荷重 · 已回写进计划）**
计划只说"把 preview 列的 display:none 去掉"，**没做特异性分析**。实测：`.right-rail[data-layout="split"] > .right-rail-preview` 与空槽隐藏规则 `.right-rail-preview:not(:has(> .preview-dock:not([hidden])))` **特异性相等**（均 0,3,0），同特异性按源顺序后者胜——新规则放在 brief 提示的 split 规则区会被空槽规则重新压成 `display:none`，**修复等于没做**。implementer 把它移到空槽规则之后（styles.css ~1761），活页探针证实 preview 82/122/160 全可见。
**裁决：接受**。代价：split 档且坞无可见内容时，preview 列现在是**有边框的空列**（既定取舍："剩下的全给 preview"+ 判据 preview>0）。若日后想恢复"无内容即藏"，要把空槽规则改成排除 split——但那会重新引入本缺陷。

**Ruling 7（T3，次要 · 已回写进计划）**
既有用例 `splitRatio 决定并排比例` 断言 `tree === round(railWidth*0.25)`（1600 档=83）。新的 200 下限使该断言**必然为假**，而 brief Step 4 要求整文件 PASS。implementer 把比率改成 0.75（新旧实现均过），保留用例名与语义，加注释**，未碰 tabbed/overlay**。
**裁决：接受**。契约变了，锁旧契约的断言必须跟着变；它选的最小改法（换高于下限的比率）保住了用例仍在测"比率决定比例"这件事。

**Ruling 8（T3，我自己的计划错误 · 已回写进计划）**
我在计划里写"旧 `railPolicy` 的 split 档 `preview` 是 0"——**错的**。代码是 `preview = railWidth - tree`，**本来非零**；活页看到的 0×0 **纯粹是 CSS 的 `display:none`**。所以 RED 只有一条（树的下限），不是计划预期的两条。
**裁决：接受 implementer 的实测**，计划 Step 2 的 RED 预期改为"一条红"。

Task 3: implementer 报 DONE_WITH_CONCERNS（commit c236f81；46/46 绿；全量第一次 = 基线 13 条零新增；活页 tree 200 / preview 82,122,160）
Task 3: task reviewer 已派（sonnet；brief=原始版 + 附计划更正，不预判）
Task 3: ⚠️ 已解（控制者独立实量，run 页 94f58b8a，真视口）
  1920 split 右列360 树200px flex / preview160px flex
  1600 split 右列322 树200px flex / preview122px flex
  1440 split 右列282 树200px flex / preview 82px flex
  1100 tabbed 右列240 树0 none / preview0 none（**回归护栏成立**）
  CSS 变量已写：--rail-tree-w=200px / --rail-preview-w=160|122|82。控制台零错误。
  截图 shots/rail-split-task3-1600.png：**目录名已可读**（changelog.txt / hello-code.txt / preview-seed.html …），对比改动前的 _probe2-p… 不可辨。
  ★ 探针第一版量错状态：在 `#/`（欢迎页）上量，右列被内容驱动规则收成 0——**这条要记**：量右列必须先开有内容的 run 页。
Task 3: minor (deferred, 但值得最终 review 重点分诊): split 档下 preview 列现在是 **82–160px 的空白列**（有边框无内容）。改动前那 161px 是 display:none 的**看不见的死区**，现在成了**看得见的空列**——树的宽度真赢了（141→200），但"右列空转"只解决了一半。根因：`railPolicy` 是纯函数，**不知道有没有 preview 内容**（内容判据在控制器的 `vis` 里）；正解是 split 档且坞无可见内容时让树吃满整列（`tree = railWidth, preview = 0`），而不是让 CSS 硬撑一个空列。
Task 3: review 结 —— Spec ✅ / 质量 Approved / 零 Critical / 零 Important
Task 3: ⚠️ 已解 —— commit body 含归属行 ✓；styles.css 行尾核过（i/lf w/crlf，与 implementer 主张一致）
Task 3: minor (deferred): 0×0 的真修复**没有自动锁** —— 修在 CSS（规则位置），而"样式锁" describe 只正则锁了 flex-direction / hider / pd-handle，没锁新规则的存在与它在 hider 之后的位置。全靠活页探针。**这正是本仓记过的"浏览器实测才抓得到的缺陷类型"**；一条正则断言（规则在、且在 hider 之后）就能补上
Task 3: minor (deferred): styles.css:1762-1765 的承重注释只说了 hider 这一处冲突，**漏了 1670-1671 那处同选择器的 display:none 孪生规则**——维护者"清理 split 规则区"时会撞上它。补一个从句即可
Task 3: minor (deferred): **未文档化的常量耦合** —— 下限只在 RAIL_MIN_PX(240) ≥ TREE_MIN_PX(200) 时成立；若夹紧下界掉到 200 以下，Math.min 会静默把树压回下限之下、preview 归 0，而三条测试（railWidth 全 ≥240）一条都不红。在 TREE_MIN_PX 注释上补一句关系即可
Task 3: minor (deferred): 被改的比率用例**对预算敏感** —— 它只在 1600 档 railWidth ≥ 267 时成立；将来预算一降会假红。另一选择是保留 0.25 并断言夹紧值（tree === TREE_MIN_PX），直接测新契约
Task 3: complete (commits df577d5..c236f81, review clean)
Task 4: dispatched (implementer, sonnet —— 要动 6000 行 index.html 的内联控制器) — BASE c236f81

**Ruling 9（T4，计划缺陷 · 载荷中 · 已回写进计划）**
我在计划 Task 4 的 CSS 里写 `.workspace-git-chip`——**是个类**。DOM 里那个元素是 `id="workspace-git-chip"` + 类 `scope-field scope-field--git`，**没有同名类**。规则逐字落地等于空转：Work 脸下芯片摘掉 `hidden` 仍是 `flex`（implementer 活页实测抓出）。
**这与 Ruling 3 是同一族病灶**（我在 CSS 里写不存在的选择器，而 `block()` 只读 CSS 文本、不校验 DOM，测试照样绿）。
**裁决：接受 implementer 的修法**——给元素补同名类（1 行 markup），CSS 与测试保持逐字。理由：① 补类的 diff 最小且不动已绿的测试契约 ② 类名与 id 一致，不引入新概念 ③ 替代修法（改用 `#workspace-git-chip`）会让测试的 `block()` 串与 CSS 双双偏离 brief 文本，改动面反而更大。
**代价**：若日后有人重命名该 id 而忘了类，CSS 与 id 分叉——但 `workspace-git-chip` 这类名在两边同时出现，改名时 grep 会同时命中。替代修法把"CSS 锚在 id 上"、id 改名时 CSS 立刻失效（更脆）。故补类不是次优解。
**已回写**：计划 Task 4 的 CSS 段加注「DOM 侧需有同名类，或改用 id 选择器并同步改测试」。

**顺带一条（不是本任务的，记下）**：`[hidden] { display: none !important }`（styles.css:338）让 `body[data-face]` 与 `hidden` 的优先级关系是**hidden 恒胜**——所以脸规则只在"有 git 数据"时可见。这是对的（无仓库时本就不该显示 git 芯片），但**量两脸必须摘 hidden 量**，否则会误判"规则没生效"。implementer 与我的探针都按这个口径。

Task 4: implementer 报 DONE_WITH_CONCERNS（commit eca67a0，5 files +54/−1；RED 3 条与 brief 同名同因；两文件 303/303 绿；全量三跑零新增确定性失败——第 3 跑多出的 `ui-server 产物取件` 已归因为并行抖动，隔离跑 17/17 绿且 diff 零 src 改动；活页实测 Work→none / Code→flex / 回 Work→none，0 控制台错误）
Task 4: task reviewer 已派（sonnet；brief=原始版 + 附本账 Ruling 9 与既有事实，不预判「补类」的裁决）
Task 4: review package = review-c236f81..eca67a0.diff
Task 4: 一处 brief 文本外改动待裁 → 给 git 芯片补 `workspace-git-chip` 类（见 Ruling 9 我的倾向；reviewer 独立判）

**控制者独立活页复核（任务 4）**——脚本 `eval/persona-ux/_audit-20260919/verify-task4-face.mjs` + `verify-task4-face-repo.mjs`，靶宿主 4201，真视口 1600×900，真点击。

链上每一环分开量，因为 implementer 那三行 none/flex 是**摘掉 `hidden` 之后**的读数——那证明 CSS 写对了，不证明功能自己会动：

| 环 | 证据 | 结论 |
|---|---|---|
| 宿主服务的是 eca67a0 | 服务端吐出的 `/styles.css` 273801 字节，两条规则都在（静态资源无 Cache-Control，只信服务端字节） | ✅ |
| `deriveFace` + `syncComposer` 接线 | 真点 `#workspace-face-code` / `#workspace-face-office`：`body.dataset.face` work→code→work 三态全对，tab 选中态同步 | ✅ **端到端** |
| 两条 CSS 规则的**内容** | 摘掉 `hidden` 后 display none→flex→none | ✅ |
| 规则的**触发路径**（`present=true`） | ★ **在这台宿主上不可达** | ⛔ |

★ 最后一环是本次复核最值钱的发现，已查到根：
① 6 条 run 去重后只有 **1 个** workdir（`D:\Work\scratch\fathom-ux-audit-20260918\web-a`），不是仓库；
② 宿主有 workdir 白名单（`/api/workspace/git` 越界返回可选项），白名单三处 `web-a` / `web-b` / `C:\Users\rk302\Fathom` **逐个问过，`present` 全为 false**。
所以不是"恰好没跑过仓库"，是**这台宿主上造不出触发条件**。

**这不构成缺陷**：芯片的 `hidden` 由 `root.hidden = !present` 驱动（`workspace-git.js:192`），是**本任务 diff 之外的既有代码**；无仓库时本就不该显示 git 芯片，行为正确。
**代价**：Task 4 新写的三样东西里，`deriveFace` 与 `body[data-face]` 接线已端到端证实，两条 CSS 规则的内容也已证实；**唯一没被真实路径覆盖的是"`present=true` 那年会发生什么"**——而这正是设计案给 Code 脸的第一条差异，也是计划 2（Code 脸 / GitHub）里会变成承重件的东西。
**已 Park（交给最终 review 分诊，且是计划 2 的输入）**：计划 2 需要一个 **git 支撑的 scratch workdir 夹具**（`git init` 一个允许目录），否则 Code 脸的 git 芯片、分支、PR 这一整族差异会**继续只能在"摘掉 hidden"的人工口径下验收**。这正是本仓记过的"浏览器实测才抓得到的缺陷类型"的镜像：测试绿、CSS 对、而真实路径一次都没被走过。
**顺带**：全程 0 控制台错误；`body[data-face]` 与既有 `document.documentElement.dataset.workspaceFace`（index.html:1425）是两个不同落点，没有打架。

**计划文档补勘误（控制者自查）**——账本此前标了几处「已回写」，实际只落在账本、**没落进计划正文**。已补三处，让计划本身是份真话：
- Task 2 Step 5 / Task 4 Step 5 都指向 `verify-ab.mjs`（那是 A+B 的脚本，且会往 `eval/persona-ux/**` 写截图，撞 Global Constraint「不许改档案」）→ 各自改成 `verify-task2-sidebar.mjs` / `verify-task4-face.mjs`，并把「为什么要真浏览器量」写进去。
- Task 3 Step 4 漏了 **Ruling 7**：既有用例 `splitRatio 决定并排比例` 断言 `tree === round(railWidth*0.25)`，新的 200 下限让它必然为假——补上「换比率到 0.75、保留用例名与语义、不碰 tabbed/overlay」的修法。
（Task 3 Step 5 指的 `rail-probe.mjs` **确实存在**，是上一轮的探针，那条原本就对，不动。）

Task 4: review 结 —— **Spec ✅ 合规 / 质量 Approved / 0 Critical / 1 Important**（reviewer 独立重跑两个被测文件 303/303；`git diff --check` 干净；全仓 grep `is-office|is-code|face-code|face-work` 在 styles.css 零命中；确认 commit 恰好 5 个文件、未碰 `eval/persona-ux/**`）
Task 4: 补类的独立裁决 —— reviewer 裁 **accept**，理由比 implementer 的更硬：`.workspace-git-chip` 类选择器全仓**仅新规则**消费、零歧义；`#workspace-git-chip` 替代修法会把 **id 级 specificity** 压到显示规则上、且要同步改测试文本；拿 `scope-field--git` 当脸判据更糟（哪天芯片布局类一改，脸规则静默脱钩）。**Ruling 9 的倾向被独立证实，不再是自证。**

**Ruling 10（T4，计划缺陷 · 载荷中 · 已回写进计划）**
reviewer 的 Important：`test/ui-layout.test.ts` 那组两脸测试**只读 `styles.css`**，全仓没有一条断言 `index.html` 里那个元素**真的带着** `workspace-git-chip` 类。失败场景具体：有人把类删掉或改名（"类的名字和 id 重复，清理一下"），**303 条测试全绿而 Work 脸重新显示 git 芯片**——正是本任务修掉的 bug 原样复活；Step 5 是一次性手测，拦不住。
**这是计划原文的锅**（测试文本是 brief 逐字指定的，reviewer 明确写了"非实现者偏差"）——**它是 Ruling 3 / Ruling 9 的第三次同族复发**：我写测试时只锁 CSS 文本，忘了"CSS 规则和它匹配的 markup 必须一起锁，只锁一半等于没锁"。计划 Step 5 本该有这一条。
**裁决：接受，开 fix round 1**。修法逐字给定：落进已有的 `describe("两脸差异只收在 [data-face] 上")`，取整个标签再断言类与 id 在**同一个标签里**（只 `toContain("workspace-git-chip")` 会退化成"文件里出现过这个词"——元素上方那两行 HTML 注释里就有它）。
**硬要求（本轮加的纪律）**：这条是**回归锁**，类已在 markup 里，写完直接跑就是绿的，那种绿什么都证明不了——必须**临时删类看它红、再还原看它绿**，并核 `git diff ui/public/index.html` 为空。
**代价**：无。这轮只加断言、零生产代码改动。

Task 4: minor (deferred): commit `eca67a0` body 尾部重复——`CSS 与测试保持计划原文不动。` 与 `Co-Authored-By` 块各出现两次。cosmetic，**不 amend**（该 SHA 已被 review 包引用，改写已评审历史会让包对不上）。
Task 4: minor (deferred): `styles.css:10976` 的 `body[data-face="code"] .workspace-git-chip { display: flex }` 与 `.scope-field` 基础规则（`styles.css:4799-4801` 已设 `display: flex`）**冗余**且无测试断言它。当前无害（belts-and-suspenders），reviewer 判不值得改。
Task 4: ★ reviewer 的现状澄清（**交给最终 review，也是计划 2/3 的输入**）：注释里那句「**全应用只有这一个判据**」目前是**目标态，不是现状**。第二脸表示还在两处：`<aside#sidebar data-workspace-face>` 与两个脸按钮上的 `data-workspace-face`（JS 态标记，CSS 已不挂它，`test/ui-file-tree.test.ts:292-293` 负向锁着），以及 `designModeActive = workspaceFace === "office"` **三处 JS 判断**（`index.html:1403 / 2317 / 4823`）。本任务正确地没去迁它们（范围外），但**在迁完之前，`data-face` 的"单一判据"声明不许被当真引用**——这正是注释里点名的"散落的 if(office) 会各自漂移"，而我们自己刚留了三处。
Task 4: fix round 1 dispatched（resume implementer a616642，R=1）—— 落点 `test/ui-layout.test.ts` 已有的 `[data-face]` describe，加 `html()` helper + 一条标签级断言；硬要求「临时删类验红 → 还原验绿 → 核 `git diff` 为空」

**Ruling 11（T4，我 brief 里的文本错误 · 载荷轻 · 已回写进计划）**
reviewer 在"备注"（不是 finding）里点的：`app.js:2931` 那句「**全应用只有这一个判据。**」是**现在时的断言句**，而现状不是——第二脸表示还在 `data-workspace-face`（侧栏 + 两个脸按钮，JS 态标记）与 `designModeActive = workspaceFace === "office"` **三处**。
**裁决：改注释，不迁代码**。迁那三处是范围外的活（reviewer 也明说本任务没去迁是对的），但**一句现在时的假陈述会毒掉整份 JSDoc 的可信度**——将来有人读到"只有一个判据"、一 grep 出来四处，从此不信这段，而这段恰是全计划里最该被信的。补"现状注"点名两处 + 写明"迁完前别当真引用"，**零行为改动**，并入本轮同一提交。
**代价**：无。**已回写**：计划 Task 4 的 `deriveFace` 代码块下加注。
**这也是本计划第四次"计划文本本身不真"**（R3 编选择器 / R9 id 写成类 / R10 只锁一半 / R11 现在时假陈述）——四条全是同一根：**我写计划时按"意图"写，落地时被按"字面"读**。

Task 4: fix round 1 报 DONE_WITH_CONCERNS（commit **13f8759** `test(ui): 锁住 git 芯片的类挂钩…`，2 files +17：`test/ui-layout.test.ts` +11、`ui/public/app.js` +6；未 amend `eca67a0`；自报删类验红成功——`AssertionError: expected '<div class="scope-field scope-field--…' to match /class="[^"]*\bworkspace-git-chip\b…/` @ `ui-layout.test.ts:94:17`；还原后 `git diff` 为空；`ui-layout`+`ui-app` **304/304** 绿）

**Ruling 12（T4，我数错了 · 载荷轻 · 已回写进计划）**
implementer 报：我给的「`designModeActive = workspaceFace === "office"` **三处**」与实测不符，实测**只有两处**。
**我独立复核：它是对的，我和 reviewer 都错了。** 精确 grep `designModeActive\s*=` 得 `1403 / 4823` 两处；我先前数出的"第三处" `2317` 是 `designMode: workspaceFace === "office",`——一个**对象属性**，被我自己的松散模式 `workspaceFace\s*=` 一并抓进来。**我又把这个错数字写进了派单，reviewer 照单全收**（它的 `1403 / 2317 / 4823` 与我派单里逐字相同）。implementer 没听转述、去 grep 了，才对。
**裁决：按实测两处落地**，计划与账本的"三处"全部改正。（另有 `designModeActive = true/false` 四处 `1412 / 1448 / 1453 / 4035`——同属"第二套脸表示"这一族但不是脸派生，别混进来数。）
**代价**：无（只改一个字面）。**这是本计划第二次"转述被当事实"**（R11 是"意图被当真话"）：**派单里的数字也是要被 grep 的，不是指令。**

**控制者独立核 concern 2（行尾事故）——通过。**
implementer 自报这轮有两条 `sed -i` 把 `index.html` 写成了 LF，且本机 grep 对 `\r$` 匹配不可靠（对已知 CRLF 的控制文件也计 0），一度误判幽灵写者；用 od 查实、node 恢复 CRLF。
**为什么不能信「`git status` 干净」**：本仓无 `.gitattributes` 而 `core.autocrlf=true`——索引存 LF、检出转 CRLF、提交再归一化，于是**工作树是 CRLF 还是 LF，git status 一律显示干净**。
**字节级核对**（脚本 `.superpowers/sdd/2026-09-19-scheme-a-skeleton/check-eol.mjs`）：
```
✅ ui/public/index.html   CRLF=6021   裸LF=0  字节 220165/220165
✅ ui/public/app.js       CRLF=12050  裸LF=0  字节 439487/439487
✅ ui/public/styles.css   CRLF=10976  裸LF=0  字节 273801/273801
✅ test/ui-layout.test.ts CRLF=96     裸LF=0  字节 3521/3521
（与 HEAD 的 LF 形态归一后逐字节相同）
eca67a0 相对 c236f81 在 index.html 行数净变化 +7 —— 与报告的 +8/−1 对上
```
**结论：`sed` 事故零残留**。同时立一条纪律：**行尾/内容核对一律用字节，不用 `git status`**（本仓配置下 status 对行尾是瞎的）。

Task 4: ★ **complete**（commits c236f81..**13f8759**，即 eca67a0 + 13f8759，review resolved）
Task 4: 定向复查结 —— **resolved**，三项要求全部落地且由复查者**独立复现**：
  ① 锁是真锁 —— 测试实际代码 `test/ui-layout.test.ts:87-95`，落在指定 describe 内；它在 node 里对两个字符串实跑正则：真 markup 标签 **匹配 true**、删类版标签 **匹配 false**；并额外证明退化路径真的存在（注释行 278 含该词、若只 `toContain` 全文件则删类后**仍绿**）——而标签级断言躲开了它。`id="workspace-git-chip"` 全文件仅 1 处，提取无歧义；`not.toBe("")` 守卫在，无恒绿路径。
  ② 能红可信 —— 复查者**自己复现**：用 Edit 工具精确删类（**没用 sed**）→ `ui-layout.test.ts:94:17` 红，received 串与实现者报告**逐字一致**；还原后 `git diff` 空（exit=0）、`git status --porcelain` 空，重跑 **9/9 绿**。
  ③ JSDoc「两处」准确 —— 复查者自己 grep `designModeActive\s*=\s*workspaceFace`：`index.html:1403` + `4823`，**恰好两处**；并核了辅助事实：`data-workspace-face` 在 `index.html:35/104/106`、`styles.css` 中 **0 处**（"CSS 已不挂它"属实）、负向锁在 `test/ui-file-tree.test.ts:292-293`。原 JSDoc 语义未被改坏（原文保留，被如实重框为目标态 + 警告）。
  复查者旁注一条我们都没盘的（**不构成失实，接受**）：`index.html:2317` 另有 `designMode: workspaceFace === "office"` 内联传参、`:4048` 有 `pendingTemplate` 的三元推导；注文数的是 `designModeActive =` 赋值形式、且未自称盘点全部内联比较——**这是计划 2/3 迁移时要一起收的**，已记。
Task 4: 控制者独立核 —— 复查者的变异复现**零残留**：四个文件 `check-eol.mjs` 全 ✅（0 裸 LF、与 HEAD 逐字节相同）。**"它说还原了"照例不算证据。**

---

## 最终全分支审查

**已派（opus —— 技能要求"以能力最强的可用模型派发"，不是会话默认）**
- 范围：`cc77d28`（merge-base，已用 `git merge-base main HEAD` 核过）… `13f8759`
- 复查包：`.superpowers/sdd/2026-09-19-scheme-a-skeleton/review-cc77d28..13f8759.diff`（**6 commits，128326 字节**）
- ★ **注意范围比"计划 1"大**：`cc77d28..HEAD` 里 **含 A+B（`61995c6`）**——它是计划 1 的 BASE 之前就在分支上的。**这才是会合进 main 的全部内容**，所以最终审查按整支派，不是按计划派。
- 派单内容：plan 路径（含全部 勘误 块，作为修正后的权威）· Spec（`.superpowers/brainstorm/198-1789817065/content/` 的 5 套方案 + 50 个状态）· A+B 的来源（`UX-AUDIT-3.md` / `RESEARCH-AGENT-UI.md`）· Global Constraints · 只读纪律（**禁 `sed -i`**、禁写 `eval/persona-ux/**`）· 不许派 subagent · **逐条分诊账本里的每个 `minor (deferred)`**（给"合并前修 / 单独立项 / 放着"三选一）· 已知事实（12 条基线失败 + 抖动、三处已裁的偏差、两脸 git 链路在 4201 上不可观测、四次"计划文本不真"）
- 明确邀请它**挑战**我给的已裁事实，而不是照单全收——**这一条是有来由的：Ruling 12 就是"我把错数字写进派单、reviewer 照单全收"**。
- 提示它去找**别的缝**（量过的那条 T2×T3 已告知结论、不必重测）。

**★ 分支收尾要记得的两个未跟踪归档物**（有先例：`docs/superpowers/plans/2026-09-18-*.md` 与 `eval/persona-ux/_audit-20260915/**` 都已入仓）：
- `docs/superpowers/plans/2026-09-19-scheme-a-skeleton.md`（计划文档 + 全部勘误）
- `eval/persona-ux/_audit-20260919/**`（本次走查的报告、调研、全部探针与截图；`.gitignore` 只忽略 `_audit-*/video/`）
- `mcp.json` 的 `M` 是**会话开始前就有的**既有改动，**不是我们的，不要提交**。

**最终审查结：With fixes —— 0 Critical / 4 Important / 8 Minor。** 全文存 `.superpowers/sdd/2026-09-19-scheme-a-skeleton/final-review.md`（含逐条 fix 指路与完整的 deferred-minors 分诊表）。
审查者自己跑了**全量：3630 条、12 失败、逐条对上基线、零新增**；活页探了 4201（含一条没人列过的：≤700px + 持久收起偏好下 48px 条正常，此前那里左栏直接消失；以及`<summary>` 里的芯片**不会**误触 `<details>`）；对新的结构性测试做了内存变异。**零 Park 项该挡合并。**

**四条 Important（都是"锁没锁在真东西上"这一族，与账本里那四次同根）：**
- **I1** 首页"核查关"芯片**说假话**：`index.html:2348` 传 `selectedState ?? {}`，无 run 时 `verify` 为 undefined → 无条件渲染；而真值是 `#verify-toggle`（发送路径 `index.html:3989/4141` 读的就是它），且**没有 `change` 监听、不会自愈**。审查者活页复现：勾上复选框，芯片照旧说"核查关"。
- **I2** **"防再次脱钩"的锁没锁在调用点**：三条断言查容器/id，**没有一条断言 `index.html` 真的调了 `patchCapabilityBar`**——删掉那一行，12 条测试全绿而能力条再次死掉，**正是这个提交要防的 12 天 bug 原地复刻**。
- **I3** `test/ui-layout.test.ts:53` 的 `/width:\s*48px/` **也匹配 `min-width: 48px`**——内存变异证明：删掉 `width: 48px` 测试照绿，条子回落到 280px 宽的宽面板。
- **I4** `sidebarRailItems()` 没接线 + JSDoc 是**第五次"现在时的假陈述"**（说 index.html 会按 id 找按钮，没这回事；id 还是逻辑名）。

**Ruling 13（I1 的语义裁决 —— 我没把这题转手给实现者）**
审查者给了两个选项（"从复选框取源"vs"没 run 就不渲染"）。**我裁：一律以 composer 的开关为准**——即 `patchCapabilityBar({ ...(selectedState ?? {}), verify: verifyToggle?.checked === true }, harnessSnapshot)`，并加 `change` 监听重画。
**依据是代码自己的话**：那个调用点上方的注释就写着「能力条跟着 composer 走：换模型/**换核查开关**都发生在这儿」——**而代码从来没读过那个开关**；`index.html:3989/4141` 的发送路径读的也正是 `verifyToggle.checked`。`capabilityChips` 的 JSDoc 说 `verify`"开着是默认"，而真默认是关（`index.html:3423` ← `composerDefaults`）。
**"核查关常显是不是噪音"不在这一刀里**——那是设计决定（属于"只在弱态占位"那条原则与 H 簇），单独立项。**我的修法不会让它更糟**：修前默认路径**也**常显，只是说假话；修后照样常显，但说真话。
**代价**：若日后想改成"只在 run 页显示"，改的是同一个调用点，一行。

**Ruling 14（M2 —— 账本的"已回写进计划"被证明不可信）**
审查者 grep 证实：**Ruling 6**（split 的 preview 规则**必须排在空槽 hider 之后**，两条特异性都是 (0,3,0)）**根本不在计划里**，尽管账本标着"已回写进计划"。只有 CSS 注释带着它。**照计划字面做的人会写出一个静默无效的修复**——正是计划自己的失败模式。
**裁决：接受，作为流程教训记下**（审查者把它列进 Recommendations 第 3 条："立下一份计划时，把账本里'已回写进计划'的说法当作未经验证、直到 grep 过"）。**这条对我自己成立**：我今晚就犯过一次同型的错——说完"已回写"实际没落进正文，后来自查才补。**根因是我把"我打算写"记成了"我写了"。**
**处置**：M2 本体留作计划 2 的输入（计划 1 已接近收尾，不再动它的正文结构）。

**★ 我此前 Park 的两条被审查者升格：**
- **git 支撑的 workdir 夹具** → **立成计划 2 的入场条件**（否则 Code 脸整个 git 家族继续只在人工口径下签收）。
- **L5 外壳资源无 `Cache-Control`** → **尽快排**：它能让任何前端修复对用户不可见（除非硬刷新），**而它已经骗过审查者一次**（也骗过我一次）。

Task-final-fix: dispatched（sonnet）—— **一次做完合并前的全部 8 项**（I1 / I2 / I3 / I4-JSDoc / T1-2 / T3-2 / T3-3 / T3-4），约 25 行、除 I1 外零生产行为风险；分两笔提交（`fix(ui)` 行为一刀 + `test(ui)` 锁与注释一刀）；I1 与 I3 都要求**变异验红再还原**并贴红输出。

Task-final-fix: 报完成（`fa96229` fix(ui) I1 行为 + `97d5323` test(ui) 锁与注释，共 2 files 18.7KB diff）
- **全量**：3606/3633 passed、**12 failed**——**它自己 `git worktree` 回基线 `13f8759` 实测对比**，失败名全等（`ui-server` 隔离跑两边逐条一致），**零新增**；另含 1 条基线同样有的 EBUSY 套件清理竞态与 1 条仅全量并行负载下出现的 v2-3b 超时抖动。
- **变异验证**：I1 / I2（删调用行）/ I3（删 `width: 48px`）三种变异都**恰红一条**、还原后经 `git diff` 核过。
- **方法学值得记**：它没靠"我记得基线是什么"，而是**开了个 worktree 回基线把失败名逐条打出来比对**——这正是本仓"判定是不是我改坏的，要先建基线"那条记档规矩的正确执行。

**控制者独立核（fix 轮）**：
- 字节：`check-eol.mjs` 四文件全 ✅（0 裸 LF、与 HEAD 逐字节相同）。
- `git worktree list` 只剩主工作树——**它没留下临时 worktree**。
- **I1 活页端到端自验**（`verify-final-i1.mjs`，欢迎页，真 `change` 事件）：
```
初始        开关=false  芯片=说「核查关」   ✅ 一致
点一次开关    开关=true   芯片=说「」        ✅ 一致（核查开着是常态，格子本就该消失）
再点回来     开关=false  芯片=说「核查关」   ✅ 一致
不刷新就跟着变：✅ 会        控制台错误：零
```
**审查者当初抓到的假话已消失，"换核查开关都发生在这儿"那句注释现在成真了。**

Task-final-fix: scoped re-review 已派（sonnet，本分支合并前**最后一道门**）—— 复查包 `review-13f8759..97d5323.diff`；八项逐条判，其中 **I2 / I3 / T3-2 三处锁要求变异证明**（删调用行 / 删 `width: 48px` / 把 split 显形规则移到 hider 之前），并**逐条自报还原后 `git diff` 是否为空**；附带判有无**范围蔓延**。已告知 I1 的活页一半由我验过、它只需判代码与测试。

Task-final-fix: 复查结 —— **not resolved**（一条残留 + 一条非阻塞洞），八项里 **7 项真做完且锁经变异验证为真锁**：
- **I2 真锁**（删调用整行 → 恰红一条，13 passed/1 failed）；**I3 真锁**（删 `width:48px` → 红；改成 `min-width:48px` → 仍红，负向后顾不再误匹配）；**T3-2 真锁**（把显形规则挪到 hider 之前 → 恰红那条顺序断言，`43900 > 44279` 断言了 reveal 下标 < hider 下标）；**T3-3** 孪生规则核实存在（`styles.css:1670-1671`）；**T3-4** 耦合已写（`rail-policy.js:35-40`）；**I4** 只改注释未接线未删函数（六个真实 id 在 `index.html:109/144/147/150/153/157` 全在）；**I1** 接线与监听都在。**范围零蔓延**（7 文件 +75/−6 全落在八项内）。
- ★ **残留 1（T1-2 not done）**：修复者把「**ch 在这个文件里已经不存在**」写进了注释——**句新假话**。**根子在我**：终审报告的"`ch` 不再存在于该文件"这个前提**本身是错的**，我**原样抄进了派单**，修复者照着写。**这是"转述被当事实"（R12）与"字面被当意图"（R3/R9/R10/R11）的第 7 次同族**——而且这次链条是**审查者→我→实现者**，每一环都没去核。
- ★ **残留 2（非阻塞洞）**：修复者自加的接线锁**被注释喂饱**——断言是"函数体一带出现过 `verifyToggle`"，而 `index.html:2349` 的注释里就有它。**变异 1b**（只删接线、留调用行与注释）→ **14/14 全绿**，即"核查格脱钩"这半条回归没有测试抓得住。
- 复查者还自报一次事故：它的 Edit 工具把 CRLF 写成了 LF，中途用 `git show > file` 修复时**被 MSYS 管道把 CRLF 转成 LF、"两份同源文件互相比较"蒙混过关**，最后是 `check-eol` 抓出来的，用 `git checkout HEAD --` 修好。**它如实自报了——这正是那条口径规矩值钱的地方。**

**控制者裁决残留（不再转第 N 轮）——两条各 1–2 行，我直接改：**
- 残留 1 → 注释改成"**本处**原先的 ch 上限已删——别处的 ch 上限是别的区域的事，没动"。**我先自己 grep 核实了那 10 处**（`695/703/720/3537/4492/4760/5748/5754/7391/7484`），没信转述。
- 残留 2 → 断言收紧成**接线表达式本身** `/verify:\s*verifyToggle\?\.checked === true/`。
- **我自己做了变异证明**：删接线、留调用行与注释 → **1 failed / 13 passed**（旧断言下同一变异 14/14 全绿）；还原后 `check-eol` 核过 `index.html` **逐字节与 HEAD 一致**；两文件重跑 **23/23 绿**。
- 提交 **`1f4bab0`** `test(ui): 收紧核查格接线锁 + 把 styles.css 那句新假话改成实话`。提交后四文件 `check-eol` 全 ✅。

**★ 至此八项全部关闭，两条残留由控制者收口，本分支的审查循环终结。**

---

## 分支收尾 · Step 1 全量测试（在待整合的这棵树上）

**结论：零新增确定性失败。** 但过程里我自己踩了一个坑，值得记。

**第一次全量（`1f4bab0`）：13 failed / 3605 passed。** 比文档基线多一条 → **不靠"我觉得是抖动"糊过去**，按本仓规矩查。
- 逐条比对：`run-crash-inject` 2 条（基线 1）、`ui-server` 2 条（基线 1）超了；`ui-patch`×3 的 Received 里出现了我 Task 2 的注释，**必须排除是我弄的**。
- **`ui-patch` 已直接看清**：测试期望一个用 `\n` 拼的多行块，而工作树是 CRLF——**就是那条既有的 CRLF 家族**（Received 里出现我的注释只是把整份文件开头当成了实际值）。
- **隔离跑**：`run-crash-inject` 1 failed / 9 passed、`ui-server` 1 failed / 276 passed——各 1 条，与基线**条数**一致 → 全量里多出的是并行负载产物。

**★ 我踩的坑：worktree 基线对比被 cwd 污染。**
我在 `.review-base`（worktree，`cc77d28`）里跑了全量，得 **20 failed / 3556 passed**。但**基线里 `cli-json`×5 / `cli-lazy-startup` / `cli-plan-verdict` / `design-mode` 都在失败**——**这些是 spawn 活页测试，换个目录行为就变**（node_modules 从父目录解析、路径长度、cwd 都不同）。**这份对比不是苹果对苹果，不能用。** 反过来说：它比分支多 7 条失败，**很容易被我误读成"分支修好了 7 条"**——那是个假结论。
（顺带：它自己的失败名单里 `ui-server 产物取件` 与 `ui-workspace-git-api` 都在——两条都是账本已记档的并行抖动，印证了这两个文件不稳。）

**改用同树同目录重跑（这才是真判据）：第二次 12 failed / 3606 passed。**
两次之间**失败成员漂移**：
- 第一次多出的 `run-crash-inject · write_file 发射 prepared/committed`、`ui-server · v2-3b approval_expired` → **第二次消失**
- 第二次多出 `ui-workspace-git-api · 脏工作区 409 dirty_worktree`
**成员在两次同树运行之间移动 = 抖动的签名，不需要再推理。**

**确定性核心 11 条**：cloud-sync-env×2 · run-crash-inject×1（审批等待中硬崩溃）· ui-handoff×4 · ui-patch×3 · ui-server×1（跨 run 资源互斥）+ **一个轮换的抖动位**。
**分支上每一条失败，要么在基线失败集里，要么是同树跨运行会消失的轮换项。**

**★ 记档纠正**：账本与项目记忆里的"**12 条稳定失败**"——**那份清单自己只加到 11**。实测确定性核心是 **11**，第 12 个位置是抖动。已改记忆。
**产物**：`.review-base` worktree 已 `remove --force` 清掉，`git worktree list` 只剩主工作树。

**控制者跨任务缝检查（T2 × T3）——缝上没长东西，但过程中抓出我自己复核里的一个盲点。**

**缝是什么**：每个任务的 reviewer 只看自己那段 diff，看不见任务之间。这条缝是真的：Task 2 把左栏收起态从「整个消失」改成 48px，而 Task 3 的 `railPolicy()` 吃 `sidebarWidth`（`index.html:5215` → `railSidebarWidth()` → `index.html:1324` 的**实测值**）。于是**收起左栏会给右栏腾出空间**，右栏可能自己从 tabbed 升到 split 档——那样 Task 3 那条"窄档回归护栏"就在收起态下不成立了。

**实测**（脚本 `verify-seam-t2t3.mjs`，真视口、真点收起键）：
```
视口  左栏态  侧栏宽  右栏档   右栏宽  树    preview  主区宽
1440  展开      312  split    282   200    82 flex  1128
1440  收起       48  split    360   200   160 flex  1392
1100  展开      292  tabbed   240     0     0 none   808
1100  收起       48  tabbed   275     0     0 none  1052
```
**结论：档位不变。** 我担心的那一档（1100 收起后主区 1052px，够宽，可能被提升到 split）**没有被提升**——档位判据吃的是**视口宽**不是剩余空间，1100 恒 tabbed。收起左栏只让右栏 282→360 变宽（地方大了，合理）。零控制台错误。

**★ 顺带抓出我自己复核里的盲点（值得记）**：
这个探针第一版在点 `#sidebar-collapse` 时被 Playwright 判"被拦截"重试到超时——拦截者是 `#sidebar-expand`（收起态的浮动展开键，`position: fixed` @(8,10)、36×36、`z-index:40`、与侧栏横向重叠）。
那一刻我意识到：**我 Task 2 的验收集 `verify-task2-sidebar.mjs` 判"按钮可见"用的是 `getBoundingClientRect()`——纯几何**（宽高 >2px、右下边在屏内）。**一个元素可以几何上漂漂亮亮地摆着，却被别人盖在上面吃掉点击**，而那种探针照样打 ✓。这正是仓库里记过的「浏览器实测才抓得到的缺陷类型」的正中靶心，**盲点长在我自己的工具里**。
**补测**（`verify-task2-hittest.mjs`，`elementFromPoint` 打在每个按钮中心）：
```
收起态 侧栏宽 48px；#sidebar-expand @(8,10) 36×36 position=fixed z=40 ★与侧栏横向重叠
✓点得到  new-chat-btn @(27,151)  ✓ board-open-btn @(24,202)  ✓ artifacts-open-btn @(24,242)
✓点得到  schedules-open-btn @(24,282)  ✓ memory-btn @(24,322)  ✓ settings-open-btn @(24,362)
✓点得到  notifications-btn @(24,70)  ✓ theme-picker @(24,110)
结论：八个按钮全部真的点得到。控制台错误：零
```
**为什么这次没事**：展开键在 y=10..46，最上面那个图标（`notifications-btn`）中心 y=70、高 34（顶边 ≈53）——刚好错开，没有压上。
**处置：Task 2 的"⚠️ 已解"结论成立，不改代码。** 但 `verify-task2-hittest.mjs` 留档——**几何可见 ≠ 点得到**，以后凡是"收起态/浮动元素"的可见性验收，一律走命中测试，不走 `getBoundingClientRect()`。
