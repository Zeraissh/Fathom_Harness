# 中栏契约 —— UI 使用体验设计

**Status:** Draft（待维护者审阅）
**Date:** 2026-09-18
**Deciders:** Agent_Design 维护者
**Related:** `eval/persona-ux/_audit-20260915/IMPROVE.md`；`eval/persona-ux/_audit-20260915/walks/p1-cursor-claude.md`、`p3-approver-security.md`；`docs/ui/ui-current-state-report.md`

---

## 1. 背景

用户裁决（2026-09-18 走查对话）：

- **最痛的区域**：对话流 + 发送栏，右侧文件树 + 预览坞。审批卡与左栏未被指认。
- **难受的方式**：四种全中 —— 挤·抢·乱 / 看不明白 / 伸手就断 / 慢·顿·跳。
- **姿态**：对话优先打底；「并排工作台」是可达且被记住的状态，不是冷启动默认。

四种症状同时出现，指向同一个成因：**中栏没有一份契约**——谁该多宽、什么时候出现、状态由谁说了算，三方各写各的。

---

## 2. 取证（读实现所得，非引用档案）

以下行号本轮亲自读过。09-15 的审计档案只用作线索，不作事实依据。

### 2.1 空间有三份契约，互不知情

| 抢占者 | 实现 | 位置 |
|---|---|---|
| 对话列 `#main-area` | `flex: 1 1 22rem`；`min-width: min(20rem, 42%)` | `ui/public/styles.css:1494-1510` |
| 文件树 `.files-rail` | `width: clamp(200px, 22vw, 280px)`；可折叠，偏好持久化 | `styles.css:3545-3613` |
| 预览坞 `.preview-dock` | `width: 38%` 兜底；可拖；宽度持久化；`<900` 退覆盖；有盖满态 | `styles.css:8843-8912` |
| 左栏 `.sidebar` | `width: 280px` 固定，可折叠隐藏 | `styles.css:373-384` |

**关键事实**：`styles.css` 里 `.files-rail` 一条 `@media` 都没有（`grep "@media" styles.css` 的 40 条里无一条命中 `files-rail`），而 dock 有独立断点 `styles.css:8913`。两个抢占者用两套断点。

没有一方负责「对话至少得多宽」，也没有一方负责「总宽不够时谁先让位」。

**记忆 key 也是两个**：`agent.ui.pref.filesRailCollapsed`（`ui/public/features/file-tree.js:26`）、`agent-ui-preview-dock-width`（`ui/public/features/preview-dock.js:42`）。

### 2.2 「当前目录」有两份真相，还带时序

- 树已经跟随发送栏：`getWorkdir: () => composerWorkdir()`（`ui/public/index.html:5020`）。
- 但 `composerWorkdir()` 在 `harnessSnapshot` 缺席时返回 `""`（`index.html:3565-3580`），树于是先渲染出 `noWorkdir`「先选一个工作目录。」（`file-tree.js:22`）。
- 补救是事后的：`syncFileTreeToComposer()`（`index.html:3582`）。

用户看到的「发送栏已有目录、树却说先选一个目录」，是补丁追不上时序。

### 2.3 状态宣布早于事实

- `artifact-canvas.js:1627` 在**选中**产物时 announce「产物画布已打开：X」——不是写盘成功后。
- 读不到文件时，无论什么原因都报同一句：`artifact-canvas.js:673 / 685 / 705 / 732 / 750`，文案「读取失败——文件可能已被移动或删除。」而真相常常是「还没写」。

### 2.4 过程折叠的粒度是「单条」而不是「一组」

`app.js:3867-3889` `defaultCollapsed()`：失败的 `tool_result`、`approval_request`、`api_retry`、`model_fallback`、`compaction`、`steering` 等展开；其余（`turn_start`、`tool_call`、**成功的** `tool_result`、`assistant_text`）逐条折叠。

结果：只读了一个文件的小 run，散成几条各自折叠的条——既不成「组」，也没有可点的过程抽屉；读写连着来时又本该成组。

---

## 3. 范围

### 做

- **P1** 空间契约：右侧合成一条列；对话下限；单一断点预算；单一记忆
- **P2** 单一上下文真相：`currentWorkdir` 一处派生 + 就绪态
- **P3** 宣布纪律：写盘才说话；读不到分三类
- **P4** 伸手就断：点文件必开、看「改了什么」，以及两条**待复现**条目
- **P5** 过程显示：按「同一 run 内连续 ≥2 个工具调用」成组

### 不做（明确出局，各自单独立项）

- **编辑器化**：不做行内编辑、不做多文件编辑器、不做完整 IDE。树保持浅列读文件。
- **性能（打字延迟 / 流式一顿一顿）**：用户选了「慢·顿·跳」，但本 spec 只处理其中**可归因于布局**的部分（窄屏错位、预算塌陷）。纯性能问题需要先证伪（SSE 帧率？渲染粒度？diff 算法？），单独立项，不在这里凭猜改。
- **左栏信息架构**：用户未指认左栏，不动。
- **审批卡文案与结构**：用户未指认，且审计第 5 节明确「批准人话」是做得对的地方，别误伤。

---

## 4. 设计

### P1 · 空间契约

#### 4.1.1 DOM 变化

```
#center-row  (flex row)
├── #main-area                对话/内容 — 不变
└── #right-rail               新增：右列唯一 owner
    ├── [data-panel="tree"]       文件树（#workspace-file-tree 搬入）
    └── [data-panel="preview"]    预览（preview-dock 搬入）
```

右列内部有一个 tab 行（文件 / 预览）。**列内 vs 浮层**的区分保留，但写成明文规则：

- **列内**（占位、可拖、被记住）：文件树、当前产物 / 正在做的东西
- **浮层**（不占位、`Esc` 关）：临时瞄一眼 —— 引用的旧文件、附件

保留浮层是刻意的：`styles.css:8885-8893` 的注释写明「瞬态预览不该把对话挤窄」，这个判断是对的，不推翻。

`#action-dock`（`index.html:214`）不在本契约内——它占的是**纵向**空间（钉在提交栏上方），与横向预算无关，保持原样。

#### 4.1.2 仲裁函数（单一真源，纯函数可单测）

`ui/public/core/rail-policy.js`：

```js
export const CENTER_MIN_PX = 416;   // 26rem —— 对话列的不可侵犯下限
export const RAIL_MIN_PX = 240;     // 右列下限
export const RAIL_MAX_PX = 360;     // 右列上限
export const RAIL_COLLAPSED_PX = 40;
export const SPLIT_MIN_PX = 1440;   // 允许并排两列的最小视口宽

/**
 * @returns {{ mode:"side"|"overlay", layout:"split"|"tabbed",
 *             centerWidth:number, railWidth:number,
 *             tree:number, preview:number, collapsed:boolean }}
 * tree / preview 是各自实际占的像素；0 = 该面板不显示。
 */
export function railPolicy({ viewportWidth, sidebarWidth, preferredWidth, splitRatio, panel, collapsed })
```

判定顺序（`available = viewportWidth - sidebarWidth` 是主区能用的总宽）：

1. `railCap = clamp(preferredWidth, RAIL_MIN_PX, RAIL_MAX_PX)`；`railBudget = available - CENTER_MIN_PX`
2. **先定档，再在档内解释 `collapsed`** —— 两档里 `collapsed` 不是一个意思：
   - `railBudget < RAIL_MIN_PX` → **`mode:"overlay"`**（预算关不上，右列不占位）
     - `layout = "tabbed"`，`railWidth = railCap`
     - `collapsed` = **抽屉关着** → `railWidth = 0`，`tree = preview = 0`，`centerWidth = available`
     - 否则按 `panel`：`tree = railWidth, preview = 0`（或反之），`centerWidth = available`（覆盖，不挤压）
   - 否则 → **`mode:"side"`**
     - `collapsed` = **收成细条** → `railWidth = RAIL_COLLAPSED_PX`，`tree = preview = 0`，`centerWidth = available - RAIL_COLLAPSED_PX`
     - 否则 `railWidth = min(railCap, railBudget)`，`centerWidth = available - railWidth`
       - `layout = viewportWidth >= SPLIT_MIN_PX ? "split" : "tabbed"`
       - `split` → `tree + preview = railWidth`，按 `splitRatio` 分
       - `tabbed` → 按 `panel` 给满：`tree = railWidth, preview = 0`（或反之）

自洽性核对（左栏 280 展开）：视口 936 → `available = 656`，`railBudget = 240 ≥ 240` → `side`，`railWidth = 240`，`centerWidth = 416`；视口 935 → `available = 655`，`railBudget = 239 < 240` → `overlay`。边界恰好落在 936，与 §4.1.5 一致。

#### 4.1.3 断点是算出来的，不是硬编码的（**修正**）

走查时我口头说过「`<900` 退覆盖，和现在 dock 的断点是同一个数」。**这句不成立**，按本预算算一遍：

| 量 | 值 |
|---|---|
| 左栏 `.sidebar` | 280px 固定 |
| 对话下限 `CENTER_MIN_PX` | 416px（26rem） |
| 右列下限 `RAIL_MIN_PX` | 240px |
| **`side` ↔ `overlay` 的真实边界** | 280 + 416 + 240 = **936** |

也就是预算算出来的边界是 **936**，不是 900。900 是当初 dock 单独写的数，没有预算依据。**声明 900 会是一个假断点**。

**决定**：`side` ↔ `overlay` 的边界**由预算算出**（左栏展开时是 936），不写死数字；`SPLIT_MIN_PX = 1440` 写死（并排需要两条列各自够宽，这是产品判断不是预算）。

被替代的 `preview-dock.js:45` `DOCK_NARROW_BP = 900` 由此删除。

另一条路是「把下限降到 22rem(352) 让边界落回 900」——否决：26rem 是对话读得下去的下限，为了迁就一个既存的魔法数去牺牲阅读宽度，取舍反了。

#### 4.1.4 记忆

单一 key 取代两个旧 key：

```js
// agent.ui.pref.rightRail
{ collapsed: false, layout: "tabbed", width: 288, splitRatio: 0.5, panel: "tree" }
```

迁移：初值依次读 `agent-ui-preview-dock-width` → `agent.ui.pref.filesRailCollapsed` → 默认。旧 key 不删（降级回滚时不丢用户偏好），只是不再写。

#### 4.1.5 断点表

| 档 | 条件 | `mode` | `layout` | 右列 |
|---|---|---|---|---|
| 宽 | ≥ 1440 | `side` | `split` | 树与预览各一列，列间可拖 |
| 中 | 936 – 1439 | `side` | `tabbed` | 单列互斥，tab 切换，可拖可折叠 |
| 窄 | < 936 | `overlay` | `tabbed` | 不占位，退覆盖抽屉，默认收起 |

### P2 · 单一上下文真相

定义 `currentWorkdir()` 为唯一派生入口。树、坞、`@`、预览、发送**只准**从它读。

| 情形 | 现在 | 改后 |
|---|---|---|
| 快照未到 | 树渲染「先选一个工作目录。」 | 「正在确认目录…」 |
| 快照到、有目录 | `syncFileTreeToComposer()` 事后补救 | 订阅：workdir 变 → 树/坞统一重渲染 |
| 确实没有可用目录 | 同一句话 | 才是「先选一个工作目录。」 |

**判决点**：`noWorkdir` 的触发条件从「我还没拿到」改成「**确实没有**」（`availableWorkdirs` 为空）。`syncFileTreeToComposer()` 删除。

`file-tree.js` 需新增字面量 `confirming: "正在确认目录…"`，并在 `host` 注入一个 `isContextReady()`。

### P3 · 宣布纪律

一条规则：**announce 只在事实发生之后。**

- **写盘成功** → 「已写出 `hello-b1.txt`」（新增，现在没有）
- **仅选中产物** → 不 announce。`artifact-canvas.js:1627` 的「产物画布已打开：X」改为静态标题「预览 · X」
- **读不到文件** → 分三类，不再一句话打死：

| 真相 | 文案 |
|---|---|
| 本 run 从未写成功过 | 「还没写到磁盘。」 |
| 写过，现已 404 | 「文件不在了（可能被移动或删除）。」 |
| 其它读失败 | 「读不动：<人话原因>。」 |

实现：需要一个「该路径本 run 写成功过吗」的判定，从 run 事件流里成功的 write 工具结果派生，**不新增持久状态**。`renderPreviewErrorCard` 的五处调用点（`artifact-canvas.js:673/685/705/732/750`）改走同一个分诊函数。

### P4 · 伸手就断

**本块设一道闸门：先复现，不复现就不改。**

| 条目 | 依据强度 | 处置 |
|---|---|---|
| 点文件必开 | 与 P1 绑定 | 必做：走右列 preview 面板，不再有第二套开法 |
| 看「改了什么」 | `changes-panel.js`（532 行）已存在 | **第一步是实拍现状**：跑一个改了文件的 run，打开 changes-panel，记下屏幕原文与它缺什么；据此决定「补一条行内 diff」还是「这面板本来就够了，删掉本条」。不预设要重写 |
| `@` 插入截断成 `@hello` | 档案条目，**实现读不出该 bug** | 先复现。`insertWorkspaceFileMention`（`index.html:3721-3737`）按 `trigger.query.length` 整段替换，逻辑自洽；可能已修，可能另有触发条件 |
| `#` / `/` / `$` 空响 | 档案条目 | 先复现 |

理由：09-15 之后有 30+ 个 commit（含 `5ddb01d`「`@` 可深搜」）。把档案旧症状当现状写进 spec，会让后续「证据只认屏幕原文」的走查做不了。**复现不了的条目从本 spec 删除，不占实施位。**

### P5 · 过程显示

按「**同一次 run 内连续的 ≥2 个工具调用**」成组，取代现在的逐条折叠：

- **单工具** → 不套抽屉，内联一行
- **连续 ≥2** → 折成一组，标题「用了 3 步」，展开出明细
- **思考** → 直播条跟尾（`app.js:6635-6688` 已做对，不动）；结束后进时间线默认折叠成一行摘要

`defaultCollapsed()`（`app.js:3867-3889`）的展开白名单**全部保留**——失败、审批、重试、换端点、压缩、信息队列这些「藏了变量」的条目必须继续展开。改动只落在「成功 `tool_result` / `tool_call`」这一类上：从逐条折叠改为按组聚合。

---

## 5. 不变量（不可违背）

来自审计第 5 节「做得对的，下一刀别误伤」。本 spec 的任何改动不得违反：

1. 默认 `autoApprove=false`（默认先问）
2. 批准卡人话，不回退 JSON 工具名
3. 停止三分词：「已停止」+「写入不会回滚」；已完成的才写「运行已完成」
4. Work 普通人话 `POST /api/runs` 必须 200，不因「设计模式更干净」请回 409
5. `[hidden]` 空壳不得被 `display:flex` 压过
6. 预览 txt 不整页开走 `file://`
7. `@` 列文件、旧对话走「引用会话」
8. 拒绝不写盘
9. 桌面 attach 不杀宿主

---

## 6. 验收

### 6.1 单测

- `rail-policy.test.ts`：断点边界 —— `935 / 936`（`side`↔`overlay`）、`1439 / 1440`（`tabbed`↔`split`）；`collapsed` 在**两档里语义不同**各一支（中档 → 40px 细条；窄档 → 抽屉关着、`centerWidth = available`）；左栏收起（`sidebarWidth = 0`，边界随之降到 656）；`preferredWidth` 越界（低于 `RAIL_MIN`、高于 `RAIL_MAX`）各一支。
- `currentWorkdir` 就绪态三分支（未到 / 已到 / 确实没有）。
- 读不到文件的三类文案各一支。
- 过程分组：单工具不成组 / 连续两个成组 / 中间插入失败结果不跨组。

### 6.2 活页回走

按 `eval/persona-ux/_audit-20260915/walks/p1-cursor-claude.md`（树 / `@` / 批准）与 `p3-approver-security.md`（花费 / 提问卡）**原地回走**，不另开新剧。屏幕原文写进 walks，与 09-15 活页逐句对照。

### 6.3 截图梯子 —— 探边界，不抄旧档案

旧档案的 `1280 / 1100 / 900 / 700` 探不到本契约的任何边界（1100 不是断点），作废。新梯子：

```
700    窄档内部
935    窄档最后 1px
936    中档第 1px      ★预算边界
1100   中档内部
1439   中档最后 1px
1440   宽档第 1px      ★产品边界
1600   宽档内部
```

判据：**935 与 936 必须是两种形态；1439 与 1440 必须是两种形态。** 任一不成立即边界写错。

### 6.4 回归

58 个 `test/ui-*.test.ts` 中动到 DOM 假设的：`ui-file-tree`、`ui-preview-dock`、`ui-file-preview`、`ui-artifact-canvas`、`ui-server-ux`、`ui-faces`。

---

## 7. 实施顺序

本 spec 覆盖一份契约的五个面，但**不是一次提交**。按风险从低到高、依赖从先到后：

1. **P2**（单一上下文真相）—— 不动 DOM，改派生与就绪态，最小面
2. **P3**（宣布纪律）—— 不动 DOM，改文案与分诊，信任收益最大
3. **P5**（过程显示）—— 不动 DOM，改分组规则
4. **P1**（空间契约）—— **唯一改现有 DOM 的一步**，单独一个提交，便于二分回滚
5. **P4**（伸手就断）—— 含复现闸门，可能收缩；依赖 P1 的右列已就位

P1 之所以排在 P2/P3/P5 之后：它是唯一会动结构和四个测试文件的一步，前三个先落地并各自可独立回滚，P1 出问题时不会连带把文案与纪律的修复一起回退。

## 8. 风险与代价

1. **DOM 搬迁是本 spec 最大的改动面。** `#workspace-file-tree` 与 dock 搬进 `#right-rail` 后，`app.js` 里 `#main-area .rail-body`、`#center-row:has(.files-rail)`（`styles.css:3609`）一类选择器和四个测试文件都要跟着动。这是唯一一处改现有结构的部分，建议单独一个提交。
2. **窄屏手感会变。** 点文件在 `<936` 时由浮层变成抽屉，是行为变化，必须在 6.2 的回走里确认不是退步。
3. **P4 允许收缩。** 两条待复现条目若复现不出来就从 spec 删除，这会缩小交付面——这是刻意的，不是失败。
4. **性能问题未处理。** 用户选了「慢·顿·跳」，本 spec 只解决其中布局可归因的部分。若实测仍有卡顿，需另立项，本 spec 不背这个账。
