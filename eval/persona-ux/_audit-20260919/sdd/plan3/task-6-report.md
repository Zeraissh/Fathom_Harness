# 计划 3 · Task 6 报告：对话流里的「本场改动」卡 + 已阅/撤掉/下一个 hunk

结论：**六条判据全绿**（活页探针两次全量通过），**全量测试零新增失败**（11 = 基线 12 − 轮换位），T7 交接形状已备（「在右栏审阅 →」按钮不接、`renderPatchHunksHtml` 已导出）。

---

## 1. 落地了什么

| 文件 | 内容 |
|---|---|
| `ui/public/app.js` | 两个新导出纯函数 `deriveTouchedFiles` / `buildRevertMessage` + 契约 1 安全绳 `toRepoRootRelative`；渲染链三处（`deriveChatItems` 产 `changecard` 条目、条目键派生、`renderChatItem` case）；`renderChangeCard`；**导出** `renderPatchHunksHtml`（T7 右栏审阅复用）；`chatItemSig` 新 case **随已阅集合变化** |
| `ui/public/index.html` | `reviewedAtSeq`（runId → Map\<path, 已阅时 lastSeq\>）；三个回调（已阅→写容器重渲染 / 撤掉→写输入框不发送 / 下一个 hunk→卡内滚动）；宿主侧取件（patch 缓存 key 含 lastSeq、git root 缓存、inflight 去重、契约 1 转换失败给诚实 note）；`bindChangeCardHost`（capture 阶段 toggle + click 委托） |
| `ui/public/styles.css` | 187 行，**全部挂在 `body[data-face="code"]` 下**（Code 脸专属）；卡片/文件/hunk 行样式复用 `--status-ok/--status-bad` 变量；已阅/撤掉/下一个图标全是 CSS 画形状，**HTML 里零 dingbat** |
| `test/ui-review-hunks.test.ts` | 12 条（deriveTouchedFiles ×3、buildRevertMessage ×3、toRepoRootRelative ×6） |
| `eval/persona-ux/_audit-20260919/verify-change-card.mjs` | 活页探针（判据六条） |
| `scripts/git-fixture.mjs` | 夹具演进：`src/app.js` 写成多行（见 §6 第 3 条） |

**T6→T7 交接（brief 8.c）**：卡片头**没有**「在右栏审阅 →」按钮——没有 `data-review-panel` 死按钮，由 T7 补按钮 + `showRailPanel("review")` + `saveRailPref({ collapsed: false })`。

## 2. TDD 证据

- **Step 1→2 红**：新建测试跑出 `deriveTouchedFiles is not a function`（照 brief 预期）。
- **Step 4 绿**：两个纯函数落地后 12 条全绿。
- **Step 5 变异验红**（本会话重跑捕获）：

  - 变异 A：摘掉 `deriveTouchedFiles` 里「只收成功的编辑」过滤 →
    ```
    × deriveTouchedFiles > 失败的编辑不算（改的是别的东西）
    Tests  1 failed | 11 passed (12)
    ```
    恰好红第二条，其余 11 条不动。已还原。
  - 变异 B：`buildRevertMessage` 在 header 取不到行号时硬编「第 1 行」 →
    ```
    × buildRevertMessage > 没有行号（旧下标形态 / 非 git）时退化成不提行号，但不许说假话
    Tests  1 failed | 11 passed (12)
    ```
    恰好红「不许编行号」那条。已还原。
  - **三处出现陷阱**：`if (!res || res.resultIsError) continue;` 在 app.js 里出现 **3 次**（别的函数也有同款过滤）。把**第一处**（不是 deriveTouchedFiles 那份）换成恒真过滤再跑——**12 条全绿**。证明测试锁的正是 deriveTouchedFiles 那一份，改错地方红不了。
- **ui-patch 既有锁的形状更新**（`test/ui-patch.test.ts:2207`）：`deriveChatItems` 的 kind 数组期望从 `["user","text","artifacts","verdict"]` 改为追加 `"changecard"`，并锁卡片 files/key——现有测试必须跟新形状走（与 T5 偏差 ⑤ 同类，不算新失败）。

## 3. 活页探针（brief Step 10）

**方法**：宿主 LLM 认证已死（POST /api/runs 的新 run 必 ~100ms 内 `model_call_end=error`），「用 git 夹具造一场真跑过编辑的会话」造不出来。照 `verify-artifact-route.mjs` 的 mock 模式：

- 起一个死 run（workdir=夹具）当靶；`addInitScript` 把 `window.EventSource` 换成回放器，**只截生产 URL `/api/runs/<死 run>/events`**，其余（`/api/stream`、别的 run 的流）全部放行给真 EventSource；
- 重放 6139d6d8 那场真跑过编辑的 run 的真实事件流（657 条），路径改写 `hello-code.txt→src/app.js`、`changelog.txt→src/app.js`、`hello-seed.txt→src/new-file.js`——三个名字在夹具里都真实存在（M + 未跟踪），diff 端点给得出真 patch；
- **期望触碰清单不硬编码**：探针自己用应用的同一套收法（成功的 edit_file/write_file/write_pptx）解析改写流 → `src/app.js · 2 处 · lastSeq=65`、`src/new-file.js · 2 处 · lastSeq=96`，DOM 与它对比；
- **判据 ① 的诚实改编**：死 run 自己的档案 0 次触碰，跟「服务端那条链」比恒假——mock 下量「卡片文件数 = 探针对改写流的解析数」；
- **判据 ④ 的注入**：已阅后给 mock 实例 dispatch 两条 MessageEvent（edit_file seq 1000 + tool_result seq 1001）——走生产 `reduceEvents → renderDetailWithState` 同一条路。node 级预证过：重放后触碰 65/96，注入后 `src/app.js` edits 3、lastSeq 1000 且重排（post-run_end 事件 reducer 不丢）；
- 判据 ③ 三问全问：进输入框（与 `buildRevertMessage` **逐字**相符）/ 地址栏 hash 不变 / user 消息 3→3 且 1.2s 后仍在框里；
- 判据 ⑤：localStorage 偏好 + reload 来回切，聚焦模式生效证据 17 处 `.rm-summary/.rm-hidden`，卡三态可见；
- **清理只删探针的靶死 run**（DELETE 200，列表确认消失）。

**原始输出（最终一轮）**：

```
夹具 diff：src/app.js 带上下文行 ✅
夹具 diff：src/new-file.js 合成 @@ -0,0 全 + 行 ✅
靶死 run=c419af90-ad1c-4f3c-8948-be177eadef3e（status=running，workdir=夹具）
重放源=6139d6d8-92de-4246-8686-2d2b81fd8eb4（657 条），改写后期望触碰：
  src/app.js · 2 处 · lastSeq=65
  src/new-file.js · 2 处 · lastSeq=96

—— 判据 ① ——
卡片标题：改文件 2 个 · 行：{"src/app.js":"2 处改动","src/new-file.js":"2 处改动"}
① 卡片在、文件数=服务端链给的触碰路径数 → ✅

—— 判据 ② ——
src/app.js 展开后 @@ 头：@@ -1,5 +1,5 @@ · 上下文行=4
src/new-file.js 展开后 @@ 头：@@ -0,0 +1,1 @@（未跟踪 → 合成全 + 行）
diff 端点取件：0 → 2（真去取过=true）
② 展开取到真 patch → ✅

—— 判据 ③ ——
输入框值：把 src/app.js 第 1 行起新加的 1 行、删掉的 1 行撤掉
期望（buildRevertMessage 逐字）：把 src/app.js 第 1 行起新加的 1 行、删掉的 1 行撤掉
三问：进了输入框（含路径）=true · 与 buildRevertMessage 逐字相符 · 没导航（hash 不变）=true · 没发送（user 消息 3→3，1.2s 后还在框里）=true
③ 撤掉只进输入框、不导航、不发送 → ✅

—— 判据 ④ ——
点已阅后标记出现=true · 注入 ok（edit_file seq 1000 + tool_result seq 1001）
注入后标记消失=true · src/app.js meta=3 处改动（期望 3 处改动）
④ 已阅随再改动自动失效 → ✅

—— 旁证 ——
最后一个 hunk 的「下一个 hunk」禁用=true（单 hunk 文件没有下一个）

—— 判据 ⑤ ——
完整模式卡可见=true → 聚焦模式卡可见=true（模式生效证据：.rm-summary/.rm-hidden 共 17 处）→ 切回完整卡可见=true
⑤ 阅读模式两种都量，卡片都在 → ✅

—— 判据 ⑥ ——
控制台错误：零 · 页面异常：零
⑥ 0 控制台错误 → ✅

清理靶死 run c419af90-ad1c-4f3c-8948-be177eadef3e：DELETE 200 · 已从列表消失=true
✅ 六条全成立
```

截图：`eval/persona-ux/_verify-shots/verify-change-card.png`。

## 4. 全量测试（零新增失败）

```
Tests  11 failed | 3708 passed | 15 skipped (3734)
```

failed 名单 = 基线 12 **减去轮换位** `ui-server > approval_expired`（该条 standalone 已绿，MEMORY「全量测试不是绿基线」的 11 确定 + 1 轮换口径）：

- cloud-sync-env ×2、下一步提议（ui-handoff）×4、空态/侧栏密度（ui-patch CSS，CRLF 针）×3、RUN-02 crash injection ×1、stm32 探针互斥 ×1 —— 全部是基线成员，**零新增**。
- passed 3708 = 3695 + 12（review-hunks 新测试）+ 1（轮换位这次过了）。

## 5. EOL（check-eol.mjs）

```
ui/public/app.js              CRLF=12408 裸LF=0
ui/public/index.html          CRLF= 6548 裸LF=0
ui/public/styles.css          CRLF=11333 裸LF=0
test/ui-review-hunks.test.ts  CRLF=  114 裸LF=0（未在 HEAD）
test/ui-patch.test.ts         CRLF= 6062 裸LF=0
verify-change-card.mjs        CRLF=  422 裸LF=0（未在 HEAD；Write 工具首次写成了纯 LF，已用 node 转 CRLF）
scripts/git-fixture.mjs       CRLF=   91 裸LF=0
```

## 6. brief 与仓的出入（漂移清单）

1. **Step 10 路径笔误**：brief 写 `_audit_20260919/verify-change-card.mjs`（无连字符），实仓目录是 `_audit-20260919`——照仓。Step 11 的 git add 路径是对的。
2. **Step 11 git add 缺 `test/ui-patch.test.ts`**：kind 数组形状更新必须随提交，否则 checkout 后全量红。已含（与 T5 偏差 ⑤ 同类）。
3. **Step 11 git add 缺 `scripts/git-fixture.mjs`**：判据 ② 要求「至少一行上下文行」，而夹具的 `src/app.js` 是单行文件（`@@ -1 +1 @@`，改一行永远没有上下文行）。夹具生成器把 `src/app.js` 改成多行（中间行是未提交改动，前后是不改的行），diff 变成 `@@ -1,5 +1,5 @@` 带 4 条上下文行。**T4 探针 `verify-file-patch.mjs` 对再生夹具复跑五条全绿**——没有回归。brief 没预见到这一步，但它是判据 ② 的成立前提。已含。
4. **Step 11 署名**：brief 写 `Co-Authored-By: Claude Opus 4.8 (1M context)`——按指令改为 `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`。
5. **Step 9 基线口径**：brief 写「11 确定失败」，实测基线是 **12**（11 确定 + 1 轮换抖动）。零新增按 12 判，本次 11 失败 = 轮换位这次过了，不是少了一个失败。
6. **Step 10「造一场真跑过编辑的会话」做不到**（宿主 LLM 认证死）→ mock 重放 + 判据 ① 改编，见 §3。
7. **判据 ⑥「0 控制台错误」逐字达成**：0 控制台错误 + 0 页面异常，无需像 T5 那样按实测机制改写判据。
8. **死 run 档案不是空的**（7 条 model_call 错误事件）——本来担心 `ensureSubscription` 对 done+有档案的 run 不建 EventSource；实测 fresh 页本地态是空的，EventSource 照建、mock 照播。
9. **新起的死 run 探针抓到的是 `running`**（~100ms 后才死透）——mock 占着它的流，状态无影响；判据照过。
10. **brief 锚点行号全漂**（deriveChatItems `:8736`、条目键派生 `:9102-9119`、renderChatItem `:10473` 等）——照仓实现（此前会话已记）。

## 7. T7 交接

- **按钮不接**：卡片头没有「在右栏审阅 →」，也没有 `data-review-panel` 空按钮——T7 加按钮并接 `showRailPanel("review")` + `saveRailPref({ collapsed: false })`。
- **hunk 渲染可复用**：`renderPatchHunksHtml(patch, { runId, path, lastSeq })` 已从 app.js 导出（null/非 present → 诚实 note；hunk 头**原样展示**，section heading 安全的契约 3 形状；增删数按行号数）。右栏审阅面板直接用，别写第二份。
- **已阅态同容器**：宿主 `reviewedAtSeq`（runId → Map\<path, lastSeq\>）——面板若也要已阅态，写同一个容器，失效语义自动一致。
- **patch 取件可蹭宿主**：`fillChangeCardFile(runId, workdir, body)`（index.html 内联）有 lastSeq 进 key 的缓存 + git root 缓存 + inflight 去重；面板同 run 同文件想取 patch 时照这个口径，别绕过契约 1 的 `toRepoRootRelative`。

---

# 修复轮 1（审查 Approved · 0 Critical / 0 Important / 4 Minor，按约束改 2 处）

## 修复内容

1. **Work 脸 hide 规则**（`ui/public/styles.css`）：187 行卡片样式组原本全挂在 `body[data-face="code"]` 下，Work 脸（office）没有成对规则——卡片在 Work 脸上是一张无样式的裸 `<details>`，照样可见可点。补上 `body[data-face="work"] .chat-change-card { display: none; }`，放在该组开头，与既有范式同形（`workspace-git-chip` 的两脸对），注释写明「两脸成对，只写一半等于没锁」。
2. **探针 q1e 成门**（`verify-change-card.mjs`）：`c3 = q1 && q2 && q3` → `c3 = q1 && q1e !== false && q2 && q3`。逐字比对原先只打印不入裁决——三问的价值全在锁「撤掉写进输入框的到底是什么」，打印项不是锁。

## 新增判据 ⑦（脸判据）

- boot 把 `agent.ui.pref.workspaceFace` 偏好钉成 `code`（**原先没钉**：boot 默认 office → data-face="work"，修复前 ①-⑤ 其实全在 Work 脸的裸卡上量的——裸卡无样式但可见，clickable/boundingBox 都过，所以没被发现；修复后不钉住的话 ①-⑤ 会与 ⑦ 搅在一起）。
- ⑦ 真点脸切换控件：office → `data-face="work"` 达成 → 卡**还在 DOM** 但 computed `display:none`、`boundingBox=null`；切回 code → `display:block`、boundingBox 有。

## 验证证据

**负向测试（q1e 门，留了原始输出）**——把 index.html 的 `onChangeCardRevert` 临时改成 `taskInput.value = msg + "!"`（只动消费端，不动 app.js 的 `buildRevertMessage`，页↔探针逐字比对因此撕裂）：

```
—— 判据 ③ ——
输入框值：把 src/app.js 第 1 行起新加的 1 行、删掉的 1 行撤掉!
期望（buildRevertMessage 逐字）：把 src/app.js 第 1 行起新加的 1 行、删掉的 1 行撤掉
三问：进了输入框（含路径）=true · ★ 与 buildRevertMessage 不符 · 没导航（hash 不变）=true · 没发送（user 消息 4→4，1.2s 后还在框里）=true
③ 撤掉只进输入框、不导航、不发送 → ★ 红
```

其余六条全绿，exit 1——q1e 确实是门。还原后重跑：

```
—— 判据 ⑦ ——
office 脸（data-face=work 达成=true）：卡在 DOM=true · computed display=none · boundingBox=null
code 脸（data-face=code 达成=true）：computed display=block · boundingBox=有
⑦ 两脸成对：Work 脸藏掉、Code 脸照常 → ✅

✅ 七条全成立：卡片在且文件数对 / 展开取到真 patch（含上下文行）/ 撤掉三问全过（逐字比对成门）/ 已阅随再改动失效 / 阅读模式两种都可见 / 0 控制台错误 / 两脸成对（Work 藏、Code 现）
EXIT=0
```

**EOL**（还原后）：`index.html` 与 HEAD **逐字节相同**（篡改还原的字节级证据）；`styles.css` CRLF=11336 裸LF=0、`verify-change-card.mjs` CRLF=461 裸LF=0（不一致只是本次改动本身）。

**聚焦测试**：`ui-review-hunks` 12/12 绿；`ui-patch` 3 失败全是基线 CRLF 针成员（设计样例卡 ×2、侧栏骨架 ×1，针是 `\n` 多行串对 CRLF 原文件——已核 4736 行针形，与本次插入的 `.chat-change-card` 规则无关）。

**全量**：`11 failed | 3708 passed | 15 skipped` = 基线 12 减轮换位 approval_expired，**零新增**（passed 与修复前相同，证明 ⑦ 与钉脸没有碰任何单测路径）。

## 出入补充（修复轮）

- **新增第 11 条漂移**：probe 的 dead-run 复用（REUSE_DEAD `7de7f5fe`）每次跑完清理都会删掉靶 run，所以复用分支从第二轮起自然失效、走新建——输出里的靶死 run id 每轮都不同是设计内行为，不是探针不稳。
