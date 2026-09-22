# Task 2 报告：左栏收成图标条

**状态：** DONE_WITH_CONCERNS（实现完成、测试全绿、活页已验；含一处对 Task 1 测试 helper 的必要偏差，见下）

**提交：** `df577d5` feat(ui): 左栏收起态从『整个消失』改成 48px 图标条

---

## 1. 实现了什么

| 文件 | 改动 |
| --- | --- |
| `ui/public/app.js` | 新增纯函数 `sidebarRailItems()`（放在 `renderRunList` 之前，第 4846 行处），返回 6 条入口：`new-chat / board / artifacts / schedules / memory / settings`，每条带 `id`、`label`、`title` |
| `ui/public/styles.css` | `body.sidebar-collapsed .sidebar` 由 `display:none` 改为 48px 图标条（`width/min-width:48px; overflow:hidden`）；新增一组 `display:none` 选择器（`.run-list` / `.run-search-row` / `#home-spend` / `#workspace-face` / `.sidebar-brand` / `.new-chat-btn span`）；`.sidebar-top-tools` 与 `.sidebar-footer--icons` 改 `flex-direction:column` |
| `test/ui-layout.test.ts` | 追加 `describe("左栏收起态是图标条，不是消失")` 3 个用例 |
| `test/ui-app.test.ts` | 导入块加 `sidebarRailItems`；追加 `describe("sidebarRailItems：收起态图标条上放什么")` 1 个用例 |

代码与测试**逐字照搬 brief**，未自创选择器 / id / 命名。未新建任何 DOM（brief 已注明图标按钮本就在 DOM 里）；`sidebarRailItems()` 是能见度契约，不是渲染源。

## 2. 测试与结果

### TDD Evidence

**RED** —— `npx vitest run test/ui-layout.test.ts test/ui-app.test.ts -t "sidebarRailItems|图标条"`

```
Test Files  2 failed (2)
     Tests  4 failed | 295 skipped (299)
```

4 条新用例全红，两类原因都符合预期：

- `ui-layout.test.ts > 收起态仍占 48px 且不 display:none`
  `AssertionError: expected '\nbody.sidebar-collapsed .sidebar {\r…' not to match /display:\s*none/`
  —— 旧 CSS 就是 `display:none`。
- 另两条 `Error: 找不到选择器 body.sidebar-collapsed .run-list,...` / `... .sidebar-top-tools,...`
  —— 这些规则块尚不存在。
- `ui-app.test.ts` 侧 `sidebarRailItems is not a function`。

**GREEN** —— 实现后同一命令：

```
 ✓ test/ui-layout.test.ts (6 tests) 16ms
 ✓ test/ui-app.test.ts (293 tests) 119ms
Test Files  2 passed (2)
     Tests  299 passed (299)
```

### 全量套件（零新增失败，已用 HEAD 基线实证）

按仓库纪律先取了 HEAD 基线（`git stash push` 四个文件后跑全量，patch 已备份到 `D:\Work\scratch\task2-backup.patch`，随后 `git stash pop` 已还原）：

| | 失败数 | 失败集合 |
| --- | --- | --- |
| **HEAD 基线** | 12 | cloud-sync-env×2、run-crash-inject×1、ui-handoff×4、ui-patch×3、ui-server×2 |
| **本任务改动后** | 11 | 同一集合的子集（ui-server 一条在本次并行负载下侥幸通过） |

基线 12 与 controller 给的文档基线逐条吻合；本任务**零新增失败**。另有一次全量跑到 14（多出 `ui-workspace-git-api` 超时等并行抖动），亦全部落在既有基线文件内。

### 活页确认（Step 5，真浏览器）

- 起隔离宿主：`AGENT_UI_PORT=4211 npx tsx --env-file-if-exists=.env ui/serve.ts`（跑的是工作区当前 `ui/public/`，即本次改动）。
- Playwright 脚本复用 `verify-ab.mjs` 骨架，但**没有改 `eval/persona-ux/**`**（硬约束），改写到仓库根的一次性脚本 `.verify-task2.mjs`，跑完已删。走的是真实用户路径：点 `#sidebar-collapse` / `#sidebar-expand`，不直接改 class。

实测：

| 断言 | 展开态 | 收起态 |
| --- | --- | --- |
| `#sidebar` 宽度 | 312 | **48** ✅ |
| `#new-chat-btn` | 可见 287×32 | **仍在 DOM 且可见** 30×32 ✅ |
| `#new-chat-btn span` | 可见 | `display:none` ✅ |
| `.run-list` / `.run-search-row` / `#home-spend` / `#workspace-face` / `.sidebar-brand` | 均可见 | 均 `display:none` ✅ |
| `.sidebar-top-tools` / `.sidebar-footer--icons` flex-direction | `row` | **`column`** ✅ |
| 6 个图标按钮（board/artifacts/schedules/memory/settings/notifications） | 34×34 | 全部仍 34×34 可见 ✅ |
| `#sidebar` 横向溢出 | 0 | **0**；最宽子孙 47px ≤ 48 ✅ |
| 再点展开 | — | 回到 312 ✅ |
| console errors | — | **[]** ✅ |

截图（已随临时文件删除）确认：48px 竖排图标条 = 收起箭头 / 铃铛 / 主题 / 橙色「+」/ 看板 / 产物 / 日程 / 记忆 / 设置；品牌、搜索、列表全部让位。

## 3. Self-review

- **完整性**：brief Step 1–6 全部执行；无遗漏需求。
- **质量**：注释为中文且解释 WHY（旧行为是什么、错了会怎样），符合仓库风格。CSS 注释写清了「为什么藏这些」「为什么改竖排（5×34=170px 溢出 48px）」。
- **纪律**：只改 brief 点名的 4 个文件；未新建 DOM；未动 `eval/persona-ux/**`；未把 `mcp.json` 或两个 untracked 目录带进提交。
- **测试**：TDD 先红后绿；新用例验的是真实行为（CSS 结构 + 纯函数返回值），不是同义反复。

## 4. 偏差与关注点（需 controller 裁决）

### 4.1 唯一的偏离：`test/ui-layout.test.ts` 的 `block()` 加了行尾归一

**症状**：brief 里那两条**多行选择器**的用例，在实现完全正确的情况下依然会失败：

```
Error: 找不到选择器 body.sidebar-collapsed .run-list,
body.sidebar-collapsed .run-search-row, ...
```

**根因（已实证）**：`git ls-files --eol` 给出 `ui/public/styles.css: i/lf w/crlf`，`core.autocrlf=true` 且无 `.gitattributes`。仓库里存的是 **LF**，Windows 检出后工作区是 **CRLF**。helper 裸 `indexOf('\n' + selector + ' {')`，而多行选择器是用 `\n` 拼的 —— 文件里却是 `\r\n`，于是**同一份正确样式在本机判「找不到」、在 CI（LF）判通过**。我用 node 复现验证过：同一份块，CRLF 文件 `indexOf` 返回 `-1`，LF 文件返回 `0`。

**处置**：在 `block()` 里 `const text = source.replace(/\r\n/g, "\n")` 后再查找，并写了注释说明 WHY。**这是对 Task 1 已审过代码的 6 行改动**——因为不这么做，brief 指定的测试在本机根本不可能绿；而只改我来写的那部分又做不到（测试代码要求逐字照搬）。行尾归一也让 helper 在两种检出下结论一致，顺带消除了一个环境相关的地雷。

**为什么没走「把工作区文件整成 LF」那条路**：那只能修当下——`core.autocrlf=true` 下次检出又会变回 CRLF，同一测试再次翻车。归一 helper 是唯一在两种环境下都成立的解法。

**如果 controller 认为不该动 Task 1 的 helper**：撤销这 6 行即可，但需接受「本机跑这两个多行用例必红、只有 CI 绿」。

### 4.2 其余观察（均非本任务引入）

- 展开态 `#sidebar` 实测宽 **312px**，而 `.sidebar` 声明的是 280px —— 来自别处的覆盖，与本次改动无关（本任务只碰 `body.sidebar-collapsed .sidebar`，展开态实测前后一致）。
- 收起态把 `.run-search-row` 整行藏掉，连带里面的 `#sidebar-filter-btn` 也无入口。这是 brief 明确规定的行为（选择器逐字照搬），只是提示：后续若要「收起仍能筛选」，得单独想办法。
- `ui-workspace-git-api` / `ui-server` 在全并行下会抖（本次两次全量分别 14 / 11），属文档记载的既有现象。

## 5. 清理

- 临时脚本 `.verify-task2.mjs`、截图 `task2-collapsed.png` 已删除（未入库）。
- 宿主进程：`TaskStop` 后端口仍在应答（Windows 僵尸），已按已知坑 `taskkill //PID <pid> //T //F`，复核端口关闭、无残留 node。
- patch 备份留在 `D:\Work\scratch\task2-backup.patch`（仓库外）。
