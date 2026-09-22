# 主流 Agent 对话 UI 调研报告（2026-09-19）

**目的：** 委托方要求"把主流 agent 中对话会遇到的所有 UI 状况调研清楚"，据此决定本应用怎么排布。
本报告是**决策文档**，不是资料汇编——每条按「业界怎么做 → 我们现状如何 → 结论」三段写。

**方法与可信度（先读）：**

| 项 | 事实 |
|---|---|
| 调研范围 | 四路并行：① Anthropic 系（Claude Code / Cowork / claude.ai）② IDE 侧（Cursor / Devin Desktop / Copilot / Cline / Roo / Zed）③ 通用对话（ChatGPT / Gemini / Perplexity / Kimi·豆包·通义·DeepSeek / Notion / Linear） ④ 横切设计模式 |
| 取证手段 | 官方文档直取（Mintlify 系加 `.md` 拿纯文本）、官方 changelog、**产品源码/二进制字符串抽取**（Zed、Claude Code）、官方截图下载后肉眼核对 |
| 纪律 | **只写查到的**；查不到的逐条列「未查到」（§6）。所有 UI 文案为**原样引用** |
| 时效警示 | 本调研日期 **2026-09-19**。产品迭代极快，其中三条**推翻常识**的变更见下 |

### 三条必须先知道的口径纠正

1. **ChatGPT Canvas 已于 2026-05-28 退役**，ChatGPT agent 同月退役，GPTs 正在退役。其能力被拆成 writing blocks（长文）+ code blocks（代码/图表，可**分屏**）+ Work 产物（doc/xlsx/pptx）。
2. **Windsurf 已改名 Devin Desktop**，**Cascade 于 2026-09-08 移除**，默认本地 agent 是 Devin Local。凡引用"Cascade"的资料都已过时。
3. **Gemini 全面改版 "Neural Expressive"**（Canvas 收进输入框 "+" 菜单）；**Perplexity Spaces 改名 Projects**。

---

## 1. 已经收敛的十条行业共识（可直接采纳）

这十条是**多产品独立收敛到的同一个答案**，不是某家的偏好。

### 1.1 产物分层：默认内嵌，侧栏/全屏是"升格"动作 ★回答委托方的问题

**业界：** Claude 把两种介质的分工写死在文档里——custom visuals「**help you think in the moment**」（内嵌、可全屏、**默认 ephemeral**，官方原话定位成 *whiteboard sketch*），artifacts「**persistent and shareable from the start**」（侧栏、可版本、可分享）。ChatGPT 的后 Canvas 形态是同构的：短内容内嵌 → 长文 writing block（可升格全屏编辑器）→ 代码 code block（可升格分屏）→ 成品文件落 Library/侧栏。

**关键**：Claude 给 custom visual 三个**晋级手势**——`Copy as image` / `Download(.svg/.html)` / **`Save as artifact`**。原文对比：*"artifacts are persistent and shareable from the start, while custom visuals help you think in the moment and only stick around if you choose to keep them."*

**Artifact 判定清单（官方，可直接用）**：同时满足——
① significant and self-contained，**typically over 15 lines**；
② 你很可能想编辑、迭代、在对话外复用；
③ 不需要额外对话上下文就能独立成立；
④ 你很可能回头再看。

**我们现状：** **只有一级**。产物一律进右列（`#right-rail-preview`），而它在 split 档里还是 `display:none`。对话里没有任何内嵌产物形态。

**结论：** ~~Canvas 还是 HTML 二选一~~ 是错的问法。正解是**同一个东西两个状态 + 一个升格手势**：
- 图表 / 小 HTML / SVG → **默认内嵌**在对话流里（Claude 的 custom visual 位）
- 只有满足上面四条判定的，才给「**保存为产物 / 在右栏打开**」的升格入口
- 内嵌态必须带**三个留存出口**，否则用户以为它随时会消失

### 1.2 权限卡是「信息卡」，不是 Yes/No 对话框

**业界：** Codex CLI 的官方示意方框最完整：

```
[ a] Accept once
[ s] Accept for session
[ p] Accept and add to policy
[ d] Decline
[ c] Cancel turn
```
外加 **Working directory / Reason / Suggested rule**（例：`Suggested rule: ["npm","install"]`）。

**一条最狠的纪律（Claude Code）**：**「记住」的持久化范围按动作类型写死**——Bash 命令=按仓库+命令**永久**（写 `.claude/settings.local.json`）、文件修改=**仅本会话**、WebFetch=按域名**永久**；而且**当选项标签无法完整展示规则范围时，干脆不提供该选项**（只给一次性批准）。
理由：*展示不下的授权就是用户看不懂的授权。*

**我们现状：** 三种键（允许/拒绝/拒绝并说明），`maxScope: "once"` 写死。**没有"同类允许"**——所以我们量到「看图 14–25 次/运行」这种摩擦。

**结论：** 加第 4、5 档（`允许本会话同类` / `总会允许此类`），**并把持久化范围写进按钮文案**（`允许并记住（本会话内所有看图）`）。说不清范围就不给这个选项。

### 1.3 审批降噪的优先级：沙箱 > 分类器 > 白名单

**业界数据**（这条值得单独记）：Windows UAC 实测 **89% 的提权提示被直接点掉，只有 13% 的人能解释弹窗原因**；一次打断平均 **10–15 分钟**才能回到心流；**即使 95% 自动批准率，300 次工具调用的会话仍会冒出 15 次打断**。

四条被验证的路径（按效果排序）：
1. **用沙箱把提示换成边界**（沙箱内不问，越界即时通知）
2. **自动模式 + 分类器**，配两个保险：**连续 3 次 / 累计 20 次阻塞就自动降级回逐个询问**；被拒动作进「Recently denied」列表**可带手动批准重试**
3. **规则化预批准**（正则白名单）
4. **自动批准必须留回执**（VS Code 弹通知并链接到"是哪个设置放行的"）

**我们现状：** 只读 bash 已免问（对的方向），但**没有"被拒可重试"列表**，也没有**自动降级**。

**结论：** 补「Recently denied 可重试」+「连续阻塞自动降级」。这两条成本低、直接对着我们的摩擦数字。

### 1.4 "跑到一半想改口"要三种语义，不是一个 Stop ★

**业界在收敛：**
- VS Code：**`Stop and Send` / `Add to Queue (Alt+Enter)` / `Steer with Message (Enter)`**
- Cursor：Enter 排队（可拖拽排序）/ `Cmd+Enter` 立即 / Send now 或连按两次 Enter 在**下一个 tool call 处插入**而不截断当前工作
- Zed：排队卡片 + 每条消息独立的 **`Steer` 开关**

**我们现状：** 只有「停止」+「直接发送会立即插入」一句模糊文案（一轮 UX-A4，至今未修）。

**结论：** 把底栏那句话换成**三选一**，并把"插在哪"说清（下一个工具调用之后）。

### 1.5 过程默认折叠，但折叠标题要"人话 + 数字 + 时长"

**业界：** `Called slack 3 times`（Claude Code 把重复 MCP 调用折成一行计数）／`Completed 3 steps in 34s` ／ `✓ Read layout.tsx, lines 30 to 90` ／ `Searched text for Green Thumb, 6 results`。
折叠策略本身是**设置项**（VS Code `collapsedTools` = off / withThinking / always）。
**完成后轨迹不消失**——这是被模式库明确列为反模式的一条（"响应完成后轨迹消失"）。

**我们现状：** 工具行可折叠 ✓、`经放行` chip ✓；但**没有计数折叠**，重复调用会铺开。

**结论：** 给重复同工具调用做计数折叠。

### 1.6 "进行中/受限"必须一行三段式：为什么停 / 何时继续 / 怎么取消 ★★

**业界最值得照抄的一行（Claude Code 官方逐字）：**

> `Usage limit reached · continuing automatically at 3:45pm · esc to cancel`

以及 20 秒无数据时的：`Waiting for API response · will retry in … · check your network`。

**另一条来自 Kimi 的"防误杀"文案**：明写「**界面未及时刷新不代表任务中断——刷新页面、勿点『停止输出』**」，并承诺**误判中断会照扣额度、失败可申诉退额**。它把"用户手贱点了停止"当成产品问题在解。

**我们现状：** 一轮修过直播条与轮数耗时 ✓；但**"看起来卡住了"时没有三段式文案**——而这正是委托方那条 run 卡住时的体验。

**结论：** 任何"看起来卡住了"的状态，都必须同时回答那三个问题。

### 1.7 上下文用量要可视化到"钱"这一层

**业界：** Copilot 输入框旁的**百分比圆标** → popover：`Session Cost 12.4 credits` ／ `26.1K / 1M tokens 3%` ／ **按类别拆分**（System Instructions / Tool Definitions / Messages / Tool Results）／ **`Reserved for response` 斜纹段** ／ 底部一个 **`Compact Conversation`** 按钮。
Cursor 的 context ring 拆分更细（System prompt / Tools / Rules / Skills / MCP / Subagents / Summarized conversation / Conversation）。
Zed 快满时出 banner，出口写成 **`Start New Thread` / `New From Summary`**。

**我们现状：** 有上下文环 ✓，有花费双口径 ✓。**缺"按什么在吃"的拆分**。

### 1.8 换模型必须说清代价，包括"能力变了吗" ★★★

**这条是全行业**都做得不好**、而我们刚补上一半的地方。**

Claude Code 的做法最完整（官方文档逐条）：
- `TaskCreate/TodoWrite` **只在部分模型可用**，其余模型不提供（**文档写明 + 给逃生门** `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`）
- 功能按模型 ID 正则匹配启用；**Provider-specific ID 常匹配不上，"leaving supported features disabled"**，除非声明 `_SUPPORTED_CAPABILITIES='effort,xhigh_effort,thinking,...'`
- **切换本身有代价**：模型切换 = 提示缓存全部失效，`/model` 在缓存仍热时**先要求确认**

**行业级反例**：GPT-5 上线时 OpenAI **一次性退役 8 个消费端模型、无过渡期**，历史会话被自动切到等价模型；随后官方认错承诺 "**we will give plenty of notice**"。

**我们现状：** 今天刚补了「能力条 + 模型选择器标看不见图」——**这一条我们反而走在前面**。仍缺：切换前的**缓存失效/计费**提示。

**结论：** 把"模型能力矩阵"做成**数据而不是散落的 if**，选择器与服务端各门控一次；**不支持的控件直接不渲染**（而不是渲染了再报错）。

### 1.9 Tab 补全下一句 ★（我们今天刚做完）

**唯一有官方同类功能的是 Claude Code**（官方原文）：
> 空会话显示灰色示例命令（**取自本项目 git 历史**）；每轮回复后基于对话生成下一条 prompt 建议；
> "**Press `Tab` or `Right arrow` to place the suggestion in the prompt input, then `Enter` to submit. Start typing to dismiss it.**"

且明确写了**什么时候跳过**：prompt cache 冷、部分会话的第一轮之后、**上一次回复以错误结束**、plan mode 中、接近用量上限。成本靠**复用对话的 prompt cache**压到极低。

**ChatGPT 与 VS Code Chat 均无同类功能**——这是相对空白的竞品位。

**我们现状：** 今天做完 B（幽灵问句 + Tab 采纳 + 打字即消失）。**差两处**：① 只认 Tab，不认 `→`；② 没有"什么时候跳过"的规则集。

### 1.10 附件超限文案 = 说人话 + 去哪看用量 + 怎么绕

**业界原文**：`Uploaded file is too large`（Claude）、`upload limit reached` 并指路 Settings & Storage（ChatGPT）。

---

## 2. 反模式清单（业界明确认为不好的）

1. **默认展开全部过程细节**，答案被埋在过程里；步骤没时间戳/时长；标签泛化（"Processing"）；**响应完成后轨迹消失**
2. **无差别"每次操作都要批准"**（UAC 89% 盲批；300 次调用剩 15 次打断）
3. **静默换模型 / 静默退役模型**（GPT-4o 事件）
4. **自动批准不留回执**
5. **把"模型拒绝"当"系统错误"渲染或重试**（refusal 是独立结果类型；Devin 专门改成 warning）
6. **"Undo all" 直接写盘回滚工作区**（Cursor 论坛投诉）
7. **白名单式自动批准的过度自信**（VS Code 自己写明 quote concatenation / shell aliases 可绕过；Cursor 明说 "not a security boundary"）
8. **空态泛泛且不可关**（全用户同一套、展示做不到的能力）
9. **只靠颜色或动画表达状态**
10. **补全列表吞掉 Enter**（Claude Code 特意保证 fullscreen 下 Enter 仍发送）

---

## 3. Work 脸 / Code 脸的差异（回答委托方第 1 问）

**业界没有"一张应用两个脸"的先例**——IDE 侧与对话侧是**两个产品**。相关的是：

| 观察 | 出处 |
|---|---|
| Claude 桌面 app 把"编程"与"Cowork（非编程）"做成**两个入口**，共用会话模型但**呈现不同** | 官方 |
| Copilot VS Code 有 **Chat view** 与 **Agents window** 两套：前者贴合编辑器、后者是 agent-first 独立窗口 | 官方 |
| Cursor 有编辑器内的 **Agent 面板** 与 **Agents Window**（agent-first 独立窗口） | 官方 |
| Copilot Agents window 的 **Changes 面板**：`All Changes ∨  3 files +1069 -0` + **Mark as Reviewed** + 文件行状态字母 A/M/D/U + `Commit / Merge / Checkout / Discard` | 官方截图 |

**结论：** 两脸不该只是"换个默认宽度"，而应在**三处**分化：
1. **中栏内容形态**：Work = 文档/对话；Code = diff 与文件为主
2. **右列内容**：Work = 产物预览/进度；Code = **仓库状态 + diff + PR**
3. **GitHub 的出现面**：Code 脸恒有（分支/commit/PR/diff），**Work 脸不出现**（委托方点名）

---

## 4. Code 脸与 GitHub 的配合（回答委托方第 3 问）

这一格业界做得很厚，可直接抄的：

| 动作 | 业界形态 | 出处 |
|---|---|---|
| **生成 commit message** | Source Control 输入框旁**闪光图标**，用**便宜的小模型**（不占会话模型）；Zed 提交后下方出一条 bar 带 **`Uncommit`** | Copilot / Zed 官方 |
| **建 PR** | 从会话一键，**一个表单**里改标题/描述、选 draft、配 merge 选项；PR 标题旁也能生成 | Copilot 1.138 官方 |
| **PR 状态** | 页脚可点 `PR #446`，**颜色下划线**表评审状态（绿 approved / 黄 pending / 红 changes requested / 灰 draft），合并后消失 | Claude Code 官方 |
| **diff 审阅** | hunk 级 **`Reject` / `Keep`** + `Next/Previous Hunk` + 工具条 `Reject All`/`Keep All`；拒绝后弹 **`Agent Changes Rejected` + `Undo`** | Zed 官方源码实测 |
| **Mark as Reviewed** | 跟踪审阅进度，**文件被再次改动时标记自动清除** | Copilot 官方 |
| **冲突** | `Resolve Merge Conflict with AI` 一个按钮进 agent 流程 | Copilot 官方 |
| **署名规则** | bot 提的意见署 bot；**你在 review 里写的评论署你本人**；GitHub 上点 Apply suggestion 的 commit 署**点击者** | Devin 官方 |

**我们现状：** 只有输入框里一个 git 芯片 + 一个还没长成的 PR 面板。**基本是空的。**

---

## 5. 逐题：我们现状 vs 业界（速查表）

| 题 | 业界收敛的答案 | 我们现状 | 差距 |
|---|---|---|---|
| **图片附件** | 三通道入口（+ / 拖拽带 drop indicator / 粘贴）；粘贴插入**编号 chip 可位置引用**（`[Image #N]`） | 有上传按钮 | 缺拖拽反馈、缺编号 chip |
| **生成图** | 内嵌 + 点开编辑器 + **统一图库** | — | 缺 |
| **非图附件** | chip / 卡片 + 类型图标 + `×` | — | 缺 |
| **大目录** | 按类型降噪折叠 + Expand/Collapse All + **状态跨会话记忆** | 树把 `_probe…` 全截断 | 差 |
| **图表内嵌** | 内嵌 + 可切交互/静态图 + 可升格 | 无 | 缺 |
| **HTML 产物** | **沙箱内嵌 + 版本选择器 + 错误旁一键修复 + 分享三档** | 只有右列一个 `display:none` 的预览 | 差 |
| **代码 diff** | 三态（inline / side-by-side / **automatic 按宽度切**）+ 偏好记忆 | 有右列预览 | 缺审阅动作 |
| **工具调用** | 默认折叠 + **计数分组** + 时间戳 + 完成后不消失 | 可折叠 ✓ | 缺计数分组 |
| **思考** | 全部折叠 + 时长（`Thought for 5s`）+ 完成态 | ✓ | — |
| **审批** | 5 档梯度 + 工作目录 + 原因 + 建议规则 | 3 档 | 缺同类允许 |
| **危险操作** | protected paths 硬拦截 + 「没有模式能自动批准」清单 | 有 irreversible | 部分 |
| **会话导航** | `/resume` 选择器 + **`{`/`}` 按 prompt 跳** + 搜索 | 侧栏列表 | 缺跳转与搜索 |
| **回滚** | **列 prompt 而非列文件** → 6 个正交动作 → **prompt 回填输入框** | 无 | 缺 |
| **模型切换** | 行内标注能力与成本；**不支持的控件不渲染** | **刚补上能力条** ★ | 缺成本/缓存提示 |
| **上下文** | 百分比 + **按类别拆分** + `Reserved for response` + 一键压缩 | 有环 | 缺拆分 |
| **@ / 斜杠** | `@` 管资源、`/` 管动作；**补全列表不许吞 Enter** | 有 `@` | 缺 `/` |
| **换行/发送/停止** | 三语义（Send / Queue / Steer） | 只有停止 | 差 |
| **状态色板** | 6 态 + 图标形状另表进程存活 | 部分 | 缺统一色板 |
| **空态** | 3–4 个可扫读 chip，**首条消息后消失**，**必须保留输入框** | 有起步卡 | ✓ |

---

## 6. 明确「未查到」清单（不要当成已求证）

- **Cursor**：消息内图片缩略图/lightbox；工具调用折叠形态；多文件改动 `N files changed` 文案；Mermaid/表格渲染；空态与错误重试文案
- **Windsurf/Devin Desktop**：上下文/token 占用显示；会话内错误态文案
- **Copilot**：普通终端命令审批卡的**确切按钮字**（只验证到沙箱外那张）；chat 里**表格**渲染规则
- **chat.deepseek.com / 通义 / 豆包**：思考过程 UI、错误态文案、分享/置顶/搜索（SPA 不可达，本机网络限制）
- **claude.ai**：上传图在气泡里的视觉形态（缩略图尺寸、是否可点开）；markdown 表格 / Mermaid / LaTeX 渲染策略（官方文档完全未提）
- **Gemini**：@ 提及；会话置顶/分支；文件类型清单
- **Perplexity**：置顶/会话搜索 UI；失败态

---

## 7. 对 5 套方案的输入：三条被调研钉死的约束

1. **对话宽度必须回到 60–73%**（业界共识区间；我们现状 43%）。≥1880px 时正文应有**行宽上限**（中文 25–40 字/行）。
2. **右列不能是"要么全有要么全无"**——它应该是**内容驱动**的（已有 `railVisibility`），并且**内嵌优先于侧栏**。
3. **Code 脸的 GitHub 必须常驻可见**（分支/改动/PR 状态），**Work 脸完全不出现**。
