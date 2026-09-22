# 计划 3 最终全分支审查 · 六项发现修复报告

日期：2026-09-20 · 分支 `feat/review-actions`（HEAD 5e967e1）· 六项全修，单 commit。

## 一览

| 项 | 发现 | 修复 | 锁 | 变异验红 |
|----|------|------|----|----------|
| I1 | next-hunk 按容器全局找 hunk，≥2 文件展开时点第二个文件的 hunk 0 滚到第一个文件的 hunk 1 | scope 圈到 `btn.closest(".chat-change-file")` | 探针判据 ⑧（行序无关陷阱） | ✅ 红→绿 |
| I2 | server.ts 第二道圈禁 `resolveInWorkdir(listed.path, abs)` 死代码，四条可执行检查里都没有它 | 检查已活着：加探针 ⑥⑦ + 4 条 handler 测试 | 测试「圈禁第二道活着」 | ✅ 红→绿 |
| I3 | 未跟踪文件 readFileSync 整读无上限（大文件瞬时分配数倍内存） | fileSize > MAX_PATCH_BYTES 时只读前 N 字节，truncated=true | NUL-tail 红锁测试 | ✅ 红→绿 |
| I4 | ≥1440 split 档点「在右栏审阅 →」无可见反应（死按钮） | split 档 announceStatus 把话说出来 | 单测文本锁 T7 + 探针 ① 扩展 | 锁为文本锁（无行为可锁） |
| M1 | artifact-canvas.js 头注释深链还写 `<index>` | 改成 `<路径>`，前后 grep 归零 | — | — |
| M2 | ui-layout.test.ts 文档串声称「源顺序」依赖 | 改成「属性互斥」措辞 | — | — |

---

## I1：next-hunk 圈到按钮所属文件（ui/public/index.html）

**问题**：`data-hunk-idx` 按文件从 0 起（`renderPatchHunksHtml` 每个文件体各调一次），handler 却对容器整体 `querySelectorAll(".chat-hunk")`。展开 ≥2 个文件时，点第二个文件的 hunk 0，`find(idx===1)` 命中第一个文件的 hunk 1，滚去别的文件。

**修复**：

```js
const container = btn.closest(".right-rail-review") ?? btn.closest(".chat-change-card");
const scope = btn.closest(".chat-change-file") ?? container;
const hunks = scope ? [...scope.querySelectorAll(".chat-hunk")] : [];
```

**锁**：探针判据 ⑧。陷阱设计必须**行序无关**——判据 ④ 注入 `edit_file seq 1000/1001` 触发重渲染重排（app.js lastSeq=1000 变成第二行），谁在前不可假设。判据 ⑧ 把陷阱 idx=1 放进**文档序第一行**的文件体、按钮放进**第二行**：修复版圈文件 → 滚到第二行的 idx=1；退回容器全局找 → 滚到第一行的陷阱（落错文件）→ 红。

**变异验红（把修复行退回 `const scope = container;`）**：

```
—— 判据 ⑧ ——
行序（重排后）：第一行=src/new-file.js · 第二行=src/app.js（陷阱在第一行，按钮在第二行）
scrollIntoView 落点：file=src/new-file.js idx=1（次数=1）
⑧ 下一个 hunk 圈在按钮所属文件内（终审 I1） → ★ 红
```

**恢复修复后**：

```
—— 判据 ⑧ ——
行序（重排后）：第一行=src/new-file.js · 第二行=src/app.js（陷阱在第一行，按钮在第二行）
scrollIntoView 落点：file=src/app.js idx=1（次数=1）
⑧ 下一个 hunk 圈在按钮所属文件内（终审 I1） → ✅
```

探针最终行：`✅ 八条全成立：…/ 下一个 hunk 圈在文件内`。

---

## I2：diff 圈禁第二道（检查活体证明 + 锁）

**问题**：`ui/server.ts:11694` 的第二道检查 `resolveInWorkdir(listed.path, abs)` 是死代码——四条可执行路径（缺 path、非 git、目录、文件）都到不了它，是圈禁逻辑本身有缝（第一道只看 root，workdir 是子目录时 `sub/../sibling` 能逃出 workdir）还是实现行失效，人读不出来。

**处理**：不删行——检查被证明**活着且必要**，用两条探针判据 + 四条 handler 测试把它钉成有判据的事实。

探针 `verify-file-patch.mjs` ⑥⑦（workdir=夹具 src 子目录，探针自加自删白名单）：

```
✅ ⑥ workdir 是仓库子目录时，子目录之外的路径被 400 挡住（圈禁第二道活着） —— status=400 body={"error":"路径越出了工作目录"}
✅ ⑦ workdir=子目录时 path 仍按 root 相对：拿到 repo/src/app.js 的 patch —— status=200 path="src/app.js" hunks=1
✅ 七条全成立：有行号 / 未跟踪全 + / 非 git 人话 / 越界 400 / 目录不 500 / workdir 双检 400 / root 相对契约
```

单测 `test/ui-workspace-git-api.test.ts` 新 describe「/api/workspace/git/diff 圈禁双检（终审 I2）」4 条。

**变异验红（删掉 server.ts:11694 那行）**：

```
 FAIL test/ui-workspace-git-api.test.ts > /api/workspace/git/diff 圈禁双检（终审 I2） > workdir 是仓库子目录时，子目录之外的路径 400（圈禁第二道活着）
AssertionError: expected 200 to be 400 // Object.is equality

- Expected  - 400
+ Received  + 200

  ❯ test/ui-workspace-git-api.test.ts:212:24
```

红色**精确命中**圈禁第二道的测试，另外三条（root 相对契约、+43 基线、第一道越界）保持绿——证明锁钉的就是那一道。

**还原后**：`4 passed`（9 条中 5 条 skip），`git diff HEAD -- ui/server.ts` 为空（与 HEAD 逐字节一致）。

---

## I3：未跟踪文件读取上限（src/workspace-git.ts）

**问题**：未跟踪分支 `readFileSync` 整读。workdir 里的大未跟踪件（node_modules/**、构建产物、数据集）被点开时瞬时吃下数倍于文件大小的分配。对照：`GET /api/file-preview` 有 `FILE_PREVIEW_MAX_BYTES` 超了返 413。

**修复**（与 tracked 截断同一把尺 `MAX_PATCH_BYTES` = 262144）：

```ts
let fileSize = 0;
try {
  const st = statSync(join(cwd, rel));
  if (!st.isFile()) return empty("这是个目录，看不了逐行改动");
  fileSize = st.size;
} catch { return empty("盘上没有这个文件"); }

// 未跟踪分支：
let buf: Buffer;
if (fileSize > MAX_PATCH_BYTES) {
  const fd = openSync(join(cwd, rel), "r");
  try {
    buf = Buffer.alloc(MAX_PATCH_BYTES);
    buf = buf.subarray(0, readSync(fd, buf, 0, MAX_PATCH_BYTES, 0));
  } finally { closeSync(fd); }
} else {
  buf = readFileSync(join(cwd, rel));
}
if (buf.includes(0)) return { ...empty("二进制文件，不给逐行改动"), binary: true };
({ hunks, truncated } = synthesizeUntrackedHunks(buf.toString("utf8")));
truncated = truncated || fileSize > MAX_PATCH_BYTES;
```

代价如实写进代码注释：二进制判定只对已读前缀成立。

**锁（可触发失败的红锁机制）**：`test/workspace-git.test.ts` 新测试「未跟踪超大文件」——3000 行 ≈318KB，文件尾部放 NUL（offset ≈317KB > 262144）。实现若退回整读，`buf.includes(0)` 看见尾部 NUL → 判 binary → `expect(p.binary).toBe(false)` 当场红。前缀读看不见它（代价即锁）。不用 `vi.mock("node:fs")`——实测它会把 vitest 自身模块加载毒化，全文件 17 条一起红（测试文件注释里记录了这个坑）。

**变异验红（把 `if (fileSize > MAX_PATCH_BYTES)` 改成 `if (false && …)`）**：

```
 FAIL test/workspace-git.test.ts > probeFilePatch：工作区相对 HEAD 的真 patch（计划 3 · T4） > 未跟踪超大文件：只读前 N 字节、truncated=true、尾部 NUL 不许被看见
AssertionError: expected true to be false // Object.is equality

  ❯ test/workspace-git.test.ts:288:22
    286|     expect(p.present).toBe(true);
    287|     expect(p.tracked).toBe(false);
    288|     expect(p.binary).toBe(false);   // ← 红锁本体：整读会判 binary
```

**还原后**：17/17 全绿。

---

## I4：split 档的「在右栏审阅 →」不许当死按钮（ui/public/index.html）

**问题**：≥1440px split 档下 review 不占列（railPolicy 边界 + styles.css 藏槽），卡片主 CTA 点击后 `showRailPanel("review")` 照跑但用户什么都看不见。

**修复**（最小可见反应——把话说出来；给 split 真开一列是三列预算的单独立项）：

```js
if (action === "open-review-panel") {
  e.preventDefault();
  showRailPanel("review");
  paintReviewPanel();
  if (document.getElementById("right-rail")?.dataset.layout === "split") {
    announceStatus("「改动」面板在宽档右栏里不占列——把窗口拉窄（右栏收成单列）即可看到");
  }
}
```

**锁**（行为锁不住，锁 handler 文本）：

- 单测 `test/ui-layout.test.ts` 新测试「open-review-panel 分支：split 档必须 announceStatus，不许当死按钮」——正则提取分支，断言 showRailPanel / paintReviewPanel / split 检查 / 精确 announceStatus 文案。
- 探针 `verify-review-panel.mjs` 判据 ① 扩展：点击前清空 `#status-announcer`，点击后断言非空且含「不占列」。

探针输出（判据 ①）：

```
公告栏："「改动」面板在宽档右栏里不占列——把窗口拉窄（右栏收成单列）即可看到"（终审 I4：split 档不许当死按钮）
① 召出改的是面板选择；split 下槽位不出现（边界断言） → ✅
```

探针最终行：`✅ 十条全成立`。

---

## M1/M2：注释与文档措辞

- **M1** `ui/public/features/artifact-canvas.js:7`：头注释深链从 `#/run/<id>/artifact/<index>` 改为 `#/run/<id>/artifact/<路径>`。修复后 `grep -n "<index>" ui/public/features/artifact-canvas.js` 零命中（前后已 grep 确认）。
- **M2** `test/ui-layout.test.ts:276` 文档串：「两脸成对 + 三向互斥 + 两条同特异性规则的**源顺序**（split 必须排在 show 之后）」改为「**属性互斥**（show 把槽接进 tabbed 的互斥三向里、split 直接藏槽，两条选择器永不共存，不靠源顺序裁决）」。

---

## 测试证据

**聚焦单测**（3 文件）：

```
 Test Files  3 passed (3)
      Tests  57 passed (57)
```

**全量套件**（`npx vitest run`）：

```
 Test Files  5 failed | 167 passed | 1 skipped (173)
      Tests  13 failed | 3725 passed | 15 skipped (3753)
```

13 失败全部落在已知基线家族（与基线「11 确定 + 1 轮换抖动」吻合，零新增）：

- test/ui-handoff.test.ts：4（已知基线）
- test/cloud-sync-env.test.ts：2（已知基线）
- test/run-crash-inject.test.ts：2（已知基线）
- test/ui-patch.test.ts：3（已知基线）
- test/ui-server.test.ts：2（已知基线）

本次改动的三个测试文件（workspace-git / ui-workspace-git-api / ui-layout）无一在失败列表中；`grep FAIL` 对新测试名（圈禁双检 / 超大文件 / announceStatus / 属性互斥）零命中。

**变异验红汇总**（原始输出见上）：I1 探针 ⑧ 红→绿；I2 第二道删行 →「圈禁第二道活着」红 → 还原 4/4 绿；I3 尺寸闸短路 → 红锁本体红 → 还原 17/17 绿。

## check-eol 输出（九个改动文件）

```
★★ 不一致  src/workspace-git.ts       CRLF=  402 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  test/workspace-git.test.ts CRLF=  297 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  test/ui-workspace-git-api.test.ts CRLF=  252 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  test/ui-layout.test.ts     CRLF=  349 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  ui/public/index.html       CRLF= 6653 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  ui/public/features/artifact-canvas.js CRLF= 2016 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  eval/persona-ux/_audit-20260919/verify-change-card.mjs CRLF=  517 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  eval/persona-ux/_audit-20260919/verify-file-patch.mjs CRLF=  175 裸LF=   0 ← 与 HEAD 不逐字节相同
★★ 不一致  eval/persona-ux/_audit-20260919/verify-review-panel.mjs CRLF=  543 裸LF=   0 ← 与 HEAD 不逐字节相同
```

「★★ 不一致」是 check-eol 对「内容与 HEAD 不逐字节相同」的标注（本报告改动了全部九个文件，必然如此）；EOL 判据是**裸LF=0**——九个文件全部为 0，无行尾漂移。

## 探针最终行汇总

- `verify-file-patch.mjs`：`✅ 七条全成立：有行号 / 未跟踪全 + / 非 git 人话 / 越界 400 / 目录不 500 / workdir 双检 400 / root 相对契约`
- `verify-change-card.mjs`：`✅ 八条全成立：… / 下一个 hunk 圈在文件内`
- `verify-review-panel.mjs`：`✅ 十条全成立：split 下召出改选择不现身且把话说出来 / … / 0 控制台错误`

## 提交

单 commit 覆盖六项，九个代码文件（`mcp.json` 有无关工作区修改，不入库）。本报告位于 `.superpowers/`（未被 git 跟踪），不随 commit 提交。
