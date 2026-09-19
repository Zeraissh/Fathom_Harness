# UX 全面走查报告（2026-09-18 晚，feat/ui-center-contract）

**目的：** 用户判「体验很差」，点名三条线：**进行时 / 面板展开与隐藏 / 文本溢出控件**。本报告在隔离宿主上以真机证据为准逐一取证；静态读码结论只作假设，且单独标注。
**纪律：** 证据只认活页屏幕原文、DOM 几何/计算样式、HTTP、宿主落盘事件、亲手跑的脚本。**未复现的不进「确证」**。

## 0. 方法与仪器

| 项 | 事实 |
|---|---|
| 宿主 | `fathom-audit` 隔离实例 `127.0.0.1:4201`（`.claude/launch.json`；独立 workdir/history/memory 在 `D:\Work\scratch\fathom-ux-audit-20260918\`）。**未碰**用户 4173 与回走 4199 |
| 工作目录 | `web-a`（含超长中文文件名、深路径、HTML 样张等溢出弹药）+ `web-b` |
| 真 run | 4 条：改写 hello-code（含审批）、版本号 v2 + 新建 changelog（两次审批）、**带核查**改回 v1、纯对话轮；全部走真实模型（flash 档） |
| 仪器 | Playwright 全分辨率（`ux-ladder-scan.mjs` 梯子+溢出扫描、`ux-click-send.mjs`/`ux-click-mini.mjs` 真点击裁决）+ 面板内 DOM 取证 + 采样器（400–700ms/次）+ 宿主 `events.jsonl` |
| 证据文件 | 本目录 `uxaudit/`：`ux-ladder-scan.json`（7 档 × 2 态 + 96 处溢出命中）、`ladder-*.png`、`live-approval-pending.png` |

**仪器发现（写进给后来人）：**
1. 面板原生视口仅 **427×411**；`preview_resize` 放大后 `preview_screenshot` 是整体缩放的缩略图（不可读），且**模拟视口下 `preview_click` 不会触发默认动作**（点发送键不提交表单）——交互一律用页内 `el.click()` 或 Playwright；宽档截图一律用 Playwright。
2. **「点了没反应」的假警报**：源码注释称「嵌入预览/某些环境下 submit 会被吞」（index.html:3440）。真鼠标点击裁决（`ux-click-mini.mjs`）=**正常提交**（POST 立即 1 次）。前提驳回，不作缺陷。

## 1. 总裁决

**最有杀伤力的三处，全在用户点名的线上，且都在宽屏（用户主场景）或每个任务的常规路径上：**

1. **进行时几乎不可见**：调用了工具的 run（≈所有真任务）从第一个工具起，直播条**整场不再出现**（64 秒 160 次采样零出现）；核查阶段界面完全静止；会话页没有轮数/耗时。剩下的"在干活"信号只有侧栏 shimmer、底栏停止键、对话里一块可能陈旧的 Thinking。
2. **宽屏右列结构塌了**：≥1440 的 split 档不是「树|预览并排两列」，而是两条 **141px 横条**竖叠 + 下方 **487px 全空**，且「文件/预览」tab（含收起键）**整排隐藏**。根因已钉到 CSS。
3. **窄档右列里，产物画布工具条横向溢出 76px**：地址栏被压成 **16px 的缝**，最右按钮被窗口右缘**切掉**。

另有两条"点了没反应"级的交互缺陷：**「收起右列」键完全没接线**（零反应、无回头路）；**「放大」只放大到右列自身**（对话一点不让）。

## 2. 问题总表

图例：**✅ 活页确证** ｜ 🔶 静态证据（待逐一复现）｜ ⛔ 已复现失败/前提驳回（不占实施位）

| 序 | 症状（一句话） | 线 | 严重度 | 状态 |
|---|---|---|---|---|
| UX-A1 | 工具轮次里直播条整场消失（含等模型/审批挂起窗口），只剩侧栏 shimmer | 进行时 | 高 | ✅ |
| UX-A2 | 核查阶段零指示：verifier 在真干活，界面像卡住 | 进行时 | 高 | ✅ |
| UX-B1 | 宽屏 split 档：两条 141px 横条 + 487px 空 + tab 全隐 | 展开 | 高 | ✅ |
| UX-B2 | 「收起右列」键零反应；进了收起态无回头路 | 展开 | 高 | ✅ |
| UX-C1 | 窄档画布工具条溢出 76px：地址栏 16px 缝、按钮被窗口切 | 溢出 | 高 | ✅ |
| UX-B3 | 「放大」只放大到右列自身（239×769），不铺主区 | 展开 | 高 | ✅ |
| UX-A3 | 长 run 无粗粒度进度（轮数/耗时只在指挥中心，要离开对话） | 进行时 | 中高 | 🔶（会话页无计数已确证；指挥中心未开） |
| UX-A4 | 审批挂起时底栏说「运行进行中，直接发送会立即插入…」，不说它在等你 | 进行时 | 中 | ✅（文案原文） |
| UX-D1 | 会话内 `/api/workspace/git` ×112、`/paths/inspect` ×84，背靠背 6–7ms 爆发 | 其它 | 中 | ✅（量化；根因未钉死） |
| UX-A5 | 直播条隐藏后残留陈旧「正在想…」文本 | 进行时 | 低 | ✅ |
| UX-B4 | 子代理浮层每帧重建（拒签理由会丢）/ 阅读模式段自收 / 产物与Progress自己弹开 / z-index 60 浮层互不互斥 / 坞收起留空槽 / 若干折叠键盘不可达 | 展开 | 中 | ✅（2026-09-18 深夜修复，见 §12） |
| UX-C2 | 文件预览坞顶条长文件名撑破（ellipsis 挂错元素成死代码）/ 消耗图表日期 `text-overflow:clip` 硬切 / 长 MCP 工具名撑行 / 工具组摘要硬切 / 审批卡首行长名不换行 / 来源表零防护 | 溢出 | 中 | 🔶（O1–O10，静态证据强） |
| UX-A6 | 重试/换端点/段续跑/hook 等事件零视觉；右栏「等待拆步…」不可达；文案指已删抽屉 | 进行时 | 中低 | ✅（2026-09-18 深夜修复，见 §11） |
| UX-B5 | `E4 工作目录菜单每帧重建` 前提不成立（会话内触发器 `disabled`，菜单打不开） | 展开 | — | ⛔ |
| UX-B6 | `E5 变更预览被清空` 本轮未复现（行头节点确被替换，但预览内容存活 5s+） | 展开 | — | ⛔（待更长的写盘窗口再试） |
| UX-D2 | `@/#//$` 键现状、IME、并发直播 | 其它 | — | 未测 |

---

## 3. 线 A · 进行时（确证部分）

### UX-A1 直播条在工具轮次里整场消失 ✅
- **采样**：turn 2（含 2 次审批、多轮工具）**64 秒 160 次采样，`.live-strip` 无一可见**；turn 3（核查轮）同样全程 `hidden`。
- **对照**：纯对话轮（无工具）采样到两条可见样本：`正在想… Conversational answer, three senten…` —— **直播条只在"没调过工具"的轮次里活着**。
- **根因**（静态，与采样吻合）：`app.js:6521-6525`——`call = recent.find(e => e.type === "tool_call")` 取的是**时间线上最近一次工具调用**（不是"进行中的工具"），一有工具调用就整体 `hidden` 提前返回；其后的「等待模型响应…」「成本预警」标签全被这行挡死。注释里写的优先级与行为不符（`app.js:6470-6478`）。
- **加重**：隐藏的直播条里留着陈旧文本（UX-A5），如 `正在想… Task is complete. Call finish_task with artifacts.`——已完成后仍然滞留在 DOM。
- **复现配方**：4201 → 发「读两个文件再改一行」→ 从第一个工具起盯主区顶部：整场空白（对照：发纯聊天任务可见「正在想…」）。
- **证据**：本目录 `uxaudit/live-approval-pending.png`（挂起相位的高清现场）；采样数据见 §0 仪器说明。

### UX-A2 核查阶段零指示 ✅
- **事件 vs 屏幕**：turn 3 勾了「本轮独立核查」。`events.jsonl` 里 `source: verifier` 的 bash 调用（cat/grep）在稳定推进（seq 240–251），**而屏幕端采样：直播条 hidden、无任何「核查中/复核中」字样、无进度**；页面里仅有的一块 live Thinking 是主 agent 的残留。屏幕看起来 = 卡住。
- **根因**（静态）：verifier 事件整体改道 `verifierTimeline`（`app.js:1196-1212`），直播条只读 `state.timeline`；verifier/planner 的思考被显式丢弃（`app.js:8381`）；段分界（`◆ 核查 · 全新上下文独立复核`）默认路径不可达（`app.js:8542/8259` 的 `hideTools/showBoundaries` 恒 false）。
- **复现配方**：4201 → 勾「本轮独立核查」发一个写文件的轮次 → 放行写盘卡后，在裁决卡出现前的整段时间盯屏幕：除侧栏 shimmer 外无任何指示（verifier 确实在跑，见 history/<run>/events.jsonl）。

### UX-A3 长 run 无粗粒度进度 🔶（会话页无计数已确证）
- 会话页骨架（`app.js:5375-5433`）只有标题＋上下文环＋直播条＋对话＋右栏；「第 N 轮 · 已耗时 · 最近一步」只存在于**指挥中心卡片**（`command-center.js:571-573`，还得开着指挥中心才 10s 刷新）。带轮数/用量的「运行详情」抽屉今天刚下线。用户看一条 34 分钟的 run，界面上没有任何"跑了多久/到哪了"。
- 复现配方：发长任务，全程停在会话页——无法回答"第几轮了"。

### UX-A4 审批挂起时的话术 ✅
- 挂起时底栏原文：`运行进行中，直接发送会立即插入…` + 按钮「停止」+ 提示「已发出停止…」等；**没有任何"它在等你批准"的字**（"在那张卡上"只在 dock）。若在别的 run 上，完全看不出这条在等你。
- 复现配方：发写盘任务，卡出现后看底栏原文（`live-approval-pending.png` 同款现场）。

### UX-A5 陈旧直播条文本 ✅
见 A1 加重情节。复现：任一轮结束再取样 `.live-strip`（hidden 但 textContent 非空且过期）。

### UX-A6 一批事件零视觉 🔶
`api_retry`（重试还把已流出的半截正文清掉，`index.html:2990-2999`）、`model_fallback`、`segment_resume`（`app.js:8476-8479` 显式跳过）、`hook`/`tool_aborted`/`approval_auto`（除指挥中心一句）等，在对话里零痕迹。右栏「等待拆步…」分支与自己的前置条件矛盾、永不显示（`app.js:7596-7621`）。`app.js:7522` 文案仍指已删除的「运行详情」。

### 进行时里做对了的（下一刀别误伤）
- **只读 bash 链式免问**（活页实录）：`approval_auto` `ls -la; echo "---"; cat -A f 2>/dev/null | head -30` → `rule:read-only-shell`「只读命令，参数均在工作目录内」；写盘照旧逐张卡（`for` 循环这类语法外构造正确回卡）。
- **写盘后播报**：`已写出 hello-seed.txt`、`已写出 hello-code.txt 等 3 个`（P3 宣布纪律生效）。
- **停止三段**：点击后 <500ms 按钮变「正在停止…」+ 说明「已发出停止，正在收尾。已完成的写入不会回滚。」→ ~1.5s 后「已停止：…」+ 按钮回「继续对话」。
- **裁决卡**：`chat-verdict--ok`「◆ 核查通过 判第 3 轮对话」+ 实测摘要，另有 `chat-verdict-list--not` 记一条正文与结构化交付矛盾的备注。
- **折叠在流式下存活**：scopebar 与对话折叠在 5s 连续重渲染中节点未被替换、展开态保持。

## 4. 线 B · 展开与隐藏（确证部分）

### UX-B1 宽屏 split 档结构塌陷 ✅（本轮最重的结构问题）
- **活页几何（1440×900）**：`#right-rail` 282×769 `flex-direction: column`；子项 `#right-rail-preview` **281×141 @y=0**、`#workspace-file-tree` **281×141 @y=141**；画布本体 178 高**超出其槽 37px**；y≈290 之后到 769 **全空**。`[aria-label="右列面板"]`（文件/预览 tab）`display:none`——**面板不可切换、收起键也被一起藏了**。
- **根因（已钉死）**：`styles.css:1631-1635` 在 column 容器里写 `flex: 0 0 var(--rail-tree-w/preview-w, 144px)`——**flex-basis 在 column 方向被解释成高度**；全仓没有 `[data-layout="split"] { flex-direction: row }` 之类声明（注释却写着"并排"）。901 之前各档的 tabbed 形态正常。
- **影响面**：宽屏是主力场景；用户看到的右列 = 一条 141px 的预览缝 + 树 + 半屏空白。
- **复现配方**：4201 拉宽到 1440/1600 → 看右列；`uxaudit/ladder-1440.png`、`ladder-1600.png` 为现场图。

### UX-B2 「收起右列」键没接线 ✅
- **活页裁决**：`#right-rail-collapse` 点击前后，948 / 1440 / 1600 三档**截图字节完全相同**（md5 一致）；全部 7 档的 `mode/layout/tabs/railWidth` 键值零变化。按钮只在 `paintRightRail` 里被写 aria/文案（`index.html:5182-5188`），**没有任何 click 处理器**（两处 document 级委托只认 `[data-rail-panel]`）。`saveRailPref` 三处调用全部写 `collapsed:false`——**没有任何代码路径写 `collapsed:true`**，但旧偏好键 `agent.ui.pref.filesRailCollapsed=1` 是 `readRailPref` 唯一的 `collapsed:true` 来源（`core/rail-policy.js:67`）→ 老用户一旦是收起态，右列 40px 死条/覆盖抽屉无入口恢复（CSS 出口全在右列内部：`styles.css:1551/1561/1609/1647`）。
- **复现配方**：1440 宽点右列右上 ⌄（预期：纹丝不动）；或 `localStorage.setItem("agent.ui.pref.filesRailCollapsed","1")` 刷新（预期：右列缩死、无可点恢复入口）。

### UX-B3 「放大」只放大到右列自身 ✅
- **活页几何**：1000 宽下点「放大」→ 画布从 `239×734 @(761,34)` 变 `preview-dock--expanded` `position:absolute; inset:0` → **239×769**——只长高 35px 并盖掉右列自己的 tab 行；对话列（468 宽）纹丝不动。
- **根因**：`position:absolute; inset:0` 的最近定位祖先是 `.right-rail { position:relative }`（`styles.css:1548/9122`），而 `#main-panel` 已无 position（`styles.css:1366`）——`styles.css:9110` 注释「absolute 相对 #main-panel」是 P1 搬 DOM 前的旧话。用户预期（也是注释承诺）：「盖满整个主区」。
- **复现配方**：打开产物预览 → 点「放大」→ 量画布宽度 = 右列宽而非主区宽。

### 展开/隐藏里做对了的
- tabbed 档（≤1439）形态正常；树与发送栏同源；`.chat-thinking` 折 19px ↔ 701px 正常开合；detail-rail（Progress）开合 aria 正确；折叠在流式重渲染中存活（见 A 线正向项）。

### ⛔ 前提驳回 / 未复现
- **E4**（工作目录菜单每帧重建）：会话内 `#workdir-trigger` 是 `disabled`（`workdirLocked`，`app.js:2861-2863`），菜单根本打不开——触发路径不存在，不占实施位。
- **E5**（变更预览被清空）：我的窗口里 `.chg-row-head` 节点确实被替换（重渲染实发生），但 `.chg-preview` 内容存活 5s+ 未清空——未复现，候选保留待长写盘窗口再试。

## 5. 线 C · 文本溢出（确证部分）

### UX-C1 窄档画布工具条溢出 76px ✅
- **活页几何（视口 1000，右列 240）**：`.ac-browser-bar` `clientWidth 239 / scrollWidth 315`（**溢出 76**）；`.ac-browser-url` 输入框 **clientWidth=16px**（一条缝）；`.ac-actions` 209 宽止于 **x=1076 > 视口右缘 1000**——「在文件夹中显示」按钮右侧被**窗口右缘直接切断**（`bodyScrollX=0`，页面不横滚，所以就是看不见/点不着）。
- **梯子扫描**：右列 240/282 档，`main-panel/center-row/right-rail/ac-browser-bar` 一族同报 76px 溢出；右列 322（1600 档）时消失——阈值在所有档位之外与 `O8` 的静态预算（按钮 nowrap 合计 ≈367px）吻合。
- **复现配方**：4201 开一个文件预览（画布）→ 量 `.ac-browser-bar` 的 `scrollWidth-clientWidth`；或看 `uxaudit/ladder-1100.png` 右列右缘。

### 扫描器扫到的但**不是**缺陷（防误伤，✅ 已守住）
- 花费芯片 `这次约 $0.0017 · 本机今日 $5.59`（149/170）、工作目录（139/175）、模型名（124/139）：**都有省略号 + 完整 title**，为设计内截断。
- 侧栏会话行、项目分组、文件树长名（含我的超长中文名种子）、tab、命令中心、通知——静态清单核对有 `ellipsis/min-width:0/overflow-wrap` 守卫。

### UX-C2 溢出批 ✅（原为静态条目；2026-09-18 深夜全部修复并活页 A/B 验收，见 §10）
1. **O1 预览坞顶条**：`.ac-title { flex: 0 0 auto }` 使 `.ac-name` 的三件套成死代码（父不缩，子不被裁）——超长文件名会把面板撑出右列（`features/file-preview.js:164-205`、`styles.css:9156-9171`）。
2. **O2 消耗图表日期**：`.usage-col-label { white-space:nowrap; overflow:hidden; text-overflow: clip }`（`styles.css:4156-4164`）——30d/90d 档日期被硬切（每列 8–23px，标签 ≈55px）。
3. **O3/O7 长 MCP 工具名**：`.chat-tool > summary > code` 归入"不可省略不许换行"族（`styles.css:6666-6668`、`app.js:10192`），67 字符的 MCP 全名（本仓 stm32 服务就有）会把行撑出卡片；活动行同病（`app.js:10043-10048`）。
4. **O4 工具组摘要**：`.tool-headline` nowrap 原子块 + 容器只 `overflow:hidden` 无省略号（`styles.css:4478-4481/4475`），长 bash 命令在列右缘"戛然而止"。
5. **O5 审批卡首行**：`.approval-tool-name` 无 min-width/word-break（`styles.css:1976-1982`），无分隔符长文件名会压出卡框。
6. **O6 来源表**：`.md-table` 的 `overflow-x:auto` 全带 `.md` 祖先要求，而 `.chat-sources` 不满足（`styles.css:6360-6379/5253`）——长 URL 无防护（顺带：那张表的边框/底色也没生效）。
7. **O9/O10 子对话 chip / 模型 label**：均无反防护（`app.js:7047`、`settings.js:1231`）。

## 6. 线 D · 其它

### UX-D1 请求爆发 ✅（量化）
- 单会话内：`GET /api/workspace/git` **112 次**、`POST /api/runs/…/paths/inspect` **84 次**；末段多次**背靠背 6–7ms 间隔**（非并行、像串行重试/多次注册）；**空闲 17s 零新增**（非轮询）。调用点：`features/workspace-git.js:223`（refresh，被 index.html 里 ≥10 处调用）与 `index.html:2668`（inspectRunPaths，正文路径链接化）。
- 影响：服务端每次 git 状态=进程调用；84 次 inspect=每批 ≤64 路径的 stat。长会话（用户 4173 有 100 轮/907 日志条目的 run）量级未测，但同构放大。
- 复现配方：`performance.getEntriesByType('resource')` 按 `/api/` 分组计数（本报告数字即此法）。

### ⛔ 假警报封档
- 「发送键被吞」：真鼠标点击 = POST 正常（`ux-click-mini.mjs`）。观测装置伪影。

## 7. 没测到的（诚实）

- 桌面壳（用户已定范围，排除）；planner/计划编排阶段（未开计划模式）；多 run 并发直播；中文 IME 真输入路径；NVDA 听感；`@/#//$` 键现状（N6/N7 只读了代码未点）；审批卡「短期允许相同参数」的实际行为；E5 的清空条件（需更长的写盘窗口）。

## 8. 候选下一刀（排序建议，供勾选）

1. **进行时指示复活**（A1+A2+A3）：直播条按"当前有没有手段在跑"判，而不是"曾经有过 tool_call"；核查阶段给一行「正在独立核查…」；会话页给轮数/耗时。→ 用户点名的第一痛点，且改动集中在派生层。
2. **宽屏右列结构**（B1）：补 `flex-direction: row`（或按契约重排），让 split 真并排；tab 行在 split 下的去留一并定。
3. **收起键与「放大」语义**（B2+B3）：接线或按契约撤掉；`放大` 的定位上下文回归主区。
4. **画布工具条窄档收纳**（C1）：按钮收纳/wrap，URL 保底宽；顺手清 O1 的 `.ac-title` 死代码。
5. **请求爆发**（D1）：钉根因（workspace-git refresh 的调用簇 + inspect 的触发时机），去重/节流。
6. **C2/O2-O7 溢出批**：等勾选后按撞见概率逐条（消耗图表、工具名、来源表优先）。

改完按本目录脚本回走：`ux-ladder-scan.mjs`（梯子+溢出）、`ux-click-mini.mjs`（真点击冒烟），并对照本报告「做对了的」清单防误伤。

---

## 9. 修复落点（2026-09-18 晚，用户勾选 A/B/C/D 后实施）

四刀全部实施完毕，逐条附**活页验收证据**；全量测试对 HEAD 基线（stash 对照）**零新增失败**——两版失败集完全相同（13 条存量：cloud-sync-env×2 / run-crash-inject×1 / ui-handoff×4 / ui-patch×3 / ui-server×2 / ui-workspace-git-api×1），通过数 3420 → 3437（+17 条新锁）。

| 刀 | 改动 | 单测锁 | 活页验收 |
|---|---|---|---|
| **A1** | `patchLiveStrip` 去掉"曾经有过 tool_call 就永久隐藏"（`app.js`）；顺收窄旧正文兜底——只认"最新一条就是正文" | ui-patch ×2（工具落地后恢复出声 / 旧正文不冒充） | 160 采样：思考窗口 `正在想…` 可见；纯聊天轮 LIVE 早前已证 |
| **A2** | 新增 `deriveActivePhase`（seq 秩序判"当前在跑谁"，返工自然回落；计划门挂起让位）＋直播条分支 | ui-patch ×2（核查/planner） | **22 个采样命中「正在独立核查…（全新上下文复核）」**，同期进度芯片在走 |
| **A3** | 会话头 `.chat-progress`：`第 N 轮 · 已跑 Xm`（30s 自走字、节点断连自清） | ui-patch ×1（显示与结束收起） | 实机 `第 17 轮 · 已跑 26m38s`，结束后正确隐藏 |
| **B1** | `styles.css` split 档补 `flex-direction: row` ＋列间分隔线（column 里 flex-basis 被当高度用的根因） | ui-rail-policy ×1 | 1600 档 `sideBySide=true`（预览 161 + 树 161 = 右列 322），截图 `b-split-1600.png` |
| **B2** | 收起键移出 tab 行（右列直接子节点、绝对定位 z=45）＋点击接线；收起态图标翻转可回 | ui-rail-policy ×1 | Playwright **真点击通过**（未被坞盖住）、收起 40px 键仍在、aria/标签翻转、可回 |
| **B3** | `--rail-expand-inset`（宿主按 -(主区宽-右列宽) 写）→ `preview-dock--expanded` 盖满主区 | ui-rail-policy ×1 | `covered=true`（dock x=313 w=1127 ≈ 主区 312/1128；改前只有 239px） |
| **C1** | 画布工具条 `flex-wrap` + URL 保底 96px + 横滚兜底；坞头同 | ui-rail-policy ×1 | 溢出 76px → **2px**；1100 档截图三排换行、按钮全可见（`ladder-1100.png`） |
| **C2（O1）** | `.ac-title` 改 `flex: 0 1 auto`（ellipsis 不再死代码） | ui-rail-policy ×1 | 静态锁 + 机制明确；长文件名的坞顶条实测脚本在 `ux-verify-B.mjs` 第 4 步 |
| **D** | git 芯片 refresh：在飞去重 + 2s TTL；`createPathInspectCache`（TTL 30s）接进 `inspectRunPaths` | ui-workspace-git ×2 / ui-path-inspect-cache ×3 | 打字 10 次 git 只 +1；重开会话 inspect **+0**（原每渲染 3 条） |

**实施中新发现（已顺手处理或记录）：**
- `ui-app.test.ts` 的「CSS 变量：引用的必须定义过」当场抓到 `--rail-expand-inset` 缺 `:root` 默认——按项目模式补上。
- ~~只读 bash 免问的**新摩擦形态**：模型习惯 `cd <dir> && wc -l f`——`wc` 不在白名单、`cd` 前缀使链式读仍逐张弹卡（本轮真机连出 3 张）。~~ **同日已修**：`wc` 本就在名单里，真凶是 `cd`；名单补 `cd`/`jq`/`test`，`cd` 带专用守卫（无参跳 HOME、`-` 跳 OLDPWD、多参/空串一律弹卡，目标走通用圈禁）。活页复核：`cd "…\\web-a" && wc -l f` 产 `approval_auto` 且该轮零张卡；同轮的 `for … $()` 动态构造照旧弹卡。
- split 档预览列仅 ~141px（`splitRatio 0.5` × 最小右列 282）：工具条按钮单只 134px 都放不下，已用换行+横滚保证"够得着"；真要好看需调 splitRatio 或做列间拖拽（spec 提过"列间可拖"，未实现）。
- 坞在右列里的挂载路径（`railHosted` 分支）**全仓零测试覆盖**（`ui-preview-dock.test.ts` 锁的还是搬列前的骨架）——B1 能溜过去的原因，后续加锁更稳。
- 并排视觉顺序是 **预览 | 树**（树靠窗口缘，与 tabbed 档一致）；与 spec §4.1.1 草图的书写顺序相反，属实现现状，未改。

## 10. 溢出批修复（2026-09-18 深夜，用户勾选「溢出批也修了」）

§5 UX-C2 的 O2–O10 全部落地；**8/8 活页 A/B 验收**（`uxaudit/ux-verify-overflow.mjs`：修复态测一次，注入「修复前」样式覆盖再测一次，期望 B 出现溢出/被裁——窄上下文条目放进 260px 容器，还原右列/审批坞的真实约束）：

| 条 | 改动 | 活页 A/B（scrollWidth/clientWidth） |
|---|---|---|
| O2 | `.usage-col-label` 不裁（overflow:visible）+ 新增 `chartLabelPlan`：按容器宽算标签节奏（全日期≈58px → 日号≈18px → 减枚数），renderPlot 量宽 + ResizeObserver 重画 | 窄视口 7d@260px 列宽 37 → 步长 2（=ceil(58/37)），标签不重叠、无中间裁切 |
| O3 | `.chat-tool > summary > code` 可收缩 + ellipsis（`title` 补全文） | 258/258 vs 模拟修复前 543/258 |
| O4 | `.tool-headline` min-width:0 + ellipsis | head 1114/240 出省略号、摘要未撑破；模拟前撑破 |
| O5 | `.approval-tool-name` `overflow-wrap:anywhere`（选择换行，审批要看清文件名） | 258/258 vs 984/258 |
| O6 | `.chat-sources .md-table-wrap` overflow-x:auto（`.md` 祖先要求够不着它） | aside 未撑破、wrap 横滚 |
| O7 | `.chat-activity code` 可收缩 + ellipsis（peek 那截早有守卫，名字这截没有） | 260/260 vs 495/260 |
| O9 | `.campaign-chip-title` max-width 18rem + ellipsis（chip 加 max-width:100%） | chip 306≤709 出省略号；模拟前 chip=709 |
| O10 | `.settings-model-copy strong` `overflow-wrap:anywhere`（small 早有守卫） | 修复后 copy/row 均未撑破；模拟前均撑破 |

单测 +13（`ui-overflow-guards` ×8 守卫锁 + `ui-usage` ×5 标签计划表）；全量对基线：差异全在既有抖动名单内（ui-server 三条轮转），**零新增失败**。顺带修一处卫生问题：`app.js` 里 `createPathInspectCache` 的键分隔符此前是**裸 NUL 字节**（JSON `NUL` 被解码成实字符写进源码），运行语义相同但会让 grep 把整文件当二进制——已改成 `NUL` 转义。

## 11. 零视觉事件收口（UX-A6，2026-09-18 深夜）

原则：只给**改变语义**的事件一行安静 notice / 一枚 chip；纯内部仪表（model_call_start/end、budget_snapshot、mid_tool_replay）照旧不上屏——把对话铺成事件流是另一种难用。

| 事件 | 形态 | 说明 |
|---|---|---|
| api_retry | notice「端点抖动 · 第 N 次重试」+ 原因/退避 | 带 narrative：收官后仍留 |
| model_fallback | notice「端点降级：A → B」+ 原因/角色 | 同上 |
| hook | notice「被前置钩子拦下：X」/「钩子执行出错」 | **只在 block/error**；allow 静默 |
| segment_resume | notice「瞬时错误，已带上下文续跑」 | 取代原「整段跳过」（旧注释"Cursor/GPT 不会插已接续"被真机表现推翻） |
| approval_auto | 工具组摘要一枚「自动放行」chip；单步时 title 直接亮判词 | 不逐条 notice（读类最频繁） |
| W14 | 删掉与 showRail 前置条件互相矛盾的 showWaiting 死分支 + 陈旧注释/CSS | 保留「空着不占位」的较新裁决 |
| W15 | 过程档提示不再指向已删除的「运行详情」 | |

**一半的修在定局层**：`collapseLiveStatus` 非运行态原本 `return rest`（滤掉全部 notice），`collapseFinishedChat` 也把 notice 一律收起——新 notice 本会"运行时可见、收官即消失"。四类 notice 加 `narrative` 标记穿两层；空转那类**瞬时动作提示**不加，照旧收起。

**顺带修一处潜伏缺口**：正常流程里工具的唯一可达渲染路径是 `renderToolGroup`（分组 pass 把即使单个工具也包成 tools 组），`renderToolRow` 里的「⚠ 经放行」chip 因此**从未显示过**——现在 gate/auto 都以计数挂到组摘要。

验证：单测 +8（`ui-patch`「零视觉事件上屏」，含"收官后叙事仍留、工具过程照旧收起"）；活页——真 run 的 `cat …` 产 `approval_auto` → 组摘要 `✓ head 2 自动放行`（title=判词原文）；死端点宿主（4202，`audit-retry.env`）真造重试 → `端点抖动 · 第 1 次重试 网络错误：无法连接 API 端点 · 1091ms 后重试`，**收官后仍在**。model_fallback / hook / segment_resume 未能在活页自然诱发（单测锁形）。全量对基线**零新增失败**。

## 12. 展开/隐藏批收口（UX-B4，2026-09-18 深夜）

| 条 | 改动 | 验证 |
|---|---|---|
| E6 子代理浮层每帧重建 | 骨架只在换子代理时建一次；聊天区/审批区改 `patchList` 键控（拒签理由、展开态、光标原地活）——与主对话/主坞同一套纪律 | 单测锁节点同一性；**活页未能自然诱发子代理**（planner 两次都没扇出），如实标注 |
| E7 阅读模式段自收 | 思考合并**保留首段 seq**（条目键稳定），三处合并点统一 | 单测（合并前后键相等） |
| E8 进度卡/产物分组自己弹开 | 重建前记住用户收起态、重建后还原（Progress 按卡、产物按组名） | 单测 + 活页：运行中收起「文档」组 → 文件数 2→4 经历重建后**仍收起** |
| E13 四块浮层互不相斥 | 触发器在**模块内部**绑（外部包 `api.open` 拦不到）→ 模块开面板前调 `host.onOpen`，宿主关其余；`api.open` 包装兜程序化路径 | 活页：开着记忆点通知 → 记忆自动关；一次 Esc 只关一层 |
| E14 坞收起留空槽 / 浮出钮打架 / 拖宽失效 | 槽判据 =「没有任何可见坞」（槽里有两个坞实例）；railHosted 下浮出钮让位、「预览」tab 广播 `preview:reveal` 唤回；坞手柄 `pointer-events:none` | 活页：开→槽 `flex`；收起→槽 `none`；点「预览」→唤回 ✓ |
| E15 键盘不可达 | 分组头改**真按钮** + aria-expanded（listbox 身份下移到条目容器——分组头放可聚焦控件会撞 axe critical）；目录名按钮带 aria-expanded；右栏分区标题补折叠三角 | 活页可信按键：focus→Enter 收起→Space 展开；单测 + axe 全绿 |

**过程里的三次自我纠错（都源于项目自己的门禁）**：① 把 `role=button` 直接挂进 listbox → axe `aria-required-children` critical 当场抓红（6 条 a11y 用例），改成身份下移；② `:has(> [hidden])` 的槽判据把一个收起的坞**连坐**藏掉另一个开着的坞（槽里有两个坞实例）→ 改成「没有任何可见坞」；③ 目录按钮的 `aria-expanded` 用了闭包外的 `open`（解析成 `window.open`，属性写成函数字符串），单测抓到后改为 `expanded.has(relative)`。

验证汇总：单测 +12（ui-patch ×5 / ui-rail-policy ×4 / ui-file-tree ×1 + 三处既有结构钉子按新语义收窄）；`uxaudit/ux-verify-b4.mjs` 可信按键复核；全量对基线零新增失败（一条 ui-server 时序用例静置单跑通过）。

