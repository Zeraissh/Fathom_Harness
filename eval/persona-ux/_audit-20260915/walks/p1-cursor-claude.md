# P1 · Cursor 惯用者 + Claude Code 惯用者

- **日期：** 2026-09-15
- **表面：** Web `http://127.0.0.1:4174/` + 桌面 attach + CLI（cwd=`D:\Work\scratch\fathom-ux-20260915\cli`）
- **活 UI：** 是。独占 4174，scratch 圈禁。不复述 2026-09-14 walks。
- **习惯伸手：** Cursor：先找文件树 / `@` 文件 / diff。Claude Code：先看目录、`/`、权限档、`--help`、计划门。

---

## Cursor 惯用者（Web + 桌面）

### 好

| 证据 | 屏幕 / HTTP / 窗框原文 |
|---|---|
| `@` 列的是这个文件夹里的文件，不是旧对话 | 普查 `at-picker`：`hello-seed.txt` / `preview-seed.html`。Code 脸再打 `@hello` 弹出 `hello-code.txt`。欢迎卡原文：「输入 @ 可按文件名找这个文件夹里的文件。旧对话用「引用会话」。」 |
| 写完能看见产物条 | B1 完成后：「产物画布已打开：hello-b1.txt」，预览正文 `ping`。磁盘 `web-a\hello-b1.txt` 存在。 |
| 关掉自动放行后写盘会停，批准卡是人话 | 默认 `自动放行=false`。卡原文：「要新建或改 hello-code.txt，写入「code-ok」」+「允许 / 拒绝」。 |
| 桌面贴的是 4174，窗框不再叫「控制台」 | `npm run desktop` + `AGENT_UI_URL=http://127.0.0.1:4174/` 后 `MainWindowTitle = FATHOM`。关窗后 4174 仍 Listen PID 28600，`/health` 仍 ok。 |

### 不习惯

| 证据 | 我本来以为会…… |
|---|---|
| 发送栏已选 `web-a`，右侧文件树仍写「先选一个工作目录。」（普查 `file-tree-resting`，B1 事后同一句还在） | 打开就是当前工作区的树，和输入栏同一个目录。 |
| 点中 `@hello-code.txt` 后输入框仍是 `@hello`，不是 `@hello-code.txt`（`B11-value`） | 插入完整 `@path`，预览/变更对得上。 |
| 没有行内 diff、没有挑改。发送仍是一次运行 | Tab 还在，改动落在可见 diff 上。 |
| 桌面只是同一张网页外框；开始菜单 / 桌面快捷方式检索 `FATHOM` 命中 0 | 装好就能从图标打开「这个项目」。 |

### 不实用

| 证据 | 为什么伸手失败 |
|---|---|
| 右侧树与预览坞经常各说各话：树空、坞里却已打开 `hello-b1.txt`；Code 写盘过程中坞写「读取失败——文件可能已被移动或删除。」随后又变成 `code-ok` | 第三套文件交互。档案里「没有文件树」已变；活页有树，但和 `@` / 预览不是一套真相。 |
| C 波对还在等批准的 `hello-c1.txt`：标题「产物画布已打开：hello-c1.txt」，磁盘文件 **不存在**，`pendingApprovals=1`。`b-code-card.png` 上「允许 / 拒绝」看得见；无头点击超时不当作用户点不中 | 预览不能预告还没写的文件，更不该先报读取失败。 |
| 今日花费芯片 `今日 $1.98` / `今日 $2.01` 跟全局台账走，不是 scratch 这一圈的账 | 换了独立 history 目录，顶栏仍报别人的钱。 |

收口：日常仍不会把这里当 Cursor 的家。`@` 和人话批准比 9 月 14 日好；文件树和桌面入口还没让编辑器惯用者留下来。

---

## Claude Code 惯用者（CLI 先 + Web）

### 好

| 证据 | 原文 |
|---|---|
| `--help` 当场能看懂怎么开干 | `npm run agent -- --help` 印 `run` / `doctor` / `--yes` / `--verify` / `--plan` / `--resume-run`。`--plan` 写明：非 TTY 须加 `--yes`，否则退出码 2 并印「需要确认，请加 --yes」。 |
| `run --help` 不再被拒 | `cli-runhelp-out.txt` 有子命令帮助。 |
| 非 TTY 不再摔 readline | 无 `--yes` 横幅：`permissionMode: 手动 · 危险动作会先问你，不会自动放行 (approval=ask … yes=false)`，停在 `→ tool write_file`。 |
| `--yes` 横幅跟行为一致 | `(approval=auto … yes=true)`，下一行 `⚠ auto-approved: approve write_file`。磁盘 `cli\hello-yes-banner.txt`。 |
| `--resume-run` 对已完成 id 停而不考古 | 「不能续跑 cli-1789479284955：终态 completed 没有可热续的检查点 / 原任务：write hello-yes-banner.txt … / 终态：completed / 读不到热续检查点会停，不会当新任务重开。」 |
| Web 权限档默认先问；停止人脸话 | 运行设置：「手动 · 危险动作会先问你」。B4 侧栏「已停止：…」正文「已停止 · 这次运行由你主动停止；已完成的工具调用与写入不会回滚。」 |

### 不习惯

| 证据 | 我本来以为会…… |
|---|---|
| 输入框打 `/`：补全不出现，命令面板也不自动打开（普查 `slash-picker`：`pickerVisible=false`，`palette=false`，输入只是 `/`） | 斜杠命令：`/plan`、权限切换。 |
| `#` `$` 同样空响 | 符号体系要么补全，要么别吃键。 |
| `--plan` 非 TTY 会先跑 planner 印出 `═══ 计划 ═══` 和 `s1  列出两个文件并停止`。本轮没有在 TTY 里改一行标题再按 y（非 TTY 无交互） | 计划门是「改一行再签字」，不是先拆完再在日志里找表。 |
| Web 勾了「计划」后模型先 `ask_user` 三个口径题，计划卡没钉住（`B5-B8-ask-on-plan`：`planPinned=false`） | 先出可改的短表，再问细节。 |

### 不实用

| 证据 | 为什么 |
|---|---|
| 帮助写「命令行暂不能 --model / --api-key / --workdir」。换模型仍只能改环境变量 | 冷启动能换模型，cwd 就是工作目录——后半句对，前半句仍要离开 CLI。 |
| 横幅仍先甩 `compat mode` / `execution: report-only` / `飞书/微信宿主未开` | 第一屏应是权限档 + 当前目录，不是兼容层诊断。 |
| 勾了计划后对话页是三道提问，不是可改短表（`planPinned=false`）。指挥中心在提问时的空态**没有**本轮原文 | 计划门应先于提问卡。 |

收口：CLI 的确认门、`--yes` 诚实横幅、续跑停而不考古，这三项比档案好。没有斜杠 REPL，计划在 Web 上容易被提问卡顶掉。
