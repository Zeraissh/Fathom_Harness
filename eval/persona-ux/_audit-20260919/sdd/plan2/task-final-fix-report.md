# Task 6 终审四件 · 修复报告（Fix round 2）

**状态**：完成。提交 `c1b3d4a79ac774294c1c22a8efb843fc2861db39`（6 文件，+148/−53），新一笔、未 amend 4667aed。

## ① 计划勘误块 + 探针改比集合（终审 I1）

- 计划文档 `docs/superpowers/plans/2026-09-19-plan2-attachments-artifacts.md` Task 6 Step 6 两条 Expected 后追加 `> **★ 勘误（终审 I1）**：…` 块：两侧成员可能不同（产物条验存在性、标签条不验）、顺序按设计不同（时序 vs 分组）、"同一个真值源"指数据来源不指逐项相等、旧判据只对特定 run 特定时刻成立（3221e432 的 seq 恰好等于分组顺序，是巧合）。**只编辑了内容，未 stage——该文件仍 untracked，等协调者自己 git add。**
- 探针 `verify-artifact-tabs.mjs`：
  - ① 改为 `railSubsetOfTabs`（标签条 ⊇ 产物条）+ 差集逐项 `POST /api/runs/:id/paths/inspect` 验 `exists === false`（响应缺失/异常/盘上还在都算红——**不是永远绿**）；打印两侧数量、差集、逐项 exists。
  - ② 只打印标签条（seq）与产物条（分组）前四项顺序，明写"顺序按设计不同，不比对"。
  - 连带：③ 原位判据改 `posInTabs = tabs.paths.indexOf(railPaths[2])` 基线（不再耦合跨清单下标/数量）；⑥ 终态基线改 `tabsBeforeSix.paths.filter(p => p !== X)`（不再用产物条清单当期望）；openRun 落定校验改存在性感知（inspect 后只对"事件里写过且盘上还在"的子集要求必在产物条，盘上已删的本来就不该出现）；ok 组合与总结行同步改写。

## ② 上传行编号 gate（真 bug）

- `index.html`：`tag` 改为 `u.attachNo !== undefined ? (u.previewUrl ? \`Image #${u.attachNo}\` : \`附件 #${u.attachNo}\`) : (u.previewUrl ? "图片" : "附件")`——照缩略图 :4971 那条门控。旧写法 `?? ""` 在上传中（attachNo 还不存在）渲染出「Image #  0%」。
- 新锁（`test/ui-attachments.test.ts` 终审 describe 第 3 条）：钉 `const tag = u.attachNo !== undefined\s*\?` + 反锁 `Image #\$\{u.attachNo \?\? ""\}`。
- 变异验红（打回旧写法后）：

```
FAIL test/ui-attachments.test.ts > 终审 fix round 的接线锁（编号 gate / 落盘判据 / 切走分支记 info） > 上传/清单行的「#N」只在 attachNo 已存在时拼——上传中还没有编号，别渲染出「Image #  0%」
AssertionError: expected '<!DOCTYPE html>\r\n<html lang="zh-CN"…' to match /const tag = u\.attachNo !== undefined…/
❯ test/ui-attachments.test.ts:200:20
```

## ③ 删盘判据改"有没有落过盘"（真 bug + 隐藏半截）

- `removeUploadedFile` 分流键 `u.status !== "done"` → `!u.absolutePath`（注释同步更正：切走分支 status=failed 但文件确实在 uploads/，按 status 判永远删不掉、成静默孤儿）。
- **关键发现（修到一半才暴露）**：`uploadEntry` 切走分支原来把 `info` 整个丢掉——`entry.absolutePath` 保持 undefined，光改判据后该条目仍会被当成"没落过盘"跳过 DELETE，修复形同虚设。补上 `Object.assign(entry, info);`（在置 failed 之前），path 换成 uploads/…、absolutePath 记上，DELETE 才打得到真文件。
- 新锁（终审 describe 第 1、2 条）：锁 `!u.absolutePath` 在 `fetch("/api/upload"` 之前 + 反锁 `u\.status !== "done"`；锁切走分支（从 `if ((composerMode?.mode` 到分支内 `entry.status = "failed"`）含 `Object.assign(entry, info)`。
- 变异验红（判据打回 status 后）：

```
× 终审 fix round 的接线锁（编号 gate / 落盘判据 / 切走分支记 info） > 删除按「有没有落过盘」（absolutePath）分流，不是 status==="done"——切走对话那条 status 是 failed 但文件确实在 uploads/，按 status 判就成静默孤儿
→ 找不到 !u.absolutePath 这道分流: expected -1 to be greater than -1
AssertionError: 找不到 !u.absolutePath 这道分流: expected -1 to be greater than -1
❯ test/ui-attachments.test.ts:177:46
```

## ④ 三处便宜硬化

- 删 `test/ui-attachments.test.ts` 那条只锁 `toMatch(/stripAttachmentLine\(/)` 的弱断言（:174-181 的 import 锁 + ui-shell-imports.test.ts 已覆盖）。
- `app.js` 消息复制 `clone.remove()` 包 try/finally（innerText 抛也不留 fixed 定位副本在 body）。
- `verify-tree-noise.mjs` / `scroll-snap/repro-4173.mjs` 截图落点 `shots/` → `eval/persona-ux/_verify-shots/`（gitignore）。

## 验证

- `check-eol`：index.html（CRLF 6349/裸 0）、ui-attachments.test.ts（236/0）、verify-artifact-tabs.mjs（397/0）、app.js（12161/0）、verify-tree-noise.mjs（202/0）全干净；repro-4173.mjs 0 CRLF/133 裸 LF——**HEAD 里它本来就是 LF（0 CR/131 行），与 HEAD 行尾一致，非本次漂移**。
- `ui-attachments.test.ts` 23/23 绿（两轮变异红后恢复绿复跑）。
- 全量两轮：12 失败（3672 过）/13 失败（3671 过）——差异是已知抖动的量级差；失败全部落在 ui-handoff(4)、cloud-sync-env(2)、run-crash-inject(1)、ui-patch(3)、ui-server(2)，与本轮六个文件零交集，零新增。
- 探针三个文件 `node --check` 语法通过。

## 提交

- SHA：`c1b3d4a79ac774294c1c22a8efb843fc2861db39`，message 逐字按协调者文本。
- 文件集：ui/public/index.html、test/ui-attachments.test.ts、eval/persona-ux/_audit-20260919/verify-artifact-tabs.mjs、ui/public/app.js、eval/persona-ux/_audit-20260919/verify-tree-noise.mjs、eval/persona-ux/_audit-20260919/scroll-snap/repro-4173.mjs。
- **未含**：mcp.json（他人修改，仍 ` M` 未 stage）、计划文档（仍 `??`，等协调者 git add）。

## 遗留顾虑

1. 探针新判据（差集全部 `exists === false`、标签条 ⊇ 产物条）只在活页上真跑过旧判据；新判据未经真浏览器活页跑（4201 环境未在本轮重跑探针）——但集合比较的输入来源（rail 路径、tabs 标题、paths/inspect 响应形状）均来自已验证的既有代码路径。
2. `railPaths[4]`/`railPaths[5]`（⑥ 的 X/Y）仍按产物条下标取件——若某场产物在盘上被删到不足 6 件，⑥ 会退化成红而非跳过（与旧探针同口径，未恶化）。
3. 差集 inspect 若 `paths/inspect` 端点暂时不可达会整条判红（保守方向，符合"盘上还在的项就是 bug 要红"）。
