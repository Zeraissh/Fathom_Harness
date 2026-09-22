# Task 3 Report: 右栏 split 档的两处结构缺陷

## Status

DONE_WITH_CONCERNS（详见「与 brief 的差异」——两处均为 brief 自身验收标准（Step 4/5）逼出来的最小调整，代码与注释文本均按 brief 逐字落地）

## What was implemented

1. **`ui/public/core/rail-policy.js`**
   - 新增常量 `TREE_MIN_PX = 200`（带 WHY 注释，位置在 `RAIL_DEFAULT_SPLIT_RATIO` 之后，逐字按 brief）。
   - `railPolicy()` 的 split 分支改为 brief 给出的公式：`tree = Math.min(railWidth, Math.max(TREE_MIN_PX, Math.round(railWidth * splitRatio))); preview = railWidth - tree;`，连同 brief 的逐字注释。**只动了 split 子分支**，`else if (panel === "tree")` 与 `else` 分支（tabbed/overlay 共用路径）一字未动。
2. **`ui/public/styles.css`**
   - 新增 `.right-rail[data-layout="split"] > .right-rail-preview { display: flex; }`（逐字按 brief，含 brief 的逐字注释）。
   - **放置位置与 brief 的行号提示不同**（见差异 2）：放在 `.right-rail-preview:not(:has(> .preview-dock:not([hidden]))) { display: none; }`（空槽隐藏规则）**之后**，并补了一行 WHY 注释说明该放置是 load-bearing。
3. **`test/ui-rail-policy.test.ts`**
   - 追加 brief 的逐字 describe「split 档：树要有下限，preview 列不能再是 0」（4 条用例，含 tabbed 回归护栏）。
   - 更新既有用例「splitRatio 决定并排比例」：`splitRatio 0.25 → 0.75`（见差异 1）。

## What was tested and results

### RED（Step 2）

```
npx vitest run test/ui-rail-policy.test.ts -t "split 档"
```

结果：**1 failed / 4 passed**。

```
FAIL test/ui-rail-policy.test.ts > split 档：树要有下限，preview 列不能再是 0 > 树有下限 200px —— 此前 141–180 时 _probe2-p… 全不可辨
AssertionError: 1440 档的树太窄: expected 145 to be greater than or equal to 200
```

与 brief 的预期（第一、二条红）有一处出入：**只有第一条红**。第二条「preview 列不再是 0」在旧实现下**本来就绿**——旧 JS 返回的是 `preview = railWidth - tree`（1440 档 = 145 > 0），实测的 0×0 是 **CSS** 的 `display:none`（空槽规则压掉的），不是 JS 返回值。该用例在 JS 层面锁的是「split 下 preview 不再退化为 0」的回归，真正的 0×0 由 CSS 规则 + 活页探针验证。这一红正是本任务要修的根因（141–180 太窄），符合 TDD 预期。

### GREEN（Step 4）

```
npx vitest run test/ui-rail-policy.test.ts
```

结果：**46/46 全部通过**（含既有 42 条 + 新增 4 条）。

### Step 5 活页量三档（真浏览器）

brief 的探针脚本硬编码 `http://127.0.0.1:4173`，而本机宿主在 `http://127.0.0.1:4201`。eval/ 是档案不许改，因此把脚本**复制**到 `.superpowers/sdd/2026-09-19-scheme-a-skeleton/probe-task3/`（gitignored），sed 改 BASE 为 4201，并顺带改成从侧栏挑一个 4201 上真实存在的 run（brief 里的 HEAVY run id 属于 4173 宿主的数据，4201 上不存在——直接用会落在欢迎态、右列 0 宽，量不到 split）。

4201 上先跑基线（改前），复现了三轮走查的原始症状：

| 档 | 改前 tree | 改前 preview |
|---|---|---|
| 1920 | 180 | 0×0（display:none） |
| 1600 | 161 | 0×0 |
| 1440 | 141 | 0×0 |

改后：

| 档 | 改后 tree | 改后 preview | 判据 |
|---|---|---|---|
| 1920 | **200** | **160**（可见） | tree ≥ 200 ✓ preview > 0 ✓ |
| 1600 | **200** | **122**（可见） | ✓ ✓ |
| 1440 | **200** | **82**（可见） | ✓ ✓ |
| 1100（tabbed 护栏） | 240 | 0（不变） | 回归护栏 ✓ |

不再出现 141px，preview 也不再是 0×0——brief Step 5 的预期全部满足。树行实测宽度随列宽同步变宽（docs 行 148 → 187）。

### 全量测试

`npx vitest run` 跑了两次（第二次留全量日志到 /tmp/task3-full-suite.log）：

- **第一次：13 failed（6 files）——与基线逐项一致**：cloud-sync-env×2、run-crash-inject×1、ui-handoff×4、ui-patch×3、ui-server×2、ui-workspace-git-api×1（文档记载的并行抖动）。**零新增失败**。
- **第二次：17 failed（9 files）**——多出的 4 条：ui-github-pr-api×1（git 测试超时）、ui-message-queue×1（事件时序断言）、workspace-git.test.ts×1（git 超时）、ui-workspace-git-api 多 1 条（超时）。四个文件都不 import rail-policy、不读 styles.css/index.html（只测服务端/git 端点），**单独跑 4 文件 26/26 全绿（7.8s）**——纯满并行负载下的抖动，与本次改动无关。
- 结论：**零新增失败**（基线 12 稳定 + git 族抖动，两次跑都覆盖不到我的三个文件之外的失败归属）。

## Files changed

- `ui/public/core/rail-policy.js`
- `ui/public/styles.css`
- `test/ui-rail-policy.test.ts`

提交：`c236f81 fix(ui): 右栏 split 档 —— 树给下限，preview 列不再是死的`（3 files, +53/−3；mcp.json 的既有改动未纳入）

## 与 brief 的差异（两项，均为验收标准逼出来的）

1. **既有用例「splitRatio 决定并排比例」必须跟着改**。它断言 `tree === round(railWidth * 0.25)`（1600 档 = 83）。新下限 200 会把 83 抬到 200，该断言在新契约下必然为假；brief Step 4 要求整个文件 PASS，因此必须改。最小改法：比率换成高于下限的 0.75（`round(330*0.75)=248`，新旧实现均通过），用例名与「比率决定比例」的语义原样保留，另加注释说明 0.25 会撞下限、下限语义由新增 describe 锁着。**未改任何 tabbed/overlay 用例。**
2. **CSS 新规则必须放在空槽隐藏规则之后**（styles.css:1761 附近），而不是 brief 行号提示的 split 规则区（~1594）。原因：`.right-rail[data-layout="split"] > .right-rail-preview`（0,3,0）与 `.right-rail-preview:not(:has(> .preview-dock:not([hidden])))`（0,3,0）**特异性相等**，同特异性按源顺序后者胜。放回 split 规则区会被空槽规则重新压成 `display:none`（探针页面里坞是 hidden 的，正是空槽规则命中场景），修复等于没做、Step 5 必然失败。放在其后则 split 档 preview 列恒可见，tabbed 档空槽隐藏行为不变（规则只匹配 split）。活页探针证实了这个判断：放在当前位置后 preview 82/122/160 全部可见。

## Self-review findings

- **完整性**：brief 的 Step 1–6 全部执行；无新接线需求（index.html:5260-5261 已在写 `--rail-tree-w`/`--rail-preview-w`，未动）。
- **质量**：JS/CSS 注释均为 brief 逐字 + 必要的一行 WHY（CSS 放置原因）；新常量 `export const TREE_MIN_PX = 200` 按 brief 命名与导出。
- **纪律**：只改 split 子分支；未加第二个真相源（没有 railColumnsFor）；未动 eval/persona-ux（探针走 gitignored 副本）；diff --check 干净；styles.css 保持纯 CRLF（10972 个 CRLF、0 个 lone LF）。
- **测试**：TDD 红-绿成立（红 1 条正是根因）；活页证据来自真实浏览器，未造假。
- 遗留观察：split 档且坞无可见内容时，preview 列现在是**有边框的空列**（82/122/160px）。这是方案 A 计划 1 的既定取舍（「剩下的全给 preview」+ Step 5 判据 preview > 0），不是回归；若日后想恢复「无内容即藏」，需要把空槽规则改成排除 split，但那会重新引入 R4。

## Issues / concerns

- 与 brief 的两处差异（差异 1/2）是审查重点：都源于 brief 自身验收标准（Step 4 全文件 PASS、Step 5 探针 preview > 0）与现状冲突，逐字文本未改。
- brief 对 RED 的预期（两条红）与实际（一条红）不符：preview > 0 在旧 JS 下本来就成立，0×0 是 CSS 症状——已在 RED 小节记录。
