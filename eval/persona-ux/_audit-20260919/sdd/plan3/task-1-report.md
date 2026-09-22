# Task 1 报告：折叠的 composer scope 不再画一个点不到的幽灵控件

**状态：DONE（含 4 处经控制者裁定的偏离，见文末）**
**Commit：`2b170c9` fix(ui): 折叠的 scope 不再画一个看得见、点不到的幽灵控件**

---

## 一、实现了什么

两处正文改动 + 两条测试 + 一个活页探针：

1. `ui/public/styles.css`（`.composer-scopebar` 块之后，`:4830` 起）：新增一条 CSS 规则
   `.composer-scope:not([open]) .composer-scopebar { display: none; }`（带病因注释），逐字照 brief Step 3.a。
   选择器在行首、与 `{` 间单空格——`block()` 的匹配形态。
2. `ui/public/index.html:255-261`：订正那句说反的注释（「收起的 details 只渲染 summary」→
   真实机制 + 修复注记），逐字照 brief Step 3.b 的改后文本。
3. `test/ui-layout.test.ts`：新增 describe「折叠的 scope 不留幽灵控件」两条测试
   （一锁 CSS 规则、一锁 markup 嵌套），放在「两脸差异只收在 [data-face] 上」之后。
4. `eval/persona-ux/_audit-20260919/verify-composer-scope.mjs`：新建活页探针，三条判据
   （① 收起态无盒 ② 展开态触发钮真命中 ③ 0 控制台错误）。

不导出任何东西，不动任何逻辑——纯样式修复。

## 二、测试与结果

| 项 | 结果 |
|---|---|
| 聚焦测试 `test/ui-layout.test.ts` | 22/22 绿（基线 20 + 新增 2） |
| 全量测试 `npx vitest run` | 13 failed / 3701——**已证明全是基线失败，与本改动无关**（见 §七） |
| 活页探针（修后） | 退出码 0，三条判据全成立 |
| 活页探针（先探针后修：撤掉 CSS） | 退出码 1，① 红（幽灵盒 618×28 复现） |
| check-eol（提交后） | 两文件 ✅✅，退出码 0 |

## 三、TDD 证据

### RED（先写测试，规则还不存在）

命令：`npx vitest run test/ui-layout.test.ts`

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > scope 收起时 scopebar 必须真的不渲染
Error: 找不到选择器 .composer-scope:not([open]) .composer-scopebar
 ❯ block test/ui-layout.test.ts:31:24
   ...
 ❯ test/ui-layout.test.ts:116:18

 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
```

为什么这个失败是预期的：CSS 规则当时还不存在，`block()` 按设计抛「找不到选择器」；
第二条（markup 锁）当时已绿——markup 现在就是好的，与 brief Step 2 的预期一致。

### GREEN（写入 CSS 规则 + 订正注释后）

命令：`npx vitest run test/ui-layout.test.ts`

```
 ✓ test/ui-layout.test.ts (22 tests) 31ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

## 四、变异验红（两半各验一次；5.b 按控制者 T1-B 裁定分三段留档）

### 5.a 删掉整条 CSS 规则 → 第一条红 → 还原

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > scope 收起时 scopebar 必须真的不渲染
Error: 找不到选择器 .composer-scope:not([open]) .composer-scopebar
 ❯ block test/ui-layout.test.ts:31:24
 ❯ test/ui-layout.test.ts:116:18

 Tests  1 failed | 21 passed (22)
```

还原后：`22 passed (22)`。

### 5.b 把 `index.html:260` 的 `class="composer-scopebar"` 改成 `class="composer-scopebar-x"`

**第一段（控制者逐字给的正则，照抄 → 不红）——这是「坑真实存在」的证据：**

```
 ✓ test/ui-layout.test.ts (22 tests)
 Tests  22 passed (22)      ← 改名了还全绿，第二条是装饰
```

实证（原始命令与输出）：

```bash
node -e "
const re = /<div[^>]*class=\"[^\"]*\bcomposer-scopebar\b[^\"]*\"[^>]*>/;
console.log(JSON.stringify('<div class=\"composer-scopebar-x\" id=\"composer-scopebar\">'.match(re)?.[0] ?? null));
"
```

```
"<div class=\"composer-scopebar-x\" id=\"composer-scopebar\">"   ← 照样匹配
```

机制：`\b` 在 `r|-` 处成立（`-` 是非词字符），`[^"]*` 把 `-x` 吃掉——`\b…\b` 挡不住类名续写。

**第二段（`\b` 后补 `(?![\w-])` → 红）：**

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > 那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）
AssertionError: scopebar 不在那个 details 里——那条 CSS 规则就匹配不到它了: expected '' not to be '' // Object.is equality
 ❯ test/ui-layout.test.ts:130:69

 Tests  1 failed | 21 passed (22)
```

修后正则在三态下的 node 验证：

```
fixed regex vs renamed:    null                                          ← 改名 → 不匹配
fixed regex vs original:   "<div class=\"composer-scopebar\" id=\"composer-scopebar\">"
fixed regex vs multiclass: "<div class=\"scope-field composer-scopebar\" id=\"composer-scopebar\">"
```

**第三段（还原 `class="composer-scopebar"` → 绿）：** `22 passed (22)`。

### 附：chip 断言同族加固的变异验红（控制者 T1-B 要求）

把 `index.html:280` 的 `workspace-git-chip` 改成 `workspace-git-chip-x`：

```
 FAIL  test/ui-layout.test.ts > 两脸差异只收在 [data-face] 上 > 芯片元素真的带着 workspace-git-chip 类…
 ❯ test/ui-layout.test.ts:103:17
 Tests  1 failed | 21 passed (22)
```

还原后 `22 passed (22)`。

## 五、活页探针的原始输出

靶：`http://127.0.0.1:4201/#/`（控制者起的隔离宿主，`ui/serve.ts` 从仓库树现读——每次改动后
`curl -s http://127.0.0.1:4201/styles.css | md5sum` 与工作树逐字节一致，探针看到的是实况）。

### 修后（退出码 0）

```
靶：http://127.0.0.1:4201/#/

=== ① 收起态（默认）===
  details.open=false · scopebar display=none · 盒 0×0 @y=0
  触发钮盒 0×0 @y=0
  ✅ scopebar 真的不渲染（盒子是空的）

=== ② 展开态（点 summary）===
  details.open=true · scopebar display=flex · 盒 618×28 @y=488
  触发钮中心命中：<SPAN> · 命中触发钮本身=true · 命中 textarea=false
  ✅ 展开后触发钮真的点得到（老 bug 时这里命中的是 textarea）

=== ③ 控制台 ===
零

✅ 三条全成立：① 收起态无盒 ② 展开态可点 ③ 0 控制台错误
退出码=0
```

### 先探针后修（临时撤掉 CSS 规则，退出码 1，① 红）

```
靶：http://127.0.0.1:4201/#/

=== ① 收起态（默认）===
  details.open=false · scopebar display=flex · 盒 618×28 @y=505
  触发钮盒 139×19 @y=509
  ★ 还有盒子——幽灵控件还在

=== ② 展开态（点 summary）===
  details.open=true · scopebar display=flex · 盒 618×28 @y=488
  触发钮中心命中：<SPAN> · 命中触发钮本身=true · 命中 textarea=false
  ✅ 展开后触发钮真的点得到（老 bug 时这里命中的是 textarea）

=== ③ 控制台 ===
零

★ 有判据没成立，见上。
退出码=1
```

收起态下幽灵盒 618×28、触发钮 139×19 复现——这条探针确实抓得住那个 bug。
还原 CSS 后再跑，回到上面退出码 0 的输出。

### 探针的第一次运行失败（onboarding 遮罩）——偏离的理由

brief 逐字探针首跑在 ② 处超时（`#onboarding-overlay intercepts pointer events`，57 次重试 30s 超时）：
新起的 playwright 上下文没有 localStorage，欢迎页首访盖引导遮罩。修法：在
`addInitScript` 里加一行 `localStorage.setItem("agent.ui.pref.onboardingDone", "1")`
（键名取自 `ui/public/features/onboarding.js:8`，做法同既有 `verify-ab.mjs`），并留注释说明。

## 六、check-eol.mjs 的输出

提交前（内容与 HEAD 不同是预期的，看的是裸 LF 列）：

```
★★ 不一致  ui/public/styles.css       CRLF=11130 裸LF=   0 字节 278531/278062  ← 与 HEAD 不逐字节相同
★★ 不一致  ui/public/index.html       CRLF= 6352 裸LF=   0 字节 233002/232845  ← 与 HEAD 不逐字节相同
```

提交后（判据：与 HEAD 逐字节相同 + 裸 LF=0）：

```
✅  ui/public/styles.css       CRLF=11130 裸LF=   0 字节 278531/278531
✅  ui/public/index.html       CRLF= 6352 裸LF=   0 字节 233002/233002
退出码=0
```

新建的探针文件在写盘后转成了 CRLF（101 个 CRLF、0 裸 LF），与工作树其余文件一致。

## 七、全量测试为什么 13 failed 仍是干净的

全量 `npx vitest run`：13 failed / 3701（5 个文件：ui-patch 3、cloud-sync-env 2、ui-handoff 4、
run-crash-inject 2、ui-server 2）。

验证方法：`git stash push -u` 把本任务全部改动撤到干净 HEAD，单独跑这 5 个文件：

```
❯ test/ui-patch.test.ts        (336 tests | 3 failed)
❯ test/cloud-sync-env.test.ts  ( 12 tests | 2 failed)
❯ test/ui-handoff.test.ts      (  4 tests | 4 failed)
❯ test/run-crash-inject.test.ts( 10 tests | 2 failed)
❯ test/ui-server.test.ts       (277 tests | 1 failed)
Failed Tests 12
```

干净 HEAD 上同样的测试同样红（12 条）。与我改动相关的
`test/ui-layout.test.ts` 全绿。全量跑里多出的第 13 条（ui-server 的「跨 run 资源互斥：stm32 包的
探针…429」）在基线重跑中通过——即 MEMORY 里记的「11 确定 + 1 轮换抖动」那一类。
结论：本改动零新增失败。`git stash pop` 后改动完整还原。

## 八、Files changed

- `ui/public/styles.css`（+16：注释 + `display:none` 规则）
- `ui/public/index.html`（+7/-2：订正说反的注释）
- `test/ui-layout.test.ts`（+31/-1：新 describe 两条 + chip 断言加固一行）
- `eval/persona-ux/_audit-20260919/verify-composer-scope.mjs`（新建，+101 行）
- 未动：`mcp.json`（任务开始前就 modified，不是我的改动，未纳入提交）
- 探针截图落在已被 gitignore 的 `eval/persona-ux/_verify-shots/`。

## 九、与 brief 的四处偏离（全部经控制者裁定或有实证支撑）

1. **brief 第二条测试照抄必死**（计划 bug）：`block()` 按 `\n<选择器> {` 找块，而
   `index.html:254` 的 details 标签缩进 4 格、以 `>` 结尾。实证（原始命令与输出）：

   ```bash
   grep -n '<details class="composer-scope"' ui/public/index.html
   # 254:    <details class="composer-scope" id="composer-scope">
   node -e "
   const fs = require('fs');
   const text = fs.readFileSync('ui/public/index.html','utf8').replace(/\r\n/g,'\n');
   console.log('needle found at:', text.indexOf('\n<details class=\"composer-scope\" id=\"composer-scope\" {'));
   "
   # needle found at: -1
   ```

   控制者 T1 裁决：改用标签级断言（其逐字代码已采纳），并已把计划订正提交为 `93eec26`。
2. **控制者 T1 给的 barTag 正则 5.b 不红**（§四第二段，`\b` 边界实证 + 变异跑 22 全绿的原始输出）：
   补 `(?![\w-])` 后 5.b 红。已报控制者，其回执「你说得比我准」，计划随之再订正。
3. **chip 断言同族弱锁**（控制者 T1-B 裁定，不在 brief 里）：`test/ui-layout.test.ts:103` 原
   `/class="[^"]*\bworkspace-git-chip\b[^"]*"/` 对 `workspace-git-chip-x` 照样绿，而两脸两条
   CSS 规则就都匹配不到了——同文件一行改动，补 `(?![\w-])`，变异验红见 §四附。
4. **探针补一行 onboarding 跳过**（§五）：不补的话逐字探针在欢迎页被引导遮罩挡死，② 永远超时。

另注：探针控制台输出里的 ✅/★ 是计划逐字代码与既有探针惯例（`verify-face-git.mjs` 同样用法），
禁 dingbat 的纪律针对的是 HTML/UI 标记（task-6 brief 明确写「不许直接写进 HTML」），本任务不涉及。

## 十、Self-review findings

- 完整性：CSS + 注释两处正文、两条测试、探针，全齐；变异验红两半都做且留了原始输出；先探针后修也做了。
- 质量：订正后的注释说的是实测结论（布局盒仍在、溢进输入行 y 带、被透明 textarea 接走），
  与探针 ① 的实测一致，没有再说反。测试名与断言对象一致。
- 纪律：没做 brief 没要求的事（chip 加固与 onboarding 行均为控制者裁定/实测所迫）；
  没动别的文件；`mcp.json` 未碰。
- 测试验证的是行为：两条测试分别锁「规则文本在」与「规则匹配的 markup 嵌套在」，
  变异各红一次；活页探针真量了布局与命中。

## 十一、Issues / concerns

1. 全量测试 13 failed 是既有基线（干净 HEAD 复现 12 + 1 轮换抖动），与本改动无关，但数字上
   比 MEMORY 记的「11 确定」多——若控制者希望，可以再全量跑一次干净 HEAD 核对成员表。
2. brief 的提交信息带 `Co-Authored-By: Claude Opus 4.8 (1M context)`，已按「逐字」要求照抄。
3. 探针依赖 4201 宿主从仓库树现读静态文件（已用 md5 验证）；若日后宿主加了内存缓存，
   「先探针后修」这类变异需要重启宿主才可见。

---

# Fix round 1/5 追加（2026-09-20，审查 Important · Spec）

审查结论：Spec ❌ 一条 Important（plan-mandated），其余全过；我先前两条实证裁决被审查者独立验证为正确
（它读 `block()` 源码、把前瞻对 `-x`/`2`/`_`/`--` 整个变异空间试过，无泄漏）。

## 唯一一条 Important：`scopeBlock` 正则的 details 类端有同一个装饰性锁的洞

逐字引审查者：`\bcomposer-scope\b` 对 `class="composer-scope-x"` 照样成立（boundary 在 `e|-` 处，
`[^"]*` 吃掉 `-x`）——details 的类加连字符后缀改名会让幽灵控件复活，而两条测试都保持绿。
责任在控制者的 T1-A 逐字版，不在我；同族弱点在本任务里第三次现形（控制者已把计划补上前瞻并提交）。

## 改了什么（一行）

```ts
// 前
const scopeBlock = source.match(/<details[^>]*class="[^"]*\bcomposer-scope\b[^"]*"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
// 后
const scopeBlock = source.match(/<details[^>]*class="[^"]*\bcomposer-scope\b(?![\w-])[^"]*"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
```

## 变异验红三段（照 scopebar-x 的同格式留档）

变异动作：把 `index.html:254` 的 `class="composer-scope"` 改成 `class="composer-scope-x"`。

**第一段（旧正则 + 变异 → 不红，坑真实存在的证据）** —— `npx vitest run test/ui-layout.test.ts`：

```
 Test Files  1 passed (1)
      Tests  22 passed (22)      ← details 类改名了还全绿，锁是装饰
```

**第二段（补前瞻后 + 变异 → 红）** —— 同命令：

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > 那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）
AssertionError: index.html 里找不到 .composer-scope 那个 details 块: expected '' not to be '' // Object.is equality
 ❯ test/ui-layout.test.ts:126:76

 Tests  1 failed | 21 passed (22)
```

**第三段（还原 `class="composer-scope"` → 绿）** —— 同命令：`22 passed (22)`；
`git diff -- ui/public/index.html` 为空（变异循环后逐字节回到提交态）。

## 覆盖测试与行尾

- 只跑 `test/ui-layout.test.ts`（按控制者指示，不跑全量）。
- check-eol（提交前）：`test/ui-layout.test.ts` ★★（与 HEAD 内容不同是预期的）· 裸LF=0；
  `index.html` ✅（变异还原干净）。
- check-eol（提交后）：`✅  test/ui-layout.test.ts  CRLF=246 裸LF=0 字节 9776/9776`。

## 提交

- `5d3c711` fix(test): scopeBlock 正则的 details 类端补 (?![\w-]) 前瞻（1 file changed, +1/-1）

## 记进账本、本轮不动（控制者已记）

- Minor：scopeBlock 非贪婪截断的脆弱性；探针的固定等待。留待 final review 分诊。

---

# 修复轮 2/5 —— 连字符前缀泄漏（审查员实测，控制者 09-20 指令）

**现象（审查员发现，控制者转达）**：上一轮只补了右端 `(?![\w-])`，左端仍是 `\b`。
`\b` 在 `-|c` 处**也**匹配（`-` 是非单词字符），所以 `x-composer-scope` 这类**连字符前缀**改名
照样喂饱断言——审查员实测 `x-composer-scope` 变异保持绿色。同一个弱点的第四次现形，
这一次是「只挡了一半」。注：修复前的「未变红」证据由审查员实测得出，本轮的验证覆盖修复后状态。

## 改了什么

`test/ui-layout.test.ts` 三处断言，左侧 `\b` 全部换成 `(?<![\w-])`，与右端 `(?![\w-])` 字符集对称：

- scopeBlock（:125）：`\bcomposer-scope` → `(?<![\w-])composer-scope`
- barTag（:129）：`\bcomposer-scopebar` → `(?<![\w-])composer-scopebar`
- chip 断言（:103）：`\bworkspace-git-chip` → `(?<![\w-])workspace-git-chip`

## 命令

- 聚焦测试：`npx vitest run test/ui-layout.test.ts`
- 变异：`sed -i` 改 `ui/public/index.html`（改行中段，不动行尾），每轮后 `git checkout -- ui/public/index.html` 还原。

## 五组变异（修复后 → 全红）

A `class="composer-scope"` → `composer-scope-x`，B → `x-composer-scope`：

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > 那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）
AssertionError: index.html 里找不到 .composer-scope 那个 details 块: expected '' not to be '' // Object.is equality
 Tests  1 failed | 21 passed (22)
```

C `class="composer-scopebar"` → `composer-scopebar-x`，D → `x-composer-scopebar`：

```
 FAIL  test/ui-layout.test.ts > 折叠的 scope 不留幽灵控件 > 那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）
AssertionError: scopebar 不在那个 details 里——那条 CSS 规则就匹配不到它了: expected '' not to be '' // Object.is equality
 Tests  1 failed | 21 passed (22)
```

E `scope-field--git workspace-git-chip` → `x-workspace-git-chip`：

```
 FAIL  test/ui-layout.test.ts > 两脸差异只收在 [data-face] 上 > 芯片元素真的带着 workspace-git-chip 类（不然那两条规则匹配不到任何东西）
AssertionError: expected '<div class="scope-field scope-field--…' to match /class="[^"]*(?<![\w-])workspace-git-c…/
 Tests  1 failed | 21 passed (22)
```

## 两个反向证明（必须保持绿）

- 反向 1：原名 `class="composer-scope"` → `22 passed (22)` ✅
- 反向 2：多类名 `class="scope-field composer-scope"` → `22 passed (22)` ✅（后顾没有收得过紧，多类名不误伤）

## 还原与行尾

- 变异循环后 `git diff --stat -- ui/public/index.html` 为空（逐字节回到提交态）。
- check-eol（提交前）：`test/ui-layout.test.ts` ★★（与 HEAD 内容不同是预期的）· 裸LF=0；
  `index.html` ✅（233002/233002）。
- check-eol（提交后）：`✅  test/ui-layout.test.ts  CRLF=246 裸LF=0 字节 9794/9794`。

## 提交

- `1ba36a1` fix(test): 幽灵锁的三个词边界全部换成 (?<![\w-])…(?![\w-])（1 file changed, +3/-3）
