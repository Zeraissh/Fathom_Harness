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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ui-app.test.ts test/ui-layout.test.ts`
Expected: PASS

- [ ] **Step 5: 活页确认两脸**

```bash
node eval/persona-ux/_audit-20260919/verify-ab.mjs
```

在页面里切 Work/Code，量 `document.body.dataset.face` 与 `.workspace-git-chip` 的可见性。
Expected: Work 脸 `data-face="work"` 且 git 芯片不可见；Code 脸反之。

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
