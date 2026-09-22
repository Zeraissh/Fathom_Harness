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
node eval/persona-ux/_audit-20260919/verify-ab.mjs   # 复用脚本骨架，改断言为 #sidebar 宽度
```

Expected: `#sidebar` 宽 **48**，`#new-chat-btn` 仍在 DOM 且可见。

- [ ] **Step 6: 提交**

```bash
git add ui/public/styles.css ui/public/app.js test/ui-layout.test.ts test/ui-app.test.ts
git commit -m "feat(ui): 左栏收起态从『整个消失』改成 48px 图标条

display:none 意味着收起后新建对话、看板、产物、日程、记忆、设置全都没了入口。
改成 48px 图标条，并加 sidebarRailItems() 作能见度契约（列进来的收起后仍够得着）。"
```

---

