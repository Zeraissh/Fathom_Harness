# Task 4 报告：真 patch 端点——工作区相对 HEAD 的行号与上下文行

**Status: DONE**（端点/路由/handler/前端取数/7 条服务端测试/2 条前端测试/活页探针全部落地；四条降级全有测试；全量零新增；三条 brief 勘误 + 一条 handler 语义观察报给控制者）

提交：`98d8baf feat(ui): 真 patch 端点——工作区相对 HEAD 的行号与上下文行`

## What I implemented

- `src/workspace-git.ts`（+163）：`PatchLine` / `PatchHunk` / `FilePatch` 接口、`MAX_PATCH_BYTES = 262144`、`parsePatchHunks`（`@@ ` 开新 hunk、header 逐字保留、`\ No newline` 记 `sign: "\\"`、字节预算截断且半截 hunk 弹掉）、`synthesizeUntrackedHunks`（未跟踪自己合成，不用 `--no-index /dev/null`——Windows 上不可靠）、`export async function probeFilePatch(root, relPath)`。语义口径（docstring 逐字按 brief 口径）：这份 patch 是「工作区相对 HEAD」，**不是「本场 run 专属」**；两条链各有各的活；这条链补上的正是 write_file 覆盖那个洞。四条降级 note 逐字用 brief：非仓库「这个目录不是 git 仓库，看不了工作区改动」、不存在「盘上没有这个文件」、二进制「二进制文件，不给逐行改动」、git 失败「git 读不出这个文件的改动」。
- `ui/server.ts`（+35）：路由类型联合 `workspaceGitDiff`（紧挨既有 git 路由后）、matcher `GET /api/workspace/git/diff?workdir=&path=`、handler（紧挨 `case "workspaceGitGet"` 后）带如实语义 docstring。
- `ui/public/features/workspace-git.js`（+19）：`fetchFilePatch(workdir, path, fetchImpl = fetch)` 逐字按 brief Step 7（两个参数都 `encodeURIComponent`；`!res.ok`/抛错/缺参 → null）。
- `test/workspace-git.test.ts`（+130）：新 describe 七条（改过带行号与上下文 / ★write_file 覆盖核心断言 / 未跟踪全 + / 非仓库 / 文件不存在 / 二进制 / 超长截断），全部用 `mkdtempSync` + `execFileSync` 自造仓库，**不碰 `.git-fixture/`**；`git config user.email/user.name` 两行在（CI 坑）。
- `test/ui-workspace-git.test.ts`（+22）：fetchFilePatch 两条（地址编码、失败路径 null）。
- `eval/persona-ux/_audit-20260919/verify-file-patch.mjs`（新建，96 行 CRLF）：不经过浏览器的直连探针，四条判据 + 404 哨兵（宿主还服务旧代码则 fail-loud）。

## 从 `git()` 与 `resolveInWorkdir` 学到的东西（brief Step 1 / 6.b 指定先读）

- `git()`（`src/workspace-git.ts:63-71`）：`execFileAsync("git", ["-C", cwd, ...args], { timeout: 8000, windowsHide, utf8, maxBuffer: 1MB })`，返回 `stdout.trim()`，**失败即抛**。所以 `probeFilePatch` 里每一处 git 调用都包在 try/catch 里降级——这是该文件「git 不可用一律降级，不抛」纪律的落实点。
- `resolveInWorkdir`（`src/tools/fs-util.ts` 附近）：**越界是抛异常，不是返回 null**（lexical / symlink / junction 都抛），且要求 workdir 本身存在。brief 的 `if (!abs) return badRequest(...)` 是猜的——handler 用 try/catch 实现。

## TDD Evidence

**RED**（实现前）：`npx vitest run test/workspace-git.test.ts` 失败，报 `probeFilePatch is not a function`（未导出）——新 describe 七条全红。**GREEN**（实现后）：两文件聚焦跑 `Test Files 2 passed · Tests 27 passed (27)`（提交前最后一次，今天）。

## 变异验红的两组原始输出（今天在最终代码态上复做）

**变异 A：把未跟踪判据 `line.startsWith("??")` 改成 `startsWith("ZZ")`**

```
× probeFilePatch：工作区相对 HEAD 的真 patch（计划 3 · T4） > 未跟踪文件：整个文件都是 + 行 400ms
  → expected +0 to be 3 // Object.is equality
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/workspace-git.test.ts > probeFilePatch：… > 未跟踪文件：整个文件都是 + 行
AssertionError: expected +0 to be 3 // Object.is equality
- Expected
+ Received
- 3
```

→ 还原。

**变异 B：`MAX_PATCH_BYTES` 改成 `Number.MAX_SAFE_INTEGER`**

```
× probeFilePatch：工作区相对 HEAD 的真 patch（计划 3 · T4） > 超长文件：truncated=true 且留前 N 个 hunk 628ms
  → expected false to be true // Object.is equality
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/workspace-git.test.ts > probeFilePatch：… > 超长文件：truncated=true 且留前 N 个 hunk
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
```

→ 还原，复跑 27/27 绿，`git diff --stat` 与变异前逐字节同（证明还原干净）。

两次变异都只红被瞄准的那一条、别的全绿——护栏是活的。

## 活页探针的原始输出（`node eval/persona-ux/_audit-20260919/verify-file-patch.mjs`，直连 4201）

```
✅ ① 改过的 src/app.js 有带行号的 hunk —— status=200 hunks=1 header="@@ -1 +1 @@"
✅ ② 未跟踪的 src/new-file.js 全 + 行 —— lines=1 header="@@ -0,0 +1,1 @@"
✅ ③ 非 git 的 workdir 拿到 present:false 且 note 是人话 —— status=200 note="这个目录不是 git 仓库，看不了工作区改动"
✅ ④ 路径越界（../../etc/passwd）被 400 挡住 —— status=400 body={"error":"路径越出了工作目录"}

✅ 四条全成立：有行号 / 未跟踪全 + / 非 git 人话 / 越界 400
```

exit 0。此前已 exit 0 两次（宿主重启前各一次）；控制者说的"瞬时抽风"正是我重启 4201 宿主换服务端代码的窗口（tsx 无 watch，服务端改动必须重启宿主——本计划第一个这样的任务），重启后宿主持续服务新代码，探针稳定 exit 0。

**判据 ③ 的一个实现细节（报备）**：白名单门（`listedWorkdir` 403）跑在 `probeFilePatch` **之前**——非白名单的临时目录会 403，永远到不了 `present:false`。所以探针用的是 `web-a`（`AGENT_UI_WORKDIRS` 白名单里有它、且不是 git 仓库），文件里注释写明了这个原因。

## 全量测试的零新增证据

两次全量跑在同一棵树、同一目录、同一 diff 上（判据照仓库记忆：零新增，不是全绿；失败集成员自己会轮换）：

- 全量第 1 跑：`12 failed | 3687 passed`。可见尾部两条都是 ui-server 既有超时（v2-3b approval_expired、跨 run 资源互斥 5s 超时）——基线家族内。
- 全量第 2 跑（完整输出落盘）：`16 failed | 3683 passed`。失败成员分两类：
  - **基线家族 11 条**：cloud-sync-env ×2、ui-handoff ×4、ui-patch ×3、run-crash-inject ×1、ui-server（本次 2 条：跨 run 资源互斥 + 产物取件——ui-server 的失败成员在两跑之间自己就在换，轮换抖动，非新增）。
  - **非基线 3 个文件共 5 条**：`workspace-git.test.ts`（既有测试「discard 后切换」，**不是**我新增的 describe）、`ui-workspace-git-api.test.ts` ×2、`ui-message-queue.test.ts` ×2。
- **隔离复跑这 3 个文件：`3 passed · 28 passed (28)` 全绿**（含全量里红的那几条逐条同名通过）。与 task-3 报告记载的同一现象：git-API/message-queue 在满负载全量下被拖红、隔离全过——负载抖动，非新增。
- **我新增的 7 条 probeFilePatch 测试在两轮全量里零失败**（第 2 跑失败名单里没有任何 probeFilePatch 条目）。

结论：零新增。`tsc --noEmit` 全绿（覆盖 src + test + eval）。

## check-eol.mjs 的输出（提交后）

```
✅  src/workspace-git.ts       CRLF=  369 裸LF=   0 字节 11785/11785
✅  ui/server.ts               CRLF=14691 裸LF=   0 字节 563518/563518
✅  ui/public/features/workspace-git.js CRLF=  440 裸LF=   0 字节 13875/13875
✅  test/workspace-git.test.ts CRLF=  246 裸LF=   0 字节 9864/9864
✅  test/ui-workspace-git.test.ts CRLF=  270 裸LF=   0 字节 9888/9888
✅  eval/persona-ux/_audit-20260919/verify-file-patch.mjs CRLF=   96 裸LF=   0 字节 3294/3294
```

（探针文件初版被 Write 工具写成裸 LF 96 行——发现后转 CRLF 再提交；现在六行全 ✅、与 HEAD 逐字节相同。）

## Files changed

- `src/workspace-git.ts`（+163）
- `ui/server.ts`（+35：import 一行 + 路由类型一行 + matcher 六行 + handler 二十八行）
- `ui/public/features/workspace-git.js`（+19）
- `test/workspace-git.test.ts`（+130）
- `test/ui-workspace-git.test.ts`（+22）
- `eval/persona-ux/_audit-20260919/verify-file-patch.mjs`（新建）
- 未动：`mcp.json`（任务开始前就是 `M`，本次未读未写，未进提交）、`.git-fixture/`、宿主与任何既有探针。

## Self-review findings

- 纪律全守：测试全部自造仓库（不碰 `.git-fixture/`）；`git config` 两行在；六条边界 + write_file 核心断言全在；两组变异验红（今天在最终代码态复做并留原始输出）；check-eol 六行 ✅；提交只含 brief Step 9 列出的六个文件。
- 语义如实：三处代码注释（`probeFilePatch` docstring、handler docstring、`fetchFilePatch` 注释）都写着「工作区相对 HEAD、不是本场 run 专属」，无一处缩写成"本场改动"。
- 自修三处（详见下）。

## Issues and concerns（报控制者）

1. **brief 勘误 ①：`resolveInWorkdir` 的返回语义**。brief handler 片段写 `if (!abs) return badRequest(...)`——真实语义是**越界抛异常，不返回 null**（lexical / symlink / junction 都抛）。已按真实语义写成 try/catch，探针 ④ 证明 400 生效。
2. **brief 勘误 ②：`(await probeWorkspaceGit(...)).root || listed.path` 过不了 tsc**——`{present:false}` 分支没有 `root` 字段。改为显式 `gitSnap.present ? gitSnap.root : listed.path`。
3. **brief 勘误 ③：brief 的测试 helper `const git = (cwd, ...args) =>` 无类型标注**，在 strict + 测试入 tsc 的项目里 `--noEmit` 报错。已补 `(cwd: string, ...args: string[])`。
4. **git 2.54 的 `@@` header 会追加 section heading**（hunk 不在文件第 1 行时，如 `@@ -5,7 +5,7 @@ line-4`）。brief 要求 header 逐字保留——照办；但截断测试若按 brief 的"精确等值"写 header 会在本机 git 版本上红，已改成前缀匹配并注释写明原因。
5. **handler 的 root 语义观察（给后续接线任务）**：brief 的 snippet 让 `path` 相对**仓库根**（`gitSnap.root`）解析，不是相对 workdir。当 workdir 是仓库子目录时，调用方若传 workdir 相对路径会打到别的文件（或「盘上没有这个文件」）。已逐字按 brief 落地；消费 `fetchFilePatch` 的 UI 接线任务需要知道这个契约（非 git 目录时才是 workdir 相对）。
6. **宿主重启（报备，不是问题）**：本任务是计划里第一个改服务端代码的——tsx 无 watch，改完必须重启 4201 宿主。控制者看到的"瞬时抽风"就是这个窗口；重启后新端点一直健康（探针稳定 exit 0）。
7. **署名行偏差**：提交 message 主体逐字用 brief Step 9，但尾行 brief 给的是 `Co-Authored-By: Claude Opus 4.8 (1M context)`，我的运行环境强制署名 `Claude Sonnet 4.6 <noreply@anthropic.com>`——以环境为准，已用后者。

---

## Fix round 1（任务审查回批：Approved / 0 Critical、1 Important、5 Minor）

**Status: DONE**。提交 `481d7b6 fix(ui): diff 端点圈禁双检 + 目录不 500，path 契约写进三处注释`（5 文件，+61/−7）。

### 改了的两件事

**Important —— root 相对契约 + 圈禁双检**：
- 三处消费者会读的 docstring 全部写明契约：`path` 是**相对仓库 root** 的，不是相对 workdir；workdir 可能是仓库的子目录。`probeFilePatch`（src/workspace-git.ts docstring 加一段）、handler（ui/server.ts 大 docstring 加契约段 + 圈禁行内注释照计划 41529a5 的措辞）、`fetchFilePatch`（workspace-git.js 注释加契约段，写明调用方要先拿仓库根再拼 path）。
- 圈禁改成双检：`resolveInWorkdir(root, rel)` 之后**再** `resolveInWorkdir(listed.path, abs)`。第二道传的是绝对路径——`resolveInWorkdir` 自己的 docstring（WORKDIR_OR_ROOT_PATH）说「relative **or** absolute, as long as it stays inside a configured root」，绝对路径受支持。**一个实现细节（报备）**：协调者说的 `isInside`（fs-util.ts:96）是**私有函数，没有导出**；我没有为它导出改 fs-util.ts，而是复用公开的 `resolveInWorkdir` 做第二道（lexical + symlink/junction 同一套逻辑，还省一次导出）。
- 修后 `sub/../sibling` 这类相对 root 通过、却逃出 workdir 的路径：第二道 isInside(workdir, abs) 为假 → 抛 → 400。

**Minor #2 —— 目录不 500**：`probeFilePatch` 里 existsSync 之后加 `statSync().isFile()` 守卫，目录给结构化 note「这是个目录，看不了逐行改动」；existsSync 与 statSync 之间的竞态按「盘上没有这个文件」降级。EISDIR 不再漏出。

### TDD Evidence（本轮）

**RED**（实现前，新测试「目录不给逐行：isFile 先拦，不抛 EISDIR」）：

```
× probeFilePatch：… > 目录不给逐行：isFile 先拦，不抛 EISDIR 199ms
  → EISDIR: illegal operation on a directory, read
❯ probeFilePatch src/workspace-git.ts:268:17
    const buf = readFileSync(join(cwd, rel));
```

正是审查者推演的那条路径（目录含未跟踪子文件 → `??` → 未跟踪分支 → readFileSync 抛）。**GREEN**（实现后）：两文件聚焦跑 `Tests 28 passed (28)`。`tsc --noEmit` 全绿。

### 变异验红（本轮新增：★ write_file 核心断言的判别力证据，审查 Minor #5）

**变异 C：`const untracked = true;`——让覆盖场景也走未跟踪合成路径**

```
× probeFilePatch：… > ★ write_file 覆盖的那种改法也给得出来（事件流那条链在这里是瞎的） 322ms
  → expected false to be true // Object.is equality
 FAIL  test/workspace-git.test.ts > probeFilePatch：… > ★ write_file 覆盖的那种改法也给得出来（事件流那条链在这里是瞎的）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
```

红在 `tracked` 断言（合成路径下 `tracked=false`）；审查者推演的 `deleted=0` 同样成立——`tracked` 在断言顺序里先触发。★ 那条有判别力是实锤。→ 还原，复跑 28/28 绿，`git diff --stat` 与变异前逐字节同。

### 活页探针（五条判据，宿主重启后直连 4201）

服务端代码变了，重启了一次 4201 宿主（先 TaskStop 后台任务、再 taskkill 杀僵尸 node 树 PID 36312+18224——记忆里那条 Windows 僵尸坑，验证端口释放后以同命令重启）。

```
✅ ① 改过的 src/app.js 有带行号的 hunk —— status=200 hunks=1 header="@@ -1 +1 @@"
✅ ② 未跟踪的 src/new-file.js 全 + 行 —— lines=1 header="@@ -0,0 +1,1 @@"
✅ ③ 非 git 的 workdir 拿到 present:false 且 note 是人话 —— status=200 note="这个目录不是 git 仓库，看不了工作区改动"
✅ ④ 路径越界（../../etc/passwd）被 400 挡住 —— status=400 body={"error":"路径越出了工作目录"}
✅ ⑤ path 指向目录不返 500，给带 note 的结构化结果 —— status=200 note="这是个目录，看不了逐行改动" hunks=0

✅ 五条全成立：有行号 / 未跟踪全 + / 非 git 人话 / 越界 400 / 目录不 500
```

④ 在圈禁双检改动后仍 400（协调者点名的重验项）；⑤ 的夹具 `src/` 正是触发形状（M 的 app.js + ?? 的 new-file.js）。

### 全量测试的零新增证据（同一棵树、同一目录、同一 diff）

`12 failed | 3688 passed | 15 skipped (3715)`（比上一轮多 1 条 = 新增的目录测试，全量里绿）。失败名单 12 条**全部落在既有基线家族**：

| 文件 | 失败数 | 对照基线 |
|---|---|---|
| cloud-sync-env | 2 | 基线 ×2 ✓ |
| ui-handoff | 4 | 基线 ×4 ✓ |
| ui-patch | 3 | 基线 ×3 ✓ |
| run-crash-inject | 1 | 基线 ×1 ✓ |
| ui-server | 2（v2-3b 超时 + 跨 run 互斥超时） | 基线 ×1-2 ✓ |

我碰过的文件（workspace-git / ui-workspace-git-api / ui-message-queue 等）**零失败**——上一轮那 5 条负载抖动这轮一个都没出现，成员轮换与仓库记忆一致。

**一个插曲（报备）**：聚焦跑时既有测试「discard 后切换」曾 5022ms 超时一次——单独跑 797ms 通过、且在全量里也绿，是负载抖动（同全量 run 2 那次），非本轮改动。

### check-eol.mjs（提交后）

```
✅  src/workspace-git.ts       CRLF=  381 裸LF=   0 字节 12186/12186
✅  ui/server.ts               CRLF=14698 裸LF=   0 字节 563915/563915
✅  ui/public/features/workspace-git.js CRLF=  445 裸LF=   0 字节 14056/14056
✅  test/workspace-git.test.ts CRLF=  262 裸LF=   0 字节 10398/10398
✅  eval/persona-ux/_audit-20260919/verify-file-patch.mjs CRLF=  110 裸LF=   0 字节 3879/3879
```

### 其余三条 Minor（协调者记入账本，本轮未动）

`maxBuffer 1MB` 先于 256KB 截断炸、已删除文件给「盘上没有这个文件」、handler 无单测——按指示未动，等 final review 分诊。另：协调者已自提 `0fd12cb`（署名尾注不许写死）——上一轮 concern 7 已闭环。

---

## Fix round 2（定向复查：All findings addressed，无新破坏）

**Status: DONE**。提交 `43b9371 docs(ui): fetchFilePatch 注释不再说过满——传错基准会静默取错，不是 400`（1 文件，+4/−3）。

复查者把 `resolveInWorkdir` 做第二道的选择判为**对**（只导出 `isInside` 反而拦不住 symlink 逃逸变体），并验证了误拒（workdir==root 平凡通过、子目录正常路径通过、Windows 大小写不影响）与守卫时机（正好卡在 EISDIR 源之前）。

本轮只改一处：`workspace-git.js` fetchFilePatch 注释里「workdir 相对路径会被 400 挡下」说得过满——真实失效形态是**传错基准会静默取错**（workdir=root/sub 时传 workdir 相对的 `sub/file.txt`，其 root 相对解释 root/sub/file.txt 双检全过，返回另一个文件的 patch）。已按计划 `7f7c723` 的口径逐字换成 ★ 警告段。

### 验证（只改注释，证明无行为变化）

```
Test Files  1 passed (1)   ·   Tests  12 passed (12)   ← npx vitest run test/ui-workspace-git.test.ts
✅  ui/public/features/workspace-git.js CRLF=  446 裸LF=   0 字节 14164/14164   ← check-eol（提交后）
```

---

## Fix round 3（T4 最后一轮措辞修复）

**Status: DONE**。提交 `f1dcde2 docs(ui): ★ 警告再收半格——错基准的逃逸形状仍会 400，界内才是静默取错`（1 文件，+5/−2）。

复查者逐环验了例子机制：`../x.txt` 这类越出边界的形状 rel=`sub/../x.txt` → abs=root/x.txt 逃出 workdir → 第二道抛 → 400；只有落在边界内的错基准才是静默取错。按计划 `5f4e072` 口径逐字替换「传错基准不会报错」为「传错基准多半不报错，但这不是全称」段。协调者明示这是 T4 最后一轮措辞修复，后续措辞类记账本交 final review。

### 验证（只改注释，证明无行为变化）

```
Test Files  1 passed (1)   ·   Tests  12 passed (12)   ← npx vitest run test/ui-workspace-git.test.ts
✅  ui/public/features/workspace-git.js CRLF=  449 裸LF=   0 字节 14280/14280   ← check-eol（提交后）
```

---

## Fix round 4（T4 收口轮：守卫归属的事实错误）

**Status: DONE**。提交 `1d4ec84 docs(ui): ★ 警告的守卫归属改对——哪道挡取决于形状`（1 文件，+5/−4）。

上一轮（控制者逐字指定）把 `../x.txt` 记到「第二道挡」——归属错了。控制者自己用 node 核过四行真值表：`../x.txt` → `D:/x.txt` 连 root 都逃出去 → **第一道**挡；`sub/../x.txt` 与 root 层 `file.txt` → 留在 root 内、逃出 workdir → **第二道**挡；`sub/file.txt` → 双检全过 → 静默取错。按计划 `62f05a2` 口径逐字替换：越出边界的形状仍会 400，但**是哪一道挡取决于形状**（两个例子分别归属第一道/第二道）。控制者明示 **T4 到此收口**：后续复查再提任何东西一律记账本交 final review，不再开轮，除非会让 T5/T6/T7 做错事。

### 验证（只改注释，证明无行为变化）

```
Test Files  1 passed (1)   ·   Tests  12 passed (12)   ← npx vitest run test/ui-workspace-git.test.ts
✅  ui/public/features/workspace-git.js CRLF=  450 裸LF=   0 字节 14386/14386   ← check-eol（提交后）
```
