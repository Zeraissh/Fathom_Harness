# Task 6 报告：产物条与预览坞标签条收拢到一个真值源（B 簇收拢）

状态：**完成** · commit `5e6bce1` · 基线：全量 11 条失败（11 确定性 + 抖动族），零新增 ·
活页探针六条断言连续两轮全绿（exit 0）· 探针截图落 `eval/persona-ux/_verify-shots/verify-artifact-tabs.png`

## 做了什么

1. **`ui/public/index.html`**：
   - `openedPreviewArtifacts(runId)` 语义从「用户手动点开过的」改为
     **「这一场的产物 ∪ 用户点开过的 − 用户关掉的」**——用既有的两个纯函数接上，
     不新增机制：`selectPreviewArtifacts`（滤核查脚本/node_modules）先过这一场的
     产物，`mine`（手动点开过的）逐件走 `ensurePreviewArtifact`（在则回原位，
     否则追加末尾）。
   - `asPreviewTab`：kind 一律归一到 `browser`/`preview`（画布只认这两种；
     `deriveSessionFiles` 给的是 `upload`/`artifact`）。判据与 `rememberPreviewFile`
     逐字相同，只此一处。
   - **`dismissedPreviewFiles` 集合**（对 brief 的偏差，见下）：关掉「这一场产物」
     的标签 = 藏掉——`forgetPreviewFile` 加进 dismissed；`rememberPreviewFile`
     解 dismissed 即恢复原位，恢复路径与首次点开同一条。
   - `previewTabStamp(runId)` + `previewTabsCache`：O(1) 缓存（推演见下）。
   - `openPendingArtifact` 的手动塞标签特例**整段删除**；`wrapIndex` import 一并
     移除（唯一消费者没了）。
   - `initArtifactCanvas` 的 `getArtifacts` 注入改为
     `() => (selectedRunId ? openedPreviewArtifacts(selectedRunId) : [])`。
2. **`test/ui-artifacts.test.ts`**：新增 describe「标签条与产物条共用一个真值源
   （计划 2 · 任务 6）」6 条源码锁（brief 预计 3 条，实际 6 条，见偏差）：
   标签条读既有派生 / 合并去重走 `ensurePreviewArtifact` 且只此一处 / 派生有缓存 +
   反锁「缓存键不许建在 `currentRunArtifacts(runId).length` 上」/ stamp 底料是
   state 时间线长度且不许出现派生调用 / dismissed 增删两向 / openPendingArtifact
   特例已删。**每条新断言都做过变异验红**（删掉/改掉被锁的那行看它红、再还原，
   M1–M4 四组全部能检出目标破坏）。
3. **`eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs`**（新入库活页探针）：
   六条真浏览器断言，方法学写死在文件头部注释里（含 tip-jump 楔死实测与 ④ 冷/热
   量法说明）。

## 各 Step 命令与真实输出

**三文件定向测试**（改完 + 变异验红还原后复跑）：

```
npx vitest run test/ui-artifacts.test.ts test/ui-server.test.ts test/ui-patch.test.ts
Test Files  3 passed (3)
     Tests  123 passed (123)
```

**全量对照**（后台 `npx vitest run`，输出重定向文件；`| tail -30` 只留了尾部，
11 条失败里只有 1 条的名字在输出文件里）：

```
Test Files  5 failed | 165 passed | 1 skipped (171)
     Tests  11 failed | 3671 passed | 15 skipped (3697)
   Start at 04:16:05   Duration 165.87s   [exited with code 0]
 FAIL  test/ui-server.test.ts > 监控闭环：outcome 分档指标与告警文件一致性 >
       跨 run 资源互斥：stm32 包的探针被在飞 run 持有 → 429 附持有者；
       stop 释放后放行
Error: Test timed out in 5000ms.
```

11 failed = 基线 11 条确定性失败 + 抖动族，**零新增**。

**活页探针**（真浏览器，服务器 `npm run ui` 已在跑），定稿后连续两轮，输出全文：

```
$ node eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs
主靶 run=94f58b8a-5a5a-4d7d-9992-87e79f87ce78（产物 7 件 / 事件 338 条 / 谱系合并 995 条）
对拍 run=无（本实例没有 ≥1.5× 事件的带产物链头 run）——④ 落回主靶冷/热对拍

① 产物条 10 项：e8-a.txt | e8-b.txt | hello-code.txt | hello-seed.txt | changelog.txt | p6-a.txt | p6-b.txt | m6-a.txt | m6-b.txt | m6-c.txt
   标签条 10 项（应 10）：e8-a.txt | e8-b.txt | hello-code.txt | hello-seed.txt | changelog.txt | p6-a.txt | p6-b.txt | m6-a.txt | m6-b.txt | m6-c.txt
   ① 项数相等=true · 顺序逐项相同=true
② 产物条第一项也是标签条第一项=true（"e8-a.txt"）
③ 点开第 3 件「hello-code.txt」：选中格=2（应 2）· 项数=10（应 10）· 原位=true
   命中几何：关闭钮中心被 SPAN. 接住 · tablist scrollLeft=165（scrollWidth=930 clientWidth=0）· 坞 hidden=false w=159
⑥ 关掉第 3 件：项数=9（应 9）· 已从标签条消失=true（click 同步段 1.80ms，含 dismissed 变更后的整链重派生）
   再点开：项数=10（应 10）· 选中格=2（应 2）· 恢复原位=true（click 同步段 0.40ms，同样含一次冷派生）

④ 冷走查（stamp 变更后整链重派生 ~995 事件）：关标签 click=1.80ms · 重开 click=0.40ms
   热 20 次 add-tab（stamp 命中）：中位=0.10ms · 前5均=0.02ms · 后5均=0.32ms · 最大=0.90ms
   ④ 热路径 <5ms=true（本实例无跨 run 对拍资格；必要性证据=冷/热两行：
   渲染路径上走的是热路径，冷价只在 stamp 变更时付一次）

⑤ 控制台错误：零 · 页面异常：零
截图落 eval/persona-ux/_verify-shots/verify-artifact-tabs.png
✅ 六条全成立：标签条=产物条同一清单、首位对齐、点开回原位、关掉真关/再开复位、
getArtifacts 热路径 <5ms 且冷价只在 stamp 变更时付、0 控制台错误
[exited with code 0]
```

第二轮复跑同样 exit 0（⑥ 两个 click 同步段 1.90ms / 0.80ms，热路径中位 0.00ms）。
首轮探针曾在对拍 run 上挂住 13s 后被强停（`[killed]`）——那是 tip-jump 楔死
（见「探针环境发现」），探针改只挑链头后消失。

**check-eol**（提交前）：

```
★★ 不一致  ui/public/index.html       CRLF= 6324 裸LF=   0 字节 231670/228980  ← 与 HEAD 不逐字节相同
★★ 不一致  test/ui-artifacts.test.ts  CRLF=  165 裸LF=   0 字节 6998/4524  ← 与 HEAD 不逐字节相同
```

读脚本确认判据：**「不一致」= 与 HEAD 逐字节不同**——我们本来就改了两个文件，
必然不同；EOL 纪律看的是裸 LF 计数，两文件都是 **0 裸 LF、纯 CRLF**，无漂移，
无需 rm + checkout 修复。

**提交**：

```
git add ui/public/index.html test/ui-artifacts.test.ts eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs
git commit -m "refactor(ui): 产物条与预览坞标签条收拢到一个真值源（B 簇收拢）…"（正文= brief Step 7 原文）
[feat/attachments-artifacts 5e6bce1] refactor(ui): 产物条与预览坞标签条收拢到一个真值源（B 簇收拢）
 3 files changed, 469 insertions(+), 14 deletions(-)
 create mode 100644 eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs
```

**mcp.json（别人的修改）与 docs/superpowers/plans 下的计划文档均未进提交**——
`git status` 验证暂存区只含上述三文件。

## 缓存 stamp 推演（为什么 O(1)）

brief 给的版本是 `currentRunArtifacts(runId).length` 当缓存键——`currentRunArtifacts`
本身要**走一遍时间线**才能算出 length，拿它当键等于每帧先走一遍派生再比键，
缓存形同虚设。**不许猜**，所以实际推演如下：

- **清单随什么变**：合并清单 = `selectPreviewArtifacts(currentRunArtifacts(runId))`
  ∪ mine − dismissed。`currentRunArtifacts` 只读 state 的时间线（走链
  `deriveThreadFiles`），时间线 append-only、从不原地改，重放是同一批事件得出
  同一份状态。所以清单的「真值源」变化只由 **每场 runState 的时间线长度 +
  lastSeq** 决定。
- **stamp 底料**：`previewTabStamp(runId)` 沿谱系链（`continuedFrom`）读每场
  `runStates.get(cur)?.timeline?.length` 与 `?.lastSeq`——都是 state 上的
  **直接字段读，O(1)**，不碰任何一条事件；再把 runId 拼进每段（链上换了成员、
  新成员长度恰与旧成员相同时，纯长度串会撞键）。链长 = 一场对话的续跑次数
  （本实例 1~3），走链 O(链长) 而不是 O(事件数)。
- **stamp 全量**：`previewTabStamp(runId)|mineSig|disSig`——mine 按插入序拼路径、
  dismissed 排序后拼（NUL 分隔；Fix round 1 由长度键改成内容键，见下节）。
  **更正**：本报告此前称 mine「只追加」是**错的**——forgetPreviewFile 会把路径
  从 mine 里 filter 掉，账本可增可删；「两者长度变化恰好覆盖它们的全部变化」
  因此不成立。正是这个错误让键不单射的缺陷没被自发现。
- **缓存形态**：`previewTabsCache: Map<runId, {stamp, list}>`，stamp 命中直接
  回 list。热路径（stamp 命中）实测 20 次 add-tab 同步段中位 0.10ms、最大 0.90ms；
  冷价（stamp 变更后整链重派生 ~995 事件）只在关标签/重开两个 click 里付一次，
  实测 1.80ms / 0.40ms——「渲染路径上每帧走一遍时间线」的退化被挡住。

## 自扫结果

- **「使用」与「引入」是两件事**：`ensurePreviewArtifact` 不只是 import——它
  在壳里**恰好一次调用**（合并去重处），测试锁的是「带左括号的出现次数 = 1」
  （import 行没有左括号，锁不到）；`selectPreviewArtifacts` 同理接在真数据上。
  两个函数都是既有纯函数，本任务**零新增派生机制**。
- **「锁了我写的那一半」四个变种**：① 产品码在 `index.html`（改的这一半）；
  ② 测试锁在 `ui-artifacts.test.ts` 6 条源码锁（锁的那一半），**每条都变异验红过**
  （M1–M4 通过：删被锁行 → 测试红 → 还原）；③ 锁的是表达式本身不是名字
  （`selectPreviewArtifacts\(currentRunArtifacts\(`，计划 1 教训）；④ 反锁
  在每条性能锁里（stamp 函数体内不许出现 `deriveSessionFiles|deriveThreadFiles|
  currentRunArtifacts`、缓存键不许是 `currentRunArtifacts(runId).length`）。
- **有没有第二个消费者**：dismissed 集合恰好两个消费者——关标签
  （`forgetPreviewFile`，被 `closePreviewTab` 调用，链未动）与重开
  （`rememberPreviewFile` 解 dismissed），探针 ⑥ 在真浏览器里把两个方向都走了
  一遍（关掉 10→9、重开 9→10 恢复原位）。旧两套清单系统的第二个消费者就是
  `openPendingArtifact` 的手动塞标签特例——它随旧语义一起删了，且有专门一条
  测试锁「删干净」（函数体内不许再出现 `rememberPreviewFile|currentRunArtifacts|
  wrapIndex`）。`wrapIndex` import 因此移除（唯一消费者没了）。

## 与 brief 的偏差

1. **行号是抄错的，不可信**——以符号为准：`extraPreviewFiles` :788、
   `rememberPreviewFile` :790、`openedPreviewArtifacts` :801、`openPendingArtifact`
   :865、`getArtifacts` 注入（`initArtifactCanvas`）:6183；`selectPreviewArtifacts`
   app.js:9672、`ensurePreviewArtifact` app.js:9683。
2. **stamp 版本**：brief 给的 `currentRunArtifacts(runId).length` 等于没缓存——
   换成 state 时间线长度 + lastSeq 的 O(1) 读（推演见上）。
3. **dismissedPreviewFiles 集合是新增**：brief 没写「关掉这一场产物的标签」的
   语义；不记这笔账，关掉的产物标签会在下一次渲染时自己长回来。
4. **`wrapIndex` import 移除**：brief 没提，但它是被删特例的唯一消费者。
5. **测试 3 → 6 条**：brief 预计 3 条，实际 6 条（多出 dismissed 增删两向、
   openPendingArtifact 特例已删、ensurePreviewArtifact 唯一调用点三条锁）。
6. **④ 方法学从跨 run 对拍改为冷/热对拍**：本实例唯一 ≥1.5× 事件的 run（657
   事件）恰是非链头，一导航就被 tip-jump 强拉回链头，页面与探针 hash 重设乒乓成
   永久楔死（见下）。探针保留跨 run 对拍逻辑，只在有资格实例启用；本实例自动
   落回主靶冷/热对拍。

## 探针环境发现（与 Task 6 代码无关，但探针绕不开）

- **tip-jump 楔死（决定性）**：`refreshRunListView`（index.html:1734-1741）里
  `conversationTipId(runs, selectedRunId)` 若 tip ≠ 选中 run 就 `selectRun(tip)`。
  实例数据 `94f58b8a.continuedFrom = 6139d6d8`（A 是 B 的续跑），B 非链头，
  一导航就被强拉回 A；探针的 hash 重设与 writeHash 乒乓（A↔B 无限重渲染）=
  页面永久楔死——v14 诊断实测 40s+ 每次探测都 2s 硬超时、0 控制台错误。探针
  因此只挑链头 run；楔死事实已写进探针头部注释与本报告。
- boot 期应用不定态自动改 hash：loadRuns 完成后自动选中最近一场并写 hash
  （曾观察到 artifact/6、artifact/9），会盖掉探针的 hash-set——openRun 先
  `waitForQuiet(15000)` 等落定，落定校验（hash 含 runId + 期望产物全在 +
  项数 ≤ 期望×2）失败重设，最多 3 次。
- hydration 重画换卡节点：路径探测回来的重画会换掉卡节点，早了点的是一张死卡
  ——等 `data-artifact-state="ok"` 再点。
- 产物条住在 `#detail-rail`，默认收起（rail-body display:none），Playwright
  可见性点击点不到 → evaluate 派发 click（委托链与真点击同路）。
- 坞元素 id = `artifact-canvas-view`；右列 pref（panel:"preview"、splitRatio 0.55）
  未生效，坞实测仍 w=159——窄列下固定钮（收起/放大/add ≈ 96px+）把
  `.ac-tabs`（flex:1 1 0）挤到 clientWidth=0（scrollWidth=930）；styles.css:9543
  注释自证「split 档预览列可能只有 ~141px」是既存布局限制。探针用命中几何
  （elementFromPoint）如实记录，不拦验收（量的是清单语义不是响应式）。
- 服务器把 query 当路径（`?probe=` 404）；hash-only 的 page.goto 挂住——探针
  首次 goto 根路径、之后只用 location.hash 切 run。

## 遗留顾虑

1. **窄坞下标签条 0 宽是既存布局限制**（styles.css 注释自证），不是 Task 6
   引入；但合并清单让标签条项数从「点开过几件」变成「这一场全部产物」（本实例
   10 项），0 宽下用户只能靠横滚——与第二套画廊/右列预算问题同族，属于既存
   响应式债，不在本任务范围。
2. **探针跨 run 对拍在本实例自动落回冷/热**：代码保留了对拍分支，但没有有资格
   的实例验证过它（需要一只 ≥1.5× 事件的带产物链头 run）。tip-jump 楔死
   （应用导航设计使然）已如实记录，探针不与非链头 run 对拍。
3. **mcp.json 是别人的修改**，未动、未进提交。
4. 全量输出因 `| tail -30` 只留尾部，11 条失败里只核到 1 条名字（ui-server
   跨 run 互斥 timeout，基线族）；总账 11 failed / 3671 passed / 15 skipped 与
   基线一致、零新增，结论不受影响。

## Fix round 1（review Important 的修复 + 一项重要更正）

### 修了什么

- **stamp 键从长度改成内容**：`previewTabStamp(runId)|mineSig|disSig`，
  `mineSig = mine.map(f => f.path).join("\x00")`（按插入序）、
  `disSig = [...dismissed].sort().join("\x00")`。路径里不可能出现 NUL，
  按序 join 不歧义；手动账本只有几件，O(件数) 可忽略。
- 注释里「7 个调用点」改成实测 5（grep 数出来，不是抄计划；删
  openPendingArtifact 特例后 6→5）。
- 新探针 verify-artifact-tabs.mjs 归一到 CRLF；check-eol 三文件全过
  （CRLF=6337/181/345，裸 LF=0）。

### 变异验红

- **源码锁红（vitest，04:55:47 逐字）**：变异回长度键后
  `test/ui-artifacts.test.ts:174:21` 的 `toMatch(/join\("\\x00"\)/)` 失败，
  收到的函数体含 `const stamp = \`${previewTabStamp(runId)}|${mine.length}|${dismissed?.size ?? 0}\`;`；
  `Test Files 1 failed (1) · Tests 1 failed | 11 passed (12)`。恢复内容键后
  12/12 绿（04:57:26）。
- **探针⑥五步锁在变异下跑绿（exit 0）**——不是漂移掩蔽，是结构性的，见下一节。
  变异态与修复态各跑一遍，输出逐行一致（终态 9 项、Y 在格 4、X 消失、
  五步成立=true）。
  **探针为什么锁不住它**：探针锁的是**终态契约**（第 5 步 = 产物∪Y−X），
  而这个变异**只改键、不改终态**——键单射与否，终态断言天然无感。行为锁与
  源码锁各锁一半：源码锁抓「键怎么拼」，探针抓「清单终态对不对」，缺一不可。

### 重要更正：五步序列在今天代码里撞不出旧缓存（review 前提不成立）

review 的序列：开X → 开Y → 关Y → 关X → 重开Y，第 5 步 stamp 绕回「关Y」那步
的键 → 命中第 3 步旧缓存 → Y 打不开、已关掉的 X 还躺在标签条里。**按今天的
代码推演，这个序列撞不上**：

- `previewTabsCache` 是 `Map<runId, {stamp, list}>`——每 runId 只留**最后一次**
  派生，每次派生都覆写；它没有按 stamp 留多个条目的能力。
- remember/forget 的唯一调用点（openArtifactByPath :939 / closePreviewTab :903）
  之后**立刻**各跟一次 openedPreviewArtifacts 派生。
- 五步的缓存写读序列：开X→`t|3|0` 写；开Y→`t|4|0` 写；关Y→`t|3|1` 写（这就是
  「第 3 步的条目」）；**关X→`t|2|2` 写——把第 3 步的条目覆写掉**；重开Y→
  `t|3|1` 读，比对的是第 4 步写的 `t|2|2` → 不等 → MISS → 重新派生 → 终态正确。
- 更一般地：账本的任何内容变化必改 `(mine.length, dismissed.size)` 之一
  （remember 只做 dismissed 删 + mine 追加，forget 只做 mine filter + dismissed
  增）；两个**连续**派生之间至多一次账本操作，同键（长度相等）即内容相同。
  所以「同键、不同内容」的陈旧命中在「单条目缓存 + 每次变更必派生」的
  不变式下不可达——前缀漂移只会造成更多 MISS，不会造出陈旧命中。
- 结论：长度键在今天的代码里**无害但脆弱**——不变式没写在脸上，任何「改完
  账本没立刻派生」的新路径（或缓存改成留多条目）都会让长度键绕回旧键、撞上
  旧清单。内容键把这个危险整类去掉，这就是 review「must fix」的正当理由；
  只是可触达序列的推演前提（第 5 步命中第 3 步旧缓存）不成立。
- 活页证据（变异态）：探针⑥ exit 0；另有逐步诊断两轮（每步 dump hash/tabs/
  mine/dismissed/stamp），重开Y 那步 hash 停在 artifact/4 = 第 5 步是 MISS 后的
  正确派生，不是命中旧清单。
- 更正连带：review 说症状是「找不到该产物」——实际 resolveArtifactOpen 对
  缺失路径返回 index=list.length（追加到副本）→ mode 恒为 canvas → 症状会是
  画布开到越界 index 而非 toast。加上五步本就不撞，这条症状路径今天也走不到；
  如实记下。

### 既存边界（不拦验收）

- 窄坞 0 宽标签条为既存响应式债（styles.css 注释自证），建议计划 3 处理。
- ④ 的性能数字证不了 stamp 正确性——它量的是热路径与冷价，不是键的单射性。

### 本轮遗留顾虑

- 探针⑥锁的是终态契约，抓不住长度键变异（结构性原因如上）；变异红由源码锁担。
- 提交 message 首版按协调者逐字使用；协调者随后授权**只改 message**（树不许动）
  ——已 amend 为实证口径的版本（4667aed），`git diff d487a11 HEAD --stat` 为空
  （树一个字节未动）、`git show --stat HEAD` 与 amend 前逐文件一致
  （3 files, 72+/18−）。
