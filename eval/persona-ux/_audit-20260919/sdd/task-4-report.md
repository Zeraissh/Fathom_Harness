# Task 4 Report: 两脸骨架分化的开关

## Status

DONE_WITH_CONCERNS（一处 brief 文本之外的改动：给 git 芯片补 `workspace-git-chip` 类——活页实测抓出 brief 的 CSS 钩子在 DOM 里不存在，规则写了等于没写；CSS 与测试保持 brief 逐字）

## What was implemented

1. **`ui/public/app.js`** — 在 `deriveComposerMode`（原 2928 行）正上方新增 `deriveFace(input)`，逐字按 brief（含整段 WHY 注释）。
2. **`ui/public/index.html`**
   - import 列表（`/app.js` 块）加 `deriveFace`。
   - `syncComposer()` 里、`patchComposer(composerMode)` 之前写入 `document.body.dataset.face = deriveFace({ face: null, workspace: workspaceFace });`。brief 的 `workspaceFaceExplicit` 变量**不存在**（已核实：脸切换控件 `applyWorkspaceFace` 写的就是 `workspaceFace` 全局本身，没有第二份来源），按控制器指示用 `null`，并补了两行 WHY 注释（显式位留给后续「按会话存脸」）。
   - **brief 之外的改动（活页实测逼出）**：给 `#workspace-git-chip` 元素补上 `workspace-git-chip` 类。brief 的 CSS 选择器 `.workspace-git-chip` 在 DOM 里匹配不到任何元素——该元素只有 `id="workspace-git-chip"` 和 `scope-field scope-field--git` 类。补类后 CSS 与测试保持 brief 逐字，且活页行为达标（见下）。
3. **`ui/public/styles.css`** — 末尾追加 brief 的两条规则，逐字。
4. **`test/ui-app.test.ts`** — import 加 `deriveFace`；末尾追加 brief 的逐字 describe「deriveFace：两脸只有一个判据」。
5. **`test/ui-layout.test.ts`** — 末尾追加 brief 的逐字 describe「两脸差异只收在 [data-face] 上」。

## What was tested and results

### RED（Step 2）

```
npx vitest run test/ui-app.test.ts test/ui-layout.test.ts -t "deriveFace|两脸差异"
```

结果：**3 failed / 1 passed**（299 skipped），与 brief 预期逐项一致：

- `TypeError: (0 , deriveFace) is not a function` ×2（deriveFace 两条用例）；
- `Error: 找不到选择器 body[data-face="work"] .workspace-git-chip`（`block()` 在 test/ui-layout.test.ts:23 抛出）；
- 第 4 条（「CSS 里不许出现别的脸判据」）**本来就绿**——仓库里没有任何 `body.is-office/is-code/face-code/face-work`，它是回归护栏，红不了是预期的。

### GREEN（Step 4）

```
npx vitest run test/ui-app.test.ts test/ui-layout.test.ts
```

结果：**2 files / 303 tests 全部通过**（ui-layout 8 条、ui-app 295 条）。

### Step 5 活页（真浏览器，Playwright，宿主 4201）

brief 点名的 `verify-ab.mjs` 我**没有跑**：它的内容是 A+B 活页验收（next-actions 幽灵/Tab 采纳），与两脸无关，且跑它会往 `eval/persona-ux/_audit-20260919/shots/` 写截图——eval/persona-ux 是档案不许动。Step 5 描述的行为（切 Work/Code 量 `data-face` 与芯片可见性）我用仓库根目录的临时脚本（跑完即删，未落库）直接量了：

| 状态 | body.dataset.face | 芯片 computed display（摘掉 hidden 后） |
|---|---|---|
| 初始（office） | `work` | `none` ✓ |
| 点 Code | `code` | `flex` ✓ |
| 点回 Work | `work` | `none` ✓ |

console errors 为 0。芯片带 `hidden` 时恒为 `none`（`[hidden]{display:none!important}` 全局护栏，控制器已预告）——hidden 由 git 数据有无驱动（`workspace-git.js` 的 `root.hidden = !present`），欢迎页无 workdir 故 hidden；两脸 CSS 骨架本身的翻转（none/flex/none）已由「摘掉 hidden」一列证实。

### 全量测试

`npx vitest run` 共三次：

- **第 1 次：11 failed**——全部落在文档基线集合内（cloud-sync-env×2、run-crash-inject×1、ui-handoff×4、ui-patch×3、ui-server×1[互斥超时抖动]）。
- **第 2 次（只 grep FAIL 行）：12 failed**——恰好等于文档基线的 12 稳定失败，逐条同名。
- **第 3 次（终态）：13 failed**——基线 12 + 多出 1 条 `ui-server > 产物取件：圈禁比功能更要紧`。

对多出的那条做了归因：`ui-server.test.ts` 只 import vitest/node 内建/`src/*`，本次 diff **零 `src/` 改动**；该用例在我代码在场时单独跑（`-t 产物取件`）**17/17 全绿**；再单独全文件跑 ui-server 它又绿了（那次只剩互斥 1 条红）。结论：并行/时序抖动，与本次改动无关。**零新增确定性失败**，两个被测文件全绿。

## Files changed

- `ui/public/app.js`（+14）
- `ui/public/index.html`（+8/−1：import 1 行、syncComposer 4 行、芯片类 1 行+注释 2 行）
- `ui/public/styles.css`（+4）
- `test/ui-app.test.ts`（+15）
- `test/ui-layout.test.ts`（+13）

提交：`eca67a0 feat(ui): 两脸骨架分化收在一个 data-face 属性上`（5 files, +54/−1；mcp.json 的既有改动未纳入）

## 与 brief 的差异（两项）

1. **`workspaceFaceExplicit` → `null`**。brief 备注「若该变量尚不存在，用 null」，控制器已核实不存在并指示写法；我独立复核确认脸切换控件写的就是 `workspaceFace`，无第二来源。补 WHY 注释。
2. **给芯片补 `workspace-git-chip` 类（brief 文本之外）**。活页第一测证明：brief 的规则逐字落地后，Work 脸下芯片摘掉 hidden 仍是 `flex`——选择器匹配不到元素。根因是计划作者把 id 当成了类。最小修法选补类而非改 CSS/测试：CSS 与测试保持 brief 逐字不动，diff 只有 1 行 markup；类名与既有 id 一致，不算新概念。若审查希望改法反过来（改选择器为 `.scope-field--git` 或 `#workspace-git-chip` 并同步改测试），是一行级改动。

## Self-review findings

- **完整性**：brief Step 1–6 全部执行；四个落点（app.js / index.html / styles.css / 两个测试文件）与 brief 的文件清单一致；无多余文件（临时探针脚本已删）。
- **质量**：注释均为中文 WHY（漂移病灶、显式位为何空、双类并存原因），与仓库风格一致。
- **纪律**：`deriveFace` 是全应用唯一新脸判据（diff 中无第二处脸判断；负向测试锁着 `body.is-office/is-code` 等不得出现）；`eval/persona-ux/**` 未动（未跑会写档案的 verify-ab.mjs）；五个文件纯 CRLF（0 个 lone LF）；提交只含 brief 指定的 5 个文件。
- **测试**：TDD 红-绿成立（红的 3 条与 brief 预期完全同名同因）；活页证据来自真实浏览器真实读数，未造假；全量三跑零新增确定性失败。

## Issues / concerns

- 审查重点在差异 2（补类 vs 改选择器的取舍）与 syncComposer 里 `face: null` 的两行 WHY 注释。
- `ui-server 产物取件` 是文档基线 12 条之外的观察：满并行/整文件跑会偶发红、隔离跑绿、本次 diff 无 src 改动——判为既有抖动，但不在控制器给的基线清单里，故单列。
- brief 点名的 Step 5 脚本与 Step 5 描述不符（脚本验 A+B 而非两脸），且会写 eval/persona-ux 档案；以临时脚本按 Step 5 描述验收，控制器可独立复测。

## Fix round 1

reviewer 回的一条 Important：两脸测试只读 `styles.css`，全仓没有断言 `index.html` 里那个元素真的带着 `workspace-git-chip` 类——类被静默删掉时 303 条全绿而 bug 复活。本轮补回归锁 + 顺带修正 JSDoc 事实错误。

### 改了什么

1. **`test/ui-layout.test.ts`**：顶部 `css()` 旁加 `html()` 读 index.html；在**已有的** `describe("两脸差异只收在 [data-face] 上")` 里追加第 3 条用例「芯片元素真的带着 workspace-git-chip 类（不然那两条规则匹配不到任何东西）」——取整个标签再断言"类与 id 在同一个标签里"，避免 `toContain` 退化（注释里就出现这个词）。
2. **`ui/public/app.js`**：`deriveFace` 的 JSDoc 末尾补「现状注」——"全应用只有这一个判据"是**目标态**不是现状，点名还留在 `<aside#sidebar data-workspace-face>` + 两个脸按钮（JS 态标记，CSS 已不挂，`test/ui-file-tree.test.ts:291-297` 负向锁着）与 `designModeActive = workspaceFace === "office"` 的判断。
   - **与协调者建议文本的一处出入**：建议文本写「三处」，grep 实测全 `ui/public` 树里该赋值**只有两处**（`index.html:1403` exitDesignMode、`index.html:4823` 初始化）。注释与提交信息都按实测写「两处」——这条修复的本意就是注释不许有假陈述，把假数字写进去会重犯同一个错。

### 验红（先删类，硬性要求）

```bash
sed -i 's/class="scope-field scope-field--git workspace-git-chip"/class="scope-field scope-field--git"/' ui/public/index.html
npx vitest run test/ui-layout.test.ts -t "芯片元素"
```

红的样子（错误落在 `class="..."` 断言那行，收到的标签里类已不在）：

```
FAIL test/ui-layout.test.ts > 两脸差异只收在 [data-face] 上 > 芯片元素真的带着 workspace-git-chip 类（不然那两条规则匹配不到任何东西）
AssertionError: expected '<div class="scope-field scope-field--…' to match /class="[^"]*\bworkspace-git-chip\b[^"]*"/
- Expected: /class="[^"]*\bworkspace-git-chip\b[^"]*"/
+ Received: "<div class=\"scope-field scope-field--git\" id=\"workspace-git-chip\" hidden>"
 ❯ test/ui-layout.test.ts:94:17
```

第一条断言（找不到标签）没有先红——标签还在，只有类没了，红的正是它该锁的那一层。

### 还原与验绿

```bash
sed -i 's/class="scope-field scope-field--git"/class="scope-field scope-field--git workspace-git-chip"/' ui/public/index.html
git diff ui/public/index.html   # 空，exit=0 ✓
npx vitest run test/ui-layout.test.ts test/ui-app.test.ts   # 2 files / 304 tests 全绿
```

### 一个环境插曲（如实记）

这轮的两条 `sed -i` 把 index.html 整文件重写成了 **LF**（git-bash sed 的行尾处理），`git diff` 一直干净（autocrlf 清洗后相同），但 `git status` 因索引 stat 过期持续显示 ` M`——本机 grep 对 `\r$` 的匹配也变得不可靠（对已知 CRLF 控制文件也计 0），一度误判"幽灵进程在改文件"。用 od 查实后：node 把 LF blob 转回 CRLF 写回，`git add`+`git reset` 刷新索引 stat，status 干净、文件 CRLF、内容与 HEAD 逐字节一致。**结论：没有幽灵写者，sed 是唯一写者；最终提交与工作树都不受影响。**

### 提交

`13f8759 test(ui): 锁住 git 芯片的类挂钩，别让它再被静默清理掉`（2 files, +17；提交信息含 JSDoc 修正段，按协调者模板、"三处"改"两处"；未 amend eca67a0）

### 遗留顾虑

- `## 与 brief 的差异` 一节的两项维持原判（审查重点不变）。
- 协调者的两个只读探针结论照录：宿主 4201 白名单三处 workdir 全部 `present:false`，两脸 git 差异在真机不可观测（缺 git 支撑 workdir 夹具，Park 给计划 2）——与本任务无关，未复跑。
