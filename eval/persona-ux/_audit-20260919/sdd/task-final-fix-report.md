# 最终修复轮报告（fix/capability-visibility）

审查判定：With fixes（0 Critical、4 Important、8 Minor）。本报告逐条交代"合并前修"七项的执行与证据。

两笔提交：

- `fa96229` fix(ui): 能力条说真话 —— 核查格接到 composer 的开关上
- `97d5323` test(ui): 补三处锁与三处注释——脱钩、宽度正则、右栏顺序

---

## I1（Important · 唯一改行为）核查格接到 composer 开关

**改了什么**

- `ui/public/index.html` `syncComposer` 内（原 2348 行）：
  `patchCapabilityBar(selectedState ?? {}, harnessSnapshot)`
  → `patchCapabilityBar({ ...(selectedState ?? {}), verify: verifyToggle?.checked === true }, harnessSnapshot)`，
  并按裁决加注释：verify 一律以 composer 开关为准。
- `ui/public/index.html` `verifyToggle` 初始化块（3422 行一带）加 `change` 监听：
  勾选/取消当场重画芯片，不等下一次 syncComposer；注释说明设置页
  `applyComposerDefaults` 走 `.checked` 赋值不触发 change，那半边走它自己的重画时机。
- `test/ui-capability-visibility.test.ts`：
  - 行为断言：既有"核查关着才出；开着不占位"补上 `capabilityChips({}, null)` 也出「核查关」——
    锁审查者点名的默认路径（undefined 不许滑进"开着"那半）。
  - 接线断言（与 I2 同 describe）：`syncComposerRegion(html)` 一带确实读到 `verifyToggle`
    （新增 `syncComposerRegion` 辅助：从函数声明抠到下一个段落标题，只锁函数体一带）。

**红/绿证据（先证红，再改）**

红（修复前，HEAD 原样跑新测试）：

```
 FAIL  test/ui-capability-visibility.test.ts > 装配条挂载点（防再次脱钩） > syncComposer 一带真的读到 verifyToggle
AssertionError: expected 'function syncComposer() {\n  const info = ...' to contain 'verifyToggle'
 ❯ test/ui-capability-visibility.test.ts:151:38
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

失败输出里可见抠出的函数体确实是 syncComposer 一带，且其中只有
`patchCapabilityBar(selectedState ?? {}, harnessSnapshot);`——开关没被读。行为断言（`{}` 也出「核查关」）此时即绿，它锁的是纯函数语义。

绿（修复后）：`npx vitest run test/ui-capability-visibility.test.ts` → **13/13 passed**。
邻域回归：`test/ui-app.test.ts`(295) + `ui-layout`(9) + `ui-rail-policy`(46) + `ui-next-suggestion`(12) → 362/362 passed。

---

## I2（Important · 锁）调用点没被锁——加"syncComposer 真的调了 patchCapabilityBar"

**改了什么**：`test/ui-capability-visibility.test.ts` 装配条挂载点 describe 新增一条：
`expect(syncComposerRegion(html)).toContain("patchCapabilityBar(")`。
只锁函数体一带，不是全文件——名字在 603 行的 import 列表里也出现，
全文件断言会把"import 了但没调用"当成"线还在"。

**红/绿证据（变异验证）**：临时删掉 `index.html` 里那一行调用：

```
 FAIL  test/ui-capability-visibility.test.ts > 装配条挂载点（防再次脱钩） > syncComposer 一带真的调用 patchCapabilityBar（不是只在 import/注释里出现）
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```

恰只红这一条（其余 13 条含既有 12 条全绿——正是审查者说的"删掉那一行全绿而能力条死掉"的场景，现在被抓住了）。还原后 14/14 绿。还原经 `git diff` 核过：index.html 与 HEAD 逐字节一致。

---

## I3（Important · 锁）48px 宽度断言有洞

**改了什么**：`test/ui-layout.test.ts:53` `/width:\s*48px/` →
`/(?<!-)\bwidth:\s*48px/`，附注释说明 min-width 不算数、回落后果（`.sidebar { width: 280px }`）。

**红/绿证据（变异验证）**：临时删掉 `styles.css` 里 `width: 48px;` 那一行（很象样的"min-width 已覆盖"清理）：

```
 FAIL  test/ui-layout.test.ts > 左栏收起态是图标条，不是消失 > 收起态仍占 48px 且不 display:none
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

旧正则在此变异下照绿；新正则红了。还原后 9/9 绿，`git diff` 核过 styles.css 与 HEAD 逐字节一致。

---

## I4（Important · 注释）sidebarRailItems 的第五次"现在时假陈述"

**改了什么**：`ui/public/app.js` `sidebarRailItems()` 的 JSDoc 删掉
「DOM 侧由 index.html 的控制器按 id 找按钮」，改成实话：
它是能见度契约、**当下还没有消费者**；点名真实按钮
`#new-chat-btn / #board-open-btn / #artifacts-open-btn / #schedules-open-btn / #memory-btn / #settings-open-btn`
（已逐个核过 index.html 里的真实 id）；注明全仓读这份名单的只有测试与 JSDoc。
未接线、未删函数——按裁决那是单独立项。

---

## T1-2（Minor · 注释）"放宽到 108ch"是假话

**改了什么**：`ui/public/styles.css`（原 6675 行）「放宽到 108ch，并给右栏预留 clamp 宽度」
→「度量改成 --measure: 40em（全角字宽，见 :root；ch 在这个文件里已经不存在），
并给右栏预留 clamp 宽度」。

---

## T3-2（Minor · 锁）0×0 真修复没有自动锁

**改了什么**：`test/ui-rail-policy.test.ts` 既有「样式锁（styles.css）：split 真并排」describe 新增一条：
`split 的 preview 显形规则存在，且排在空槽 hider 之后（同特异性按源顺序后者胜）`。
用 `indexOf` 不用正则——同选择器在 1670 处还有一条 `display:none` 孪生规则，
正则只认"出现过"会把孪生当成修复；先做 `\r\n` 归一化（与 `block()` 同款，工作树是 CRLF）。

**证据**：断言当前绿（47/47）；`hider` 与 `reveal` 两个位置都解析到（否则先红）。
本组变异验证按任务只对 I1/I3 必做，未做；断言本身直取唯一单行规则文本，无洞可滑。

---

## T3-3（Minor · 注释）承重注释漏了 1670 孪生规则

**改了什么**：`ui/public/styles.css` split 显形规则上方的承重注释补一段：
「另注意 1670 处还有一条同选择器的 display:none 孪生规则（面板互斥的旧账），
清理 split 规则区时别把本条并进它——那里任何一条都同样压得过这条。」

---

## T3-4（Minor · 注释）TREE_MIN_PX 的常量耦合

**改了什么**：`ui/public/core/rail-policy.js` `TREE_MIN_PX` 注释补：
下限只在 `RAIL_MIN_PX (240) ≥ TREE_MIN_PX (200)` 时成立；若夹紧下界掉到 200 以下，
`Math.min` 会静默把树压回下限之下、preview 归 0，而三条 `railWidth` 全 ≥240 的测试一条都不红。
改这两个常量时先过这条账。

---

## 命令与结果汇总

| 命令 | 结果 |
|---|---|
| `npx vitest run test/ui-capability-visibility.test.ts`（修复前） | 1 failed / 12 passed（I1 红，已贴） |
| `npx vitest run test/ui-capability-visibility.test.ts`（修复后） | 13/13 passed |
| `npx vitest run test/ui-app.test.ts test/ui-layout.test.ts test/ui-rail-policy.test.ts test/ui-next-suggestion.test.ts` | 362/362 passed |
| I2 变异：删 index.html 调用行 | 恰 1 红（已贴）→ 还原 |
| I3 变异：删 styles.css `width: 48px` | 恰 1 红（已贴）→ 还原 |
| `node .superpowers/sdd/2026-09-19-scheme-a-skeleton/check-eol.mjs` | 全部文件裸 LF = 0；index.html 与 HEAD 逐字节一致 |
| `npx vitest run`（全量） | 见下 |

## 全量基线对照

基线（审查者实测）：3630 条、12 稳定失败（cloud-sync-env×2、run-crash-inject×1、
ui-handoff×4、ui-patch×3、ui-server×1）+ 两条已知并行抖动。
判据：**不许有基线之外的新失败**。

**HEAD 全量**（`npx vitest run`，169s）：**3606 passed / 12 failed / 15 skipped（3633）**，
失败名单与基线逐一比对：

| 文件 | 条数 | 与基线 |
|---|---|---|
| cloud-sync-env | 2 | 同名同条 ✓ |
| run-crash-inject | 1 | 同名同条 ✓ |
| ui-handoff | 4 | 同名同条 ✓ |
| ui-patch | 3 | 同名同条 ✓ |
| ui-server | 2 条测试 + 1 个套件 | 见下 |

ui-server 拆解（这条最费事，单独核过）：
- 「跨 run 资源互斥：stm32」——**隔离跑也红**，基线稳定失败（审查者账上的 ui-server×1）。
- 「v2-3b. approval_expired」——5s 超时，**只在全量并行负载下红**；隔离跑在
  HEAD 与基线 13f8759 **都绿**。属已知并行抖动。
- 「产物取件：圈禁比功能更要紧」是 **Failed Suite**（afterAll `EBUSY: resource busy
  or locked, rmdir ...\Temp\artifact-*`，Windows 临时目录清理竞态）——基线 13f8759
  隔离跑**同样红**，与我的改动无关。

**证法**（不是只看数字）：`git worktree add` 到基线 `13f8759`（junction 复用
node_modules），同一批文件在两边各跑一遍、按**失败测试名**比对——
11 个稳定失败在基线同名同条全红；ui-server 隔离跑在基线与 HEAD
**结果逐条一致**（1 测试 + 1 套件红，276 绿）。结论：**零新增失败**。

（全量跑里 recap 标 "Failed Tests 12" 却列 13 条，是因为 vitest 把那条
EBUSY 套件失败单独归进 "Failed Suites 1"、又并进了 recap 列表。）

## 未提交物说明（不是我的，不动）

- `mcp.json` 的 `M` 是会话开始前就有的既有改动，未提交。
- `docs/superpowers/plans/2026-09-19-scheme-a-skeleton.md` 与
  `eval/persona-ux/_audit-20260919/**` 两个未跟踪归档物仍在工作树里，留待分支收尾入仓。
