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

/** 从 CSS 里抠出某个选择器的规则块（第一个匹配）。 */
function block(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`找不到选择器 ${selector}`);
  const end = source.indexOf("\n}", start);
  return source.slice(start, end);
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

在 `ui/public/styles.css` 的 `:root` 块里加一行（放在 `--center-min` 附近，约 1542 行）：

```css
  --measure: 40em;          /* 正文度量：40 个中文全角字（1 全角字 ≈ 1em）。
                               用 em 不用 ch——ch 是拉丁"0"的宽度，对中文不对口，
                               而且 em 会让度量随字号自动跟走。 */
```

把 `.conversation` 块改成：

```css
.conversation {
  /* 整块居中 + 全角字度量。此前是 `min(132ch, 100%)` 靠左：
     132ch 对中文太宽（实测 57 字/行），"靠左"让宽屏右边空一大片。
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

