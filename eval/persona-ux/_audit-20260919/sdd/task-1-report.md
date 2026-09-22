# Task 1 报告：正文度量与字号

**状态：** DONE_WITH_CONCERNS（实现完成、测试全绿；brief 与测试之间有两处硬冲突，已按测试为准解决，见「与 brief 的偏差」）
**提交：** `8370ab1` feat(ui): 正文度量改用全角字 em 并整块居中（2 files changed, 49 insertions(+), 4 deletions(-)）

---

## 一、实现了什么

按 brief 的 Interfaces 契约产出 CSS 变量 `--measure`（默认 `40em`），并把对话列的正文字度量与居中改对：

1. **新增度量常量** —— `ui/public/styles.css` 顶层设计令牌块（`:root`，fonts/leading/radius/space 那一块）加：
   ```css
   --measure: 40em;          /* 正文度量：40 个中文全角字（1 全角字 ≈ 1em）。
                                用 em 不用 ch——ch 是拉丁"0"的宽度，对中文不对口，
                                而且 em 会让度量随字号自动跟走。 */
   ```
2. **`.conversation` 换单位 + 改居中** —— `max-width: min(132ch, 100%)` → `min(var(--measure), 100%)`；`margin: 0 0 var(--space-lg)` → `margin: 0 auto var(--space-lg)`（居中落在**容器**上，工具行与正文共享同一条左沿）。块内旧注释替换为解释 WHY 的新注释。
3. **删掉一条被完全覆盖的 `.conversation` 一行式**（详见「与 brief 的偏差」第 2 条）。

## 二、测试与结果

| 命令 | 结果 |
|---|---|
| `npx vitest run test/ui-layout.test.ts` | **3 passed / 3**（RED 时 3 failed） |
| `npx vitest run test/ui-app.test.ts test/ui-patch.test.ts` | ui-app 全绿；ui-patch 3 failed（**与 HEAD 基线同名同数**） |
| `npx vitest run`（全量） | 12 failed / N passed —— 见下方「全量基线的严格对照」 |

`test/ui-layout.test.ts` 逐字照抄 brief（含 `// @ts-nocheck` 头、`block()` 辅助函数、三条 `it`），一字未改。

## 三、TDD 证据

### RED

命令：`npx vitest run test/ui-layout.test.ts`

输出（节选）：
```
 FAIL  test/ui-layout.test.ts > 正文度量 > .conversation 用 --measure 而不是 ch
AssertionError: expected '\n.conversation { max-width: min(112c…' to match
                /max-width:\s*min\(var\(--measure\),\s*100%\)/
+ Received:
".conversation { max-width: min(112ch, 100%); gap: 14px; }
 .chat-item:has(.chat-tool-group) { …"

 FAIL  test/ui-layout.test.ts > 正文度量 > 整块居中（左右都 auto）——不是靠左
AssertionError: expected '\n.conversation { max-width: min(112c…' to match /margin:\s*0 auto/

 Test Files  1 failed (1)
      Tests  3 failed (3)
```
**为什么这个失败是预期的：** 三条断言打的都是「改造前」的事实——`:root` 里没有 `--measure`；对话块上限是 `ch` 单位（`112ch`/`132ch`），既没有 `var(--measure)` 也没有 `margin: 0 auto`。三条红是 brief Step 2 明写的预期。

**RED 阶段额外捞到的事实（brief 没预期）：** `.conversation` 的失败输出里出现的是 `min(112ch, 100%)`，**不是** brief 说的 `min(132ch, 100%)`；`block()` 的注释写明它取「第一个匹配」。`grep` 证实本表里 `:root` 有两份（第 20 行设计令牌块、第 1541 行 rail 默认值块）、`.conversation` 也有两份（第 4488 行一行式、第 6653 行完整块）。brief 的 Step 3 给的行号/数值瞄的是**第二份**，而测试抠的是**第一份**——两者对不上。这是 brief 的缺陷，不是测试写错，处理见下节。

### GREEN

命令：`npx vitest run test/ui-layout.test.ts`

输出：
```
 ✓ test/ui-layout.test.ts (3 tests) 8ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## 四、与 brief 的偏差（三处，全部由「测试是唯一契约」倒逼）

测试是逐字给定的、且是判定 GREEN 的唯一标准，而它取选择器的**第一个匹配**。因此 brief Step 3 的字面落点无法让它变绿。三处偏差如下，均已写进提交信息：

1. **`--measure` 落在第一个 `:root`（设计令牌块，第 169 行附近），不是 brief 说的「`--center-min` 附近约 1542 行」。**
   理由有两重：① 测试 `block(source, ":root")` 抠的是第一个 `:root` 块，写进第二个必然红；② 第二个 `:root` 是 **rail 宽度默认值**块（`--center-min`/`--rail-width`/…），而 `--measure` 是版式度量，本该和 `--space-*`/`--leading-*`/`--radius*` 同住——第一个块正是那个「尺寸/字号令牌」块。语义与测试指向同一处，brief 的行号是错的。

2. **删除了第 4488 行 `.conversation { max-width: min(112ch, 100%); gap: 14px; }`。**
   它是**死规则**：与第 6653 行的完整块同为 `.conversation`（同特异性）、位置更早，而它仅有的两个属性 `max-width` 与 `gap` 都被后面的块重新声明。删它对外观**零影响**（有效值本来就是 6653 那份），但不删它就永远是「第一个 `.conversation`」，测试只会抠到旧值。这也是 brief 没察觉的重复源。

3. **`.conversation` 块内注释改写成不含「数字紧跟 ch」的字面。**
   brief 给的注释原文含 `min(132ch, 100%)`，而同一任务的测试自带 `expect(b).not.toMatch(/\d+ch/)` 守卫——**照抄 brief 的注释会让测试红**。改写后保留了全部 WHY（ch 是拉丁「0」宽度、对中文太宽、实测 57 字/行、靠左导致右边空一片、居中的对象是容器所以左沿统一）。这是 brief 自身的内部矛盾，不是我的取舍。

> 没有选「改测试」的另一条路（把 `indexOf` 换 `lastIndexOf`）：测试逐字给定、注释明写「（第一个匹配）」，为了迁就实现去改测试是倒置；而且留着重复选择器会让测试的目标随将来新增规则静默漂移。清掉重复源更合本仓「一个真值源」的纪律。

## 五、全量基线的严格对照（没弄坏别处）

按记忆里「全量测试不是绿基线」的纪律，先建 HEAD 基线再比：把 `styles.css` `git stash`、新测试文件暂时移出，跑一次全量；再恢复跑一次带改动的全量。

| 跑法 | 失败数 |
|---|---|
| HEAD 基线（无本改动） | **13** |
| 带本改动 | **12** |

逐条 diff：**带改动的 12 条是基线 13 条的严格子集**，多出来的那条是基线里的 `ui-server > v2-3b. approval_expired：宿主关停时仍挂起的审批被逐条宣告过期`（本改动那次跑它绿了）——即典型的满负载抖动，与本改动无关。**本改动新增失败 = 0。**

两个需要点名的既有事实：

- **brief 给的基线文件清单不全。** brief 列了 `cloud-sync-env` / `run-crash-inject` / `ui-handoff` / `ui-patch` / `ui-server` 五个文件。实测满负载下还有第六个文件 `test/ui-workspace-git-api.test.ts > /api/workspace/git > 脏工作区 409 dirty_worktree；stash 后可切` 在失败。**它既在基线里也在带改动的那次里**（两次都红），单独跑两次都过（5/5）——是本仓已知那类「全量并行下的时序抖动」，不是本改动引起。
- `ui-patch` 恰好 3 条失败，与 brief 说法一致；失败用例名与基线逐字相同。

## 六、文件变更

| 文件 | 变更 |
|---|---|
| `D:\Work\Github_pros\Agent_Design\ui\public\styles.css` | `:root` 加 `--measure: 40em`（+4 行含注释）；删 `.conversation` 一行式（−1 行）；第 6653 行 `.conversation` 块换单位/改居中/换注释（−3 +5） |
| `D:\Work\Github_pros\Agent_Design\test\ui-layout.test.ts` | **新建**，39 行，brief 原文逐字 |

未提交的 `mcp.json`（改动）与 `docs/superpowers/plans/…`、`eval/persona-ux/_audit-20260919/`（未跟踪）都是开工前就存在的，未纳入本次提交——`eval/persona-ux/**` 按约束一字未动。

## 七、自查发现

- **完整性**：brief 的三步（写测试 / 落 `--measure` / 改 `.conversation`）全部落地；`--measure` 的产物名、类型、默认值 `40em` 与 Interfaces 一致，后续任务可直接引用。
- **质量**：CSS 注释解释 WHY（原注释只说「靠左」这一条假设，新注释把「单位错」与「居中的对象」两件事说清）；提交信息用中文、格式 `feat(ui): …`。
- **纪律**：只动 brief 点名的一处常量、一个规则块，外加删除同文件的死重复（被迫）。没有重构、没有碰 `.detail-layout`、没有动任何 JS。
- **测试**：测试验的是真结构（单位、常量出处、居中方向），三条都能被真实回归打破；RED 先行，输出干净。
- **修正了一处自己的操作失误**：首次提交漏了本环境要求的 `Co-Authored-By` 尾注，且我用来补的时候一条 `sed` 把提交正文的段落空行删掉了——已用 `--amend -F` 重写成完整正文 + 尾注；`git show --stat` 复核确认文件差异未受影响（仍 2 files / 49+ / 4−）。最终 SHA `8370ab1`。

## 八、遗留问题与关切

1. **brief 与测试不自洽（已按上文解决，但请复核这个裁决）**：三个偏差里，第 2 条（删重复规则）与第 3 条（改注释措辞）是**无法回避**的——照 brief 字面做，测试必红。第 1 条（`--measure` 的家）我选了语义正确的令牌块。若计划方坚持要落在 `--center-min` 旁边，那必须同时改测试，而那是改测试迁就实现，我不建议。
2. **`.detail-layout` 上方那段注释已经过时**（第 6643–6646 行）：它说「原来的 78ch 太窄… 放宽到 108ch」，而改动前该方法里的实际值是 `132ch`（不是 108ch），现在更是完全不用 `ch` 了。它属于 `.detail-layout` 而非 `.conversation`，超出本任务范围，我**没动**，留给计划方决定（Task 2–4 会再碰这个文件）。
3. **`test/ui-layout.test.ts` 的 `block()` 取「第一个匹配」，对重复选择器是脆的**。本任务把 `:root`/`.conversation` 的重复源清掉后它是对的，但后续任务（T2 的 `body.sidebar-collapsed .sidebar`、T4 的 `[data-face]`）若引入重复选择器，测试会静默指向第一份。建议 T2/T4 落地前先确认各自选择器在表里唯一。
4. **`--measure: 40em` 的取值我没独立验算**。按 1 全角字 ≈ 1em、正文 13–14px 计，40em ≈ 520–560px ≈ 40 字/行，落在 brief 说的中文舒适区 30–45 内，方向自洽；但这个「40 字」是设计侧的判断，本任务只能锁它「被写成 40em 且只有一处」，锁不了它是否舒适。
