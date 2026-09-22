# 方案 A · 骨架与宽度 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把方案 A 的骨架落到代码里——正文回到可读度量、左栏收成图标条、右栏变成内容驱动、两张脸各有骨架差异。这是其余三份计划（产物与附件 / 过程与权限 / 会话与配置）的共同前置。

**Architecture:** 全部是**现有零件的度量与显隐调整**，不新建面。正文宽度改一个 CSS 常量、左栏折叠从 `display:none` 改成 48px 图标条、右栏修 split 档的两处结构性缺陷、两脸差异收在一个 `data-face` 属性上。派生逻辑继续放在 `app.js` 的纯函数层（可测），DOM 补丁继续走现有的 `patch*` 协议。

**Tech Stack:** 原生 ESM（`ui/public/*.js`，无构建步）、纯 CSS、vitest + jsdom、Playwright 做活页验收。

**Spec（设计案，逐屏拍板的那一份）:**
- `.superpowers/brainstorm/198-1789817065/content/schemes-overview.html`（5 套方案对比）
- `.superpowers/brainstorm/198-1789817065/content/scheme-a-work-3states.html`（Work 脸三态）
- `.superpowers/brainstorm/198-1789817065/content/scheme-a-code-3states.html`（Code 脸三态）
- `.superpowers/brainstorm/198-1789817065/content/states-A..H*.html`（50 个状态，逐屏）
- 调研依据：`eval/persona-ux/_audit-20260919/RESEARCH-AGENT-UI.md`
- 现状事实：`eval/persona-ux/_audit-20260919/UX-AUDIT-3.md`

## Global Constraints

- **正文度量用 `em` 不用 `ch`**。一个中文全角字 ≈ 1em；`ch` 是拉丁"0"的宽度，对中文不对口。现有 `min(132ch, 100%)` 是**错的单位**，不是错的数值。
- **度量常量只写一处**：`:root { --measure: … }`。`ui-app.test.ts` 有一条硬门「CSS 变量：引用的必须定义过」，新变量必须同时在 `:root` 有默认值，否则测试当场红。
- **禁用 unicode dingbat 做状态图标**（`✻ ✽ ✢ ∙ ◆ ○ ✓ ✕ ■`）：Windows 下字体回落不一致，有的走文字字形、有的走彩色 emoji。状态点一律用 CSS 画的形状（见设计案 H v2）。
- **两脸的差异只收在 `data-face="work|code"` 一个属性上**，不许在别处再判断"现在是哪张脸"。
- **中文文案**：界面文案全中文；代码注释中文。
- **每个任务结束必须提交**，commit message 用 `type(scope): 中文描述`（本仓既有格式）。
- **不许改 `eval/persona-ux/**`**——那是档案。

---

## 文件结构

| 文件 | 职责 | 本计划里怎么动 |
|---|---|---|
| `ui/public/styles.css` | 全部样式 | 改 `.conversation` 度量、加 `--measure`、sidebar 折叠态、split 档右栏、`[data-face]` 差异 |
| `ui/public/app.js` | 派生层（纯函数）+ DOM 补丁 | 加 `deriveFace`、`sidebarRailItems` 纯函数；`renderRunList` 不动 |
| `ui/public/index.html` | 壳 + 内联控制器 | 折叠/展开接线、`data-face` 落到 `body` |
| `ui/public/core/rail-policy.js` | 右栏可见性与宽度规则（已有纯函数层） | 修 split 档判据 |
| `test/ui-layout.test.ts` | **新建**：骨架的度量与显隐锁 | 本计划四组测试 |
| `test/ui-app.test.ts` | 既有派生层测试 | 加 `deriveFace` / `sidebarRailItems` 的用例 |
| `test/ui-rail-policy.test.ts` | 既有右栏策略测试 | 加 split 档的用例 |

---

### Task 1: 正文度量与字号

**Files:**
- Modify: `ui/public/styles.css`（`:root` 加常量；`.conversation` 块，现约 6647–6660 行）
- Test: `test/ui-layout.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces: CSS 变量 `--measure`（类型：CSS 长度，默认 `40em`）；后续所有"正文宽度"相关的任务都引用它，不许再写字面量

**背景（这一条纠正设计案里的一处错算）：** 设计案的线框里写的是"正文上限 760px"。**那个数是错的**——760px ÷ 14px = 54 个中文字/行，中文舒适区是 30–45，仍然超。正确的做法是按**全角字数**定上限：中文一行 40 个全角字 ≈ `40em`（1 全角字 = 1em），字号变了度量跟着自动变。现有代码写的是 `min(132ch, 100%)`——`ch` 是拉丁数字宽度，对中文不对口，这是**单位错**不是数值错。

- [ ] **Step 1: 写失败的测试**

新建 `test/ui-layout.test.ts`：

```ts
// @ts-nocheck
/**
 * 骨架的度量与显隐锁（方案 A · 计划 1）。
 *
 * 这一层全是 CSS 与少量派生函数，跑不了"行为"，能锁的是**结构**：
 * 度量单位对不对、常量在不在、显隐规则有没有被后来的改动悄悄抹掉。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = () => readFile(join(process.cwd(), "ui/public/styles.css"), "utf8");

/** 从 CSS 里抠出某个选择器的规则块（第一个匹配）。
 *  行尾先归一化：本仓没有 `.gitattributes` 而 `core.autocrlf=true`，
 *  `styles.css` 在检出时是 CRLF——测试串里的 `\n` 在 CRLF 工作树上匹配不到，
 *  会出现「同一份正确的 CSS 本地红、CI 绿」。归一化是唯一在两种检出下都成立的修法。 */
function block(source: string, selector: string): string {
  const text = source.replace(/\r\n/g, "\n");
  const start = text.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`找不到选择器 ${selector}`);
  const end = text.indexOf("\n}", start);
  return text.slice(start, end);
}

describe("正文度量", () => {
  it("--measure 在 :root 有默认值（ui-app.test.ts 的变量门也要求）", async () => {
    const source = await css();
    const root = block(source, ":root");
    expect(root).toMatch(/--measure:\s*40em/);
  });

  it(".conversation 用 --measure 而不是 ch", async () => {
    const b = block(await css(), ".conversation");
    expect(b).toMatch(/max-width:\s*min\(var\(--measure\),\s*100%\)/);
    expect(b).not.toMatch(/\d+ch/);
  });

  it("整块居中（左右都 auto）——不是靠左", async () => {
    const b = block(await css(), ".conversation");
    expect(b).toMatch(/margin:\s*0 auto/);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: FAIL —— `找不到选择器 :root` 之前会先报 `--measure` 断言失败；`.conversation` 块里是 `min(132ch, 100%)`，第二、三条也红。

- [ ] **Step 3: 最小实现**

在 `ui/public/styles.css` 的 **第一个 `:root` 块**（设计令牌块，约 20 行）里加一行：

```css
  --measure: 40em;          /* 正文度量：40 个中文全角字（1 全角字 ≈ 1em）。
                               用 em 不用 ch——ch 是拉丁"0"的宽度，对中文不对口，
                               而且 em 会让度量随字号自动跟走。 */
```

> **落点是第一个 `:root`，不是 `--center-min` 那个**（计划原稿写错了，implementer 实测后更正）：`styles.css` 里有两份 `:root`（20 行令牌块 / 1541 行 rail 默认值），而测试的 `block()` 取**第一个**匹配。令牌块也是**语义上正确的家**——`--measure` 是版面令牌，不是右列常量。

把 `.conversation` 块（现约 6653 行的那份**完整块**）改成：

```css
.conversation {
  /* 整块居中 + 全角字度量。此前是 `min(132ch, 100%)` 靠左：
     那个单位对中文不对口（实测一行五十七字），"靠左"让宽屏右边空一大片。
     居中放在**容器**上而不是子元素上，所以工具行与正文共享同一条左沿——
     这正是旧注释担心的"漂到栏中间"，那个问题是逐子元素居中造成的。 */
  max-width: min(var(--measure), 100%);
  margin: 0 auto var(--space-lg);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 18px;
}
```

**顺带**：`styles.css` 另有一份**同一选择器的一行式死规则**（约 4488 行，只写了 `max-width` 与 `gap`，同特异性、位置更早，两个属性都被上面这份覆盖）——**删掉它**。它零视觉影响，但留着会让 `block()` 抠到旧值，也是本仓"根因修掉，补丁就是负债"该清的东西。

- [ ] **Step 4: 跑测试确认它通过**

Run: `npx vitest run test/ui-layout.test.ts`
Expected: PASS（3 条全绿）

- [ ] **Step 5: 跑关联测试，确认没弄坏别处**

Run: `npx vitest run test/ui-app.test.ts test/ui-patch.test.ts`
Expected: PASS（`ui-patch` 有 3 条存量失败，与本次无关，数量不变即可）

- [ ] **Step 6: 提交**

```bash
git add ui/public/styles.css test/ui-layout.test.ts
git commit -m "feat(ui): 正文度量改用全角字 em 并整块居中

设计案里写的 760px 是错算——760÷14=54 字/行，中文舒适区 30–45，仍超。
改用 --measure: 40em（1 全角字 ≈ 1em），字号变了度量跟走。
顺手把 min(132ch) 换掉：ch 是拉丁数字宽度，对中文不对口。
居中放在容器上（不是子元素），工具行与正文共享左沿。"
```

---

### Task 2: 左栏收成图标条

**Files:**
- Modify: `ui/public/styles.css`（`.sidebar` 块约 373 行、`body.sidebar-collapsed .sidebar` 约 385 行）
- Modify: `ui/public/app.js`（新增纯函数 `sidebarRailItems`，放在 `renderRunList` 附近约 4846 行前）
- Test: `test/ui-layout.test.ts`（追加）、`test/ui-app.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `--measure`（无关，只是同文件）
- Produces: `sidebarRailItems(): Array<{id: string, label: string, title: string}>` —— 返回收起态图标条上要显示的按钮；后续加新入口（比如计划 4 的「稿件」）时改这一个函数

**背景：** 左栏现在的"折叠"是 `body.sidebar-collapsed .sidebar { display: none }`——**整个消失**，什么都点不到。设计案改成 **48px 图标条**（新建对话 + 看板/产物/日程/记忆/设置）。

- [ ] **Step 1: 写失败的测试**

追加到 `test/ui-app.test.ts`（该文件已有 `// @ts-nocheck` 与 app.js 的导入块，把 `sidebarRailItems` 加进导入即可）：

```ts
describe("sidebarRailItems：收起态图标条上放什么", () => {
  it("只放『收起后仍要够得着』的入口，且每个都有可读的标签", () => {
    const items = sidebarRailItems();
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(["new-chat", "board", "artifacts", "schedules", "memory", "settings"]);
    for (const i of items) {
      expect(i.label.length, `${i.id} 缺 label`).toBeGreaterThan(0);
      expect(i.title.length, `${i.id} 缺 title`).toBeGreaterThan(0);
    }
  });
});
```

追加到 `test/ui-layout.test.ts`：

```ts
describe("左栏收起态是图标条，不是消失", () => {
  it("收起态仍占 48px 且不 display:none", async () => {
    const source = await css();
    const b = block(source, "body.sidebar-collapsed .sidebar");
    expect(b).not.toMatch(/display:\s*none/);
    expect(b).toMatch(/width:\s*48px/);
  });

  it("收起态藏起的是宽内容（列表 / 搜索行 / 花费 / 脸切换 / 品牌 / 按钮文字）", async () => {
    const source = await css();
    const hidden = block(
      source,
      "body.sidebar-collapsed .run-list,\nbody.sidebar-collapsed .run-search-row,\nbody.sidebar-collapsed #home-spend,\nbody.sidebar-collapsed #workspace-face,\nbody.sidebar-collapsed .sidebar-brand,\nbody.sidebar-collapsed .new-chat-btn span",
    );
    expect(hidden).toMatch(/display:\s*none/);
  });

  it("保留的按钮行改成竖排（横排 5×34=170px 会溢出 48px）", async () => {
    const source = await css();
    const kept = block(
      source,
      "body.sidebar-collapsed .sidebar-top-tools,\nbody.sidebar-collapsed .sidebar-footer--icons",
    );
    expect(kept).toMatch(/flex-direction:\s*column/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui-layout.test.ts test/ui-app.test.ts -t "sidebarRailItems|图标条"`
Expected: FAIL —— `sidebarRailItems is not a function`；CSS 块里是 `display: none`。

- [ ] **Step 3: 最小实现**

在 `ui/public/app.js` 的 `renderRunList` 之前加：

```js
/**
 * 收起态图标条要放哪些入口（方案 A · 计划 1）。
 *
 * 收起态从「整个消失」改成 48px 图标条，所以这份名单是**能见度契约**：
 * 列进来的，收起后仍够得着；没列的，收起后就没有入口了——加新入口时想清楚。
 * 纯数据、无 DOM，方便测；DOM 侧由 index.html 的控制器按 id 找按钮。
 */
export function sidebarRailItems() {
  return [
    { id: "new-chat", label: "新建", title: "新建对话" },
    { id: "board", label: "看板", title: "指挥中心" },
    { id: "artifacts", label: "产物", title: "本次产物" },
    { id: "schedules", label: "日程", title: "定时任务" },
    { id: "memory", label: "记忆", title: "记忆" },
    { id: "settings", label: "设置", title: "设置" },
  ];
}
```

把 `ui/public/styles.css` 的 `body.sidebar-collapsed .sidebar` 改成：

```css
/* 收起态 = 48px 图标条（不是消失）。此前是 display:none，收起后什么都点不到。 */
body.sidebar-collapsed .sidebar {
  width: 48px;
  min-width: 48px;
  overflow: hidden;
}
/* 收起态藏起的：宽内容在 48px 里放不下，且都是"展开态才看得清"的东西。
   选择器逐个核过真实 DOM（`.sidebar-search` 里是 `#new-chat-btn` + `.run-search-row`，
   品牌是 `.sidebar-brand`）。 */
body.sidebar-collapsed .run-list,
body.sidebar-collapsed .run-search-row,
body.sidebar-collapsed #home-spend,
body.sidebar-collapsed #workspace-face,
body.sidebar-collapsed .sidebar-brand,
body.sidebar-collapsed .new-chat-btn span {
  display: none;
}
/* 保留的按钮行改成竖排：图标按钮已经在 DOM 里（无需新建），
   横排时 5×34=170px 会溢出 48px。 */
body.sidebar-collapsed .sidebar-top-tools,
body.sidebar-collapsed .sidebar-footer--icons {
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
```

> **注**：图标按钮**已经在 DOM 里**——`.sidebar-top-tools` 的 `#notifications-btn` / `#theme-picker`、`.sidebar-footer--icons` 的 `#board-open-btn` / `#artifacts-open-btn` / `#schedules-open-btn` / `#memory-btn` / `#settings-open-btn`、以及 `.sidebar-search` 里的 `#new-chat-btn`。所以本任务**不新建 DOM**，只改它们的排列与显隐。`sidebarRailItems()` 是**能见度契约**（可测的那份名单），不是渲染源。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui-layout.test.ts test/ui-app.test.ts`
Expected: PASS

- [ ] **Step 5: 活页确认**（这一条只有真浏览器看得出来）

起隔离宿主，收起左栏，用 Playwright 量 `#sidebar` 宽度与「新建对话」按钮是否还在：

```bash
node eval/persona-ux/_audit-20260919/verify-task2-sidebar.mjs
```

Expected: `#sidebar` 宽 **48**，`#new-chat-btn` 仍在 DOM 且可见。

> **勘误（计划点错了脚本）**：原稿此处写「复用 `verify-ab.mjs` 的骨架」——那是 A+B（能力条 / Tab 采纳）的验收脚本，与左栏无关。已改为本任务自己的探针 `verify-task2-sidebar.mjs`：**点真收起键**（不是直接改 class）、量宽度与横向溢出、逐个核八个图标按钮是否可见且落在侧栏内。
> **★ 口径**：结构断言只读 CSS 文本，**抓不到 DOM 漂移**（reviewer 已点名）——所以这一步不可省。控制者已独立跑过：展开 312px / 收起 **48px** `display:flex` / 横向溢出 body=0 sidebar=0 / 八个按钮全部可见（含 implementer 没列的 `#notifications-btn` 与 `#theme-picker`）/ 0 控制台错误。

- [ ] **Step 6: 提交**

```bash
git add ui/public/styles.css ui/public/app.js test/ui-layout.test.ts test/ui-app.test.ts
git commit -m "feat(ui): 左栏收起态从『整个消失』改成 48px 图标条

display:none 意味着收起后新建对话、看板、产物、日程、记忆、设置全都没了入口。
改成 48px 图标条，并加 sidebarRailItems() 作能见度契约（列进来的收起后仍够得着）。"
```

---

### Task 3: 右栏 split 档的两处结构缺陷

**Files:**
- Modify: `ui/public/core/rail-policy.js`（`railPolicy()` 的 split 分支，现 149–151 行）
- Modify: `ui/public/styles.css`（`.right-rail` 一族的 split 规则，约 1564/1657/1659 行）
- Test: `test/ui-rail-policy.test.ts`（追加）

**Interfaces:**
- Consumes: 无
- Produces: 无新导出 —— **改的是既有 `railPolicy()` 的返回值**（`{tree, preview}`）。控制器 `index.html:5260-5261` 已经在写 `--rail-tree-w` / `--rail-preview-w`，**不需要新接线**。

**背景（三轮走查量出来的两个硬缺陷，附一处我自己的更正）：**

1. `split`（声称"并排"）档里 `#right-rail-preview` 是 **`display: none`**，宽高 0×0 —— 右栏 322px 里 **161px 是纯死的**
2. 文件树实测 **141–180px**，`_probe2-p…` `_probe3-p…` 全截断成不可辨

> **更正**：走查报告里我写的是"窗口越宽文件树越窄（1920→180 / 1600→161 / 1440→141）"——**那句是错的**：180 > 161 > 141，树是随窗口**变宽**的。真正的病灶是**树始终太窄**（141–180 读不出名字），加上 preview 列 `display:none` 让右栏一半纯死。计划按更正后的口径写。

**根因**：`railPolicy()` 第 150 行 `tree = Math.round(railWidth * splitRatio)`——`railWidth` 被夹在 `RAIL_MIN_PX 240` ~ `RAIL_MAX_PX 360`，`splitRatio` 默认 0.5，于是 **tree 永远在 120–180**，与实测严丝合缝。

- [ ] **Step 1: 写失败的测试**

追加到 `test/ui-rail-policy.test.ts`（该文件已导入 `core/rail-policy.js` 的若干导出，把 `railPolicy` 加进去）：

```ts
describe("split 档：树要有下限，preview 列不能再是 0", () => {
  /** 三个实测档位：1440 / 1600 / 1920，左栏 280。 */
  const split = (viewportWidth: number) =>
    railPolicy({ viewportWidth, sidebarWidth: 280, splitRatio: 0.5, panel: "tree" });

  it("树有下限 200px —— 此前 141–180 时 _probe2-p… 全不可辨", () => {
    for (const w of [1440, 1600, 1920]) {
      expect(split(w).tree, `${w} 档的树太窄`).toBeGreaterThanOrEqual(200);
    }
  });

  it("preview 列不再是 0 —— 此前 display:none，右栏一半是纯死的", () => {
    for (const w of [1440, 1600, 1920]) {
      expect(split(w).preview, `${w} 档的 preview 列没了`).toBeGreaterThan(0);
    }
  });

  it("两列加起来不超过右列本身，且 layout 仍是 split", () => {
    for (const w of [1440, 1600, 1920]) {
      const p = split(w);
      expect(p.layout).toBe("split");
      expect(p.tree + p.preview).toBeLessThanOrEqual(p.railWidth);
    }
  });

  it("窄档与 tabbed 档不受影响（回归护栏）", () => {
    const narrow = railPolicy({ viewportWidth: 900, sidebarWidth: 280, panel: "tree" });
    expect(narrow.layout).toBe("tabbed");
    expect(narrow.tree).toBe(narrow.railWidth);
    expect(narrow.preview).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui-rail-policy.test.ts -t "split 档"`
Expected: **FAIL 一条**（树 ≥200）——实现实测值约 141/161/180（随窗口变化），低于下限。

> **更正（implementer 实测）**：计划原稿预期两条红，**错了一条**。旧 `railPolicy` 的 split 分支是 `preview = railWidth - tree`，**preview 本来就不是 0**；活页看到的 `0×0` **纯粹是 CSS 的 `display:none`**。所以 `preview > 0` 在旧 JS 下**已经成立**，不会红——它是 CSS 修复的验收判据，不是 JS 的。

- [ ] **Step 3: 最小实现**

把 `ui/public/core/rail-policy.js` 的 split 分支（现 147–156 行）改成：

```js
  let tree = 0;
  let preview = 0;
  if (layout === "split") {
    /**
     * 树有下限，其余给 preview（方案 A · 计划 1）。
     *
     * 此前是 `tree = railWidth * splitRatio` 对半分：railWidth 被夹在 240–360，
     * 于是树永远 120–180px——实测 141/161/180，长目录名全截成 `_probe2-p…`
     * 这种互相分不出的样子；同时 preview 列 `display:none`，右栏一半是纯死的。
     * 现在：树先吃够 200（名字要能读），剩下的全给 preview。
     */
    tree = Math.min(railWidth, Math.max(TREE_MIN_PX, Math.round(railWidth * splitRatio)));
    preview = railWidth - tree;
  } else if (panel === "tree") {
    tree = railWidth;
  } else {
    preview = railWidth;
  }
```

并在该文件顶部的常量区（`RAIL_DEFAULT_SPLIT_RATIO` 附近）加：

```js
/** split 档文件树的宽度下限：低于这个数，目录名会截成互相分不出的样子。 */
export const TREE_MIN_PX = 200;
```

`ui/public/styles.css` —— 把 preview 列在 split 档的 `display: none` 去掉（这是"161px 纯死"的直接成因）：

```css
/* split 档两列并排：树吃够 TREE_MIN_PX，其余归 preview。
   此前 preview 列是 display:none，右栏一半宽度纯浪费（三轮走查实测 322px 里 161px 是死的）。 */
.right-rail[data-layout="split"] > .right-rail-preview { display: flex; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui-rail-policy.test.ts`
Expected: PASS

> **勘误（Ruling 7，implementer 实测）**：本文件另有一条**既有**用例 `splitRatio 决定并排比例`，断言 `tree === round(railWidth * 0.25)`（1600 档 = 83）。新的 200 下限让该断言**必然为假**——它锁的是旧契约，而契约变了。修法：把该用例的比率改成 0.75（新旧实现均过），保留用例名与语义，加一行注释说明为何换值；**不要碰 tabbed / overlay**。这样 Step 4 的"整文件 PASS"才可能成立。

- [ ] **Step 5: 活页量三档（这一条只有真浏览器量得准）**

```bash
node eval/persona-ux/_audit-20260919/rail-probe.mjs
```

Expected: 1440 / 1600 / 1920 三档里 `tree ≥ 200` 且 `preview > 0`；不再出现 141px 或 preview 0×0。

- [ ] **Step 6: 提交**

```bash
git add ui/public/core/rail-policy.js ui/public/styles.css test/ui-rail-policy.test.ts
git commit -m "fix(ui): 右栏 split 档 —— 树给下限，preview 列不再是死的

根因在 railPolicy 第 150 行：tree = railWidth × splitRatio 对半分，
而 railWidth 夹在 240–360，于是树永远 120–180px（实测 141/161/180），
长目录名全截成 _probe2-p… 这种互相分不出的样子；叠加 preview 列
display:none，右栏 322px 里 161px 纯死。
改成树先吃够 TREE_MIN_PX 200，其余归 preview。
（顺带更正走查报告里'窗口越宽树越窄'那句——实测是越宽，180>161>141。）"
```

---

### Task 4: 两脸骨架分化的开关

**Files:**
- Modify: `ui/public/app.js`（新增 `deriveFace`，放在 `deriveComposerMode` 附近约 2928 行前）
- Modify: `ui/public/index.html`（把 `data-face` 写到 `body`）
- Modify: `ui/public/styles.css`（`[data-face]` 差异）
- Test: `test/ui-app.test.ts`（追加）

**Interfaces:**
- Consumes: 既有 `workspaceFace` 的概念（`"office" | "code"`，见 `index.html` 约 3406 行）
- Produces: `deriveFace(input): "work" | "code"` 与 `body[data-face]` —— **后续所有两脸差异都读这一个属性**，不许别处再判断

**背景：** 设计案定的四处差异：① 左栏多仓库文件树 ② 顶栏常驻 git（分支/改动/PR）③ 右栏 tab 不同 ④ 起步卡不同。本任务只落**开关与前三处的显隐骨架**，仓库树与 PR 面板的内容留给计划 2。

- [ ] **Step 1: 写失败的测试**

追加到 `test/ui-app.test.ts`：

```ts
describe("deriveFace：两脸只有一个判据", () => {
  it("office 与缺省都算 Work；只有明确的 code 才是 Code", () => {
    expect(deriveFace({ workspace: "office" })).toBe("work");
    expect(deriveFace({ workspace: "code" })).toBe("code");
    expect(deriveFace({})).toBe("work");
    expect(deriveFace(null)).toBe("work");
  });

  it("显式脸优先于会话推断（用户切了脸就听用户的）", () => {
    expect(deriveFace({ face: "code", workspace: "office" })).toBe("code");
    expect(deriveFace({ face: "work", workspace: "code" })).toBe("work");
  });
});
```

追加到 `test/ui-layout.test.ts`：

```ts
describe("两脸差异只收在 [data-face] 上", () => {
  it("git 区在 Work 脸藏起、Code 脸显示", async () => {
    const source = await css();
    const work = block(source, 'body[data-face="work"] .workspace-git-chip');
    expect(work).toMatch(/display:\s*none/);
  });

  it("CSS 里不许出现别的脸判据（只认 data-face）", async () => {
    const source = await css();
    expect(source).not.toMatch(/body\.(is-office|is-code|face-code|face-work)/);
  });
});
```

> **勘误（Ruling 10，Task 4 review 的 Important）**：上面这组测试**只读 `styles.css`**——它能抓到"规则被改坏"，抓不到"**规则匹配的东西不存在**"（Ruling 9 就是这么发生的：规则逐字落地、元素上根本没那个类、测试全绿）。**必须再补一条锁 markup 的断言**，落在同一个 describe 里：
>
> ```ts
> const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");
> ```
> ```ts
> it("芯片元素真的带着 workspace-git-chip 类（不然那两条规则匹配不到任何东西）", async () => {
>   const source = await html();
>   // 取整个标签再断言"类与 id 在同一个标签里"。只写 `toContain("workspace-git-chip")`
>   // 会退化成"文件里出现过这个词"——元素上方那两行 HTML 注释里就有它。
>   const tag = source.match(/<[^>]*id="workspace-git-chip"[^>]*>/)?.[0] ?? "";
>   expect(tag, "index.html 里找不到 #workspace-git-chip 标签").not.toBe("");
>   expect(tag).toMatch(/class="[^"]*\bworkspace-git-chip\b[^"]*"/);
> });
> ```
>
> **它是回归锁，不是新功能**——类已在 markup 里，写完直接跑就是绿的，**那种绿什么都证明不了**。落这条时必须**临时把类删掉看它红、再还原看它绿**，并核 `git diff ui/public/index.html` 为空。这是本计划**第三次**同族复发（Ruling 3 我编了不存在的选择器 / Ruling 9 我把 id 写成类 / 这次只锁了一半），规矩就此立下：**CSS 规则与它匹配的 markup 必须一起锁。**
> 另：上面第一条只断言了 **work** 那条规则；`code` 那条（`display: flex`）与 `.scope-field` 基础规则冗余、无断言，当前无害，留档不动。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ui-app.test.ts test/ui-layout.test.ts -t "deriveFace|两脸差异"`
Expected: FAIL —— `deriveFace is not a function`；`body[data-face="work"] .workspace-git-chip` 块找不到。

- [ ] **Step 3: 最小实现**

在 `ui/public/app.js` 的 `deriveComposerMode` 前加：

```js
/**
 * 现在是哪张脸（方案 A · 计划 1）。
 *
 * **全应用只有这一个判据。** 落成 `body[data-face]`，所有差异（git 区显隐、
 * 左栏 tab、右栏 tab、起步卡）都读它——散落的 `if (office)` 是上一轮的病灶，
 * 它们会各自漂移，而漂移那天没人知道该信谁。
 * 显式脸优先于会话推断：用户切了脸就听用户的。
 */
export function deriveFace(input) {
  const explicit = input?.face;
  if (explicit === "code" || explicit === "work") return explicit;
  return input?.workspace === "code" ? "code" : "work";
}
```

> **勘误（Ruling 11，reviewer 核出的文本错误）**：上面 JSDoc 里那句「**全应用只有这一个判据。**」是**现在时的断言句，而现状不是**——第二脸表示还留在两处：`<aside#sidebar data-workspace-face>` 与两个脸按钮上的 `data-workspace-face`（JS 态标记，CSS 已不挂它，`test/ui-file-tree.test.ts:292-293` 负向锁着），以及 `designModeActive = workspaceFace === "office"` **两处**（`index.html:1403` / `4823`）。
>
> **数字勘误（implementer 实测纠正我）**：我在派单里写的是"**三处**"，**错了**。第三处（`index.html:2317`）是 `designMode: workspaceFace === "office",`——一个**对象属性**，不是 `designModeActive` 赋值；它是我用 `workspaceFace\s*=` 这个松散模式 grep 时一并抓进来的，我又把这个错数字写进派单，reviewer 照单全收。**落地按实测的两处**。（另有 `designModeActive = true/false` 四处 —— `1412 / 1448 / 1453 / 4035` —— 它们同属"第二套脸表示"这一族，但不是脸派生出来的，别混进来数。）
> **本任务不去迁它们**（范围外），但**注释必须说实话**：在 JSDoc 末尾补一段"现状注"，点名这两处并写明"迁完之前别把'唯一判据'当真引用"。一句现在时的假陈述会毒掉整份 JSDoc 的可信度——将来有人读到"只有一个判据"、一 grep 出来多处，从此不信这段，而这段恰是全计划里最该被信的。**零行为改动。**

在 `ui/public/index.html` 的 `syncComposer()` 里，`patchComposer(composerMode)` 之前加：

```js
  // 两脸差异的唯一落点（方案 A · 计划 1）
  document.body.dataset.face = deriveFace({ face: workspaceFaceExplicit, workspace: workspaceFace });
```

（`workspaceFaceExplicit` 取现有脸切换控件的当前值；若该变量尚不存在，用 `null`，此时按会话推断。）

在 `ui/public/styles.css` 末尾加：

```css
/* 两脸差异：只认 body[data-face]，别处一律不许判断"现在是哪张脸" */
body[data-face="work"] .workspace-git-chip { display: none; }
body[data-face="code"] .workspace-git-chip { display: flex; }
```

> **勘误（Ruling 9，implementer 活页实测抓出）**：上面两条规则写的 `.workspace-git-chip` 是**类**，而 DOM 里那个元素是 `id="workspace-git-chip"` + 类 `scope-field scope-field--git`，**没有同名类**——规则逐字落地等于空转（Work 脸下摘掉 `hidden` 芯片仍是 `flex`）。
> **落地口径**：给元素补上同名类（`index.html` 1 行 markup），CSS 与测试保持本计划逐字。这是已采纳的修法；本计划正文按它写。
> **注意 `hidden` 恒胜**：全局 `[hidden] { display: none !important }`（`styles.css:338`）压过一切 face 规则，而该芯片的 `hidden` 由 git 数据有无驱动（`workspace-git.js:192` `root.hidden = !present`）。所以**无仓库时两脸差异不可观测**——量这条必须用「有 git 数据的 workdir」或摘掉 `hidden` 的人工口径，别把"没变化"误判成"规则没生效"。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui-app.test.ts test/ui-layout.test.ts`
Expected: PASS

- [ ] **Step 5: 活页确认两脸**

```bash
node eval/persona-ux/_audit-20260919/verify-task4-face.mjs
```

> **勘误（计划点错了脚本）**：原稿此处写 `verify-ab.mjs`——那是 A+B（能力条 / Tab 采纳）的验收脚本，**与两脸无关**，且会往 `eval/persona-ux/**` 写截图，撞上本计划的 Global Constraint「不许改 eval/persona-ux」。
> 已改为本任务自己的探针 `verify-task4-face.mjs`（量 `body.dataset.face` 三态翻转 + 芯片可见性，并先核宿主服务的是不是本提交）。
> **★ 读数的正确口径**：全局 `[hidden] { display: none !important }` 压过 face 规则，而芯片的 `hidden` 由 git 数据有无驱动。**无仓库时两脸差异不可观测**——探针会分别打印「真机 display」与「摘掉 hidden 后」，别把前者当成后者的证据。宿主 4201 的白名单三处 workdir **全部 `present:false`**，所以本任务在这台机器上只能验到「规则内容正确 + `data-face` 接线端到端正确」，验不到「触发路径」。git 支撑的 workdir 夹具留给计划 2。

- [ ] **Step 6: 提交**

```bash
git add ui/public/app.js ui/public/index.html ui/public/styles.css test/ui-app.test.ts test/ui-layout.test.ts
git commit -m "feat(ui): 两脸骨架分化收在一个 data-face 属性上

deriveFace() 是全应用唯一判据，落成 body[data-face]；git 区在 Work 脸不出现。
散落的 if(office) 各自会漂移，漂移那天没人知道该信谁——收成一处。"
```

---

## Self-Review

**Spec coverage（设计案 → 任务）：**

| 设计案里的决定 | 落在哪 |
|---|---|
| 正文度量与居中 | Task 1 |
| 左栏 48px 图标条 | Task 2 |
| 右栏内容驱动 / 修死区 | Task 3 |
| 两脸骨架四处差异 | Task 4（开关与前三处的显隐；仓库树/PR 面板留给计划 2） |
| 字号 14→15px | **未覆盖**——留待与计划 2 一起做（它和正文度量耦合，且会牵动多个既有 CSS 值） |
| 状态色板 CSS 化 | 计划 3（H 簇） |

**Placeholder scan:** 无 TBD / TODO；每个代码步都是完整可粘贴的代码。

**Type consistency:** `railColumnsFor` 返回 `{tree, preview}`，Task 3 三段测试与 CSS 变量名（`--rail-tree-w` / `--rail-preview-w`）一致；`deriveFace` 返回 `"work" | "code"`，与 CSS 的 `[data-face="work|code"]` 一致；`sidebarRailItems()` 返回 `{id,label,title}[]`，测试断言的三个字段与实现一致。

**已知偏差（如实记）：** 设计案线框里写的"760px 上限"是错算，本计划 Task 1 已更正为 `--measure: 40em`，并在计划正文里写明了错在哪——落地时按本计划，不按线框上的数字。
