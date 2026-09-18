# 二轮走查报告（2026-09-18 夜场 · feat/ui-center-contract）

**目的：** 委托方续前轮（`_audit-20260918/UX-AUDIT.md` 的三主线）后出的新委托：
「作为多维度用户使用这个软件……特别是 UI 和 harness 层面」；随后追加纲领——
**「不只是右列：全 UI/UX/harness；能图形化解释的绝不用文字生硬描述」**。
本报告是本轮全部发现的台账 + 八刀落地记录 + 边界与遗留。

**纪律（沿用前轮）：** 证据只认活页屏幕 / DOM 几何 / 落盘档案 / 亲手复跑；
跨端复验（同一事实在 UI、meta、CLI 三处对齐才算数）；**未复现的不进确证**，撤销的怀疑单列。

## 0. 方法与仪器

| 项 | 事实 |
|---|---|
| 宿主 | `personas-audit` 隔离实例 :4203（`.claude/launch.json` + `D:\Work\scratch\fathom-personas-20260918\personas.env`：独立 workdir/history/memory）。全程未碰用户 4173 |
| 角色 | 小白首开（引导→首任务→停止→历史）、外部 CLI agent（Cursor/Claude 类，子代理取证）、浅色主题、空目录、窄档 390、编排/单执行者 |
| 工具 | Browser pane（活页 + DOM 几何 + `el.click()` 真事件）、spawn 真进程（CLI 锁）、Playwright 存盘截图（`capture.mjs`）、宿主落盘档案（history/*.jsonl） |
| 仪器坑（复发，记档） | ①Pane 尺寸变化后 `preview_click` 坐标偏移、事件零到达（两次踩到）——交互一律页内 `el.click()` 或 Playwright；②模拟视口（resize 放大）下 screenshot 变缩略不可读、click 不触发默认动作；③Playwright 全新 profile 弹「初次使用」引导挡点击——`addInitScript` 预置 onboardingDone |

## 1. 发现台账与落地

八刀全部提交（均在 `feat/ui-center-contract`，未 push）。每条：症状 → 根因 → 落点。

### UI 线

| 序 | 症状 | 根因 | 落地 |
|---|---|---|---|
| U1 | 运行列表把「已停止」画成绿色「已完成」（详情页/元数据都说已停止） | `app.js` 列表标签二值映射（running/其余），rich 分档函数只服务详情页 | `runItemStateFace` 走 `classifyStopReason` + warn/bad 色调 + title；老档案缺 stopReason 回落已完成。**`3ef01bc`** |
| U2 | 「独立核查」设置页说默认关、新对话实际开（首跑 meta.verify=true） | 两套事实源：启动先按设置默认，随后「默认 office→应用记忆 Code 脸」迁移用硬编码 `codeVerifyPref=true` 盖回 | 初值=设置默认 + 设置实时同步时记忆跟走。**`1095447`** |
| U3 | 窄档浮层盖内容（写盘自动开画布拦腰截断直播；40px 细条占位把中轴推偏 20px） | 右列无内容判据、自动打开在窄档也全开 | **已被右列内容驱动刀顺带修掉**（见下），本轮 390 活页坐实：待放行期间右列 0 宽、无遮罩、画布不上屏 |
| U4 | 审批卡命令原文写两遍（header+summary 同句） | 同一 `human` 串双 setText | 删 summary 元素×2 + setText + 死 CSS；活页出现次数 2→1。**`3cecac1`** |
| U5 | 审批悬停时工具行标「⚠ 经放行」（小白以为已批准） | `gated` 只记"曾等待"，无 pending 态 | 派生层按 `state.pendingApprovals` 加 `awaitingApproval`，行/组 chip 分现在时/完成时；差分键同步（否则决定后不重绘）。**`3cecac1`** |
| U6 | 会话内 workdir 禁用键无解释 | 解释写得对，但 `workdir-picker.js` 四处 title 写入点用裸路径冲掉 | 禁用时 title 归宿主，四处加守卫。**`3cecac1`** |

### 右列内容驱动（委托方拍板两条：欢迎页一律不显示 / 窄档角标→全宽 sheet）

- 设计案：本目录 `rail-redesign.html`（可视化：现状四连拍 → 主流对照 → 三规则 → 待拍板）。
  **流程定论**：此类界面重设计先出可视化设计案拍板、再 TDD 落地，比文字方案快且少返工。
- 落地 `d56f4cd`：欢迎页收起（40px 细条也收成 0——它就是中轴偏 20px 的根因）；对话按内容开；
  手动收起粘住（新内容只发角标）；窄档永不自动展开，点开=全宽 sheet+遮罩+Esc/点外/收起键三路关；
  **修断头路**（窄档收起曾 0 宽消失无入口→ 30px 右缘把手）；`railVisibility` 纯函数五规则。
- 密度收拢 `5341917`：主轴合一（hero/chips/form/cards 同 cx=803）+ 节奏 51/10→27/22px。
- 去说明书 `85d30ac`：红框四行文案与「下一步」chip 排全撤（两脸一致）；「未入项（按目录）」→「创建项目」。

### Harness / CLI 线

| 序 | 症状 | 落地 |
|---|---|---|
| H1 | 错误终态退出码 0（CI 把"端点挂了"当成功） | 只有 completed=0；其余=1（核查未通过也=1）；plan_rejected 不表态防盖 2；--help 增表。**`3ef01bc`** |
| H2 | 无 --json/--quiet；ANSI 原样落盘；机器可读资产隐身 | `--json`（stdout 纯 JSONL：事件流+run_result；人话改道 stderr，一处收口）/`--quiet`（stdout 只留终局）/颜色决策（管道自动关、NO_COLOR、FORCE_COLOR）；--help 写入档案路径。**`959b27a`** |
| H3 | error 与 aborted 同写 closed/aborted；max_turns 等冒充 completed；--verify 路径从不收尾 durable | `cliRunEndForStopReason` 逐值口径表 + `markEnded`（error 相位保持 interrupted——CLI 热续只认它，与 Web 的 failed 差异有意为之）；--verify 收尾补齐。**`3ef01bc`** |
| H4/H5 | SIGINT 在 Windows 自动化不可达且无提示；无 bin、跨目录调用摩擦 | **未落**（H4 提示语 + H5 帮助示例，仍是队列小项） |
| H6 | MCP 先于参数校验启动的噪音 | 未落（低） |
| H7 | 「REPORT-ONLY / UNISOLATED」注入让模型以为 shell 只读（真机犹豫三轮） | 描述改 "commands run directly on the host; no sandbox (real side effects)"；bash 工具描述补回执释义；状态机原值不动。**`9874908`** |
| H8 | 无包时核查只能静态推导，「未能亲自运行」只躺在细则里 | `verifierCanExecute(白名单)` + CLI 注行 + server 带 `staticOnly`（单执行者路径）+ 裁决卡徽标「（静态推导）」。**`9874908`** |

## 2. 边界与遗留（如实记）

- **H8 只覆盖单执行者路径**：编排 run 的子任务裁决根本不发 verification 事件（其 onVerification 只记账），
  对话裁决卡不出现——要覆盖需先决定"给编排补发 verification 事件"（更大的行为变更）。
- **僵尸档案清理未做**：硬杀留下的 `phase:executing` 需要 liveness 标记（pid/heartbeat）设计；
  朴素启动扫描会误关并行 CLI 的活档案。
- **图形化纲领（委托方追加）尚未铺开**：右列是其第一例（设计案里已列）；下一批候选——
  消耗图表、Progress 可视化、「agent 产物默认给图而不是长段落」。
- 队列小项：H4/H5/H6、运行列表「已完成」筛选器口径（只修了标签）、从对话返回新建对话时核查开关不复位（remember-last，产品取舍待定）。

## 3. 撤销的怀疑（防造假，沿用前轮纪律）

| 怀疑 | 裁决 |
|---|---|
| 窄档控件重叠（workdir 按钮被"+"覆盖） | 收起态隐藏字段的测量残影，展开态正常——撤销 |
| workdir 菜单帮助文案被遮 | 几何零重叠，动画中途截屏误判——撤销 |
| Work/Code 页签无差别 | 底部模板卡不同，被浮层遮住误判——撤销 |
| 「本机今日 $5.75」新实例不归零 | 台账按设计本机全局——非缺陷 |
| U6「无解释」的原判 | 解释存在、被 picker 冲掉——根因修正（本条教育：症状位置 ≠ 病灶位置） |
| 终态「经放行」pending 语义 | 首轮把截图字形读成"待放行"、DOM 实为"经放行"——以 DOM 为准 |

## 4. 做对了的（防误伤清单）

引导 4 步与「再看一遍引导」；审批三键+拒绝理由；停止不回滚文案；核查裁决卡（含三值降级）；
Progress 清单；花费双口径+消耗页；浅色主题对比度全 AA+；控制台全程零错误；
CLI 错误路径 fail-fast/exit 2、help 质量、resume 三种拒绝语义；`--json` 一键可编程。

## 5. 复跑方式

```bash
# 1) 起隔离宿主（launch.json 的 personas-audit，:4203）
# 2) 截图归档
node eval/persona-ux/_audit-20260918b/capture.mjs
```
截图：`shots/w1-welcome-wide.png`（欢迎页零右列+边缘把手）、`w2/w3`（窄档把手→全宽 sheet）、
`v1-verdict-static-derived.png`（「核查通过（静态推导）」）、`a1-approval-single-line.png`（命令只一遍）、
`l1-run-list-stopped.png`（列表「已停止」）。
