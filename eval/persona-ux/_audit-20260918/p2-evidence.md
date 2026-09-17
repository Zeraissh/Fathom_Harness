# P2 活页证据（2026-09-18）

评的是 **`feat/ui-center-contract` 分支的活产品**，对照 `main`。
计划：`docs/superpowers/plans/2026-09-18-p2-workdir-truth.md`；设计：`docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §P2。

证据只认：屏幕原文、逐帧采样、亲手跑的脚本。不把单测绿当「活页已经好了」。

---

## 1. 方法与仪器

| 项 | 本轮事实 |
|---|---|
| 宿主 | `npx tsx ui/serve.ts`，端口 **4199**（隔离，不碰 4173/4174） |
| 工作目录 | `AGENT_UI_WORKDIR=D:/Work/scratch/p2-check`，含 `hello.txt`（内容 `ping`） |
| 独立台账 | `AGENT_RUN_HISTORY_DIR` / `AGENT_MEMORY_DIR` 都指到 `D:/Work/scratch/p2-*` |
| 浏览器 | Playwright `chromium` **无痕上下文**（无 localStorage，所以没有残留目录偏好——正是首次打开的场景） |
| 采样 | `requestAnimationFrame` 逐帧记录 `#workspace-file-tree` 的可见文字，**帧级**，不是轮询，所以「闪过一帧」也抓得到 |
| 脚本 | `eval/persona-ux/_audit-20260918/p2-firstpaint.mjs`（用法：`node p2-firstpaint.mjs <url> <out.json>`） |
| 没做 | 桌面 attach；CLI；任何真实模型 run（都不在 P2 范围，且要花钱） |

判据来自计划 Task 5：

1. 从白屏到出内容，**任何一帧都不出现**「先选一个工作目录。」
2. 出内容后是真实列表，或「正在确认目录…」在数百毫秒内被替换。

---

## 2. 正例：修复后

`p2-firstpaint.json`（第二次跑；第一次得 174ms / 192ms，逐次有几十毫秒抖动）

| 帧 | 时刻 | 树的文字 |
|---|---|---|
| 1 | 127ms | `正在确认目录…` |
| 2 | 148ms | `正在列出文件…` |
| — | 终态 | `文件文件 ⟩hello.txt@` |

```
verdict_flash_noWorkdir: true
saw_noWorkdir_frames: []
saw_confirming_frames: [{ ms: 127, text: "正在确认目录…" }]
first_real_frame:      { ms: 148, text: "正在列出文件…" }
final_tree_text:       "文件文件 ⟩hello.txt@"
```

**判据 1 成立**（`saw_noWorkdir_frames` 为空）；**判据 2 成立**（确认态到真实列表隔 21ms，远在「数百毫秒」内）。

---

## 3. 对照组：修复前确实闪过谎

同一台宿主、同一个脚本、同一个无痕场景，只把 `ui/public/features/file-tree.js` 与 `ui/public/index.html` 用
`git checkout main -- <两个文件>` 退回 `main` 版本，跑完再 `git checkout HEAD -- <两个文件>` 复原（复原后又跑了一次，判据仍成立，见 §2）。

`p2-firstpaint-BEFORE.json`：

```
verdict_flash_noWorkdir: false
saw_noWorkdir_frames: [{ ms: 131, text: "先选一个工作目录。" }]
saw_confirming_frames: []
first_real_frame:      { ms: 147, text: "正在列出文件…" }
```

| | 131ms 那一帧 | 结论 |
|---|---|---|
| 修复前（`main`） | **先选一个工作目录。** | 谎话确实在首屏闪过 |
| 修复后（分支） | 正在确认目录… | 一帧都没闪 |

这是这一刀有用的**直接证据**：同一台机、同一个场景、同一个脚本，只差这两个文件。

---

## 4. 反例：活页上构造不出来（如实记录，不编）

计划 Task 5 Step 3 要求「去掉 `AGENT_UI_WORKDIR` 且本机 `availableWorkdirs` 为空时」应显示「先选一个工作目录。」。

**构造失败**，原因是宿主的兜底：

- 不设 `AGENT_UI_WORKDIRS` 时，宿主读 `<workdir>/.agent-workdirs.json`（V-29 清单）。我把 `AGENT_UI_WORKDIR` 指到一个空的 scratch 目录 `D:/Work/scratch/p2-none`（该目录下没有 `.agent-workdirs.json`），请求 `GET /api/harness` 实测：
  ```
  availableWorkdirs = ["D:\\Work\\scratch\\p2-none"]
  workdir          = D:\Work\scratch\p2-none
  ```
  清单为空时，宿主**回退成 `[workdir]`**，所以 `availableWorkdirs` 永不为空。
- 于是 `currentWorkdir()` 永远能解析出目录，`noWorkdir` 那一路在 **web 宿主上不可达**。

**没有碰你的 `.agent-workdirs.json`**（本机数据）。

这项改由单测覆盖：`test/ui-file-tree.test.ts` 的「上下文落定且确实没目录，才说「先选一个工作目录。」」（`isContextReady: () => true` + `getWorkdir: () => ""`）。活页层面这一条**未取证**，不冒充通过。

---

## 5. 回走 `walks/p1-cursor-claude.md`（只回走属于 P2 的那一条）

p1 卡是一张满幅走查（Web + 桌面 attach + CLI，含真实 run）。其中与 P2 直接相关的**只有一条**：

> 「发送栏已选 `web-a`，右侧文件树仍写「先选一个工作目录。」（普查 `file-tree-resting`，B1 事后同一句还在）」

| 卡上原文 | 本轮活页 | 判定 |
|---|---|---|
| 发送栏已有目录，树仍写「先选一个工作目录。」 | 首屏任何一帧都没有这句；首帧是「正在确认目录…」，21ms 后是真实列表 `hello.txt` | **已闭** |

卡上其余涉及树/预览的条目**不属 P2**，本轮**未回走**，逐条说明去处：

| 卡上条目 | 去哪 |
|---|---|
| 点中 `@hello-code.txt` 后输入框仍是 `@hello` | P4。P4 有「先复现，不复现就删」的闸门，本刀不动 |
| 树与预览坞各说各话；坞写「读取失败——文件可能已被移动或删除。」 | P3（宣布纪律与读不到分三类） |
| 未批准就 announce「产物画布已打开」，磁盘无此文件 | P3 |
| 没有行内 diff / 挑改 | P4 |
| 今日花费跟全局台账 | 不在本 spec（审计 §4「花费芯片」），未立项 |

**未走的原因**：这些条目要真实 run（花模型调用）与批准交互，而 P2 只改「目录真相」与两个名字，不碰它们。假装走过会让后续 P3/P4 的走查没有干净的基线。

---

## 6. 附带勘误：全量测试的预期是错的

计划 Task 3 Step 4 写「`npx vitest run` Expected: PASS」。**这个期望在本机不成立**，且与本次改动无关。

实测（同一批 5 个文件）：

| | 失败数 |
|---|---|
| `main`（stash 掉 Task 3 改动后跑） | 12 |
| `feat/ui-center-contract` | 11 |

差异是抖动（5 秒超时类 + Windows 临时目录锁）。逐条比对后的成因：

| 文件 | 成因 |
|---|---|
| `ui-server.test.ts` | `EBUSY: resource busy or locked, rmdir '…\Temp\artifact-…'`；另一条 5000ms 超时 |
| `cloud-sync-env.test.ts` ×2 | 读到本机真实 key `sk-e119ee…` 而不是 fixture 的 `sk-test`——本地 `.env` 泄进测试环境 |
| `run-crash-inject.test.ts` | 5000ms 超时（崩溃注入抖动） |
| `ui-handoff.test.ts` ×4 | 未收到 `handoff_proposal` / 5000ms 超时 |
| `ui-patch.test.ts` ×3 | 源文本断言，`main` 上同样失败 |

**没有任何一条可归因于本次改动。** 与本次直接相关的两个文件 `ui-file-tree.test.ts`（17 条）与 `ui-app.test.ts`（292 条）**309/309 全绿**；`npm run typecheck` 无输出。

---

## 7. 本轮没做的事

- 没碰 `eval/persona-ux/_audit-20260915/`（别人的档案，保持原样）
- 没碰 `.agent-workdirs.json`、没碰 4173/4174 上的任何宿主
- 没做桌面 attach 与 CLI 回走
- 没提交截图（`p2-firstpaint*.png` 留在磁盘上，照 `.gitignore` 里「截图搬到 scratch」的惯例不进仓）
