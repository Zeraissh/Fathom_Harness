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
Expected: FAIL —— 第一条（树 ≥200）与第二条（preview >0）红；实测值约 141/161/180 与 141/161/180 的对半。

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

