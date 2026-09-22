# 计划 4 · 右列骨架（从「带页签的框」到「召出的整条」）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把右列从一个**占宽的列 + 一排页签**改成**召出的整条**——窄屏浮层 / 宽屏占宽列，两脸各有各的召出钮，一次一只；拆掉 `split` 那一档与页签行。

**Architecture:** 三层各改一处，**改动全在既有的三个接缝上**，不新建面：
1. **策略层**（`ui/public/core/rail-policy.js`，纯函数）：**拆掉 `split`**，`layout` 从 `"split"|"tabbed"` 改成 **`"docked"|"floating"`**（宽屏占宽列 / 窄屏浮层）。
2. **样式层**（`styles.css:1590-1797` 整块 + T7 那 10 条）：把「两列并排 + tab 行」那套换成「浮层 / 占宽列」那套。
3. **宿主层**（`index.html` 的 `paintRightRail` / `bindRightRail`）：页签行换成**召出键**；`data-panel` 换成**一次一只**的 `data-surface`。

**★ 本计划是骨架，不是新面**：现有三只面（树 / 预览 / 改动）**换个家**，不重做。Work 脸那个钮**暂挂树**（计划 6 才换成工作台四段）——**刻意的中间态**。

**Tech Stack:** 原生 ESM（`ui/public/*.js`，无构建步）、纯 CSS、vitest + jsdom 做单测、Playwright 做活页验收。

**Spec（设计稿，权威）:** `docs/superpowers/specs/2026-09-20-two-face-shell-redesign-design.md`
**本计划实现它的 §4（四件套复用）/ §5（浮层↔占宽列）/ §6（Progress 不参与宽度）/ §7（那排键）/ §9（对现有代码的影响）/ §10 的计划 4 行。**

**前一份计划**：`docs/superpowers/plans/2026-09-20-plan3-review-actions.md`（已落地于 `main`）。本计划**承接它的右列**（它刚往右列加了第三只面与三只页签），**把它们换个家**。

---

## Global Constraints

计划 1/2/3 的全部约束继续有效，**逐条列出以便实现者不必翻旧计划**。

### 从计划 1 继承

- **正文度量用 `em` 不用 `ch`**。度量常量只写一处：`:root { --measure: 40em }`。
- **CSS 变量：引用的必须定义过**。`ui-app.test.ts` 有一条硬门。
- **禁用 unicode dingbat 做状态图标**（`✻ ✽ ✢ ∙ ◆ ○ ✓ ✕ ■`）——**状态点一律用 CSS 画的形状**。
- **★ 两脸的差异只收在 `body[data-face="work|code"]` 一个属性上**，不许在别处判断"现在是哪张脸"；**且必须写成成对的两条**（一边显、一边 `display:none`）——**只挂一半不是"另一边不出现"，是"另一边以无样式形态出现"**（T6 实测栽过）。
- **中文文案**：界面文案全中文；代码注释中文。
- **每个任务结束必须提交**，commit message 用 `type(scope): 中文描述`，结尾带**你所在环境要求的署名尾注**（**别照抄模板**，子代理各有各的署名规则）。
- **不许改 `eval/persona-ux/**` 的既有档案**——**但本计划对这条有一处例外，见下。**

### 从计划 2/3 继承（**每一条都有对应的实战事故**）

- **★ CSS 规则与它匹配的 markup 必须一起锁，只锁一半等于没锁。**
- **★ 断言要锁"接线表达式本身"，不是"这一带出现过这个名字"。** 一句注释喂得饱 `toContain`。
- **★ "使用"与"引入"是两件事。** `test/ui-shell-imports.test.ts` 是通用护栏。
- **★ 改了测试/断言必须变异验红**：把被锁的那行删掉，看它红不红，再还原。**写完直接绿什么都不证明。**
- **★ 行尾与内容核验用字节，不用 `git status`**：`node eval/persona-ux/_audit-20260919/check-eol.mjs [文件…]`。
- **★ 行尾漂了怎么修**：`rm -f <path> && git checkout HEAD -- <path>`（`git checkout` 单独修不好它，stat 缓存会跳过写入）。
- **★ 计划正文里的每个 `file:line` 锚点都必须来自真实读取。** 本计划的锚点全部取自**本次三条勘查的实测**（右列契约 / 左栏 / 破坏面），**落笔时若与仓库不符，以仓库为准并回写勘误**。
- **★ 每个探针都必须真去点。** 计划 1/2/3 里三条真回归**全是"纯函数绿 + 接线锁绿而走不通"**。
- **★ 别用 `sed -i`**（会把 CRLF 写成 LF 而 `git status` 看不见——T5 实现者踩过）。

### ★ 本计划对「不许改已有探针」的例外（已有裁定，理由在此）

计划 2/3 定的是「不许改 `eval/persona-ux/_audit-20260919/` 里已有的报告与探针」。
**本计划必然让其中约 10 个失效**——它们依赖**页签行 / `split` 档 / `--rail-tree-w`** 这些本计划要拆掉的东西。

**裁定（委托方 2026-09-20 已确认切分时一并定下）**：
- **允许改**本计划失效的那些探针，**并且必须逐条记进报告**（哪个探针、改了什么、为什么非改不可）。
- **旧报告一个字不动**（`sdd/plan2/**` / `sdd/plan3/**` / `verify-*` 的历史结论）。
- **理由**：那些探针是**针对某个已过去状态的验收记录**（一次性、打活页），不是回归测试。

---

## 文件结构

| 文件 | 职责 | 本计划里怎么动 |
|---|---|---|
| `ui/public/core/rail-policy.js` | 右列空间仲裁的**唯一**纯函数 | **任务 1**：拆 `split`、`layout` 改两形态、`RAIL_PANELS` 改 `RAIL_SURFACES` |
| `ui/public/styles.css` | 全部样式 | **任务 2**：`1590-1797` 整块 + `11354-11389`（T7 那 10 条） |
| `ui/public/index.html` | 主壳（含内联控制器） | **任务 3/4**：右列 DOM、`paintRightRail`、`bindRightRail` |
| `test/ui-rail-policy.test.ts` | 策略层锁（**已存在**，586 行） | **任务 1**：~15 条要重写 |
| `test/ui-layout.test.ts` | 骨架锁（**已存在**） | **任务 2**：T7 那 7 条要重写 |
| `eval/persona-ux/_audit-20260919/verify-*.mjs` | 活页探针 | **任务 5**：~10 个失效的更新 |
| `eval/persona-ux/_audit-20260919/verify-rail-surfaces.mjs` | **新建**：本计划的验收探针 | 任务 5 |

**任务之间的依赖**：
```
任务 1（策略层） ← 一切的地基
      ↓
任务 2（样式） ← 消费任务 1 的 layout 取值
      ↓
任务 3（DOM + paintRightRail） ← 消费 1 与 2
      ↓
任务 4（关闭路径 + 同键开/关）
      ↓
任务 5（探针） ← 只有前四个都落地，探针才有东西可量
```

---

### Task 1: 策略层——拆掉 split，改成「占宽列 / 浮层」两形态

**Files:**
- Modify: `ui/public/core/rail-policy.js`（`:29` `SPLIT_MIN_PX`、`:41` `TREE_MIN_PX`、`:78` `RAIL_PANELS`、`:114-208` `railPolicy`、`:246-260` `normalizeRailPref`）
- Test: `test/ui-rail-policy.test.ts`（**重写 ~15 条**）

**Interfaces:**
- Consumes: 无（本任务是地基）
- Produces:
  ```js
  /** 右列的两个形态。docked = 占宽的真列；floating = 浮在对话上的浮层。 */
  export const RAIL_LAYOUTS = /** @type {const} */ (["docked", "floating"]);

  /** 右列能召出的面。一次一只。 */
  export const RAIL_SURFACES = /** @type {const} */ (["tree", "preview", "review"]);

  /**
   * @param {{
   *   viewportWidth: number, sidebarWidth?: number,
   *   preferredFraction?: number, surface?: "tree"|"preview"|"review",
   *   collapsed?: boolean, hasPreviewContent?: boolean,
   * }} input
   * @returns {{
   *   mode: "side"|"overlay", layout: "docked"|"floating",
   *   railWidth: number, centerWidth: number,
   *   surface: "tree"|"preview"|"review", collapsed: boolean,
   * }}
   *   layout="floating" 时 railWidth 是**浮层宽**（对话宽度不受影响）；
   *   layout="docked" 时 railWidth 是从对话那里拿的宽（centerWidth = available − railWidth）。
   */
  export function railPolicy(input = {})
  ```
  **★ 与旧输出的差异（消费方必须知道）**：
  - 旧的 `tree` / `preview` **两个像素字段没了**（不再并排两列）⇒ 改成**一个** `surface` 字段。
  - 旧的 `layout: "split" | "tabbed"` ⇒ 改成 `"docked" | "floating"`。
  - `SPLIT_MIN_PX` / `TREE_MIN_PX` / `RAIL_DEFAULT_SPLIT_RATIO` **删除**。

**背景（现状逐字，来自勘查）**

`rail-policy.js:158`：`const layout = viewportWidth >= SPLIT_MIN_PX ? "split" : "tabbed";`
`rail-policy.js:161-190`：split 分支算 `tree`/`preview` 两列像素（`TREE_MIN_PX = 200` 是树的地板）。
`rail-policy.js:191-199`：tabbed 分支按 `panel` 三选一。
`rail-policy.js:131-142`：窄档 `mode: "overlay"`，`railWidth = closed ? 0 : available`（**全宽 sheet**）。
`rail-policy.js:145-155`：宽/中档 + `collapsed` ⇒ `railWidth = RAIL_COLLAPSED_PX (40)`。

**★ 拆掉 split 的判据**：`split` 要求"两列各留地板"，而 `RAIL_MAX_PX = 360` 与 `TREE_MIN_PX = 200` 决定了**预览列永远 ~160px**（计划 3 的终审实测）。**没有并排列，就没有这个问题。**

---

- [ ] **Step 1: 写失败测试（先锁新形态的两条）**

在 `test/ui-rail-policy.test.ts` 里**新增**一个 describe（旧的先留着，Step 4 再重写）：

```ts
/**
 * 两形态：占宽列 / 浮层（计划 4 · T1）。
 *
 * 拆掉 split 的判据：`RAIL_MAX_PX=360` 与 `TREE_MIN_PX=200` 决定了并排时
 * 预览列永远 ~160px（计划 3 终审实测）。没有并排列就没有这个问题。
 */
describe("右列两形态：docked / floating", () => {
  it("RAIL_LAYOUTS 只有 docked 与 floating", () => {
    expect([...RAIL_LAYOUTS]).toEqual(["docked", "floating"]);
  });

  it("RAIL_SURFACES 是 tree / preview / review（一次一只）", () => {
    expect([...RAIL_SURFACES]).toEqual(["tree", "preview", "review"]);
  });

  it("宽屏给 docked：railWidth 从对话那里拿，centerWidth = available − railWidth", () => {
    const r = side(1920);
    expect(r.layout).toBe("docked");
    expect(r.railWidth).toBeGreaterThan(0);
    expect(r.centerWidth).toBe(1920 - SIDEBAR - r.railWidth);
  });

  it("窄屏给 floating：对话宽度**逐像素不变**（浮层不占位）", () => {
    const r = side(900);
    expect(r.layout).toBe("floating");
    // 浮层宽由预算给，但它**不从 centerWidth 扣**
    expect(r.railWidth).toBeGreaterThan(0);
    expect(r.centerWidth).toBe(900 - SIDEBAR);
  });

  it("★ 任何宽度下都不再返回两列像素（tree / preview 字段消失）", () => {
    for (const vw of [900, 1100, 1440, 1920, 3200]) {
      const r = side(vw);
      expect(r).not.toHaveProperty("tree");
      expect(r).not.toHaveProperty("preview");
      expect(RAIL_SURFACES).toContain(r.surface);
    }
  });

  it("collapsed：两形态下都不占位", () => {
    expect(side(1920, { collapsed: true }).collapsed).toBe(true);
    expect(side(900, { collapsed: true }).collapsed).toBe(true);
  });
});
```

**★ 第四条是本次改动的**分界判据**：`floating` 时 `centerWidth` **不扣**浮层宽 ✓——那是"浮层"与"占宽列"的全部差别 ✓。**它必须能红**（Step 5 会删掉那行逻辑看它红）。

- [ ] **Step 2: 跑测试，确认它红**

Run: `npx vitest run test/ui-rail-policy.test.ts`
Expected: 新 describe 全 FAIL（`RAIL_LAYOUTS is not defined` 之类）；旧 describe 仍 PASS。

- [ ] **Step 3: 实现（`rail-policy.js`）**

3.a 删掉 `SPLIT_MIN_PX`（`:29`）与 `TREE_MIN_PX`（`:41`）与 `RAIL_DEFAULT_SPLIT_RATIO`（`:34`），加：

```js
/** 右列的两个形态。docked = 占宽的真列；floating = 浮在对话上的浮层。 */
export const RAIL_LAYOUTS = /** @type {const} */ (["docked", "floating"]);

/** 右列能召出的面。一次一只（计划 4）。 */
export const RAIL_SURFACES = /** @type {const} */ (["tree", "preview", "review"]);

/**
 * 占宽列模式的最小视口宽。
 * 判据：`docked` 要从对话那里拿宽，而对话有硬地板 CENTER_MIN_PX(416)——
 * 所以只有预算装得下 [对话地板 + 右列下限] 时才给 docked，否则 floating。
 * **这正是旧 `SPLIT_MIN_PX` 那个数想做而没做对的事**：旧的按"视口宽度"判，
 * 而真正该判的是"预算够不够"。
 */
export const DOCK_MIN_BUDGET_PX = CENTER_MIN_PX + RAIL_MIN_PX;
```

3.b `railPolicy` 的展开分支（`:157-208`）整段换成：

```js
  const railWidth = Math.min(railCap, railBudget);
  /**
   * 两形态的判据是**预算**，不是视口宽度。
   * `docked` 从对话那里拿宽 ⇒ 必须装得下 [对话地板 + 右列下限]；
   * 装不下就是 `floating`（浮在对话上，**对话宽度一个像素都不动**）。
   */
  const canDock = railBudget >= DOCK_MIN_BUDGET_PX;
  if (!canDock) {
    return {
      mode: "side",
      layout: "floating",
      // 浮层宽不占位：给它一个读得懂的宽，但 centerWidth **照旧是全部可用宽**
      railWidth: Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, Math.round(available * FLOATING_WIDTH_RATIO))),
      centerWidth: available,
      surface,
      collapsed: false,
    };
  }
  return {
    mode: "side",
    layout: "docked",
    railWidth,
    centerWidth: Math.max(0, available - railWidth),
    surface,
    collapsed: false,
  };
```

并在常量区加：

```js
/** 浮层宽占可用宽的比例（只在 floating 用；它不占位，所以与 RAIL_MAX_FRACTION 无关）。 */
export const FLOATING_WIDTH_RATIO = 0.6;
```

3.c `surface` 的解析（替换旧的 `panel`）：`:119` 那行改成
`const surface = RAIL_SURFACES.includes(input.surface) ? input.surface : "tree";`
（**旧的 `panel` 入参保留一版兼容**：`input.surface ?? input.panel`，并在注释里写明"计划 4 改名，旧的 `panel` 只读不写"。）

3.d 窄档分支（`:131-142`）与 collapsed 分支（`:145-155`）也要带上 `layout` 与 `surface`（窄档给 `floating`✓，collapsed 给 `docked` ✓）。

3.e `normalizeRailPref`（`:246-260`）：`panel` → `surface`，`layout` 的取值改成 `RAIL_LAYOUTS`，去掉 `splitRatio`。

- [ ] **Step 4: 重写旧 describe 里失效的那 ~15 条**

**逐条判**（**这一步不许偷懒**——那些是上一夜挣来的锁）：

| 旧 `it`（行号来自勘查） | 处置 |
|---|---|
| `:41` 边界恰 936 | **改**：`side↔overlay` 的边界**没变**（仍是预算边界），保留但改断言里的字段名 |
| `:52` 900 是假断点 | **保留** |
| `:57` 左栏收起边界下降 | **保留** |
| `:63` split ≥1440 | **删**（`split` 不存在了）→ 换成新的"两形态"describe |
| `:79` 收成 40px 细条 | **保留**（collapsed 语义没变） |
| `:88` 窄档抽屉关着 | **保留** |
| `:97` tabbed 按 panel 给满 | **改**：改成 `surface` 字段 |
| `:102` railWidth 恒在 [240,360]（side 档） | **改**：floating 下不适用（浮层宽是另一套），改成"docked 档恒在 [240,360]" |
| `:110`/`:122` 预算紧时压到对话正好 416 | **保留** |
| `:130` splitRatio 决定比例 | **删**（`splitRatio` 没了） |
| `:136`/`:146` 回落语义 | **改**：`panel:"nope"` → `surface:"nope"` |
| `:376-447` `样式锁：split 真并排` 整个 describe | **删**（那是任务 2 的活，CSS 也要拆） |
| `:454`/`:460`/`:466`/`:474`/`:499`/`:506`/`:513`/`:518`/`:524`/`:535` 树下限/预览列 | **删**（都关于并排两列） |
| `:545-585` T7 那 6 条 | **改**：`panel` → `surface`、`split` → 新形态 |

**★ 删掉的每一条都要在报告里写明"它锁的是什么、为什么随 split 一起消失"**——审查者会看这个 ✓。

- [ ] **Step 5: 变异验红（两处）**

5.a 把 `canDock` 判据改成 `true` 恒真 → **"窄屏给 floating"那条必须红** → 还原。
5.b 把 `floating` 分支的 `centerWidth: available` 改成 `available - railWidth` → **"对话宽度逐像素不变"那条必须红** → 还原。

- [ ] **Step 6: 跑，确认它绿 + 全量零新增**

Run: `npx vitest run test/ui-rail-policy.test.ts && npx vitest run`
Expected: 聚焦全绿；全量 **12±1 条失败**（既有基线），**零新增**。

- [ ] **Step 7: 提交**

```bash
git add ui/public/core/rail-policy.js test/ui-rail-policy.test.ts
git commit -m "..."
```
（提交信息写清：拆 split 的判据、两形态的分界、以及**删掉的那 12 条旧锁各自锁的是什么、为什么随 split 消失**。）

---

### Task 2: 样式层——浮层 / 占宽列 / 可拖

**Files:**
- Modify: `ui/public/styles.css`（`1590-1797` 整块；`11354-11389` 那 10 条）
- Test: `test/ui-layout.test.ts`（T7 那 7 条）

**Interfaces:**
- Consumes: 任务 1 的 `data-layout="docked"|"floating"`、`data-surface="tree|preview|review"`
- Produces: 新的形态选择器（下游任务与探针都按它写）

**★ 勘误（任务 1 落地后回写，`0fe7eb5`）**

1. **任务 1 的实际输出**（逐字）：`layout: "docked" | "floating"`；`surface`（`"tree"|"preview"|"review"`）；**`tree` / `preview` 两个像素字段已整个消失**；`RAIL_PANELS` → `RAIL_SURFACES`；`splitRatio` 入参删除。⇒ **本任务的新 CSS 不许引用任何"两列宽度"变量**（`--rail-tree-w` / `--rail-preview-w` 由任务 3 删）。
2. **★ Step 5 那 7 条的 `:行号` 是勘查时的行号，落笔前必须回仓库现读**（Global Constraints："计划正文里的每个 `file:line` 锚点都必须来自真实读取……以仓库为准并回写勘误"）。**逐条的处置照下表**，行号按现读修正。
3. **★ `test/ui-rail-policy.test.ts` 里那个"样式锁 describe"已由任务 1 处置完毕**（retitle 为"与 split 无关、任务 2 不动的那几条"）。**原 8 条 = 3 条 split 专属已删 + 5 条保留**（实测：该 describe 现存**恰好 5 条 `it`**，在 `:449/:458/:468/:477/:485`）。
   - **本任务不许再动那 5 条** ✗——它们锁的目标（`styles.css` 的放大态左伸量 / `ac-browser-bar` 收纳 / `ac-title` 省略 / E14 空槽 + `pd-handle` / E15 分区标题）**住在本任务的重写范围之外**。
   - **★ 勘误记一笔**：实现者的报告 §3.3 说这个 describe "有 7 条、另 4 条保留"——**两个数都错**（真值 **8 = 3 + 5**，已实测计数）。**本计划初版勘误照抄了它**，审查者当场量出 8 条。**转录别人的计数也算"按以为的代码写"** ✓。
4. **`block()` 取首个匹配**：新 CSS 里 `[data-layout="docked"]` 与 `[data-layout="floating"]` **各只许写一处块规则**（Step 1 的两条断言按首个匹配判，写两处会让断言量到错的那一个）。
   **★ 勘误（实测补充，机制逐字）**：`block()` 的真身（`test/ui-layout.test.ts:28-34`）是从 `` `\n${selector} {` `` 切到**第一个 `\n}`**：
   ```ts
   const start = text.indexOf(`\n${selector} {`);
   const end = text.indexOf("\n}", start);
   return text.slice(start, end);
   ```
   ⇒ **被测的规则必须"选择器行以 ` {` 结尾、`}` 独占一行"**。**写成单行规则 `X { a: b; }` 就没有自己的 `\n}`，切片会一路吞到邻块** ⇒ 断言能在**邻块**的内容里找到目标 ⇒ **这条锁变不红**（本任务首落地实测红因正是它，实现者改成多行块才保住语义）。
   ⇒ **本节所有逐字 CSS 都是多行块**；写新断言时，被测的那条也照此排。
5. **★ 任务 1 删掉的 `:394` 锁，本任务要按新标记重锁——那是挪锁，不是撤锁**。任务 1 删它的理由（"该规则住在任务 2 要重写的右列块里"）成立 ✓，但**"收起后仍有展开入口"这条必须继续有人守**：它是走查 UX-B2 的成果，**是宽档收起态下全站唯一的重开入口**。Step 1 的测试里**补一条**（按新标记锁，并把 markup 一起锁——"锁 CSS 没锁 markup"是这一族的第一号变体）。
6. **别把 brief 里那条"collapsed：两形态下都不占位"当"不占位"的锁用**：它只断言 collapsed 的回声（输入进、输出出）。**真正守"不占位"的是它的兄弟条**（40px 细条 / 窄档抽屉 0 宽 / floating 的 `centerWidth === available`）。任务 1 照 brief 落了这条，本任务知道它的份量即可——**别再给它加戏，也别以为它守住了什么**。

**背景（现状逐字，来自勘查）**

- `:1594` `.right-rail { flex: 0 0 auto; width: var(--rail-width, 288px); … position: relative; z-index: 30; }`
- `:1612` `.right-rail[data-layout="split"] { flex-direction: row; }`
- `:1622` `.right-rail[data-layout="split"] .right-rail-tabs { display: none; }`
- `:1689-1704` **tabbed 三向互斥 + split 两列的宽度**（一堆 `[data-panel=…]` 与 `[data-layout="split"]` 组合）
- `:1707-1715` `.right-rail[data-mode="overlay"] { position: absolute; top/right/bottom: 0; z-index: 60; box-shadow: … }`
- `:1780` 空槽 hider `.right-rail-preview:not(:has(> .preview-dock:not([hidden]))) { display: none; }`
- `:1787` `.right-rail[data-layout="split"] > .right-rail-preview { display: flex; }`（**必须排在 hider 之后**，测试锁了源顺序）

**★ 保留不动的**：`:1725-1767` 的**把手 / 遮罩 / 角标**三块（计划 4 复用它们，见任务 4）。

---

- [ ] **Step 1: 写失败测试**

在 `test/ui-layout.test.ts` 里追加：

```ts
/**
 * 右列的两种形态（计划 4 · T2）。
 *
 * `docked` = 占宽的真列（从对话拿宽）；`floating` = 浮在对话上（**不占位**）。
 * 旧的两列并排那套随 `split` 一起拆了。
 */
describe("右列两形态的样式", () => {
  it("docked：`.right-rail` 是 flex 子项、占宽", async () => {
    const source = await css();
    const rule = block(source, '.right-rail[data-layout="docked"]');
    expect(rule).toMatch(/flex:\s*0\s+0\s+auto|width:/);
  });

  it("floating：浮层是 absolute、**不参与 flex**（不占位才叫浮层）", async () => {
    const source = await css();
    const rule = block(source, '.right-rail[data-layout="floating"]');
    expect(rule).toMatch(/position:\s*absolute/);
  });

  it("★ 整份 CSS 里不再有 split 档的任何规则（拆干净）", async () => {
    const source = await css();
    expect(source).not.toMatch(/\[data-layout="split"\]/);
  });

  it("★ 过渡期：槽显隐同时认 data-surface 与 data-panel（宿主到任务 3 才改名）", async () => {
    const source = await css();
    // 只认 data-surface ⇒ 落地瞬间三只槽全不匹配，整条右列空到任务 3
    for (const s of ["tree", "preview", "review"]) {
      expect(source).toMatch(new RegExp(`\\[data-surface="${s}"\\],\\s*\\[data-panel="${s}"\\]`));
    }
  });

  it("★ 两脸成对：五只召出钮都有脸规则，且**默认是藏的**（漏配对时安全）", async () => {
    const source = await css();
    // 兜底：默认藏 —— 将来新增一只钮忘了配对时，它不会以无样式形态出现在两张脸上
    expect(block(source, ".rail-surface-btn")).toMatch(/display:\s*none/);
    // 成对：Work 一只 + Code 四只
    expect(block(source, 'body[data-face="work"] .rail-surface-btn--work')).toMatch(/display:\s*flex/);
    expect(block(source, 'body[data-face="code"] .rail-surface-btn--code')).toMatch(/display:\s*flex/);
  });
});
```

**★ 第三条是"拆干净"的守卫** ✓——`split` 是这个计划要消灭的字眼 ✓，**留着任何一条规则都会让新形态在某些视口下出怪事** ✓。

**★ 第四条锁的是**成对** ✓（计划 3 的教训 ✓）。

- [ ] **Step 2: 跑，确认它红**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: 新的四条 FAIL（`block()` 抛"找不到选择器"）；**且旧的 T7 那 7 条此时还 PASS**。

- [ ] **Step 3: 实现**

3.a `styles.css:1594-1704` 整块重写：

```css
.right-rail {
  flex: 0 0 auto;
  width: var(--rail-width, 288px);
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-1);
  background: var(--surface-1);
  position: relative;
  z-index: 30;
}

/* docked = 占宽的真列（宽屏）。它从对话那里拿宽，所以要有最小/最大宽。 */
.right-rail[data-layout="docked"] {
  flex: 0 0 auto;
  width: var(--rail-width, 288px);
}

/**
 * floating = 浮在对话上（窄屏）。**不占位**是它的定义——所以 absolute。
 * 它不参与 flex，`centerWidth` 也就不扣它的宽（见 rail-policy.js 的 floating 分支）。
 */
.right-rail[data-layout="floating"] {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--rail-width, 288px);
  z-index: 60;
  border-left: 1px solid var(--border-1);
  box-shadow: -18px 0 48px color-mix(in srgb, var(--text-1) 18%, transparent);
}
/* ★ 收起 = 细条，不是消失（Ruling Q8）。旧世界的 :1607 就是这形状：
   `.right-rail[data-collapsed="true"] { width: 40px; overflow: hidden; }` */
.right-rail[data-collapsed="true"] { width: var(--rail-width, 40px); overflow: hidden; }
/* 细条上那把翻转的展开键——宽档下唯一的重开入口（2026-09-18 走查 UX-B2/B1）。
   它是列的直接子节点（index.html:213-215 的既有注释），所以活得过收起。 */
.right-rail[data-collapsed="true"] .right-rail-collapse i { transform: rotate(180deg); }
/* 只有 overlay（抽屉/浮层）收起才整条藏掉——那里重开交给 rail 外的把手。 */
.right-rail[data-mode="overlay"][data-collapsed="true"] { display: none; }
```

**★ `data-layout="floating"` 接手的是"浮在对话上"的视觉形态** ✓（`mode` 字段还在：`side`/`overlay` 决定预算，`layout` 决定形态）。
**★ 但 `[data-mode="overlay"][data-collapsed="true"] { display: none }`（旧 `:1716`）不许删** ✗——**勘误（Ruling Q8）**：本节初稿写的是"`:1707-1716` 那两条删掉"，**那是错的**：`:1707-1715`（overlay 的 absolute 定位）可以删（被 `floating` 接手 ✓），**但 `:1716` 那条管的是"收起时整条藏掉"，它与形态无关**——删了它，overlay 收起就既不是细条也不是隐藏，会剩一条 40px 的浮条挂在对话上。

3.b `:1682-1704` 的槽显隐重写：

**★ 勘误（Ruling Q7）：用 `:is()` 同时认两个属性——别只写 `[data-surface]`。**
宿主写 `data-surface` 是**任务 3** 的事；本任务若只按 `[data-surface]` 判，落地瞬间三个槽全不匹配 ⇒ **整条右列空到任务 3**（比任务 1 那个窗口坏得多）。

```css
/* 一次一只：只有当前面是 flex，另两只 display:none。
   ★ 过渡期同时认 `data-surface`（本计划的新契约）与 `data-panel`（宿主到任务 3 才改名）。
     两半都在时值相同，`:is()` 并起来即可；任务 3 摘掉 `[data-panel]` 那半（有锁）。 */
.right-rail > .workspace-file-tree,
.right-rail > .right-rail-preview,
.right-rail > .right-rail-review {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: none;
}
.right-rail:is([data-surface="tree"], [data-panel="tree"]) > .workspace-file-tree,
.right-rail:is([data-surface="preview"], [data-panel="preview"]) > .right-rail-preview,
.right-rail:is([data-surface="review"], [data-panel="review"]) > .right-rail-review {
  display: flex;
  flex-direction: column;
}
```

**★ 顺带修掉一处旧账**：旧规则只覆盖 tree/preview 两只槽，**`review` 槽没有"一次一只"的规则**（计划 3 里它靠宿主写 `hidden` 兜着）。上面的新规则**把三只槽一律纳入** ✓——这正是"一次一只"第一次真正成立。

**★ 特异性核对（别改坏 E14）——勘误：本节初稿把数算错了。**
初稿写"新显形规则 = `(0,2,0)`，hider = `(0,3,0)`，hider 仍胜" ✗——**`:is()` 取参数的最高特异性**，两个参数都是属性选择器 ⇒ `:is(...)` = `(0,1,0)` ⇒ 显形规则 = `.right-rail`(0,1,0) + `:is`(0,1,0) + `.槽`(0,1,0) = **`(0,3,0)`**，**与 hider 相等**。
⇒ **hider 只靠源顺序赢**（显形规则在前、hider 在后），**而没有任何锁守着那个顺序**——仓库自己删掉的那条旧注释警告的就是这个坑（"两者特异性同为 (0,3,0)"）。
⇒ **本任务必须补一条源顺序锁**（`indexOf(显形) < indexOf(hider)`），**变异靶 = 把 hider 挪到显形规则之前**。

**★ 槽也要两脸成对（勘误：初稿只做了钮的成对，漏了槽）**

**问题**：Work 脸那条既有规则 `body[data-face="work"] .right-rail-review { display: none }`（`styles.css:11336`）是 **(0,2,1)**，**压不过显形规则的 (0,3,0)** ⇒ 持久偏好为 `review` 时，**Work 脸上真的会出现「改动」面板**（宿主 `rail.dataset.panel` 不带脸钳制、policy 也不认脸）。设计 §3 是"Work 脸完全不出现改动/PR" ⇒ **设计违规，且它活过任务 3**（`[data-surface]` 那半特异性一样），不是中间态。

```css
/* 两脸的槽也成对（计划 1 的规矩）。Work 脸**恒出树**——计划 4 的刻意中间态
   （Work 脸那个召出钮暂挂树，工作台四段归计划 6）；另两只槽在 Work 脸不许出现。
   ★ 特异性 (0,3,1) 压过显形规则的 (0,3,0)——赢在特异性，不是源顺序。 */
body[data-face="work"] .right-rail > .workspace-file-tree {
  display: flex;
  flex-direction: column;
}
body[data-face="work"] .right-rail > .right-rail-preview,
body[data-face="work"] .right-rail > .right-rail-review { display: none; }
```

**★ 不给 Code 脸加"藏树"那条** ✗——设计 §7 的 `Files` 在 `⋮` 菜单里、**点开复用同一个右列** ⇒ Code 脸在 `surface="tree"` 时**必须**能出树。

**★ 这一段的判据从"两列并排"变成"一次一只"** ✓——旧的 `[data-panel=…]` 全部换成 `[data-surface=…]` ✓。

3.c 空槽 hider（`:1780`）**保留**，但它现在**不需要**排在 `split` 那条之前了（`:1787` 删了）✓——**把它的注释改对**（那句"必须排在 split 之后"随 split 一起消失 ✓）。

3.d `:11354-11389` 那 10 条 T7 脸规则：`data-panel` → `data-surface`、删掉 `[data-layout="split"]` 那条（`:11377`）✓。

3.e **新增「召出钮」的两脸成对规则**（Step 1 第 4 条测试要的红靠这一段变绿——**计划初版漏了它，是本任务必须自己写出来的那部分**）：

```css
/* 召出钮：Work 脸一只（暂挂树）／Code 脸四只（终端·改动·预览·更多）。
   ★ 写法是「先全藏、再按脸显」，不是「逐只 display:none」：
     前者在**将来新增一只钮忘了配对时**默认藏住（安全的一侧）；
     后者会把漏掉的那只**以无样式形态放到两张脸上**（Global Constraints 里 T6 实测栽过）。 */
.rail-surface-btn { display: none; }
body[data-face="work"] .rail-surface-btn--work { display: flex; }
body[data-face="code"] .rail-surface-btn--code { display: flex; }
```

**★ 三条规则缺一不可**：少了兜底那条，"漏配对"就没有安全网；少了任一条脸规则，那一脸就是空的。
**★ `block()` 取的是行首的规则块**——兜底那条必须**独立成块**写（`.rail-surface-btn { … }`），**别并进选择器组**，否则 `block(".rail-surface-btn")` 找不到它。

- [ ] **Step 4: 跑，确认它绿**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: 新四条 PASS；**T7 那 7 条此时会红**（它们锁的是 `data-panel`）——**Step 5 处理**。

- [ ] **Step 5: 重写 T7 那 7 条**

逐条：`:280`（tab 行第三只按钮 → 改成**召出钮**）· `:286`（两脸成对 → 保留，改选择器）· `:294`（Work 脸落回树 → **删**，那逻辑随 `panel` 消失）· `:300`（tabbed 三向互斥 → 改成"一次一只"）· `:309`（split 档不出现 → **删**）· `:323`（hunk 画法一份 → **保留不动**）· `:338`（split 档 announceStatus → **删**，那个 split 分支不存在了）。

**★ `:338` 那条删掉时要记一笔**：它是计划 3 为 I4（死按钮）加的锁 ✓——**I4 的根因（split 档没有第三列）随 split 一起消失** ✓，所以这条锁**完成了它的使命** ✓。

- [ ] **Step 6: 变异验红**

6.a 把 `floating` 那条的 `position: absolute` 删掉 → **"浮层不参与 flex"那条红** → 还原。
6.b 把兜底那条 `.rail-surface-btn { display: none }` 改成 `display: flex` → **"两脸成对"那条红**（五只钮会在两张脸上都出现）→ 还原。
（★ 初版这条写的是"把 Work 脸那条 `display: none` 改成 `display: flex`"——**勘误**：3.e 定稿后写法已改成"先全藏、再按脸显"，变异靶随之上移到兜底那条。）

- [ ] **Step 7: 提交**

---

### Task 3: 宿主层——召出钮 + `paintRightRail` 落新形态

**Files:**
- Modify: `ui/public/index.html`（`:204-234` 右列 DOM、`:5837-5922` `paintRightRail`、`:5808-5835` `railVisibilityNow`、`:2549-2561` 的 I4 死代码段）
- Modify: **`ui/public/app.js`**（`:5576-5588` 的对话头部串——**召出钮行拼在这里**，见 3-H）
- Test: `test/ui-rail-policy.test.ts`（宿主接线那几条）

**Interfaces:**
- Consumes: 任务 1 的 `railPolicy` 新输出；任务 2 的 `data-layout` / `data-surface`
- Produces: 新的右列 DOM（召出钮 + 槽）与 `paintRightRail` 的落点

**★ 勘误（任务 1 落地后回写，`0fe7eb5`）——本节有一处承重缺口，必须补**

> **缺口**：Step 3 的清理清单只写了 `rail.dataset.panel`（`:5851-5854`）**一处**，而宿主读旧名 `panel` 的地方**有五处**；Step 2 的四条测试**也只锁 `rail.dataset.panel`**。⇒ **照本节做完，测试全绿，而 `railPolicy({ panel: pref.panel })` 仍然传着 `undefined`，右列永远画树**——锁住了写的那一半，漏掉的那一半才是承重的（本仓最贵那一族，第六次）。

**3-A 五处读点 + 一处写点，逐字（已亲读核实）**

| 处 | 现状 | 改成 |
|---|---|---|
| `:5816` `railVisibilityNow()` | `railPolicy({ …, panel: pref.panel, … })` | `surface: pref.surface` |
| `:5847` `paintRightRail()` | `railPolicy({ …, panel: pref.panel, … })` | `surface: pref.surface` |
| `:5853` | `rail.dataset.panel = pref.panel` | `rail.dataset.surface = pref.surface` |
| `:5904`（tab 的 `aria-pressed` 一带） | 读 `pref.panel` | 读 `pref.surface` |
| `:5941` `bindRightRail()` | `rail.dataset.panel = pref0.panel` | `rail.dataset.surface = pref0.surface` |
| **写点** `:5934` `showRailPanel()` | `saveRailPref({ panel, collapsed: false })` | `saveRailPref({ surface, collapsed: false })` |
| `:5815` / `:5846` | `railPolicy({ …, splitRatio: pref.splitRatio })` | **删掉这一行**（任务 1 已删该入参，`pref.splitRatio` 恒 `undefined`——死键）。锁：`expect(html).not.toMatch(/(?<![\w.$])splitRatio(?![\w-])/)` |

**★ 顺带把策略层的注释也改对**（复审的越界观察）：`rail-policy.js:237-240` 的注释只写了"连五处读点一起摘"，**没提"裁决要翻回 `obj.surface ?? obj.panel`"那一半**——未来读代码的人会照着注释少摘一半。本任务动那个函数时就手改掉，让注释与本节的 3-B′ 一致。

**★ 3-G（Ruling Q7）——摘掉 CSS 里那半过渡垫**

任务 2 的槽显隐规则**同时认 `data-surface` 与 `data-panel`**（否则本任务落地前右列会空一整段）。本任务把 `[data-panel=…]` 那半**摘掉**，规则收成只认新契约。**有锁**：

```ts
  it("★ 过渡垫已摘：槽显隐不再认旧属性 data-panel", async () => {
    const source = await css();
    expect(source).not.toMatch(/\[data-panel="(tree|preview|review)"\]/);
  });
```

**★ 这条与任务 2 的那条互为反面**：任务 2 锁"两个都在"，本任务锁"旧的没了"。**两条都写死了同一个字符串** ⇒ 谁少做一半，必有一条红。

**★ 3-H（Ruling Q9）——召出钮行不在 `#right-rail` 里，在对话头部**

本节 Step 1 的 DOM 逐字把 `.rail-surface-bar` 放在 `#right-rail` **里面** ✗——**那是错的容器，而且错得会让任务 4 的核心要求不可能成立**：

- **设计稿 §3 的两张图里，那排键在对话头部那一行**（与标题同行、右对齐）：Work 脸的 `半导体行业知识 ▾` 右边那只蓝键、Code 脸的 `＞_ ⊞ ▷ ⋮` 四键，**都在标题行里**。
- **承重的理由**：菜收起时（side 收成 40px 细条 / overlay 下 `display:none`），**列里的任何东西都跟着走** ⇒ 键住在列里 ⇒ **列一关就再没有那个键** ⇒ 设计 §4 与任务 4 的"**再点同一个键**"**永远不可能发生** ✗。（这正是本节 `:213-215` 那段既有注释在讲的事：收起键之所以是列的直接子节点，就是为了活过收起。）
- **对话头部在哪**：`app.js:5582` —— `mainEl.innerHTML = '<div class="back-bar">' + chatHead + '</div>' + …`，`chatHead` 是 `.dh-kicker` + `.chat-title#chat-title`（`app.js:5576-5580`）。**那排键挂进这个 `.back-bar`**（与标题同行，`margin-left:auto` 右对齐）。
- ⇒ **本任务的 Files 要加 `ui/public/app.js`**（只加那一行渲染，别动别处）。

**锁（本任务当场能红）**：

```ts
  it("★ 召出钮行在对话头部（app.js 的 .back-bar），不在右列里", () => {
    const appJs = readFileSync(join(process.cwd(), "ui/public/app.js"), "utf-8");
    expect(appJs).toMatch(/back-bar[\s\S]{0,600}?rail-surface-bar/);
    // 列里不许有：列一关（40px 细条 / overlay 隐藏）它就没了，同键开关就不可能
    const rail = html.slice(html.indexOf('id="right-rail"'), html.indexOf('id="right-rail-handle"'));
    expect(rail).not.toMatch(/rail-surface-bar/);
  });
```

**★ 诚实说明这条锁的"红"从哪来**：它在实现前**本来就绿**（`rail-surface-bar` 此刻还不存在），所以它**不是 TDD 的红驱动**，而是**判别器**——**变异靶**：把 `.rail-surface-bar` 放进 `#right-rail` 里面 ⇒ **第二条断言必红** ✓。（别把它当"先红后绿"来演。）

**3-B 摘掉任务 1 修复轮加的过渡垫**：`normalizeRailPref` 现在**在返回值里带一个 `panel` 同值别名**（`panel: surface`），那是任务 1 与本节之间的临时垫子。**本任务连同上面五处读点一起摘掉它**。**只摘一半 = 上面那条缺口原样复现。**

```ts
  it("★ 过渡垫已摘：normalizeRailPref 的返回值不再带旧名 panel", () => {
    const out = normalizeRailPref({ surface: "preview" });
    expect(out.surface).toBe("preview");
    expect(Object.prototype.hasOwnProperty.call(out, "panel")).toBe(false);
  });
```

**★ 这条与 3-C 是一对**：3-C 说"宿主不许再读旧名"，这条说"策略层不许再发旧名"。**两条要一起红、一起绿**——只做一条，缺口就从这头挪到那头。

**★ 3-B′（Ruling Q6）：还要**翻回裁决**——但**不是"纯 `obj.surface`"**，是 `obj.surface ?? obj.panel`**

过渡垫其实有**两半**，别只摘一半：

| 半 | 形状 | 处置 |
|---|---|---|
| **别名** | 返回值上的 `panel: surface` | **摘掉** ✓（宿主不再读它） |
| **裁决** | 读入时 `obj.panel ?? obj.surface`（**panel 优先**） | **翻回 `obj.surface ?? obj.panel`** ✓ |

**为什么过渡期是 panel 优先**：窗口里宿主唯一活着的写点是 `index.html:5934` 的 `saveRailPref({ panel })`，`surface` 只是 normalize 写回存储的影子 ⇒ **打架时 panel 才是用户这一次的意图**（实现者修复轮自己加的，理由成立 ✓，已复算过读→并→写回路）。

**★ 但摘除时不许写成"纯 `obj.surface`"** ✗——那会**连旧键迁移一起删掉**：存储里只有 `{panel:"review"}` 且此后没再点过任何面钮的用户，`surface` 会落回 `"tree"`，**偏好丢了**。而"旧键只读不写"是本仓的既有哲学（降级回滚不丢偏好）。
⇒ **正确形状：`obj.surface ?? obj.panel`**——新键优先，旧键仍作**回退**读得到 ✓。

```ts
  it("★ 裁决已翻回：两键并存时 surface 胜（过渡期的 panel 优先已摘）", () => {
    expect(normalizeRailPref({ surface: "preview", panel: "review" }).surface).toBe("preview");
  });

  it("★ 旧键迁移仍在：存储里只有 panel 时照样读得到", () => {
    expect(normalizeRailPref({ panel: "review" }).surface).toBe("review");
  });
```

**★ 这两条要一起绿**：只翻裁决不删迁移读 = 丢偏好；只删迁移读不翻裁决 = 过渡语义留着。**变异靶**：把裁决写回 `obj.panel ?? obj.surface` ⇒ 第一条红 ✓；把迁移读删成 `obj.surface` ⇒ 第二条红 ✓。

**3-C Step 2 必须补一条锁（现有四条锁不到承重的那一半）**

```ts
  it("★ 宿主不再从 pref 上读旧名 panel（改名要连调用点一起改）", () => {
    // 两端都挡：前缀（xpref.panel）与后缀（pref.panelX）都不许漏
    expect(html).not.toMatch(/(?<![\w.$])pref0?\.panel(?![\w-])/);
    expect(html).toMatch(/(?<![\w.$])pref0?\.surface(?![\w-])/);
    // 写点一并锁：存储里只许再写新键
    expect(html).not.toMatch(/saveRailPref\(\{\s*panel\b/);
    expect(html).toMatch(/saveRailPref\(\{\s*surface\b/);
  });
```

**3-D `--center-min` 那处（`:5899-5902`）本节时没有能红的靶**：Step 5.b 让"改回 `side` 看任务 5 的探针红"——**而任务 5 的探针此刻还不存在**，等于此刻没锁。**补一条当场能红的静态锁**：

```ts
  it("★ `--center-min` 只在 docked 下写（浮层不占位，对话不让宽）", () => {
    const at = html.indexOf('"--center-min"');
    expect(at).toBeGreaterThan(-1);
    const near = html.slice(at, at + 160);   // ★ 锚在 token 上、往后看谓词
    expect(near).toMatch(/layout\s*===\s*"docked"/);
    expect(near).not.toMatch(/mode\s*===\s*"side"/);
  });
```

**★ 勘误 3-D 的自我订正（回写时实测出来的）**：本条初稿写的是 `toMatch(/layout === "docked"[\s\S]{0,240}?--center-min/)`——**方向反了**。仓库里 token 在谓词**之前**（`:5900` 是 `"--center-min",`，`:5901` 才是谓词）⇒ **那条永假、永远绿不了**，实现者会卡在一条做不绿的测试上。改成"锚 token、往后看谓词"（如上）：两侧现在都**当场红** ✓（实测：`near` 含 `mode === "side"` ✓、不含 `layout === "docked"` ✓）。

**3-E ★ `:2555-2560` 整段删掉——那是 I4 的补救，而 I4 随 split 一起消失**

`:2553` 的 `showRailPanel("review")` 之后跟着这段（已亲读核实）：

```js
    // split 档下 review 不占列（railPolicy 边界 + styles.css 把槽藏掉）——
    // 点了这个 CTA 却什么都看不见，等于一个死按钮（终审 I4）。给 split
    // 真开一列是三列空间预算的单独立项，这里只把话说出来。
    if (document.getElementById("right-rail")?.dataset.layout === "split") {
      announceStatus("「改动」面板在宽档右栏里不占列——把窗口拉窄（右栏收成单列）即可看到");
    }
```

**处置：`:2555-2560` 整段（含注释）删掉** ✗——**不是改名**。理由：
- **`split` 不存在了 ⇒ `=== "split"` 永假 ⇒ 这是死代码**（实测：全仓 `dataset.layout === "split"` **恰好 1 处**，就是它）。
- **改名成 `"floating"` 会把一句假话复活** ✗——新模型里 review 恒有自己的槽，浮层只是不占宽，**看得见**；说"不占列，拉窄才看得到"是错的。
- **设计稿 §9**："I4 与三列空间预算两条欠账在此自然消失（没有 split 就没有死按钮）"✓——**删掉这一段就是 I4 结案的证据**，写进报告。
- **锁**：`expect(html).not.toMatch(/dataset\.layout\s*===\s*"split"/)`（现在红 ✓，删完绿 ✓）。

**★ 3-F 值改名 ≠ 键改名（本节最容易漏的一类）**：本节的改名有两层——**键**（`panel` → `surface`，见 3-A）与**值**（`"split"` → `"docked"|"floating"`）。3-A 的五处是键，`:2558` 是值。**`paintRightRail` 的 `:5879`/`:5883` 也是值改名**（`p.layout === "split"`，两处都**删**，见 Step 3 表）✓。**别只 grep `panel`** ✗。

**背景（现状，来自勘查）**

- `#right-rail` 有 6 个静态子节点（tab 行 / 收起键 / 拖柄 / 三个槽）✓
- `paintRightRail()` 做了 **11 件事** ✓（`data-*` / scrim / handle / CSS 变量 / 槽的 hidden / `--rail-expand-inset` / `--center-min` / tab 的 aria-pressed / 收起键 / drag）✓
- `showRailPanel(panel)` = `railOpenedThisSession = true; saveRailPref({ panel, collapsed: false });` ✓

---

- [ ] **Step 1: 改 DOM（`index.html:204-234`，逐字见下）**

**改前四处**：
① `#right-rail` 的 `data-panel="tree"` → **`data-surface="tree"`**；
② `data-layout="tabbed"` → **`data-layout="docked"`**；
③ **`:205-212` 的整个 tab 行——整段删掉**（**不是"换成召出钮行"**：召出钮行**不住在这条列里**，见 **3-H**；键住在列里 ⇒ 列一关就没键 ⇒ 任务 4 的"再点同一个键"永远不可能成立）；
④ **召出钮行加进对话头部**：`app.js:5582` 的 `mainEl.innerHTML = '<div class="back-bar">' + chatHead + '</div>' + …`——把钮行拼在 `chatHead` **之后、该 `</div>` 之前**（与标题同行，`margin-left:auto` 右对齐）。**`app.js` 在本任务的 Files 里** ✓。

**钮行逐字**（**两脸的钮都在 DOM 里**，靠 `body[data-face]` 成对显隐——计划 1 的规矩）。
**★ 这段 HTML 要拼进 `app.js` 的对话头部字符串，不是写进 `index.html`**（见 ④ 与 3-H）：

```html
      <!-- 召出钮行（计划 4）。一次一只。**两脸各一套，都在 DOM 里**，
           靠 body[data-face] 显隐（计划 1 的规矩：差异只收在那一个属性上，且必须成对）。
           ★ 终端是**占位**：宿主没有交互式终端端点，点了给一句人话（见 Step 3）。
           ★ 「更多」里本计划只放一项（文件）；其余项归计划 7。 -->
      <div class="rail-surface-bar" role="group" aria-label="右列面板">
        <!-- Work 脸：一只（**暂挂树**——计划 6 换成工作台四段） -->
        <button type="button" class="rail-surface-btn rail-surface-btn--work" data-rail-surface="tree"
          id="rail-surface-work-tree" aria-pressed="true" aria-controls="workspace-file-tree">文件</button>
        <!-- Code 脸：四只 -->
        <button type="button" class="rail-surface-btn rail-surface-btn--code" data-rail-surface="terminal"
          id="rail-surface-terminal" aria-pressed="false" title="终端还没接">终端</button>
        <button type="button" class="rail-surface-btn rail-surface-btn--code" data-rail-surface="review"
          id="rail-surface-review" aria-pressed="false" aria-controls="right-rail-review">改动</button>
        <button type="button" class="rail-surface-btn rail-surface-btn--code" data-rail-surface="preview"
          id="rail-surface-preview" aria-pressed="false" aria-controls="right-rail-preview">预览</button>
        <button type="button" class="rail-surface-btn rail-surface-btn--code" data-rail-surface="more"
          id="rail-surface-more" aria-pressed="false" aria-haspopup="menu" aria-expanded="false">更多</button>
        <!-- 「更多」的菜单：本计划只有一项（文件）。照 #workspace-git-menu / #executor-model-menu
             的既有做法（原生 div + hidden + 点外关闭），**先读那两个的实现再写**。 -->
        <div class="rail-more-menu" id="rail-more-menu" role="menu" hidden>
          <button type="button" class="rail-more-item" role="menuitem" data-rail-surface="tree">文件</button>
        </div>
      </div>
```

**★ 四个 `id` 必须与 `aria-controls` 对上** ✓（`right-rail-review` / `right-rail-preview` / `workspace-file-tree` 三个槽 id **没变** ✓，与既有 `:222/:224/:227` 一致 ✓）。

**★ 那句 `:213-215` 的注释要改** ✗——它写的是「split 档 tab 行整排隐藏…键若随行消失，宽档收不起也回不来」✓，而 **split 不存在了** ✓。改成：*"收起键仍是右列的直接子节点（不在这排钮里）：一次一只的那排钮随面走，而收起键要在**每一只面**下都在。"*

- [ ] **Step 2: 写失败测试（宿主接线）**

```ts
describe("召出钮与 paintRightRail 的接线（计划 4 · T3）", () => {
  const html = readFileSync(join(process.cwd(), "ui/public/index.html"), "utf-8");
  const appJs = readFileSync(join(process.cwd(), "ui/public/app.js"), "utf-8");

  it("★ 两脸的钮都在**对话头部**渲染（app.js），且都带 data-rail-surface", () => {
    // ★ 必须读 app.js：钮行由 app.js 拼进 .back-bar，index.html 里一个字都没有
    expect(appJs).toMatch(/back-bar[\s\S]{0,600}?rail-surface-bar/);
    expect(appJs).toMatch(/data-rail-surface="tree"[\s\S]{0,80}?rail-surface-btn--work/);
    for (const s of ["terminal", "review", "preview", "more"]) {
      expect(appJs).toMatch(new RegExp(`data-rail-surface="${s}"`));
    }
  });

  it("★ 每个 aria-controls 指向的槽 id 都真实存在（槽在 index.html，钮在 app.js）", () => {
    for (const id of ["workspace-file-tree", "right-rail-preview", "right-rail-review"]) {
      expect(html).toMatch(new RegExp(`id="${id}"`));             // 槽：index.html
      expect(appJs).toMatch(new RegExp(`aria-controls="${id}"`)); // 钮：app.js
    }
  });

  it("paintRightRail 落的是 data-surface（不是 data-panel）", () => {
    expect(html).toMatch(/rail\.dataset\.surface\s*=/);
    expect(html).not.toMatch(/rail\.dataset\.panel\s*=/);
  });

  it("★ 两个并排宽变量被拆掉（没有两列了）", () => {
    expect(html).not.toMatch(/--rail-tree-w/);
    expect(html).not.toMatch(/--rail-preview-w/);
  });
});
```

- [ ] **Step 3: 实现 `paintRightRail`（`:5837-5922`，**逐处改**）**

按勘查给的逐行清单，**十一处里改六处、删三处、留两处**：

| 现状（行号） | 处置 |
|---|---|
| `:5851-5854` 写 `dataset.mode/layout/panel/collapsed` | **改**：`panel` → `surface`；`layout` 取值随任务 1 |
| `:5857` scrim 的 `p.mode === "overlay"` | **改** → `p.layout === "floating"`（浮层才有遮罩） |
| `:5863-5864` handle 的显示 + 角标 | **留** ✓——**★ 勘误：这条已实测核过，是对的，别"顺手改好"** ✗。判据 `!(p.collapsed && (p.mode === "overlay" \| context === "welcome"))` 在**任务 2 恢复细条之后**重新正确：docked/side 收起时列还在（40px 细条 + 翻转的展开键=入口）⇒ 不需要把手；只有 overlay/欢迎页收成 0 宽 ⇒ 靠把手。**别把它放宽成 `!p.collapsed`**（那会让宽档收起时同时出现"细条 + 把手"两个入口，而细条上那把键才是主入口）。 |
| `:5866-5868` 写 `--rail-width` / `--rail-tree-w` / `--rail-preview-w` | **改**：**删掉后两个**（没有两列了）✓ |
| `:5879` `previewSlot.hidden = p.layout === "split" && p.preview === 0` | **删**（一次一只由 CSS 按 `data-surface` 管）✓ |
| `:5883` `reviewSlot.hidden = p.layout === "split"` | **删**（同上）✓ |
| `:5891-5894` `--rail-expand-inset` | **留**（坞的放大仍要左伸） |
| `:5899-5902` `#center-row` 的 `--center-min` | **改**：判据从 `p.mode === "side"` 改成 **`p.layout === "docked"`**（浮层不占位，对话不必让）✓ |
| `:5903-5905` 三只 tab 的 `aria-pressed` | **改**：对 `[data-rail-surface]` 处理；`more` 那只不参与 ✓ |
| `:5907-5913` 收起键的 aria + 角标 | **留** |
| `:5918-5920` drag 的 aria-valuenow/text | **留**（可拖仍在，委托方定 ✓） |

**★ 终端那只钮的占位行为**：点它 → `announceStatus("终端还没接——宿主没有交互式终端端点")` ✓，**不要 `disabled`** ✗（disabled 的按钮读屏会跳过，用户不知道它存在 ✓——**给了话就要能听到** ✓）。

- [ ] **Step 4: 跑，确认它绿**

Run: `npx vitest run test/ui-rail-policy.test.ts test/ui-layout.test.ts`
Expected: 新增四条 PASS；任务 2 改过的那些 PASS。

- [ ] **Step 5: 变异验红**

5.a 把 `--rail-tree-w` 写回去 → **"两个并排宽变量被拆掉"那条红** → 还原。
5.b 把 `#center-row` 那处的判据从 `docked` 改回 `side` → **3-D 那条静态锁（`--center-min` 只在 docked 下写）必红** → 还原。
**★ 勘误**：初版这条写的是"**探针的判据 5 会红（任务 5 建）**"——**那个探针此刻还不存在，等于此刻没锁**；3-D 补了一条当场能红的静态锁来顶它。

- [ ] **Step 6: 提交**

---

### Task 4: 关闭路径四条 + 同键开/关

**Files:**
- Modify: `ui/public/index.html`（`bindRightRail` `:5937-6065`）
- Test: `test/ui-rail-policy.test.ts`

**★ 背景已按「任务 3 落地后」重写**（任务 3 的 DOM 重做把本节多数改动做掉了；原文那些行号与"待改"标记**已作废**，别照旧文找）：

**四条关闭路径的现状（全部已在 `index.html` 的 `bindRightRail` 里核过）**

1. **`×`（收起键）**：点 `#right-rail-collapse` → 按 `railVisibilityNow().vis.collapsed` 判开/关 ✓ **已好**
2. **遮罩**：`#right-rail-scrim` 有**自己的**直接监听器（`document.getElementById("right-rail-scrim")?.addEventListener("click", …)`），**从来不在列的委托里** ⇒ 任务的 Q11"顺带核"那件**已核：它一直是好的** ✓
3. **`Esc`**：判据 **已由任务 3 的修复轮 1 改成 `current.dataset.layout !== "floating"`** ✓（与遮罩同轴；有锁，变异靶 = 改回 `mode !== "overlay"`）——**本节不要再改它** ✗
4. **同键开/关**：**未做** ✗ ——**这是本节唯一的核心新增**。

⇒ **本节只剩三件**：**① 同键开/关**（新功能）· **② `showRailPanel` → `showRailSurface` 的改名 + 调用点签名**（见本节 Q2 勘误）· **③ 写者锁**（见本节新添的 Q14 小节）。

- [ ] **Step 1: 写失败测试（同键开/关）**

```ts
  it("★ 同一个键开/关：已开的那个面再点一下就收起", () => {
    // 点已开的面 ⇒ railClose()；点**另一个**面 ⇒ 换面（不是收起）
    expect(html).toMatch(/data-rail-surface[\s\S]{0,240}?railClose\(\)/);
    expect(html).toMatch(/dataset\.surface\s*===\s*next[\s\S]{0,120}?railClose/);
  });
```

**★ 第二条断言是"换面 ≠ 收起"** ✓——**这条最容易写错** ✓（把"点已开的"与"点另一个"混成一件事，就会变成"点任何键都收起" ✗）。

- [ ] **Step 2~6（★ 已按任务 3 的落地重写——原文那几条"待改"多已做掉，照旧文会重复劳动或改坏）**

**已经做完的（别重做 ✗）**：
- 委托的**选择器**：T3 建新钮行时就是这么写的——委托挂在 `#main-panel`，用 `[data-rail-surface]` 取值 ✓
- 委托的**挂点**：已搬到 `#main-panel` ✓（Q11 那件已落地，见本节 Q11 小节的"已作废"标记）
- `Esc` 的判据：已改成 `dataset.layout !== "floating"` ✓（修复轮 1 · F4）
- `preview:reveal` / `review:reveal` 的派发：已在 `#main-panel` 的委托里 ✓
- `saveRailPref({ surface })` 的**键**：T3 的 3-A 表已改 ✓（有锁）

**本节要做的（就这三件）**：

**① 同键开/关（新功能）**——现在点了面钮**一律 `showRailPanel(surface)`**：
- 点的**就是当前那只面** ⇒ `railClose()`（收起）
- 点的**是另一只面** ⇒ 换面（**不是**收起）

**② 改名 `showRailPanel` → `showRailSurface`**（定义在 `bindRightRail` 上方，紧邻 `saveRailPref`）：**全部调用点一起改**，并把调用点的签名收成对象（见本节 Q2 勘误）。

**③ 写者锁**（见本节新增的 Q14 小节）。

**★ 勘误（Ruling Q2，预检扫描翻出的真实缺口）——`showRailPanel` 的改名有第二处调用点**

- **定义**：`index.html:5932-5935`
- **★ 调用点（计划 3 刚落地的那个按钮）**：`index.html:2549-2561` —— `handleChangeCardClick` 的 `open-review-panel` 分支**直接调 `showRailPanel("review")`**。
  ⇒ **只改定义不改它 = `ReferenceError`，按钮点了报错**——正是本计划要杀的那族死按钮（I4 同族）。
- **签名不匹配**：`:2549-2561` 传的是**位置参数** `"review"`，而新函数收 `{ surface }`。**裁定：改调用点为 `showRailSurface({ surface: "review" })`**（显式、与 `saveRailPref` 的键一致），**别让新函数既收字符串又收对象** ✗（两种形状都给 = 谁都说不清契约）。
- **锁（本任务当场能红）**：
  ```ts
  it("★ 改名连调用点一起改（计划 3 那个按钮会 ReferenceError）", () => {
    expect(html).not.toMatch(/(?<![\w.$])showRailPanel(?![\w-])/);
    expect(html).toMatch(/showRailSurface\(\{\s*surface:/);
  });
  ```
  **变异靶**：只改定义、留 `:2549-2561` 不动 ⇒ 第一条红 ✓。

**★ 勘误（承接任务 3）：`{ panel }` → `{ surface }` 那半已经做完了** ✓——任务 3 的 3-A 表把写点 `:5934` 的键改成了 `surface`（并有锁 `saveRailPref({ surface`）。**本任务只需两件**：① `showRailPanel` → `showRailSurface` 的**改名**（定义 + 全部调用点）；② 调用点的**签名**改成 `{ surface: "review" }`（见上面的 Ruling Q2 勘误）。**别去"再改一次键"**——那会让 3-C 的锁红。

**★ 那两处 `preview:reveal` / `review:reveal` 的派发（`:5959` / `:5963`）要保留** ✓——坞与审阅面板靠它们唤回 ✓。

**★ 勘误（Ruling Q11）——点击委托的**挂点**要跟着钮一起搬，否则每只键都是死的**

> **【已作废——任务 3 落地时已做掉，别重做 ✗】** 委托**现在就挂在 `#main-panel` 上**（T3 建新钮行时一并做的），下面那条静态锁也已满足。**顺带核的那件也核完了**：遮罩 `#right-rail-scrim` **一直有自己的直接监听器**（从来不在列的委托里）⇒ **它从来没坏过** ✓。
> **下面整段留作背景与理由**——**万一将来要再动委托，先读它**（它讲的是"改名的这一半 vs 漏掉的接线那一半"）。

**问题**：`bindRightRail` 把点击委托挂在**右列**上（`rail.addEventListener("click", …)`，`rail = railElement()`）。而 **Q9 把召出钮搬去了对话头部**（`.back-bar` ∈ `#main-area` ⊂ `#center-row` ⊂ `#main-panel`）——**右列的子树里根本没有那些钮** ⇒ **列上的委托永远收不到对它们的点击** ⇒ **四只键全是死的**，而"把 `[data-rail-panel]` 换成 `[data-rail-surface]`"这句改动会照做、测试照绿 ✗。
（这正是本仓抓过六次的那族——**"改了改名的这一半，漏了接线的那一半"**——只不过这次漏的是**事件委托的挂点**。）

**改法**：把 `[data-rail-surface]` 的委托**挂到 `#main-panel`**（它同时包含右列与对话头部，一处收两处 ✓）。**顺带核一件事**：遮罩 `#right-rail-scrim` 是右列的**兄弟**（`:234`），**它也不在列的子树里**——若它的点击处理器原本住在列上的委托里，那它**早就收不到点击了**（一起去核，是就一并修）。

**静态锁（现在就红，改完绿）**：
```ts
it("★ 召出钮的点击委托不能挂在右列上（钮在对话头部，列收不到）", () => {
  expect(html).not.toMatch(/rail\.addEventListener\(\s*"click"[\s\S]{0,600}?data-rail-surface/);
  expect(html).toMatch(/data-rail-surface/);
});
```

**★ 但真正的判据在任务 5 的判据 2/3（真去点）**——**一条死掉的委托能通过所有静态检查**（这正是那族的定义）。静态锁只是第一道。

**★ Q14（来源：任务 3 的定向复审 · Minor 6）——「写者无锁」一族：把写者删掉，一切照绿**

**事实**（复审逐条量过）：四个 `data-*` 里，`data-mode` 的 **CSS 读者**被锁着（`ui-layout.test.ts` 里那条 `[data-mode="overlay"][data-collapsed="true"]` 的断言），`data-surface` 的**值**被 3-C 锁着；**而 `paintRightRail` 里那几条写者本身，一条锁都没有** ⇒ **把 `rail.dataset.layout = p.layout` 删掉、或改写成常量，测试全绿**（行为错而灯不变——正是本仓最贵那一族的"两半只锁一半"）。

**做对的对照物**：`--center-min` 的写者被 3-D 钉死（**谓词与写串在同一窗口**）；3-H 的**声明 / 消费 / 锁三端全钉**。本节把剩下四个写者补齐。

```ts
  it("★ 四个 data-* 的写者都在，且写的是策略层的值（写者无锁 ⇒ 删掉照绿）", () => {
    // 与 CSS 侧读者成对：读者已被 ui-layout 锁着，写者这一半以前没人守。
    // ★ 写法与行号一律现读现核——别照抄我这里的形状。
    expect(html).toMatch(/rail\.dataset\.mode\s*=\s*p\.mode/);
    expect(html).toMatch(/rail\.dataset\.layout\s*=\s*p\.layout/);
    expect(html).toMatch(/rail\.dataset\.surface\s*=\s*pref\.surface/);
    expect(html).toMatch(/rail\.dataset\.collapsed\s*=\s*String\(p\.collapsed\)/);
  });
```
**变异靶（两条都要真做真看）**：① 删掉任意一条写者 ⇒ 该条红；② 把任意一条改成常量（如 `rail.dataset.layout = "docked"`）⇒ 该条红。

- [ ] **Step 7: 提交**

---

### Task 5: 失效探针的更新 + 本计划的验收探针

**Files:**
- Modify: `eval/persona-ux/_audit-20260919/` 下**失效的那些**（勘查列了 ~10 个）
- Create: `eval/persona-ux/_audit-20260919/verify-rail-surfaces.mjs`

**★ 每一个改过的探针都要在报告里逐条写明**（计划 2/3 那条约束的例外，理由见 Global Constraints）✓。

- [ ] **Step 1: 逐个跑，看哪些真的红**

**别信勘查的静态推断** ✗——**真跑一遍**，红的才是失效的 ✓。

- [ ] **Step 2: 新建本计划的验收探针**（判据）：
  1. **两脸各自的召出钮**（Work 一只 / Code 四只）✓
  2. **点一个键召出** ⇒ 该面可见 ✓
  3. **再点同一个键** ⇒ 收起 ✓
     **★★ 判据 2/3 是本计划的承重判据（Ruling Q11）**：召出钮住在**对话头部**（`app.js` 渲染的 `.back-bar`），而点击委托的挂点极容易留在右列上——**一条挂错的委托能通过全部静态锁**（"把选择器改名"那句改动照做、测试照绿），**只有真点一下才知道键是死的**。⇒ 这两条**必须真点、并断言可见性变化**（不是"DOM 里有这个元素"）。
     **★ 前提**：对话头部要存在（`app.js` 在进入对话时渲染 `mainEl`）⇒ 探针得先处在有对话的上下文里，别在欢迎页上点（那里没有 `.back-bar`）。
  4. **点另一个键** ⇒ 换面（**且仍只有一只**）✓
  5. **★ 窄屏浮层：召出前后 `#main-area` 的宽逐像素不变** ✓（这是"浮层"的定义 ✓）
  6. **★ 宽屏占宽列：召出后 `#main-area` 变窄，且 `railWidth` 在 [240,360]** ✓
  7. **两脸成对**：Work 脸看不到 Code 脸的三个键 ✓
  8. **0 控制台错误** ✓

- [ ] **Step 3: 变异验红**：删掉"一次一只"那条约束 → 判据 4 必须红 ✓。

- [ ] **Step 4: 提交**

---

## Self-Review（写完后的自查）

### 1. 规格覆盖（对着设计稿逐条点）

| 设计稿说 | 落在哪 |
|---|---|
| §4 四件套复用 | **任务 4**（把手的三条已有 ✓，同键是第 4 条新增 ✓） |
| §5 浮层 ↔ 占宽列 | **任务 1**（策略）+ **任务 2**（样式）+ **任务 5**（探针 5/6） |
| §6 Progress 不参与宽度 | **任务 1**（`railPolicy` 根本不接 Progress ✓）+ **任务 2**（它在对话流里，不在这块 CSS 里） |
| §7 那排键 | **任务 3** |
| §9 对现有代码的影响 | **任务 1/2/3** 逐条 |
| §10 计划 4 行 | 本计划整体 |

### 2. Placeholder 扫描

**无 TBD / TODO。** 全计划四个任务的每一步都有可抄的代码或逐字的处置表 ✓。

**★ 第一版里任务 3/4 曾是薄的**（我把选择器留给实现者，理由是"不凭记忆写锚点"）——**那是个假两难** ✗：
正解不是"留白"，是**我自己去读** `index.html:204-234` 与 `:5837-5922` ✓，然后**用读来的锚点把任务写实** ✓。
（这一夜 25 次错误的来源是"按**以为的**代码写"，**不是"写锚点"本身**——把这两件事混为一谈，就会写出既薄又不可抄的步骤 ✗。）

另有三处**刻意的"先读再写"**（技能允许且鼓励，因为猜错的代价更大），都标明了"不许猜"：
1. **任务 3 Step 1** 里「更多」菜单的写法 —— **先读 `#workspace-git-menu` / `#executor-model-menu` 的既有做法**再写。
2. **任务 5 Step 1** 「哪些探针真的失效」—— **真跑一遍**，别信静态推断（勘查自己就标了"给的是全集，不是一定会红的清单"）。
3. **任务 5 Step 2** 探针判据 5/6 的具体量法 —— 按 `verify-review-panel.mjs` 的既有手法写（它已经量过 `#main-area` 的几何）。

### 3. 类型一致性

- `railPolicy` 返回 `{mode, layout, railWidth, centerWidth, surface, collapsed}` ✓ —— 任务 2 的 CSS 选择器（`data-layout` / `data-surface`）、任务 3 的 `paintRightRail`、任务 5 的探针**四处一致** ✓。
- `RAIL_LAYOUTS = ["docked","floating"]` 与 `RAIL_SURFACES = ["tree","preview","review"]` ✓ —— 任务 1 定义、任务 2/3/5 消费 ✓。

### 4. 与既有测试的冲突预判

- **任务 1 会改 ~15 条、删 ~12 条** ✓（逐条表在任务 1 Step 4）✓
- **任务 2 会改/删 T7 那 7 条** ✓（逐条在任务 2 Step 5）✓
- **任务 5 会改 ~10 个探针** ✓（**真跑一遍才知道是哪几个** ✓）
