# P2 · 单一上下文真相 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右侧文件树在「上下文还没落定」时不再谎报「先选一个工作目录。」；并把「当前目录」与「目录变了要刷什么」各自收敛成一个名字。

**Architecture:** 树的 `paint()` 现在只有两态：有目录 / 没目录。加第三态「还没问完」——由宿主注入 `isContextReady()` 判定。就绪信号来自 `loadHarness()` 是否落定（成功、非 2xx、抛错都算落定），落定后走既有的刷新链重绘。不加状态容器，只补一个布尔和两次机械重命名。

**Tech Stack:** 零构建前端（`ui/public/index.html` 内联 module + `ui/public/features/*.js` ES 模块）、Vitest + jsdom、TypeScript 只用于服务端。

**Spec:** `docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §P2（§7 把它排第一刀）

**顺序**：Task 1 加行为 → Task 2/3 纯机械重命名 → Task 4 接线 → Task 5 活页验收。重命名排在接线之前，是为了让 Task 4 直接用新名，不留「先写成旧名回头再改」的分叉。

---

## 文件结构

| 文件 | 职责 | 本计划对它做什么 |
|---|---|---|
| `ui/public/features/file-tree.js` | 右侧文件树模块（纯函数 + `initFileTree` 挂载） | 加 `confirming` 文案；`paint()` 加就绪态门控 |
| `ui/public/index.html` | 宿主：内联全部接线逻辑 | 两处重命名；加 `harnessSettled`；注入 `isContextReady` |
| `test/ui-file-tree.test.ts` | 树的回归锁（含**源码文本锁**） | 加 3 条就绪态测试；改 4 条源码锁断言 |

**为什么 5565 行的 `index.html` 还往里改**：这是本仓库既有的形态（零构建，宿主接线全在内联 `<script type="module">`）。本计划不做拆分——那是另一件事，混进来会让这次的行为改动没法复核。

---

### Task 1: 树的第三态

**Files:**
- Modify: `ui/public/features/file-tree.js:14-27`（`FILE_TREE_COPY`）、`ui/public/features/file-tree.js:198-212`（`paint()`）
- Test: `test/ui-file-tree.test.ts`（紧接「空目录与未选工作目录用人话」那条 `it` 之后）

- [ ] **Step 1: 写失败测试**

在 `test/ui-file-tree.test.ts` 的「空目录与未选工作目录用人话」这条 `it(...)` 之后追加：

```ts
  it("上下文没落定时说「正在确认目录…」，不说「先选一个工作目录。」", async () => {
    const pending = mountTree({ getWorkdir: () => "", isContextReady: () => false }, { fetch: vi.fn() });
    await pending.api.reload();
    expect(pending.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.confirming);
    expect(pending.root.textContent).not.toContain(FILE_TREE_COPY.noWorkdir);
  });

  it("上下文落定且确实没目录，才说「先选一个工作目录。」", async () => {
    const settled = mountTree({ getWorkdir: () => "", isContextReady: () => true }, { fetch: vi.fn() });
    await settled.api.reload();
    expect(settled.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.noWorkdir);
  });

  it("宿主不提供 isContextReady 时保持旧行为（向后兼容）", async () => {
    const legacy = mountTree({ getWorkdir: () => "" }, { fetch: vi.fn() });
    await legacy.api.reload();
    expect(legacy.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.noWorkdir);
  });
```

- [ ] **Step 2: 跑测试，确认它失败**

Run: `npx vitest run test/ui-file-tree.test.ts -t "正在确认目录"`
Expected: FAIL —— `expected '先选一个工作目录。' to be undefined`（`FILE_TREE_COPY.confirming` 尚不存在）。

- [ ] **Step 3: 加文案常量**

在 `ui/public/features/file-tree.js` 的 `FILE_TREE_COPY` 里，`emptyRoot` 与 `noWorkdir` 之间插入一行：

```js
  emptyRoot: "这个工作目录里还没有可列出的文件。",
  confirming: "正在确认目录…",
  noWorkdir: "先选一个工作目录。",
```

- [ ] **Step 4: 给 `paint()` 加就绪态门控**

把 `ui/public/features/file-tree.js` 的：

```js
  function paint() {
    const wd = workdirNow();
    body.replaceChildren();
    if (!wd) {
      const empty = doc.createElement("p");
      empty.className = "ft-empty";
      empty.textContent = FILE_TREE_COPY.noWorkdir;
      body.appendChild(empty);
      return;
    }
```

改成：

```js
  function paint() {
    const wd = workdirNow();
    body.replaceChildren();
    if (!wd) {
      const empty = doc.createElement("p");
      empty.className = "ft-empty";
      // 三态：还没问完（上下文未落定）≠ 确实没有。
      // host 不提供 isContextReady 时按旧行为视为已落定 —— 独立用法与老测试不受影响。
      const settled = host.isContextReady?.() !== false;
      empty.textContent = settled ? FILE_TREE_COPY.noWorkdir : FILE_TREE_COPY.confirming;
      body.appendChild(empty);
      return;
    }
```

- [ ] **Step 5: 跑测试，确认通过（本文件全绿）**

Run: `npx vitest run test/ui-file-tree.test.ts`
Expected: PASS，含原有「空目录与未选工作目录用人话」（它不传 `isContextReady`，走兼容分支）。

- [ ] **Step 6: 提交**

```bash
git add ui/public/features/file-tree.js test/ui-file-tree.test.ts
git commit -m "feat(ui): 文件树第三态——上下文没落定不说「先选一个工作目录」"
```

---

### Task 2: `syncFileTreeToComposer` → `refreshWorkdirDependents`

**Files:**
- Modify: `ui/public/index.html:3582`（定义）+ 9 处调用点
- Test: `test/ui-file-tree.test.ts:246,248,249`

**为什么改名而不是 spec 字面说的「删除」**：它现在还兼着三件事——重载树、刷 git 芯片、欢迎态重绘。删掉就得在 9 个调用点各写三段，那不是「一个真相」，是把一个隐式函数摊成九份隐式代码。改成「刷新所有依赖工作目录的视图」这个名字，才是 spec 的意图。

- [ ] **Step 1: 确认新名不冲突**

Run: `grep -rn "refreshWorkdirDependents" ui/ test/`
Expected: 无输出。若有输出，换个名（如 `refreshWorkdirDependentViews`）并在本任务所有出现处同步。

- [ ] **Step 2: 定位全部调用点**

Run: `grep -n "syncFileTreeToComposer" ui/public/index.html`
Expected: 恰好 10 行，行号 `1410 / 3523 / 3557 / 3582 / 4258 / 4449 / 4466 / 4505 / 4987 / 5034`（1 处定义 + 9 处调用）。数目或行号不符就先停手核对，别盲目全局替换。

- [ ] **Step 3: 改名**

把 `ui/public/index.html` 里全部 `syncFileTreeToComposer` 替换为 `refreshWorkdirDependents`，并把定义处（原 3582 行）的注释改成说明它的意图：

```js
/** 工作目录变了的统一出口：重载树、刷 git 芯片、欢迎态重绘。
    所有"目录可能变了"的地方都调它一次，别各自分支。 */
function refreshWorkdirDependents() {
  void fileTreeApi?.reload?.();
  void workspaceGitChipApi?.refresh()?.then(() => refreshGithubPrReady().then(() => {
    if (mainPanel.classList.contains("is-welcome")) paintEmptyState();
  }));
}
```

- [ ] **Step 4: 更新源文本锁**

把 `test/ui-file-tree.test.ts:246-249` 的 4 行：

```ts
    expect(htmlSrc).toMatch(/function syncFileTreeToComposer/);
    expect(htmlSrc).toMatch(/function composerWorkdir\(\)[\s\S]*getWorkdirSelection/);
    expect(htmlSrc).toMatch(/function paintWorkdirsForFace[\s\S]*syncFileTreeToComposer/);
    expect(htmlSrc).toMatch(/function populateKnobs[\s\S]*syncFileTreeToComposer/);
```

改成（第 2 行的 `composerWorkdir` 此步不动，Task 3 才改）：

```ts
    expect(htmlSrc).toMatch(/function refreshWorkdirDependents/);
    expect(htmlSrc).toMatch(/function composerWorkdir\(\)[\s\S]*getWorkdirSelection/);
    expect(htmlSrc).toMatch(/function paintWorkdirsForFace[\s\S]*refreshWorkdirDependents/);
    expect(htmlSrc).toMatch(/function populateKnobs[\s\S]*refreshWorkdirDependents/);
```

- [ ] **Step 5: 跑测试**

Run: `npx vitest run test/ui-file-tree.test.ts test/ui-app.test.ts`
Expected: PASS。`ui-app.test.ts` 也读 `index.html` 源文本，改漏了会在这里暴露。

- [ ] **Step 6: 提交**

```bash
git add ui/public/index.html test/ui-file-tree.test.ts
git commit -m "refactor(ui): syncFileTreeToComposer → refreshWorkdirDependents，名字说清它干的三件事"
```

---

### Task 3: `composerWorkdir` → `currentWorkdir`

**Files:**
- Modify: `ui/public/index.html:3565`（定义）+ 12 处调用点
- Test: `test/ui-file-tree.test.ts:247`

- [ ] **Step 1: 定位全部出现处**

Run: `grep -n "composerWorkdir" ui/public/index.html`
Expected: 恰好 13 行（1 处定义 + 12 处调用）。

- [ ] **Step 2: 改名并标成唯一入口**

把 `ui/public/index.html` 里全部 `composerWorkdir` 替换为 `currentWorkdir`，并把定义处的注释补上：

```js
/** 「当前目录」的**唯一**派生入口。树、预览坞、@、引用、发送都只准从这里读，
    不准各自再判一次 —— 判两次就会像 09-15 那样，发送栏有目录而树说没有。 */
function currentWorkdir() {
```

- [ ] **Step 3: 更新源文本锁**

把 `test/ui-file-tree.test.ts:247` 的：

```ts
    expect(htmlSrc).toMatch(/function composerWorkdir\(\)[\s\S]*getWorkdirSelection/);
```

改成：

```ts
    expect(htmlSrc).toMatch(/function currentWorkdir\(\)[\s\S]*getWorkdirSelection/);
```

- [ ] **Step 4: 全量测试（确认别处没有引用旧名）**

Run: `npx vitest run`
Expected: PASS。这一步**必须全量**：改名跨 13 处，单文件测试覆盖不到别的读源码的测试。

- [ ] **Step 5: 提交**

```bash
git add ui/public/index.html test/ui-file-tree.test.ts
git commit -m "refactor(ui): composerWorkdir → currentWorkdir，标成唯一派生入口"
```

---

### Task 4: 宿主把落定状态喂给树

**Files:**
- Modify: `ui/public/index.html:2620-2621`（状态声明）、`ui/public/index.html:2742-2745`（`loadHarness` 的 `catch`）、`ui/public/index.html:5017-5020`（`initFileTree` 的 host）

- [ ] **Step 1: 声明落定标志**

把 `ui/public/index.html:2621` 的：

```js
let harnessSnapshot = null;
```

改成：

```js
let harnessSnapshot = null;
/** /api/harness 是否已经落定（成功、非 2xx、抛错都算落定）。
    未落定时树说「正在确认目录…」——不能把「还没问过」说成「确实没有」。 */
let harnessSettled = false;
```

- [ ] **Step 2: 在 `loadHarness` 里置位并触发重绘**

把 `ui/public/index.html:2742-2745` 的：

```js
  } catch {
    // 拿不到就照实降级：Tools 面会显示"未获取到工具清单"
  }
}
```

改成：

```js
  } catch {
    // 拿不到就照实降级：Tools 面会显示"未获取到工具清单"
  } finally {
    // 无论成功失败都算落定；落定后才允许树说「先选一个工作目录。」
    harnessSettled = true;
    refreshWorkdirDependents();
  }
}
```

- [ ] **Step 3: 注入 `isContextReady`**

把 `ui/public/index.html:5017-5020` 的：

```js
    fileTreeApi = initFileTree({
      mount: fileTreeMount,
      getWorkdir: () => currentWorkdir(),
```

改成：

```js
    fileTreeApi = initFileTree({
      mount: fileTreeMount,
      getWorkdir: () => currentWorkdir(),
      isContextReady: () => harnessSettled,
```

- [ ] **Step 4: 类型检查**

Run: `npm run typecheck`
Expected: 无输出。`index.html` 是 HTML，`tsc --noEmit` 不看它；这条是确认没连带破坏 `.ts`。`isContextReady` 写在 HTML 里，TypeScript 看不见——Task 1 的 jsdoc 注释是唯一的契约说明。

- [ ] **Step 5: 跑树的回归锁**

Run: `npx vitest run test/ui-file-tree.test.ts`
Expected: PASS。**必须包含**第 246-249 行的 4 条源码锁（Task 2/3 已把它们指到新名）。若红在这 4 条上，说明 Task 2 或 3 没做完。

- [ ] **Step 6: 提交**

```bash
git add ui/public/index.html
git commit -m "feat(ui): 宿主把 harness 落定状态喂给文件树"
```

---

### Task 5: 活页验收（不能只靠单测）

**Files:**
- Create: `eval/persona-ux/_audit-20260918/p2-evidence.md`

**为什么必须有这一步**：单测只能证明 `paint()` 的三态逻辑对，**证明不了**「冷启动不再闪『先选一个工作目录。』」——那取决于 `loadHarness` 与树首次渲染的真实时序，只有活页能证。

- [ ] **Step 1: 起一个有工作目录的活宿主**

```bash
mkdir -p "D:/Work/scratch/p2-check" && echo ping > "D:/Work/scratch/p2-check/hello.txt"
```

```bash
AGENT_UI_WORKDIR="D:/Work/scratch/p2-check" npm run ui
```

另开终端记下实际端口（默认 4173，被占会另选）。

- [ ] **Step 2: 无痕打开，盯首次渲染**

无痕窗口打开 `http://127.0.0.1:<端口>/`，**硬刷新（Ctrl+Shift+R）**，看右侧「文件」栏。

判据（两条都要成立）：

1. 从白屏到出内容，**任何一帧都不出现**「先选一个工作目录。」
2. 出内容后显示 `hello.txt`，或「正在确认目录…」在数百毫秒内被真实列表替换。

任一条不成立 → **不通过**。回 Task 4 查 `harnessSettled` 的置位时机，最可能的错因：`finally` 没跑到，或 `refreshWorkdirDependents()` 在 `harnessSettled = true` **之前**被调用。

- [ ] **Step 3: 反例也要走一遍**

去掉 `AGENT_UI_WORKDIR` 且本机 `availableWorkdirs` 为空时启动，确认这时**才**显示「先选一个工作目录。」——证明第二态没被误吞。

- [ ] **Step 4: 留档**

两轮观察到的屏幕原文写进 `eval/persona-ux/_audit-20260918/p2-evidence.md`，含时序证据：DevTools → Network 里 `/api/harness` 的完成时刻，对比「文件」栏首帧 DOM。格式照 `eval/persona-ux/_audit-20260915/` 的既有惯例：只写屏幕原文与自己亲手跑出来的东西，不写推测。

- [ ] **Step 5: 原地回走 p1**

按 `eval/persona-ux/_audit-20260915/walks/p1-cursor-claude.md` 里「树 / `@` / 批准」的伸手顺序**原地重走**，新屏幕原文与 09-15 活页逐句对照，写进同一份 evidence。**不另开新剧**。

- [ ] **Step 6: 提交**

```bash
git add eval/persona-ux/_audit-20260918/p2-evidence.md
git commit -m "docs(eval): P2 活页证据——冷启动不再闪「先选一个工作目录」"
```

---

## 完成定义

- [ ] `npx vitest run` 全绿
- [ ] `npm run typecheck` 无输出
- [ ] Task 5 判据两条都成立，反例也成立
- [ ] `grep -rn "syncFileTreeToComposer\|composerWorkdir" ui/ test/` 无输出
- [ ] 5 个提交都在，各自可独立回滚

## 不变量（改这一刀时不许碰）

来自 spec §5，本计划任何一步都不得违反：

1. 默认 `autoApprove=false`（默认先问）
2. 批准卡人话，不回退 JSON 工具名
3. 停止三分词：「已停止」+「写入不会回滚」
4. Work 普通人话 `POST /api/runs` 必须 200
5. `[hidden]` 空壳不得被 `display:flex` 压过
6. 预览 txt 不整页开走 `file://`
7. `@` 列文件、旧对话走「引用会话」
8. 拒绝不写盘

## 本计划明确不做

- **不动布局**。`#center-row` / `.files-rail` / `.preview-dock` 一行 CSS 都不改——那是 P1，且 P1 要单独一个提交以便二分回滚。
- **不加状态容器**。只加一个 `harnessSettled` 布尔。搞一个 context 对象属于 `docs/` 里那种「架构重写」，spec §4 明确不写架构重写。
- **不拆 `index.html`**。
