# 对话「下一步」芯片（真能做的才露出）

日期：2026-09-16  
范围：`ui/public/app.js`、`ui/public/index.html`、`ui/public/styles.css`、`test/ui-patch.test.ts`。  
未改飞书签名 / `src/notify.ts` 入站实现。未改 walks。未 commit。

## 做成了什么

空态和刚结束的对话末尾露出 3–6 条短句芯片。点了要么写入输入框，要么触发已经存在的动作。未武装的能力不出现——没有假按钮。

设计目录（「更多稿件」六页签）不画这条，避免和样例卡抢。运行中藏起来，那时该看的是审批卡。

## 露出哪些建议

| id | 人话 | 点了做什么 | 何时出现 |
|---|---|---|---|
| `plan` | 先对齐做法 | 勾上「计划」并写入输入框 | 空态总有；刚结束且本轮没用过计划才有 |
| `mention` | 点名一个文件 | 输入框加 `@`，打开已有文件点名 | 选了工作目录 |
| `files` | 看右边的文件 | 展开右侧文件栏 | 选了工作目录 |
| `vision` | 看一张图 | 写入「看这张图…」（有图则 `@路径`） | `/api/harness` 识图已武装 |
| `pr` | 开成 PR | 点已有的 Git 条「开 PR」 | `GET /api/workspace/git/pr` 的 `ready === true` |
| `feishu` | 到飞书群里 @ 我 | 只播报「入站已开」。不发消息 | `/api/im` 的 `feishuInbound === true` |
| `schedule` | 设个定时 | 打开已有定时任务页 | 空态常有；刚结束有空位才挤进来 |
| `focus` / `continue` | 先说要做什么 / 接着说 / 接着改已有页面 | 聚焦输入框；未签字时写入「接着改已有页面。」 | `focus` 补到至少 3 条；`continue` 要 `canContinue` |
| `preview` | 预览刚才那页 | 打开已有预览坞 / 产物画布 | 刚结束且本场有可预览文件 |
| `review` | 点评这一页 | 打开预览并点已有「点评」 | 刚结束且有 HTML / Word / 幻灯 |

空态优先：计划 → 点名文件 → 右侧文件 → 看图 → 开 PR → 飞书 → 定时；不够 3 条再补「先说要做什么」。

刚结束优先：接着说 → 预览 → 点评 → 看图 → 计划（本轮没用过）→ 开 PR → 点名 / 文件 / 定时 / 飞书。最多 6 条。

文案是人话。不出现 `/api/`、HTTP、`describe_image`、`view_image`、领域包名。

## 怎么判断可不可用

`nextActionCapabilities` 只认现成快照，不猜。没拉到快照 = 未武装 = 不画。

| 能力 | 判据 | 不是 |
|---|---|---|
| 识图 | `harnessVisionConfigured(harness) === true`：`describeImageBacking` 为 `executor` / `vision-role`，或 `roleModels.vision.configured`。`none` 一票否决 | 出站 webhook、装配条文案、用户口头说「能看图」 |
| 飞书 | `im.feishuInbound === true`（`GET /api/im`）。控制器里 `imSnapshot` 只投影这一位 | 出站通知、`notify` webhook、签名实现 |
| 开 PR | `githubPr.ready === true`（工作区 Git 条已有的 `refreshPrReady`） | 本地有 git、有远程、有令牌但 `ready` 为假 |
| 工作目录 | `composerWorkdir()` / 本 run 的 workdir 非空 | 口头说「这个文件夹」 |
| 续跑 | 宿主 `info.canContinue === true` | 只要 `status=done` |
| 预览 / 点评 | 本场产物路径对得上已有预览 / 点评入口（html/md/图/办公稿；点评还要 html/docx/pptx） | 扫整个 workdir |
| 计划已用过 | `runConfig.mode === "plan"` 或计划节点已在 | 空态勾过计划旋钮（空态仍给「先对齐做法」） |

`loadHarness` 拉完 `/api/harness` 后顺带刷新 `/api/im` 和 PR 就绪。欢迎面还开着就重画空态。没把飞书塞进 `/api/harness`（测试宿主会继承环境变量，那是假武装）。

点芯片走 `applyNextActionChip`：只调用已有入口（计划旋钮、`@` 点名、文件树展开、`#/schedules`、Git 条 trigger、`openArtifactByPath` / 预览坞、`#ac-inspect`、`announceStatus`）。飞书芯片**不发消息**。PR 芯片在 trigger 不可用时只说实话，不假装开成了。

## 测了哪些

```
npx vitest run test/ui-patch.test.ts
```

锁：

- 空态（有工作目录）≥3 条可点按钮，含计划 / 点名 / 文件 / 定时；文案不含 HTTP / 工具黑话
- 设计目录打开时不画芯片
- 识图 `none` → 无「看一张图」；`executor` → 有，fill 不含工具名
- `feishuInbound: false` → 无飞书；`true` → 有，且只 announce
- `githubPr.ready !== true` → 无开 PR；`true` → action=pr
- 刚结束：`canContinue` 才有接着说；没有产物就不说预览 / 点评
- 没有工作目录就不说点名 / 右侧文件
- 详情页 done 露出芯片（无识图 / 飞书 / PR）；running 隐藏且清空
- `readNextActionChip` 能从 DOM 读回 fill / plan / action
