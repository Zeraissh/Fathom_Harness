# P5 活页证据（2026-09-18）

评的是 **`feat/ui-center-contract` 分支的活产品**。
计划：`docs/superpowers/plans/2026-09-18-p5-process-grouping.md`；设计：`docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §P5。

证据只认：屏幕原文、页面 DOM 事实、亲手跑的脚本。不把单测绿当「活页已经好了」。

---

## 1. 方法与仪器

| 项 | 本轮事实 |
|---|---|
| 宿主 | `npx tsx ui/serve.ts`，端口 **4199**（隔离，不碰 4173/4174） |
| 历史 | `AGENT_RUN_HISTORY_DIR=D:/Work/scratch/p5-hist`，只放三个**真实归档 run** |
| 浏览器 | Playwright `chromium` |
| 样本来源 | `_scan-p5.mjs` 按**成组规则的真实定义**扫全部 50 个归档 run（见 §4 的勘误） |
| 取证脚本 | `p5-groups.mjs`（输出 `p5-groups.json`） |

---

## 2. 导航上踩到的两个坑（都写进脚本了）

1. **`#/run/<id>/log` 会被产物自动跳转顶掉**——有产物的 run 加载后 hash 变成 `#/run/<id>/artifact/N`，事件流面板被替换。做法：等它跳完，再把 hash 打回 `/log`。
2. **事件流面板在收起的 `#detail-drawer` 里**，见 §5——这一条不只是坑，是个缺陷。

---

## 3. 判据结果：9/9 成立

样本（`_scan-p5.mjs` 按规则扫出后复制进独立 history）：

| 样本 | runId | 规则预测 |
|---|---|---|
| two-steps | `5d6a3212-1716-4be7-99db-0dbfb20228e5` | 恰好 1 组、2 步 |
| one-step | `cli-1789390950045` | 0 组、1 个 tool_call |
| with-failure | `1c6df73a-ce2b-46f4-97f1-66f19c97a1f6` | 有组且有失败结果 |

```
PASS  判据1 恰好一组两步 run 出现一条组
PASS  判据1 组标题写「用了 2 步」
PASS  判据2 点开后组体有明细（条目数 ≥ 步数 且 > 0）
PASS  判据2 组体里的明细全是展开态（不留假行）
PASS  判据2 组展开后自己不再是折叠态
PASS  判据3 单步 run 没有组
PASS  判据3 单步 run 工具条内联可见
PASS  判据4 含失败 run 里失败条目独立于组
PASS  判据4 同一 run 里组与失败共存
```

原始事实：

| 样本 | 组 | 组数 | 内联工具条 | 失败条 | 失败落在组内 |
|---|---|---|---|---|---|
| two-steps | `▸ ⋯ 用了 2 步 bash、update_progress` | 1 | 11 | 0 | 0 |
| one-step | （无） | 0 | 2 | 0 | 0 |
| with-failure | `▸ ⋯ 用了 2 步 bash、update_progress` | 1 | 9 | 2 | **0** |

展开后的组体（two-steps 与 with-failure 相同）：

```
{ hasBody: true, innerEntries: 3, innerExpanded: 3, innerBodyRendered: 3,
  innerSeqs: ["6:→", "7:→", "8:✓"], groupStillCollapsed: false }
```

`6:→ 7:→ 8:✓` = 两条 `tool_call` + 一条成功 `tool_result`。**步数 ≠ 条目数**：组标题写「用了 2 步」（2 个工具调用），组体是 3 条时间线条目。这一点我第一版判据写错了（拿"步数"当"条目数"），误判成 FAIL，已改成「条目数 ≥ 步数」，见 §6。

`with-failure` 那条最关键：同一屏里**既有组又有 2 条失败结果，而失败条目 0 条落在组体内**——即失败没有被组吞掉。

---

## 4. 勘误：我第一次挑错了样本

第一轮我用 `c33b8c94`（write_file → read_file）当"两步"样本，结果活页里**没有组**。查下来是我的扫描错了，不是实现错了：

我第一版扫描只在「工具步的子序列」里数连续，忽略了 `turn_start` / `assistant_text` 这些**会把组切断**的条目。`write_file`(第 1 轮) 与 `read_file`(第 2 轮) 之间隔着 `turn_start`，**本来就不该成组**。

`_scan-p5.mjs` 改成把**完整时间线**喂给同一套规则后，`c33b8c94` 的预测就是 `0 组 / 3 个 tool_call`——与活页一致。选样本这一步本身也成了一次验证：**实现的行为与规则的定义逐条对得上**。

---

## 5. 缺陷（与本次改动无关，但正是 P5 靶子所在）

**「运行详情」抽屉在活页上不可达。**

事实链（全部可复核）：

1. 抽屉的标记是 `ui/public/app.js:5613`：
   ```js
   '<details class="detail-drawer" id="detail-drawer" hidden>' +
   '<summary class="drawer-summary">运行详情：Loop / 上下文 / 工具 / 核查</summary>' +
   ```
   事件流面板（`.log-entries`）就在它里面（`app.js:8269` 挂 `.log-entries`）。
2. `ui/public/styles.css:334` 有 `[hidden] { display: none !important; }`，所以 `hidden` 就是真的看不见。
3. **全仓只有一处写 `parts.drawer`，而且是"设上 hidden"**：`app.js:11270` `if (parts.drawer) setAttr(parts.drawer, "hidden", "")`。而 `setAttr` 的语义（`ui/public/dom/patch.js:96-102`）是：值为 `""` 时走 `setAttribute`，即**设上**，不是摘掉。
4. 穷举「摘 hidden」的写法（`hidden", false` / `hidden = false` / `removeAttribute("hidden")` / `hidden", null`）在 `ui/public/` 里共 20+ 处，**没有一处指向这个抽屉**。

结论：抽屉被创建即 `hidden`，此后没有任何代码摘掉它，而 `<summary>` 因为 `hidden` 也点不到——**用户走不到事件流面板**。这与 `app.js:7714-7715` 的文案「完整过程也在下方「运行详情」」自相矛盾。

本仓库自己的 a11y 测试也知道这件事：`test/ui-a11y.test.ts:52-67` 的注释写着「四因子卡与下钻面搬进了默认收起的 `<details>`——**axe 不扫收起的 details 里的内容**」，并提供了一个 `openDrawer()` 助手**手动** `d.hidden = false; d.open = true`。

**本轮取证的处置（如实披露）**：我用**与 `openDrawer()` 同款的 DOM 操作**打开抽屉，再**派发真实 `click` 事件**到 `.log-entry-header`（走的是产品自己绑的 `onToggleEntry` 监听，没有绕过它）。这不是用户可达路径，是取证手段——所以本节单独记为缺陷，P5 的判据成立范围是「事件流面板的 DOM 与交互」，不是「用户能走到它」。

**建议**：这属于 spec §P1（空间契约）那一带的「右列/面板谁该在、谁该藏」，应单独立项；修法要么在渲染时按状态摘掉 `hidden`，要么把抽屉改成一个真正可见的入口。**本刀不修**，因为它会改变 P1 的边界。

---

## 6. 本轮撤回的一处改动：对话面的「≥2 阈值」

计划 Task 4 原本要把 `collapseToolGroups`（`app.js:10208`）的门槛从 `> 0` 改成 `>= 2`，理由是"单个工具不该假装有过程抽屉"。**实测后撤回**，原因是会退人话：

| | 组渲染 `renderToolGroup` | 单行 `renderToolRow` |
|---|---|---|
| 大回执折叠保护 | ✓ | ✓（都走 `renderToolResultBody`） |
| **人话动词**（「把原图载入本轮」） | ✓ 用 `toolHeadline` | **✗ 只显示 `view_image` + 路径**（用 `toolPeek`） |
| live 高亮类 | `chat-tool-group--live` | `chat-tool--live` |

改阈值后打破了 4 条既有测试（`流式输出直接长在对话里`、`直播工具组摘要是关键字高亮`、`view_image / describe_image 工具名人话`、`20KB HTML 工具回执不进用户/助手主气泡`），**它们断言的不是要废掉的旧行为，而是"单工具也要有人话动词"**。为了兑现一行字而丢掉最常见一步（单工具）的人话，取舍是反的。

正确改法（留给单独一刀）：先让单工具渲染保住人话动词与 live 高亮，**再**拆 `<details>` 抽屉。两步同刀。已写进计划 Task 4 的撤回说明。

---

## 7. 测试状态

| | 结果 |
|---|---|
| `npx vitest run test/ui-app.test.ts test/ui-faces.test.ts` | 412/412 通过 |
| `npx vitest run test/ui-patch.test.ts …` | 仅基线那 3 条失败（`设计样例卡…`、`composer 是紧凑胶囊…`、`侧栏骨架…`），P5 用例全绿 |
| `npm run typecheck` | 无输出 |
| `npm run test:changed-coverage -- --base main` | `checked=0 uninstrumented=0 uncovered=0`（改的是 `ui/public/*.js`/`.css`，不在插桩范围） |

基线不绿的成因见 `p2-evidence.md` §6。

---

## 8. 本轮没做的事

- 没修 §5 那个抽屉缺陷（会改变 P1 的边界）
- 没做对话面单工具拆抽屉（见 §6，需要同刀改渲染）
- 没碰 `eval/persona-ux/_audit-20260915/`（别人的档案）
- 没提交截图（`p5-*.png` 留在磁盘，照 `.gitignore` 里「截图搬到 scratch」的惯例不进仓）
