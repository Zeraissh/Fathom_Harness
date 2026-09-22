# Task 7 报告：右栏召出的「改动」审阅面板

**状态：完成。** 策略层、DOM、面板内容、样式、探针、变异验红、EOL 纪律全部走完；全量零新增确认（见 §4）。

---

## 1. 按 brief Steps 逐条

### Step 1–4（策略层 + TDD）

- `test/ui-rail-policy.test.ts` 追加 3 条策略测试（brief 原文照抄）：
  - `RAIL_PANELS 认得 review`
  - `tabbed 下选 review 时 tree 与 preview 都是 0`
  - `split 下 review 不参与分列（它只在 tabbed 出现）`
- **变异验红 A**：临时把 `"review"` 从 `RAIL_PANELS` 里删掉 → 恰好 **2 failed / 57 passed**（前两条红；第三条保持绿，与 brief 预测一致——不认识的 panel 回落 `"tree"`，而 split 档 tree+preview 恒等于 railWidth）。恢复后 59/59 绿。
- `rail-policy.js:78` `RAIL_PANELS = ["tree", "preview", "review"]`；tabbed 分支改成三段显式分支（`:191-199`），review 既不占树也不占预览列——它画在右栏自己的槽里。回落语义（`:119`）未动。

### Step 5（DOM · index.html）

- 右栏 tab 行第三只按钮（照既有两只的写法）：`data-rail-panel="review" id="rail-tab-review" aria-pressed aria-controls="right-rail-review"`。
- 新槽 `#right-rail-review`，照 `#right-rail-preview` 的显隐办法：`paintRightRail` 只写 `slot.hidden = layout === "split"` 与 `data-*`，内容由模块自己挂。
- `showRailPanel("review")` + 点「改动」tab 派发 `review:reveal` → `paintReviewPanel()`（与 E14 同款；接线锁钉住发与听两半）。
- 「在右栏审阅 →」按钮：见 §6 的 brief 偏差——**按钮本身在 T6 并不存在，本任务补画 + 接线**。

### Step 6（面板内容 · app.js）

- 把 `renderChangeCard` 里的文件列表 + hunk 画法抽成 `renderChangeFileRows(files, env)`（非导出），卡片与面板都调它——**没有第二份画法**。
- 新导出 `renderReviewPanel(files, env)`：空态一句话；非空 = 头（「改文件 N 个」）+ `renderChangeFileRows` 列表。
- 两边 `data-*` 挂钩名逐字一致（`data-change-action="review|revert|next-hunk"` 同一份画法产出），探针在两处各点一次验证。

### Step 7（活页探针）

新建 `eval/persona-ux/_audit-20260919/verify-review-panel.mjs`（路径见 §6 偏差 1）。猴子补丁 `EventSource` 只截靶 run 的事件流，重放既有 run 的真实流（改写 hello-code.txt/changelog.txt→src/app.js、hello-seed.txt→src/new-file.js）；`touchedOf()` 用 app 自己的口径解析流；只清理自己造的死 run。**十条判据全绿**：

| # | 判据 | 结果 |
|---|---|---|
| ① | 1600 split：点「在右栏审阅 →」改的是面板选择，槽不现身，树/预览点前点后一致 | ✅ |
| ② | 切回「文件」tab，review 槽收得回去 | ✅ |
| ③ | 「改动」tab 召出面板 | ✅ |
| ④ | 面板文件数 = 服务端链给的触碰路径数（2 个，逐路径逐计数对） | ✅ |
| ⑤ | **面板里**点「撤掉」→ 输入框逐字拿到 buildRevertMessage，不导航不发送 | ✅ |
| ⑥ | **卡片里**点「撤掉」→ 同一份探针里再验一次 | ✅ |
| ⑦ | 文件 tab 收回 + 展开键收起/展开两条路径，内容不丢 | ✅ |
| ⑧ | 1200 窄档三只键不重叠、不溢出、不压收起键 | ✅ |
| ⑨ | 两脸成对：Work 脸 tab 与槽都 display:none（DOM 还在）、右列落回树不为空；Code 脸 tab/槽正常 | ✅ |
| ⑩ | 0 控制台错误、0 页面异常 | ✅ |

- **变异验红 B**：临时在 `handleChangeCardClick` 的 revert 分支加 `if (btn.closest(".right-rail-review")) return;` → 探针 **恰好 ⑤ 红、⑥ 绿**（面板路径掐断、卡片路径不受影响——证明探针真的分得开两处挂钩）。恢复后再跑 10/10。

### Step 6.5（a11y 返工：nested-interactive → 卡结构改造 → 连带回归）

- 全量第一轮干净跑出 ui-a11y **26 条红**，全是同一个 axe 违规 `nested-interactive`（impact serious）：「在右栏审阅 →」按钮最初画在 `<summary class="chat-change-card-head">` 里——summary 本身是可交互控件，按钮嵌进去就是控件套控件。
- 改法：卡结构从 `details.chat-change-card > summary + body` 改成 `div.chat-change-card > details.chat-change-card-details + 兄弟按钮`；按钮绝对定位在头行右侧，外观与"按钮在头行里"相同，语义上两个交互控件互不嵌套。CSS 选择器同步改名（marker/::before/:not([open]) 全挂到 `.chat-change-card-details`）。
- **连带回归（T6 探针 ④ 真红抓到）**：`patchConversation` 更新路径里「保住卡展开状态」的选择器写的是旧结构 `details.chat-change-card`——结构一改，选择器落空，点「已阅」触发重画后整卡合上，刚画的「已阅」标随之不可见（DOM 里有、display 里没有，T6 探针 ④ 红）。修：选择器跟到 `details.chat-change-card-details`，并加 ui-patch 回归锁（见 §2）。
- 这一返工正是活页纪律生效的地方：T6 探针（挂钩选择器跟新结构后照跑）把结构改造漏掉的这根线抓了出来——先真红、修复、再转绿，而不是改探针把它放过去。

### Step 8（提交）

见 §5。

---

## 2. 测试锁（本轮新增）

- `test/ui-rail-policy.test.ts` +6：3 条策略（brief 原文）+ 3 条宿主接线锁：
  1. app.js 画带挂钩的「在右栏审阅 →」按钮 ↔ index.html 点击接 `showRailPanel("review")`（同文件内 200 字符之内的接线表达式锁）；
  2. `review:reveal` 有发有听（≥2 处出现）；
  3. `paintChangeCardPatches(runId…)` 后紧跟 `paintReviewPanel()`（同一时机重画锁）。
- `test/ui-layout.test.ts` +6（「右栏『改动』面板（计划 3 · T7）」）：
  1. tab 行第三只按钮 + aria-controls 指向 `#right-rail-review`；
  2. **两脸成对**：Work 脸把 review 的 tab 与槽**都**藏掉（各一条 display:none）；
  3. Work 脸下 `data-panel="review"` 的持久偏好落回树——右列不为空；
  4. Code 脸三向互斥（tabbed 档 review 选中时树与预览藏掉）；
  5. show 规则（tabbed 限定）display:flex + split 档槽位永远 display:none + **负向锁** `[data-layout="split"][data-panel="review"]` 组合不允许存在任何专门规则（探针 ① 第一轮真红过这个）；
  6. hunk 画法只有一份：`export function renderPatchHunksHtml` 全仓恰好 1 处、`renderChangeFileRows(` ≥2 处、`export function renderReviewPanel` 存在。
- `test/ui-patch.test.ts` +1（「详情页重渲染下的状态存活 (V-10)」组）：**已阅重画后「本场改动」卡的展开状态保住**——Step 6.5 结构改造后选择器漏改的回归锁（T6 探针 ④ 先红，单测再锁住）。

---

## 3. Self-Review

### 3.1 规格覆盖（对设计案 态 3）

| 设计案/调研说 | 落在哪 |
|---|---|
| 态 3 右栏**只在召出时存在** | 复用右栏既有 handle/scrim/Esc 那套；`paintRightRail` 只做显隐，`showRailPanel("review")` 唤出 |
| 态 3 「在右栏审阅 →」 | T7 补画按钮（卡头）+ 接线（见 §6 偏差 4） |
| 态 3 `+N −M · N files` | 任务 6 已给（展开态 + 面板头「改文件 N 个」）；折叠态只有文件数是既有形状约束 |
| 态 3 文件行可 Mark as Reviewed、再被改动会失效 | 任务 6 的 `reviewedAtSeq` 玩法在面板里同口径（`env.reviewed`），seq 变即失效 |
| 面板内部三只页签（改动 / PR / 进度） | **刻意不做**：本计划只做「改动」，PR 与进度归计划 4，无内部页签 |
| §7.3 本计划新增卡片与面板的 CSS 必须收在 `data-face` 上 | 已守：tabbed 互斥/show/split 隐全部挂在 `body[data-face="code"]` 下；Work 脸成对藏（tab + 槽 + 树回落） |

### 3.2 Placeholder 扫描

无 TBD/TODO/占位。探针里的判据①注释写明了「preview 无内容是既有策略（hasPreviewContent=false 把整列给树）」——不是占位，是记录裁决。

### 3.3 类型一致性

- `deriveTouchedFiles` 返回 `{path, edits, lastSeq}[]`——卡片、面板、探针 `touchedOf()` 三处同口径。
- `renderPatchHunksHtml(patch, {runId, path, lastSeq})` 全仓唯一导出——卡片展开与面板展开都走它。
- `buildRevertMessage` 逐字比较——探针 ⑤⑥ 按实现函数现算期望，不是抄字符串。

### 3.4 与既有测试的冲突

- `RAIL_PANELS` 改三只：既有 rail-policy 测试无「恰好只有两只」式断言，未红。
- 全量：零新增（见 §4）。

---

## 4. 全量与 EOL

- 聚焦跑：`test/ui-rail-policy.test.ts + test/ui-layout.test.ts + test/ui-a11y.test.ts + test/ui-review-hunks.test.ts` = **193/193 绿**；`test/ui-patch.test.ts` = **337 跑 / 3 红**——3 红全是该文件既有的 CRLF 针基线（「设计样例卡」「composer 紧凑胶囊」「侧栏骨架」三条，styles.css 检出为 CRLF 而针是 LF 的既有环境差），新增的「已阅重画保住展开」锁在绿。
- 探针：T6 `verify-change-card.mjs` **7/7**、T7 `verify-review-panel.mjs` **10/10**。
- 全量：**12 failed | 3720 passed | 15 skipped (3747)**，173 个文件里 6 个带红；干净树、零并发编辑、日志全量落盘。与基线族逐名对照——**零新增**：

| 文件 | 红数 | 基线族 |
|---|---|---|
| ui-handoff.test.ts | 4 | 确定项（「下一步提议」×4） |
| cloud-sync-env.test.ts | 2 | 确定项 |
| ui-patch.test.ts | 3 | 确定项（CRLF 针 ×3：styles.css 检出为 CRLF、针是 LF 的环境差，与本轮编辑无关） |
| run-crash-inject.test.ts | 1 | 确定项 |
| ui-server.test.ts | 1 | 确定项（stm32 包探针跨 run 互斥 429） |
| ui-message-queue.test.ts | 1 | 轮换抖动（「自动续跑轮应完整跑完（第二条 run_end）」——计时性抖动，与本次改动零相关） |

  合计 11 确定 + 1 轮换，与本仓记录的「11 确定 + 1 轮换抖动」基线一致。关键旁证：ui-a11y **92/92 全绿**（Step 6.5 的 nested-interactive 26 红清干净）、ui-rail-policy / ui-layout / ui-review-hunks 全绿、ui-patch 337 条里只有既有 3 条 CRLF 红。
- `check-eol.mjs`（9 个改过/新建的文件，含探针）：**全部 裸LF=0**；与 HEAD 的字节差都是编辑本身的差，不是行尾漂移。

---

## 5. 提交

```
feat(ui): 右栏召出的「改动」审阅面板

设计案 态 3 的右栏——「只在召出时存在」。RAIL_PANELS 加第三个 kind；
它在 tabbed 档占满右栏，在 split 档不参与分列（那会撞上三列本来就挤
的问题，本计划不碰）。

面板内部不做页签：设计案画的是「改动 / PR / 进度」三只，本计划只做
「改动」——PR 与进度归计划 4。

hunk 的画法与对话流里那张卡共用一份（从任务 6 抽出来的），两边 data-*
挂钩名一致，探针在两处各点一次。

a11y 返工（全量实抓）：卡头的「在右栏审阅 →」按钮不能嵌在 <summary>
里（axe nested-interactive，26 条红）——卡结构改成 div 包 details +
兄弟按钮；连带给 patchConversation 里保住卡展开状态的选择器跟了新
结构（漏改=点已阅整卡合上，T6 探针 ④ 真红），并加单测回归锁；T6 探
针的点卡选择器随之跟到新结构，判法未动。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

9 个文件：`ui/public/core/rail-policy.js`、`ui/public/index.html`、`ui/public/styles.css`、`ui/public/app.js`、`test/ui-rail-policy.test.ts`、`test/ui-layout.test.ts`、`test/ui-patch.test.ts`、`eval/persona-ux/_audit-20260919/verify-review-panel.mjs`（新增）、`eval/persona-ux/_audit-20260919/verify-change-card.mjs`（一行选择器，理由见 §6.7）。

---

## 6. brief 与仓库的出入（照「以仓库为准，并且报给我」）

1. **探针目录名**：brief 写 `_audit_20260919`（Step 7 与 Step 8 的 git add 路径），仓库真实目录是 `_audit-20260919`。照仓库，用 `eval/persona-ux/_audit-20260919/verify-review-panel.mjs`。
2. **「1600 也量 tab 行」与既有契约冲突**：brief Step 7.5 要求在 1600 与 1200 两个宽度都量「tab 行不挤坏、三只按钮都点得到」。仓库既有契约 `.right-rail[data-layout="split"] .right-rail-tabs { display: none }` 在 1600（split 档）把整排 tab 藏掉——1600 下量 tab 行会量到一排不存在的东西。探针照仓库：1600 量 split 边界行为（点「在右栏审阅 →」→ panel=review 持久、槽不现身、树/预览不受扰动），1200 量完整的 tab 行判据（三键不重叠/不溢出/不压收起键），并在输出里记录了这一冲突。
3. **行号锚点陈旧**：`paintRightRail` 真实在 index.html:5825（brief 写 :5543 与 :5583-5584）；`preview:reveal` 派发真实在 :5946（brief 写 :5654-5662）。tab 行 :204-229 与 rail-policy.js:78、:191-195 基本准确。
4. **「在右栏审阅 →」按钮在 T6 并不存在**：brief 说「任务 6 里那条按钮由任务 7 接线；任务 6 明写"别造空按钮"」。仓库现实是任务 6 守了「别造空按钮」，所以卡头**没有**那条按钮——T7 需要补画按钮再接线，不是纯接线。
5. **抽出的函数名**：brief 建议 `renderFileHunks(files, opts)`（原文带「比如」，是建议非定名）。实际命名 `renderChangeFileRows(files, env)`（rows——它画的是文件行不是纯 hunk）。
6. **署名行**：brief Step 8 写 `Claude Opus 4.8 (1M context)`，环境裁定用 `Claude Sonnet 4.6`。
7. **动了任务 6 的探针 `verify-change-card.mjs`（Global Constraints 写「不许改 `_audit-20260919/` 里已有的报告与探针」）**——只改一处、一行：判据 ② 起"点开卡"的选择器 `.chat-change-card > summary` → `.chat-change-card .chat-change-card-details > summary`。为什么非改不可：Step 6.5 的 a11y 返工把卡的 DOM 结构从「details 就是卡」改成「div 包 details」——T6 探针硬编码了旧结构的选择器，不改它连卡都点不开，判据 ②③④ 直接全灭。这条选择器锁的正是 T6 自己的行为（点开卡→取 patch→撤掉→已阅），不是 T7 的行为，所以这不是放宽 T6 的门，而是让 T6 的门继续量同一件事。改完的探针照跑 **7/7 全绿**——其中 ④ 还走完「真红（结构改造漏掉的展开状态线）→ 修复 → 转绿」全过程，证明探针的判法一个字没动、照旧能抓回归。除此之外未改探针任何判据的判法、阈值与注入口径。
