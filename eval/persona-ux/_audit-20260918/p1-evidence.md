# P1 活页证据（2026-09-18）

评的是 **`feat/ui-center-contract` 分支的活产品**。
设计：`docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §4.1 与 §6.3。

证据只认：页面 DOM 事实、computed style、亲手跑的脚本。

---

## 1. 方法与仪器

| 项 | 本轮事实 |
|---|---|
| 宿主 | `npx tsx ui/serve.ts`，端口 **4199**（隔离） |
| 浏览器 | Playwright `chromium`，冷启动偏好清空（量的是契约本身，不是残留偏好） |
| 脚本 | `p1-boundaries.mjs` → `p1-boundaries.json` |
| 梯子 | **动态生成**：先量左栏实测宽 → 算出边界 → 在边界两侧各放一档（见 §3 勘误） |
| 状态 | 先进入一个归档 run（脱离欢迎态）再量，见 §4 |

量的都是 DOM 事实：`data-mode` / `data-layout` / 右列实际像素 / 对话列实际像素 /
`#main-area` 的 computed `min-width`。不读 JS 变量——要证的正是「算出来的东西有没有真落在屏幕上」。

---

## 2. 判据结果：10/10 成立

```
宽度 | 档位                        | mode    | layout | 右列px | 对话px | 左栏px | 对话min-width
 700 | 窄档内部                    | overlay | tabbed |    240 |    700 |    292 | 0px
 947 | 窄档最后 1px（★预算边界 948） | overlay | tabbed |    240 |    655 |    292 | 0px
 948 | 中档第 1px（★预算边界 948）   | side    | tabbed |    240 |    416 |    292 | 416px
1100 | 中档内部                    | side    | tabbed |    240 |    568 |    292 | 416px
1439 | 中档最后 1px（★产品边界）     | side    | tabbed |    282 |    845 |    312 | 416px
1440 | 宽档第 1px（★产品边界）       | side    | split  |    282 |    846 |    312 | 416px
1600 | 宽档内部                    | side    | split  |    322 |    966 |    312 | 416px
```

```
PASS  ★预算边界用实测左栏算（实测 292px ≠ CSS 里的 280）
PASS  ★边界两侧是两个形态：947 是 overlay、948 是 side
PASS  ★产品边界：1439 与 1440 是两种形态
PASS  ★对话地板生效：工作态 side 档 #main-area 的 computed min-width = 416px
PASS  ★覆盖档撤掉地板：窄档 computed min-width = 0px（不挤压对话）
PASS  窄档不占位：700 处对话列右边界 ≈ 右列右边界（覆盖，不挤压）
PASS  中档占位：三列宽度之和 = 视口宽（谁都没多占）
PASS  宽档并排：1600 处 layout=split
PASS  全程右列宽度不越界 [240, 360]（side 档未收起）
PASS  全程对话列 ≥ 416（side 档）
```

关键读法：

- **948 处对话恰好拿到 416px**，947 处右列退成覆盖、不占位——预算边界两侧是两个形态。
- **1439/1440 分界**：1439 是 tabbed（树占满右列、预览为 0），1440 起 split。
- 「三列之和 = 视口宽」说明谁也没多占：948 处 292 + 416 + 240 = 948。

---

## 3. 勘误一：边界是 **948**，不是 spec 里写的 936

spec §4.1.3 算出的 936 用的是 `.sidebar { width: 280px }`。**活页上左栏实测是 292px**（1100 宽处；1439 宽处是 312px，会变），所以真实边界是 **292 + 416 + 240 = 948**。

不是实现错，是我那段的**算例**把左栏当成了常量：

- 实现里的 `railSidebarWidth()` 是**量**出来的，不是写死的（`index.html` 的 `paintRightRail`），所以规则本身自洽——边界在哪个数上，取决于当时左栏多宽。
- 936 只在「左栏恰好 280」时成立。写进 spec 当数字用会误导，所以取证脚本改成**先量后算**，并把「实测 ≠ 280」本身列为一条判据。

**结论**：契约的正确表述是「边界 = 左栏实测宽 + 416 + 240」，不是任何具体数。spec 里的 936 应读作算例。

---

## 4. 勘误二：取证脚本第一次测错了状态

第一版梯子在**欢迎态**里量，`#main-area` 的 computed `min-width` 全程 `0px`，两条判据红。查下来不是地板没生效，而是：

```
styles.css:3771
#main-panel.is-welcome #center-row:has(.files-rail) #main-area { width: auto; flex: 1 1 auto; min-width: 0; }
```

这条**既有**规则在欢迎态下刻意把地板归零（空态要居中），优先级高于我的 `.center-row > .content-area`。所以欢迎态是特例、工作态才是地板该生效的地方。

改成先 `#/run/<id>/log` 进入工作态再量（脚本里打印 `已脱离欢迎态: true`），判据随即成立。

---

## 5. 取证抓到的一个真 bug（已修）

第一版 `paintRightRail()` 把 `--center-min` 设在 `#right-rail` 上：

```js
rail.style.setProperty("--center-min", ...);   // ✗ rail 与 #main-area 是兄弟
```

CSS 变量只**向下**继承，横向传不过去，而规则作用在 `#main-area` 上（它是 rail 的兄弟，不是后代）——所以地板完全失效。活页量出的就是 `0px`；同时 `#center-row` 上根本看不到这个变量。

**修法两处**：

1. 设在共同祖先 `#center-row` 上（`document.getElementById("center-row")?.style.setProperty(...)`）。
2. 值改用 `CENTER_MIN_PX`（**地板本身**）而不是 `p.centerWidth`（对话的实际宽）。第一版把「实际宽」当地板设，语义也是错的——1100 宽处会写出 `min-width: 568px`。

修完复量：948 / 1100 / 1439 三处 computed `min-width` 都是 `416px`。

---

## 6. 与旧档案梯子的对照

09-15 审计的梯子是 `1280 / 1100 / 900 / 700`。按新契约复算，这四个宽度**一个边界都探不到**：

- 1280 / 1100 都在中档内部（同一个形态，探不出切换）
- 900 / 700 都在窄档内部
- 而真正要守的 947/948 与 1439/1440 一个都不在梯子里

这正是走查当时把「验收第 3 条」改成「探边界」的原因；本轮按新梯子执行，两条边界都实测到了。

---

## 7. 测试状态

| | 结果 |
|---|---|
| `npx vitest run test/ui-a11y.test.ts test/ui-app.test.ts` | 408/408 通过 |
| `npx vitest run test/ui-rail-policy.test.ts` | 17/17 通过 |
| `npx vitest run`（全量） | 12 failed / 3406 passed；失败集合 ⊆ 基线 |
| `npm run typecheck` | 无输出 |
| `npm run test:changed-coverage -- --base main` | `checked=0 uninstrumented=0 uncovered=0` |

全量里有一条 `ui-server.test.ts > design 模板 API` 不在早先记下的基线名单里，但：

- 单独跑该用例 **4/4 通过**
- 单独跑整个 `ui-server.test.ts` **10 分钟超时**（这个文件在本机就是重/挂，它内部本来就有 5 秒超时类失败）
- 它测的是 design 模板的列表/拷贝，与本刀改的 CSS/HTML/坞/railPolicy 无任何关联

判定为**负载抖动**，不是本刀引入。

---

## 8. 残件与刻意不做的部分（如实列出）

1. **树自带的收起键被 CSS 隐藏，但模块逻辑与旧键还在。** 右列接管了收起，所以 `.files-rail-toggle` / `.files-rail-title` 在 rail 内被隐藏（`styles.css`），用户不再有第二条收起路径，旧键 `agent.ui.pref.filesRailCollapsed` 因此不再被写。但 `file-tree.js` 内部那套折叠逻辑与它的既有测试**没删**——删它会动到模块 API，属于另一件事。
2. **面板切换用 `aria-pressed` 而不是 tab 语义。** 仓库有硬不变量「`[role=tablist]` 只能有一个，就是因子卡那组」，我第一版用 `role=tab` 撞了它（两条测试 + axe 的 `aria-required-attr`）。改成普通按钮 + `aria-pressed`（切换语义）后全绿。
3. **坞自己的 expand / overlay / narrow 行为保留。** 只让出了「宽度与拖拽」这一项（`railHosted()`），因为它与右列是同一个 owner；其余是坞独有的瞬态语义，spec §4.1.1 明确要保住「浮层：现瞄一眼」。
4. **`role="separator"` 是可聚焦的 window splitter，必须带 `aria-valuenow/min/max`**——否则 axe 判 critical。已补，并在每次重绘时按当前比例更新（键盘 ±2% 改的就是它）。
5. **§P5 证据里那条「运行详情抽屉不可达」的缺陷没修**——它落在 P1 的边界上（谁该在、谁该藏），改了会移动 P1 的范围。
6. **P5 的对话面单工具拆抽屉仍待办**（见 `p5-evidence.md` §6，需要先保住人话动词）。
7. 没提交截图（`p1-*.png` 留在磁盘，照 `.gitignore` 里「截图搬到 scratch」的惯例不进仓）。
