# Task 5 报告：长代码块与长表格的折叠、横滚与复制出口（B5 / B6）

状态：**完成** · commit `6751b10` · 基线：全量 13 条失败（11 确定性 + 抖动，含 1 条 timeout），零新增 · **review 修一轮已落 `610e54a`（见文末 Fix round 1）**

## 做了什么

1. **markdown.js 围栏分支**：所有代码块包进 `.md-block md-code-block` 壳——头部条
   （转义后的语言名 + `N 行` + 复制按钮）；>24 行折进原生 `<details class="md-code-rest">`
   （零 JS），summary 写「再展 N 行」。
2. **markdown.js 表格分支**：包进 `.md-block md-table-block` 壳——头部条（`N 行` +
   复制为 TSV 按钮 + 长表时「再展 N 行」按钮）；>20 行拆两个 `<tbody>`，第二个
   `.md-table-rest` 由 CSS 隐藏（**折显示不折渲染**——复制要读到全部行）。
3. **app.js**：`formatTableExport`（TSV，清掉单元格里的制表符/换行）与
   `codeTextFromNode`（折叠时两段 `<pre>` 求和）两个纯函数；派发处加
   `copy-code` / `copy-table` / `table-more` 三路，走 `cb.onCopyChat?.()` 通道。
4. **styles.css**：B5/B6 壳、头部条、折叠、横滚的样式块；`.ac-doc`/`.mem-preview-content`
   里按钮藏起、长表不折（那些容器没有聊天派发宿主，按钮是死的）。
5. **test/markdown.test.ts**：新增 3 个 describe 共 10 条（B6 折叠/头部/安全 4 条，
   B5 折行/按钮 3 条，纯函数 3 条），全部 mount 进真实 DOM 断言。
6. **verify-long-content.mjs**：新活页探针（注入真实 `renderMarkdown` 输出到真实
   run 的 `.conversation` 宿主，点真按钮、读真剪贴板）。

## 各 Step 命令与真实输出

**Step 1–2（先红）**：先在 markdown.test.ts 追加 10 条（import 指向 `../ui/public/app.js`），
跑 `npx vitest run test/markdown.test.ts -t "长代码块|长表格|导出的格式化"` ——
红：`md-code-rest`/`md-block-lang` 不存在、`formatTableExport is not a function`、
`codeTextFromNode is not a function`（ReferenceError，8 条红在缺实现上）。
实现后再跑：63 passed / 63。

**Step 6（三文件）**，首跑（修双重转义前）：

```
Test Files  2 failed | 1 passed (3)
     Tests  4 failed | 408 passed (412)
 FAIL  test/markdown.test.ts > 长代码块…（B6） > ★ 安全纪律不许破…
 FAIL  test/ui-patch.test.ts > 空态给的是能点的例子 > 设计样例卡是迷你页缩略图…
 FAIL  test/ui-patch.test.ts > 空态给的是能点的例子 > composer 是紧凑胶囊…
 FAIL  test/ui-patch.test.ts > 办公/编码脸与侧栏密度 > 侧栏骨架…
```

逐条读红：

- **markdown 那条是我的新测试自己红的**，红得对：围栏行在入口已整体 `escapeHtml`，
  再 `escapeHtml(raw)` 就是双重转义（`&lt;` → `&amp;lt;`），头部条会显示字面
  `"&lt;script&gt;"`。修法：直接插值 `raw`（入口转义后不可能再出现裸
  `< > & " '`），注释写明这条不变量。修后 markdown.test.ts **63 条全绿**。
- **ui-patch 三条是基线既有失败**：`readFileSync(styles.css)` 在 Windows 读出 CRLF，
  断言串用 `\n` 拼接，`toContain` 永远失配。证据（不只靠"大概率"）：把 styles.css
  换成 HEAD 版（我的改动是 73 行纯追加、零删除）复跑同三条：

```
Test Files  1 failed (1)
     Tests  3 failed | 333 skipped (336)
 FAIL … 设计样例卡是迷你页缩略图，不是小图标 chip
 FAIL … composer 是紧凑胶囊：对话与欢迎共用，起步卡只在欢迎
 FAIL … 侧栏骨架：列表前没有第三颗满宽标签钮；会话 meta 默认不占行
```

  与改动后的失败逐条同名同形。**markdown.test.ts 既有 425 行一条没红、一条没改**
  （brief 预计会红——实际壳保住了 `pre.md-code code`、`table.md-table` 等原有选择器
  形状，零锁需改）。这是本任务与 brief 预测的最大出入，如实记。

**Step 6 收尾复跑**（修双重转义 + word-break 后）：

```
Test Files  1 failed | 2 passed (3)
     Tests  3 failed | 409 passed (412)   ← 红的就是上面三条基线失败
```

**基线对照**：全量后台跑（`npx vitest run`）：

```
Test Files  5 failed | 165 passed | 1 skipped (171)
     Tests  13 failed | 3649 passed | 15 skipped (3677)
```

  本任务三文件口径：3 条红全是基线内的，**零新增**。

**Step 7（活页验收，真浏览器）**，首跑（14 列改版前）：

```
① 代码块：… 语言="ts" · 行数="60 行" · 折起了=true · 提示="再展 36 行"
   复制后剪贴板：60 行 · 首="const x0 = 0;" · 尾="const x59 = 59;" · 逐行全对=true
② 自身横滚：table.scrollWidth=558 > wrap.clientWidth=558 → false   ← 只有这条不成立
```

  `false` 揪出一条**只有真浏览器量得到的缺陷**：`.chat-body { word-break: break-word }`
  继承进表格单元格，把每列 min-content 坍缩成单字符——14 列宽表被压成与容器同宽，
  `.md-table-wrap` 的 `overflow-x: auto` 永远不触发，B5 原话的「自身横滚」名存实亡。
  修：`.md .md-table th, .md .md-table td { word-break: normal; }`（词保持整词宽，
  宽列自然超宽、表格自己滚；正文不横溢不受影响）。复跑：

```
① 代码块：在=true · 语言="ts" · 行数="60 行" · 折起了=true · 提示="再展 36 行"
   头部有 x0=true · 折起段有 x59=true · 点「再展」后 details 展开=true
   复制后剪贴板：60 行（应 60）· 首="const x0 = 0;" · 尾="const x59 = 59;" · 逐行全对=true
② 表格：在=true · 行数="60 行" · 有展开钮=true（"再展 40 行"）· 有复制钮=true
   自身横滚：table.scrollWidth=806 > wrap.clientWidth=558 → true
   正文横溢：注入前=false 注入后=false（应都为 false——表格横滚不撑破正文）
   折起段默认隐藏（display:none，行仍在 DOM）=true
③ 复制后剪贴板：61 行 TSV（应 61=表头+60 行）· 每行 14 列=true · 首尾齐全=true
   「再展 40 行」点开：is-open=true · 按钮变="收起" · 折起段可见=true
   再点收起：is-open=false · 按钮变回="再展 40 行"
控制台错误： 零
✅ 四条全成立
```

  截图落 `eval/persona-ux/_verify-shots/verify-long-content.png`（gitignored）。
  探针的 14 列载荷是改出来的：最初用单个 200 字符无空格长串，被 `break-word`
  拆行、表格不横溢——多列短记号每列 min-content 是整词，求和必超列宽，才量得出滚。

**Step 8（提交）**：`check-eol.mjs` 四个文件全部 `裸LF=0`（CRLF 纯净；字节与 HEAD
不同是改动本身，与"不一致"字面无关）。commit `6751b10`：

```
5 files changed, 502 insertions(+), 8 deletions(-)
create mode 100644 eval/persona-ux/_audit-20260919/verify-long-content.mjs
```

## 三样自查（对着坑清单核的，不是走过场）

1. **新 CSS 类 ↔ 规则**：`md-block`/`md-block-head`/`md-block-lang`/`md-block-count`/
   `md-block-act`/`md-code-rest`/`md-table-rest`/`is-open` 展开态/两个非聊天容器的
   覆盖——每条类都有规则（styles.css 6689 起的 B5/B6 块）。✓
2. **新 data-action ↔ 处理**：markdown.js 只发 `data-chat-action`（copy-code /
   copy-table / table-more），app.js 派发三路齐（7573/7577/7584）。✓
3. **新导出 ↔ 导入与断言**：`formatTableExport`、`codeTextFromNode` 在 app.js 导出，
   markdown.test.ts 顶部导入（从 `../ui/public/app.js`，不是 markdown.js），
   3 条测试锁行为。✓

## 与 brief 的偏差（都在提交信息里写了）

1. **`data-action` → `data-chat-action`**：brief 的代码片段发 `data-action="copy-code"`，
   但聊天派发读的是 `data-chat-action`（app.js:7541-7542，`data-action` 是另一处
   权限卡局部的属性）。照 brief 发按钮全是死的，改掉并记档。
2. **copy-table 选择器**：brief 的 `table.md tr` 不存在（真类是 `md-table`），
   照抄会复制出空串。改 `.md-table tr`。
3. **table-more 的开关挂点**：brief 的 `closest(".md-table-wrap")` 是按钮的**兄弟**
   （按钮在头部条里），closest 只往上走，照抄是静默 no-op。改挂在
   `closest(".md-table-block")` 上，并补按钮文案翻转（展开后说「收起」，
   静态「再展 N 行」会在展开后说谎）。
4. **brief 的 XSS 载荷带空格**：`<img src=x onerror=…>` 过不了围栏正则 `\S*`
   （整行不成围栏，测的是段落转义不是头部条转义）。换成无空格的
   `<script>alert(1)</script>` 并断言 `&lt;script&gt;` + `hasExecutableInjection`。
5. **brief 预计既有 425 行会红**：实际 0 条红、0 条改（见上）。
6. **新增两条 brief 没有的修**：双重转义修正、表格单元格 `word-break: normal`。
7. Step 1 的字符串包含断言换成 mount 进 DOM 的断言（更能反映浏览器实际解析）。

## 残余担忧

- **头部条给所有代码块/表格加了一层视觉**：短块也带壳（语言/行数/复制）是 B6
  设计案要的，但既有消息观感会变一次——已按设计接受。
- **`table-more` 的展开态是 DOM 节点态**：键控补丁按 key 更新节点时类名保留，
  节点一旦被重建（流式等）会回折叠——聊天消息落定后基本不再重建，可接受。
- **非聊天容器**（画布 `.ac-doc`、记忆面板）里复制按钮被 CSS 藏起、长表不折：
  那些容器没有派发宿主，按钮会是死的。若将来给它们接上派发，要同时撤销两条覆盖。
- **剪贴板路径**：复用 `onCopyChat`（唯一入口），`execCommand` 兜底在 headless
  下没走到（navigator.clipboard 已授权），兜底分支在旧浏览器上的行为没有活页验到。
- **探针依赖实例上有一个可打开的 run**：宿主 `.conversation` 要有真实渲染过才有
  派发绑定；没有 run 的干净实例上探针会明确报「做不了」退出 1，不假绿。

## Fix round 1（review 意见修一轮，commit `610e54a`）

review 判 Spec ✅ / Changes requested：0 Critical、1 Important、4 Minor；brief 三处照抄必错
的修法经 review 独立核实全对（"是计划错了，不是补丁错"）。本轮改 Important ①、Minor ②，
Minor ③ 判不动并在下文说明。review 点了两件**不做**：受控 A/B 探针（14 列载荷与
word-break 修是一步改的，缺对照；review 裁"算了"）、`codeTextFromNode` 的 `.trim()`——均不做。

### ① Important：整条消息的复制通道被新结构弄坏了（已修）

原 `chatTextFromNode` 直接 `innerText`：关着的 `details.md-code-rest` 与
`display:none` 的 `tbody.md-table-rest` 都不在 innerText 里——整消息复制把第 24 行
之后的一切静默丢掉（60 行代码块只剩 24、60 行表丢 40），**打分（onRateChat）还把
截断文本发给服务端**；且头部条可见文字（语言名/「N 行」/「复制」/「再展 N 行」）
被织进复制结果。两个消费方：app.js:7561 `copy` 动作、app.js:7614 `onRateChat`。

修法（app.js `chatTextFromNode` 重写）：克隆 `.chat-body` → 摘掉
`.md-block-head` 与 `.md-code-rest summary`（chrome）→ `details.md-code-rest` 置
`open` → `tbody.md-table-rest` 置行内 `display: table-row-group` → 挂进 `document.body`
（`position:fixed`，宽=原节点渲染宽）读 `innerText` → 摘除。**必须挂进文档**：
detached 节点上 innerText 退化成 textContent、块间换行全没；宽度沿用原节点保证折行
位置与所见一致。`innerText ?? textContent` 双退路：jsdom 根本没有 innerText。

**补锁（review："别只钉块级那条——这次漏的就是只验了一半"）**：
`markdown.test.ts` 新增 describe「消息级复制（copy 通道）」一条测试：真实
`renderMarkdown` 渲染 60 行代码块 + 60 行表格挂进 `.chat-item`，断言
`chatTextFromNode` 输出 `const x\d+` 恰 60 条、`值\d\d` 恰 60 条（表格单列
补零记号：jsdom 的 textContent 把相邻单元格无分隔拼接，多列会让跨格数字连片、
计数失真；多列几何由探针 14 列载荷兜），且不含「复制」「再展」「60 行」
「typescript」。**该测试是 chatTextFromNode 的第一把锁**（此前零测试覆盖）。

**变异验红**（review 要求：把补读逻辑去掉看它红）。临时换回旧两行实现，跑：

```
FAIL  test/markdown.test.ts > 消息级复制（copy 通道，Task 5 review 的补锁） > 消息级复制：拿到全部行（含折起的）且不含头部条文字
AssertionError: expected 'typescript60 行复制const x0 = 0;\nconst …' not to contain '复制'

- Expected
+ Received

- 复制
+ typescript60 行复制const x0 = 0;
+ const x1 = 1;
…
Test Files  1 failed (1)
     Tests  1 failed | 63 passed (64)
```

红的正是 chrome 那半（jsdom 的 innerText 就是 textContent，丢内容那半它模拟不了——
那半由 live 探针在真浏览器里锁，见下）。换回新实现后 64/64 全绿。

**探针补上消息级通道**（review："探针只点了块级按钮（走 textContent，完整），
所以四条验收照不到"——说的就是这里）：`verify-long-content.mjs` 注入件加
`[data-chat-action="copy"]` 按钮，新增第 ④ 条：先把①里展开的代码**折回去**，
再点消息级复制——在真 Chromium 里证明「折起」状态下剪贴板仍有全部 60 行代码与
60 行表格，且无头部条 chrome。实测：

```
④ 消息级复制：代码折回=true · 剪贴板代码行=60（应 60）· 表格行=60（应 60）
   无头部条 chrome（复制/再展/60 行）=true · 首行="0	c00v0	…	值0" · 末行="59	c00v59	…	值59"
✅ 五条全成立：代码折叠/复制全量 60 行、表格自身横滚不撑正文、TSV 61 行可开可收、消息级复制全文无 chrome、0 控制台错误
```

（旧实现在这条下必红：关着的 details 在真浏览器 innerText 里就是没有 x24–x59。）

### ② Minor：已不可达的语言角标规则（已删）

原 `.md .md-code[data-lang]::before` 角标（styles.css 7588 一带）**匹配不到任何元素**：
`data-lang` 只在渲染器围栏分支发出（markdown.js 309/325），而该分支的 pre 永远包在
`.md-block` 壳里；app.js:10297 的 pre 与画布 `ac-code` 都不带 data-lang。删掉它；
同时删掉我为它写的 `content: none` 覆盖（styles.css 6732 一带）——原规则没了，
覆盖句的注释「（画布等无壳场景仍保留）」跟着不实，两句一起消失，不留死规则。

### ③ Minor：`white-space: pre-wrap` 继承进单元格（判不动，说明如下）

review 的护栏话是"若你觉得会改坏有意的空格，就别动、在报告里说明"——正是这个情况：
`.chat-body { white-space: pre-wrap }` 是房子**全局**的选择（段落里的连续空格同样
保留），单元格继承它是一致行为而非表格缺陷；而 `.md code`（行内码）**没有自己的
white-space 规则**、纯继承——给 td/th 加 `white-space: normal` 会让反引号里有意义
的空格（如 `a =  1`）在表格里坍缩、在段落里保留，两处行内码行为分裂。对比
word-break 那次：那是 live 几何量出来的**功能性**缺陷（列 min-content 坍成单字符、
横滚永不触发），非修不可；white-space 只是"两个空格显示成一个还是两个"的观感差，
且保留正是全局既有语义。故不动。

### 对原报告两处"说窄了"的更正

- **残余担忧第 2 条（折叠态会回折）的触发面说窄了**：原话"聊天消息落定后基本
  不再重建"不成立——**给那条消息打分就是落定后的重建**：text 类 sig 含评分，
  打分后该消息经 innerHTML 整体重换，用户手开的折叠回折叠。裁"可接受"不变
  （折叠是阅读态便利，内容不丢；且本轮修后消息级复制与打分都绕开折叠态直接拿
  全文，回折的代价只剩"要再点一次"），但触发面必须如实记：**打分（up/down）
  → 节点重建 → 折叠复位**。
- **头部条 chrome 不只是观感问题**：原报告把它当 B6 设计副作用记录；本轮证明它
  会**污染复制与打分的文本负载**（服务端收到带 chrome 的评分样本）。修完不再成立。

### 收尾量测

- `check-eol.mjs` 四文件：全部 `裸LF=0`（app.js/styles.css/markdown.test.ts 因改动
  报「不一致」，markdown.js 未动仍逐字节同）。
- 三文件口径 `markdown + ui-patch + ui-math`：`410 passed / 3 failed`，红的仍是
  三条基线 CRLF ui-patch 失败，零新增。
- 全量 `npx vitest run`：`13 failed / 3663 passed`，与基线 13 条同名同族，**零新增**
  （首跑与 check-eol 并行时受负载扰动出 21 条，多为 hook timeout 与 handoff 时序；
  干净复跑即回落 13——按纪律只认干净跑的账）。
- commit `610e54a`（新提交，未 amend `6751b10`），4 文件 95+/19-。
