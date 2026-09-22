# Task 3 报告：坞头的标签条不再被挤成 0 宽

**Status: DONE_WITH_CONCERNS**（修法按 brief 落地、四条判据全绿；有一条对 brief 的勘误必须报给控制者——见「Issues and concerns」①③）

## What I implemented

- `ui/public/styles.css`：`.ac-tabs` 的 `min-width: 0` → `min-width: 6rem`（96px），上方加注释，**注释里的数全部来自活页实量**（固定成本 190、坞 159、余量 −31、短标签实宽 79.9）。
- `test/ui-layout.test.ts`：追加 describe「窄坞下的标签条」，两条测试逐字按 brief Step 2。
- `eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs`：新建活页探针（四条判据 + Step 1 实量段）。
- 提交：`edebe8b fix(ui): 窄坞下的标签条不再被挤成 0 宽`（message 逐字用 brief Step 8，含它给的那条 Co-Authored-By 尾行——按"逐字"执行，未换成我自己的署名格式）。

## Step 1 的实量过程与数

**工具**：在 `verify-dock-tabs.mjs` 里写了一段逐成员量宽（`getBoundingClientRect`），跑在审计宿主 `http://127.0.0.1:4201`（未动 4173、未新起宿主），视口 1600×900、`rightRail={fraction:0.45, splitRatio:0.55, panel:preview, collapsed:false}` → rail 被 RAIL_MAX_PX 夹到 360、tree=200、preview=160（与委托方实测同条件，坞复现 159）。

**量到（修前）**：

```
坞 clientWidth=159 · hidden=false · 坞头 clientWidth=159（scrollWidth=190，横滚=true）
  收起键 .pd-collapse     32px
  标签条 .ac-tabs         0px
  加号键 .ac-tab-add      32px
  放大键 .pd-expand       70px
  padding-inline=32 · gap=8 · 标签数=10 · 第一个标签宽=79.9
  固定成本（除标签条外全体）= 成员 32 + 32 + 70 + padding 32 + gap 8×3 = 190px
  坞 159 − 固定成本 190 = -31px（标签条实得，修前应为 0）
```

算进固定成本的成员：padding-inline 16×2（32）、收起键 32（CSS 硬地板 32 证实）、加号键 32（CSS 硬地板 32 证实）、放大键 70（btn--ghost 实宽，icon+「放大」）、gap 8×3（4 个 flex 成员之间）。`.ac-title` 是 `sr-only`（absolute，不占 flex 位），不算。

**两个 brief 没料到的数**：① 固定成本 190 **大于** 坞 159（余量 −31，不是 brief 预期的正数）；② 第一个短标签实宽 79.9px。brief 的退路值 6rem=96px 覆盖 79.9 有余，故取 6rem，注释写明实量依据（不写"未实量"——因为真量了）。

## TDD Evidence

**RED**（实现前，`npx vitest run test/ui-layout.test.ts`）：

```
Test Files  1 failed (1)
     Tests  1 failed | 23 passed (24)
× 窄坞下的标签条 > 标签条有下限，不再是唯一能被压到 0 的成员
✓ 窄坞下的标签条 > 坞头仍然自己横滚（那条注释说的意图没被这条修复顶掉）
```

红的那条收到的规则块正是 `.ac-tabs { display:flex; flex:1 1 0; min-width:0; … }`——现状喂不饱 `(?!0\b)`。

**负向断言有效性验证**（临时把 `(?!0\b)` 去掉，看第一条变绿，随后装回）：

```
Tests  24 passed (24)   ← 去掉后全绿：证明红是断言造成的，不是别的原因
```

**GREEN**（实现后）：`Tests  24 passed (24)`。

## 变异验红的两组原始输出

**变异 A：删掉 `min-width: 6rem;` 那行**

```
× 窄坞下的标签条 > 标签条有下限，不再是唯一能被压到 0 的成员  7ms
✓ 窄坞下的标签条 > 坞头仍然自己横滚（那条注释说的意图没被这条修复顶掉）  2ms
Test Files  1 failed (1) · Tests  1 failed | 23 passed (24)
```

→ 还原。

**变异 B：单独删掉 `.ac-head` 的 `overflow-x: auto;`**

```
× 窄坞下的标签条 > 坞头仍然自己横滚（那条注释说的意图没被这条修复顶掉）  6ms
Test Files  1 failed (1) · Tests  1 failed | 23 passed (24)
```

（第一条保持绿。）→ 还原，复跑 24 全绿。

## 活页探针的原始输出

**先探针后修**（CSS 未改时跑 `node eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs`）：

```
靶 run=94f58b8a-5a5a-4d7d-9992-87e79f87ce78（产物 7 件，链头）
—— 判据 ——
① .ac-tabs clientWidth > 0：0px（scrollWidth=930 scrollLeft=80）→ ★ 红
② 第一个标签中心点：被 BUTTON.btn 接走（第一个标签宽 79.9px）→ ★ 红
③ 坞头横滚 scrollWidth(190) > clientWidth(159) → ✅
④ 控制台错误：零 · 页面异常：零 → ✅
★ 有判据没达标——看上面哪一条红
```

① 红（clientWidth=0，老 bug 的直接反证）✓。**③ 修前就是绿的**——固定成员自己（190）就超了 159 的坞，坞头的滚动条修前已经存在；见 Issues ③。

**修后**（同一探针、同一宿主、同条件）：

```
① .ac-tabs clientWidth > 0：96px（scrollWidth=930 scrollLeft=0）→ ✅
② 第一个标签中心点：命中（第一个标签宽 79.9px）→ ✅
③ 坞头横滚 scrollWidth(286) > clientWidth(159) → ✅
④ 控制台错误：零 · 页面异常：零 → ✅
✅ 四条全成立：标签条不再被挤成 0 宽，第一个标签可见、坞头横滚生效、0 控制台错误
```

探针抓得住（修前 ①红 → 修后四条全绿），截图落 `eval/persona-ux/_verify-shots/verify-dock-tabs.png`。

**探针的一个实现细节（报备）**：页面里有两只坞——`#artifact-canvas-view`（活）与 `#file-preview-overlay`（hidden、0×0，它的 `.ac-head` 在 DOM 序上排第一）。初版探针直接 `querySelector(".ac-head")` 量到了死坞（全 0），已改成圈在 `#artifact-canvas-view` 里量；`verify-artifact-tabs.mjs` 一行没动。

## `.ac-tabs` 在 styles.css 里有几处规则块

**1 处**（`grep -n "^\.ac-tabs"` → 仅 `9602:`）。`block()` 首个匹配即目标，无歧义。附带勘误：brief 给的号位偏了——`.ac-tabs` 实为 9602-9609（brief 写 9586-9593）、`.ac-head` 实为 9551-9562（brief 写 9535-9546）。

## 全量测试的零新增证据

两次全量跑在**同一棵树、同一目录、同一 diff** 上，失败集成员自己就在动（12 → 18/19），证明成员漂移是套件自身的轮换抖动（与仓库记忆「11 确定 + 1 轮换抖动」一致），不是我的 diff：

- 全量第 1 跑（我的修改已在树上）：`5 failed files / 12 failed tests`。
- 全量第 2 跑（同一棵树）：19 个 FAIL 块，多出的成员全在 git-API/message-queue/models-api 等文件。

逐文件隔离复跑，**稳定失败恰是委托方给的 11 条基线**，其余全部通过：

| 文件 | 隔离跑结果 | 对照基线 |
|---|---|---|
| cloud-sync-env | 2 failed | 基线 ×2 ✓ |
| ui-handoff | 4 failed | 基线 ×4 ✓ |
| ui-patch | 3 failed | 基线 ×3 ✓（期望 `.starter-tiles…` 等 selector，与本任务无关） |
| run-crash-inject | 1 failed（互斥超时那条之外的均过） | 基线 ×1 ✓ |
| ui-server | 1 failed（跨 run 互斥 5s 超时） | 基线 ×1 ✓ |
| ui-message-queue / ui-models-api / ui-github-pr-api | 26/26 全过 | 全量时被负载拖红，非新增 |
| ui-workspace-git-api / workspace-git | 全过（289 条中仅 ui-server 那条红） | 非新增 |

交叉排除：**除 ui-layout 外没有任何测试文件引用 `.ac-tabs`/`.ac-head`**（grep 全 test/ 目录）；19 个失败文件里唯一读 styles.css 的是 ui-patch，其 3 条失败期望的是 `.starter-tiles` 族 selector，与我改的 `.ac-tabs` 块无关。`ui-layout.test.ts` 24/24 全绿。

## check-eol.mjs 的输出（提交后）

```
✅  ui/public/styles.css       CRLF=11145 裸LF=   0 字节 279092/279092
✅  test/ui-layout.test.ts     CRLF=  268 裸LF=   0 字节 10466/10466
✅  eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs CRLF=  243 裸LF=   0 字节 10559/10559
```

（提交前跑过一次：两文件因内容已改而报"与 HEAD 不逐字节相同"是必然的，但 裸LF=0 已确认；提交后三行全 ✅。`git status` 只见一条与任务无关的 `M mcp.json`（任务开始前就在，未动、未提交）。）

## Files changed

- `ui/public/styles.css`（`.ac-tabs` 一块：注释 + `min-width: 6rem`；`.ac-head` 未动）
- `test/ui-layout.test.ts`（+22 行：新 describe）
- `eval/persona-ux/_audit-20260919/verify-dock-tabs.mjs`（新建）
- 未动：`ui/public/core/rail-policy.js`（只读）、`eval/persona-ux/**` 既有探针（尤其 `verify-artifact-tabs.mjs` 的打印行）。

## Self-review findings

- 纪律四条全守：railPolicy 没动；既有探针没动；变异两处都验了；check-eol 三行 ✅。
- 注释说的是实话：每个数都能在探针输出里对上（190=32+32+32+70+24，159，−31，79.9）。常量不是编的。
- 自修一处：初版探针选错坞头（量到 hidden 的死坞），已在"先探针后修"完成前改正并用同一版探针完成前后对拍。

## Issues and concerns

1. **brief 的修法叙事有一处与实测不符（重要，报控制者）**：brief 说"横滚只在成员都不能再缩时才触发……永远轮不到滚动"。实测：固定成本 190px > 坞 159px，**坞头的滚动条修前就已经在**（scrollWidth 190 > clientWidth 159，滚的是按钮；被压没的是标签条）。修后 scrollWidth 286 > 159。因此**判据 ③（`scrollWidth > clientWidth`）在修前修后都成立，不是前后判别器**——委托方只要求"先探针后修"看 ① 红（已做、已红），③ 按 brief 逐字实现为修后成立；但若后续要 ③ 当判别器，需换成"标签条地板参与撑出的增量"类判据。
2. **brief 的"159 − 固定成本 = 标签条实得"预期余量为正**，实量为 −31（固定成员自己就超宽）。CSS 注释按实量写，未沿用 brief 模板里"固定成本之外至少留得下一个短标签"的字面表述（那句话在 190>159 的事实下不成立）。
3. brief 号位三处偏了（.ac-tabs 9602-9609、.ac-head 9551-9562、`.ac-tab-add` 9662-9667 而非 9646-9651），不影响实现。
4. 提交尾行按"逐字"保留了 brief 的 `Co-Authored-By: Claude Opus 4.8 (1M context)`，与我的模型署名不同——若控制者要统一格式可 amend。
5. 探针复现依赖右列档案：initScript 只在无偏好时写 `fraction:0.45/splitRatio:0.55`（与 verify-artifact-tabs 同法），换宿主/换档案时判据 ③ 的 190/159 数字可能变，但 ①②④ 与修法无关。

---

## Fix round 1（控制者回批）

控制者核了我的三条顾虑（全对），已订正计划并提交 `e6d7c30`（「横滚永远轮不到」那句假机制、`159 − 固定成本` 的负余量、`.ac-tabs` 号位）。本轮只改一处：探针头部判据 ③ 的说明——原句「证明修法走的是作者写的那条路，不是别的」是假话（修前 ③ 也成立），已按控制者给的措辞改为「横滚仍然成立……**不是前后判别器**……回归护栏……真正的判别器是 ① 与 ②」。**本轮只改注释，判据未动，无行为变化，未做变异验红。**

验证输出（改后跑一次，与改前逐行相同、exit 0）：

```
① .ac-tabs clientWidth > 0：96px（scrollWidth=930 scrollLeft=0）→ ✅
② 第一个标签中心点：命中（第一个标签宽 79.9px）→ ✅
③ 坞头横滚 scrollWidth(286) > clientWidth(159) → ✅
④ 控制台错误：零 · 页面异常：零 → ✅
```

提交：`56b5158 docs(probe): ③ 的判据说明改为实话——它不是前后判别器，只是回归护栏`（本轮 message 未被逐字指定，Co-Authored-By 用我自己的署名行）。check-eol：✅ CRLF=245 裸LF=0 字节 10681/10681。

---

## Fix round 2（任务审查回批）

审查者证明我上一轮"CSS 注释保留"是被错判：`styles.css` 里那句「横滚只在成员都不能再缩时才触发」正是被推翻的机制句，且与同一条注释里我写下的 `190>159`（修前就在滚）自相矛盾；「坞头随即横滚」同样暗示修后才开始滚。**本轮只改注释，判据未动、无行为变化、未做变异验红。**

改动三处：
1. `styles.css` 病根句 → 「但那条横滚滚的是坞头自己那一行——而这里原本」
2. `styles.css` 结尾句 → 「完整可见。**坞头修前就已经在滚**（固定成员自己就溢出），这条下限改的是**标签条自己的宽**——让那 930px 的内容不再关在一个 0 宽的盒子里。」
3. `test/ui-layout.test.ts` 新 describe 的 docstring 同步订正（「横滚永远轮不到」→ 坞头自己那一行在滚 + 固定成员 190>159 + 下限让 930px 内容不再关进 0 宽盒子）

验证（证明判据与结果都没变）：
- 聚焦测试：`Tests 24 passed (24)`；
- 探针 exit 0，四条输出与上一轮**逐行相同**：
  `① 96px → ✅ / ② 命中 → ✅ / ③ 286>159 → ✅ / ④ 零 → ✅`；
- check-eol 三个文件：✅ CRLF 11146/269/245 · 裸LF=0 · 与 HEAD 逐字节相同。

提交：`88500a8 docs(css,test): 清掉注释里被推翻的假机制句`。
