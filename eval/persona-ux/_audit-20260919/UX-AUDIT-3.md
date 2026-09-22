# 三轮走查报告（2026-09-19 · 用户真机 4173）

**目的：** 委托方点名四镜头——**操作不顺手 / 视觉感觉差 / 结构乱 / 表达方式**；并追加两条硬要求：
**「对话进行中的问题也需要修复」**、**「右侧的栏目还能怎么优化最好」**。

**纪律（沿用前两轮）：** 证据只认活页屏幕原文 / DOM 几何 / 落盘档案 / 亲手复跑；
**未复现的不进确证**，撤销的怀疑单列；「做对了的」单列防误伤。

**与一、二轮的关键差异：** 前两轮在隔离宿主（4201/4203）上走，本轮**首次对用户真机 4173**——
50 份真档案、235 轮的长会话、用户自己的 `_probeN-*` 目录，这些是隔离实例里造不出来的弹药。

## 0. 方法与仪器

| 项 | 事实 |
|---|---|
| 宿主 | 用户真机 `127.0.0.1:4173`（进程 8:59:16 起，跑的是 `cc77d28` 合并后的码——已按锚点核对：`deriveActivePhase`=2、`rail-expand-inset`=3，与工作树一致） |
| 真数据 | `.agent-run-history` 50 份；最新 `4ac7109c`：235 轮 / 1,178,239 tokens / 上下文 409,833 / `stopReason: partial` |
| 仪器 | Playwright（真视口 + 全分辨率截图 + 页内 `getComputedStyle` 几何）；档案挖掘（`events.jsonl` / `transcript.jsonl` / `meta.json`）；源码判据 |
| 授权 | 委托方明示「在 4173 上发一条跑」→ 发了 1 条真对话（`看一眼 _ux_probe/view-probe.png…`），全程采样进行中状态 |

**仪器缺陷（自曝，影响面已界定）：** 早期探测脚本用 bash heredoc 落盘，`\\s` 在模板字面量里退化成 `s`，
把 `replace(/\s+/g,' ')` 执行成 `replace(/s+/g,' ')`——**输出里的字母 `s` 被替换成空格**。
受害的只有**文本字段**（如 `run-item-task` 显示成 `run-item-ta.k`、`sidebar` 显示成 `idebar`）；
**几何数字、选择器、计数全部未受影响**。已改为 Write 工具落脚本。

## 1. 发现台账

图例：**✅ 活页确证** ｜ 🔶 源码判据 ｜ **⛔ 已撤销**

### 线 L · 进行中（委托方点名的第一条）

#### L1 「装配条」整条是死的——识图能力在界面上零表示 ✅ **本场最重**

**症状：** 换模型、换包、换核查开关时，**输入框那一行看不出能力面的任何变化**。

**证据链（四重独立）：**

| # | 证据 |
|---|---|
| 1 | 活页：全文档 `document.querySelectorAll('.assembly-chip').length` = **0**；含 `assembly` 的类名 **0** |
| 2 | `ui/public/index.html`：`grep -n "assembly"` **零命中**——挂载点不存在 |
| 3 | `ui/public/app.js:5530`：`assembly: null`（硬编码）；全仓 `.assembly` 只有**读**（5628）与 `parts.sig.assembly`（5633-5634），**没有任何一处赋值** |
| 4 | `app.js:5628-5629`：`const host = parts.assembly; if (!host) return;` —— 第一句就返回 |

**历史：**

```
d0beedf  08-08  feat(ui): 装配状态条 —— 条上是真实装配，点开才是设计思想
664eb0c  09-07  feat(ui): 桌面级 UI 升级——9 大特性模块 + 完成进行中界面特性
                └─ 输入框重建为 composer-scope / scope-field-*，丢掉装配条挂载点
```

**代价：** `deriveAssemblyBar`（`app.js:5824`）里那套judgment连同理由文案**全部不可见**，包括：

- `model` 格：当前执行模型（注释原文：「换模型是最容易被忘记的变量，而它解释掉大半的行为差异」）
- `verify` 格：核查开关 / 预算 / 白名单条数
- **`vision` 格**：`识图 执行者` / `识图 未配` / `识图 不可用` 三态 + 各自的长理由
- `workdir` / `git` / `durable` / `autoAllow` 各格

**性质：** 纯函数 + 单测（`test/ui-app.test.ts`、`test/ui-faces.test.ts` 共 8+ 条）**全绿**，
控制器没接线。**这是「纯函数与控制器的缝」的标准样本**——什么都不像坏了，只是某个东西不存在。

#### L2 换模型 = 悄悄摘掉 agent 的眼睛 ✅

**判据是模型名的字符串启发式**（`src/design-image-review.ts:51`）：

```ts
if (/(?:^|[^a-z])vision(?:[^a-z]|$)|-vl(?:-|$)|(?:^|[^a-z])vl-/.test(n)) return true;
if (n.startsWith("claude-")) return true;
if (n.startsWith("gpt-4o") || n.startsWith("gpt-4.1") || n.startsWith("gpt-5")) return true;
if (/^deepseek-(?:v4-)?flash(?:-vision-exp)?$/.test(n)) return true;
return false;        // ← kimi-k3 落这里
```

→ `resolveExecutorVisionSupport` 返回 false → `assembleViewImageTool` 返回 `undefined`
→ **`view_image` 不进工具面**（`src/cli.ts:979`）。

**档案实证（真账本，非推断）：**

| run | 起始模型（`run_config`） | `view_image` 真调用 |
|---|---|---|
| `24ca8a98` | **deepseek-flash** | **14 次**（结果 "Loaded …"） |
| `46f123df` | **deepseek-flash** | **18 次** |
| `3296e94c` | **deepseek-flash** | **3 次** |
| `25234cda` | **deepseek-flash** | **25 次** |
| **`4ac7109c`** | **kimi-k3** | **0 次** ← 卡住的那条 |

**今天活页复现（授权实跑）：** 执行者 kimi-k3，任务 `看一眼 _ux_probe/view-probe.png（用 view_image）`，
图片是自造的纯色 `#2f7a91`（文件名不带任何颜色线索）。**模型的回答：**

> 我这边没有 view_image 工具可用（**当前工具面板里没有挂载图像查看能力**），
> 但我可以直接解码 PNG 的像素数据来定论颜色——比看图更可靠。

→ 用 PIL 解码，答出 `RGB(47,122,145)` = `#2F7A91`（**正确**，但代价是 2 张审批卡 + 4 轮 + 52 秒）。

**这是一次有意的保守取舍**（注释原文：「宁可不认，也不要把 DeepSeek Pro 当成 VL」；
09-16 有活探针对照：`deepseek-v4-pro` 回 200 但把图换成 `[Unsupported Image]`）。
**取舍本身站得住；站不住的是它不可见**——因为 L1。

**用户可见的账单**（`4ac7109c` 收尾原文）：

> 篆字外皮在近景里未实测过、夜景外皮泛光未实测过；交互/降级/离线探针没跑完。

**这是"为什么卡住"的真答案**：不是 harness 坏了，是**做视觉任务的人换了个看不见图的执行者，而没人告诉他**。

#### L3 `view_image` 每看一张图弹一次审批卡，且不许"总是允许" ✅

- `src/tools/view-image.ts:87`：`approvalPolicy: { maxScope: "once" }`（写死）
- 档案：`3296e94c` 3 张卡、`24ca8a98` 14 张卡，**全部走 `approval_request`**，无一条 `approval_auto`
- 视觉任务的常态是"看十几张截图"→ **十几次点击**，且每次都要读卡

#### L4 审批挂起时底栏不说它在等你 ✅（一轮 UX-A4，当初未进修复清单）

活页原文（`live-approval-1.png`，此刻正挂着一张 `view_image` 审批卡）：

> 运行进行中，直接发送会立即插入…

**一个字都没提"它在等你批准"**。一轮 §1 记为 UX-A4「中」，但 §9 的四刀只收了 A1/A2/A3，
§8 的候选清单里也没有它——**原样活到今天**。

#### L5 静态资源不发 `Cache-Control` → 部署后用户拿到的还是旧壳 ✅

**症状：** 改完 `app.js` 重启宿主，浏览器 `location.reload()` 仍执行**旧代码**；
`location.reload()` 反复刷、`fetch(..., {cache:"no-store"})` 才拿到新的。

**证据：** `curl -D - http://127.0.0.1:4201/app.js` 的响应头只有
`Content-Type / Date / Connection / Keep-Alive / Transfer-Encoding`——**没有 `Cache-Control`，
也没有 `ETag` / `Last-Modified`**。现代浏览器对无验证器的 200 走启发式缓存，
普通刷新拿不回新壳。

**对照：** 同一份 `ui/server.ts` 里，**产物路由**（`case "artifact"`）精心写了
`Cache-Control: no-store`，注释还写着"不该被任何中间层缓存住旧版本"——
**同一条纪律没有施加到自己的 app shell 上**。

**影响面：** 任何一次前端修复，用户不做硬刷新就看不见。这一条在本轮把**我自己**骗了一次
（修复已上线，活页里却是空的，差点误判成"没接上线"）。

**修法方向**（未做，见 §5）：壳资源加 `ETag`（内容哈希）或 `Cache-Control: no-cache`（允许缓存但每次回源校验）；
`no-store` 会牺牲全部缓存收益，不适合 shell。

### 线 E · 表达方式

| 序 | 症状 | 证据 |
|---|---|---|
| E1 | **英文夹中文**：`20m ago` / `16h ago` / `yesterday` 出现在中文列表里；`AGENT CONSOLE` 眉标；`Work` / `Code` 页签；`Enter` 键帽；装配区标题 `Progress` | `home-1600.png`、`heavy-1600.png` |
| E2 | 侧栏底部 **5 个零标签图标按钮**（`board-open` / `artifacts-open` / `schedules-open` / `memory` / `settings`），全靠 hover 猜 | 骨架实测，元素无可见文本 |
| E3 | 执行者回执**自称"没有工具"**时，界面无对应解释（L1/L2 的下游后果） | `live-approval-1.png` 屏上原文 |

### 线 S · 结构 / 操作

| 序 | 症状 | 证据 |
|---|---|---|
| **S1** | **首页的输入框在首屏之下** | 1600×900：`#submit-form` **y=1508**，`inView=false`；1100 档 y=1513；390 档 y=912 |
| **S2** | 幻影滚动：首页可滚 982px（1600）/ 986（1100）/ 429（390） | `#main-panel` `scrollHeight 1882` vs `clientHeight 900` |
| **S3** | **50 条档案，29 条无入口** | 侧栏 `#run-list` 只有 3 个 `run-group`（6+1+1=8 条）；`Agent_Design` **14 条**、`ui-qa` **11 条**、scratch **4 条**不出现；`liquid-demo` 组头写 `6`，实有 **18** |
| **S4** | 1600 档四区并立，对话只占 35% | `sidebar 312` + `#main-area 966`（内含 `detail-layout` 栅格 **`562px 340px`**）+ `rail 322` |

**S1+S2 的根因链（A/B 铁证）：**

```
首页把 #right-rail 收成 width: 0
  └─ 内部 #workspace-file-tree 仍在布局：宽 1px、高 2490px（每行被迫换行）
       └─ 高度回灌 #center-row → 2490px，align-items:center → 行起点 y=-982
            └─ 行底 1508 顶住 #submit-form → 输入框落到首屏外
                 └─ 整页多出 982px 幻影滚动

对照（注入 rail.style.height='0'）：
  输入框 y 1508 → 372 ｜ inView false → true ｜ 幻影滚动 982 → 0
  截图 welcome-B-railheight0-1600.png：输入框 + 4 张起步卡全部回到首屏
```

### 线 R · 右列（委托方直接问的那块）

| 序 | 症状 | 证据 |
|---|---|---|
| **R1** | `split`（声称"并排"）档里 **preview 列 `display: none`**，宽高 0×0，树独吞 `flex: 0 0 …` | 1920/1600/1440 三档实测一致 |
| **R2** | **窗口越宽，文件树越窄** | 1920→**180px**｜1600→**161px**｜1440→**141px** |
| **R3** | 名字全不可辨 | 同一屏内 `_cdp-pix-9…` ×2、`_probe2-p…` / `_probe3-p…` ×2… |
| **R4** | 1600 档右列 322px 里 **161px 是死的** | 树 161 + 空白 161 |

## 2. 撤销的怀疑（防造假，沿用前轮纪律）

| 怀疑 | 裁决 |
|---|---|
| ~~收起态右列把首页 hero 顶偏~~ | **撤销**。A/B（`rail.style.display='none'`）后 `#main-area.y` 155 → **155**，零变化。受害的是输入框，不是 hero |
| ~~390 档首页输入框不可达~~ | **撤销**。`#main-panel` 确实不可滚，但**窗口**能滚 429px，滚到底 `y=470, inView=true`。降级为"在首屏之下" |
| ~~`view_image` 因 fail-open 探针被注册~~ | **判据错**。真判据是 `nameSuggestsVision(modelName)`（名字启发式），不是 `probeVisionSupport`；kimi-k3 落 false，工具压根不挂 |
| ~~harness 把未知工具调用伪装成"空的 bash 回声"~~ | **撤销**。`src/tools/registry.ts:224` 回的是干净明确的 `Unknown tool "view_image". Did you mean: …? Available tools: …` + `isError`。模型那句是它自己编的 |

## 3. 做对了的（防误伤清单，今天活页逐条复核）

- **直播条复活**：58 次采样里 **48 次** `.live-strip` 可见，且带思考尾（一轮 A1 修复有效）
- **轮数·耗时**：56/58 次采样有 `第 N 轮 · 已跑 Xs`（一轮 A3 修复有效）
- **「经放行」chip 上屏**（一轮 U5 修复有效）
- **未知工具回执**：带最近候选 + 全量清单 + `isError`，注释还记着案例 #8 的教训
- **控制台全程零错误**（真机 4173，三条视图 × 五档宽度）
- 首页/会话页骨架、`#action-dock` 钉在输入框上方、右列收起键与把手

## 4. 复跑方式

```bash
node eval/persona-ux/_audit-20260919/recon.mjs        # 三视图 × 三档：溢出/文本/对比度
node eval/persona-ux/_audit-20260919/rail-probe.mjs   # 右列五档几何
node eval/persona-ux/_audit-20260919/composer-ab.mjs  # 首页输入框位移 A/B
node eval/persona-ux/_audit-20260919/bar-dump.mjs     # 装配条真身（L1 判据）
```

截图在 `shots/`：`welcome-A-current-1600.png`（现状）vs `welcome-B-railheight0-1600.png`（A/B 对照）、
`live-approval-1.png`（进行中现场，含 L4 底栏原文）、`home-1600.png`（50 份档案的侧栏）、
`heavy-1600.png`（四区并立 + 树名截断）。

## 5. 修复落地：L1 + L2（2026-09-19，委托方勾选「1 和 2 先做」）

### 设计（先拍板后动码，bounded 路径）

**不复活整条 8 格装配条**——二轮 `85d30ac` 刚撤掉一份"说明书"，加回去是回归。
只把**承载能力后果**的格子挂到**常显的 scope 摘要行**右端，且**只在弱态占位**。
落点必须是 `summary` 内：收起的 `<details>` 只渲染 summary，而 `#composer-scopebar`
与 `#composer-compose` 同在 y=807，被后者整个盖住。

### 落了什么

| 件 | 改动 |
|---|---|
| `ui/public/index.html` | 摘要行内加 `#composer-capability-chips`；`</details>` **之外**加 `#composer-capability-why`（收起态正是理由被用到的状态） |
| `ui/public/app.js` | 新增 `capabilityChips(state, harness)`（薄过滤，**`deriveAssemblyBar` 本体一行未动**）与 `patchCapabilityBar(state, harness, root)`；删掉只挂在 run 详情上的 `patchAssemblyBar` 与 `parts.assembly` 两个死挂载点 |
| `ui/public/index.html` | composer 同步路径里调 `patchCapabilityBar(selectedState ?? {}, harnessSnapshot)` |
| `ui/server.ts` | `modelsApiPayload()` 每条模型补 `suggestsVision: nameSuggestsVision(pub.model)`——**引用同一个函数，不另抄名单** |
| `ui/public/features/executor-model-picker.js` | 候选带「看不见图」标；触发键 title 与详情面板同源说明 |
| `ui/public/styles.css` | 摘要行右端布局 + 警示底色药丸 + 理由弹层 |

### 测试（先红后绿）

- 新增 `test/ui-capability-visibility.test.ts`（jsdom，12 条）：过滤语义 / **挂载点源码锁** / `patchCapabilityBar` 真渲染 + 点开收起 / 挂载点缺席不炸
- 新增「防再次脱钩」锁：`app.js` 不许再出现 `assembly: null`；`getElementById("composer-capability-*")` 的 id 必须在 `index.html` 里存在
- `test/ui-models-api.test.ts` +1：每条带 `suggestsVision`，且**逐条与 `nameSuggestsVision` 相等**（同源锁）
- `test/ui-executor-model-picker.test.ts` +2：候选标只在 `suggestsVision === false` 时出现；触发键与详情都说得出后果

### 活页验收（隔离宿主 4201，执行者 kimi-k3）

| 断言 | 实测 |
|---|---|
| 能力条在**收起态**可见 | `hidden:false`，`detailsOpen:false`，标签 `["识图 未配","核查关"]`，118×19 @ 摘要文字右侧 |
| 点开理由 | 547×77 上屏，原文即 `visionWhy`（「给模型一个用不了的工具，它会反复尝试并把失败归咎于自己」）；再点收起 |
| 模型选择器 | 条目 `flag: "看不见图"`；触发键 title 带 ⚠；详情面板带 |
| 控制台 | 零错误 |

### 实施中被活页抓到、单测抓不到的一条（值得记档）

初版把 `parts.assembly` 接上线就以为完事——**活页里首页仍然一片空白，而两条单测全绿**。
根因：`patchAssemblyBar` 只被 `renderRunDetail` 调用，**首页根本不走那条路**。
这就是记忆里那条「**纯函数与控制器的缝**」：纯函数对、挂载点也在，缝在"谁调用它"。
修法是把落点挪到 composer 的同步路径（`patchCapabilityBar`），并把这段教训写进代码注释。

### 对基线：零新增失败

按纪律先备份改动（`git diff` + 未跟踪打包），再 stash 到 HEAD 跑一遍全量建基线，恢复后跑第二遍对名字。
**恢复的 diff 与备份逐字节一致**（`diff -q` 通过）。

| | 通过 | 失败 | 跳过 | 总 |
|---|---|---|---|---|
| 基线（HEAD，无本次改动） | 3564 | 12 | 15 | 3591 |
| 本轮（含修复） | **3579** | **12** | 15 | **3606** |

两个失败集**逐条相同**（`comm` 双向差集皆空），新增失败 = 0；+15 正是本次新增的锁
（`ui-capability-visibility` ×12、picker ×2、models-api ×1）。

存量 12 条与一/二轮记录的基线同族：`cloud-sync-env`×2、`run-crash-inject`×1、
`ui-handoff`×4、`ui-patch`×3、`ui-server`×2（后两条含时序抖动）。

### 遗留（本轮未做，如实记）

- **`visionWhy` 的补救只写了一半**：它说「没配视觉模型（`AGENT_VISION_MODEL`）」——那条路通向
  `describe_image`（另引一个识图模型），**通不到 `view_image`**（执行者亲眼看像素）。
  而委托方做的是三维页视觉验收，要的正是后者。另一半补救「换个能看图的执行者」目前只在
  Fix 2 的模型选择器里说。两处合起来才完整，**但 chip 自己的理由仍是单边的**——建议下一刀补。
- L5（静态资源无 `Cache-Control`）未修。
- L3（`view_image` 每张一次审批）/ L4（挂起时底栏口径）未修。

## 6. 待办（本报告尚未覆盖）

- 视觉镜头系统扫描（对比度 / 间距节奏 / 对齐轴）——recon 的 CONTRAST 在 1600 档零不合格，需换档位与暗色主题再扫
- 表达原文全量清册
- 右列优化设计案（按二轮流程定论：先出可视化设计案拍板，再 TDD 落地）
- L3 / L4 / L5 与 `visionWhy` 单边补救
