# Task 5 报告：深链从"按下标"改成"按路径"

**状态：DONE（附 6 处 brief 与现实出入，见「出入与偏差」）**
**提交：53a99b9** `fix(ui): 产物深链从按下标改成按路径——不再静默指到别的文件`（5 files，+415/−34）

---

## 1. 做了什么

### 1.1 核心编解码（`ui/public/features/artifact-canvas.js`）

- `encodeArtifactHash(runId, ref, opts)`（:325）逐字按 brief 3.a：路径形态整段 `encodeURIComponent`，数字 ref 走 `Math.max(0, Math.trunc(Number(ref)||0))`，`opts.full` 追加 `?full`。
- `ARTIFACT_ROUTE_RE`（:345）与 `parseArtifactRoute`（:357）逐字按 brief 3.b：纯数字段 = 旧下标形态（`index` 非 null、`path` null），其余 = 路径形态（`path` 非 null、`index` null）——**恰好一个非 null**；`dec` 带 try/catch，非法转义按原样留着（控制器裁决 ③）。
- **`openCanvas(index, opts)`（:1683）签名一个字没动**，`wrapIndex`（:381）逻辑没动。控制器裁决 ① 已核：`export function wrapIndex` 确在 :381 是导出的，按 brief 6.d 的推荐 **import 了它**（`index.html:664`），没写第二份取模。

### 1.2 宿主接线（`ui/public/index.html`）

- import 增加 `wrapIndex`（:664）。
- 新增 `artifactRefForIndex(runId, index)`（:936）：下标 → `{path}`，清单查不到退回数字形态（避免 brief 6.d 里 `list[at]?.path ?? ""` 落空时写出 `#/run/<id>/artifact/` 这种坏 hash）。
- `openArtifactByIndex(runId, index, opts={})`（:947）：`at = wrapIndex(index, list.length)`；`wantFull` 只在 `typeof opts.full === "boolean"` 时取；target 一律路径形态；hash 相等时 `open(index, wantFull===undefined ? undefined : {full:wantFull})`——**省略 = 保持现状**（openCanvas 的既有语义，点产物不该把放大态缩回去）。
- `openArtifactByPath(runId, path, opts={})`（:963）：opts 透传。
- 6.e 注释按 brief 改（:983-986）。
- `openPendingArtifact()`（:988）：brief 6.c 逐字（含 `if (pendingArtifact === before) return;` 守卫）**加** `openArtifactByPath(runId, path, { full: Boolean(full) })`（见偏差 ④）。
- `parseRoute`（:2007）带上 `path/index/full`（6.a）。
- `applyHash`（:2226）：6.b 逐字；**另修 brief 没写的 :2231-2232**——跨 run 恢复时 `route.index` 在路径形态下是 null，原代码 `encodeArtifactHash(route.runId, route.index)` 会把深链静默重写成 `artifact/0`（见偏差 ①）。
- `onSwitch`（:6335）与 `onExpandChange`（:6345）：两处写地址从数字形态改路径形态——否则与 6.e 注释"新写出去的一律是路径"自相矛盾（见偏差 ②）。
- `pendingArtifact` JSDoc（:775）同步 `{ runId, path, index, full? }`。

### 1.3 测试

- **新建** `test/ui-artifact-route.test.ts`：brief Step 1 逐字 7 条。
- **改** `test/ui-artifact-canvas.test.ts`（brief 没提，不改套件必红）：3 处 `toEqual` 补 `path: null`；"拒绝非画布 hash"里 `#/run/abc/artifact/x` 的期望从 `toBeNull()` 改为 `{runId:"abc", path:"x", index:null, full:false}`，测试名同步注明 T5 双形态（见偏差 ⑤）。

### 1.4 活页探针

新建 `eval/persona-ux/_audit-20260919/verify-artifact-route.mjs`（brief Step 7；目录用连字符 `_audit-20260919`——brief 正文 269 行写的是下划线 `_audit_20260919`，但 Files 段、Step 8 git add、委托方 check-eol 路径全是连字符，以连字符为准，见偏差 ⑥）。

---

## 2. TDD 红绿

- **RED**：实现前 `npx vitest run test/ui-artifact-route.test.ts` —— **4 条红**，不是 brief Step 2 说的 3 条：前三条如预期（对象 ref 变 `NaN`、`(\d+)` 不认路径），**第四条"旧的下标形态仍然认"也红**——旧 `parseArtifactRoute` 的返回形状里没有 `path` 键，`back?.path` 是 `undefined` 而非 null，`expect(back?.path).toBeNull()` 挂。brief 预期"第四条 PASS"与仓库现实不符（见出入 ⑦）。
- **GREEN**：实现后 7/7；与 `ui-artifact-canvas.test.ts` 合跑 100/100（93+7）。

## 3. 变异验红（原始输出，本轮重新捕获）

**5.a 把 isLegacyIndex 分支改成一律当路径**（改两条用法行：`path: dec(raw),` / `index: null,`）：

```
 ❯ test/ui-artifact-route.test.ts (7 tests | 1 failed) 6ms
   ✓ 路径形态：斜杠被转义，段里没有裸斜杠
   ✓ 往返：编码再解码拿回同一个路径
   ✓ 放大态：?full 不影响路径解析
   × ★ 旧的下标形态仍然认（历史会话里的链接不许断）
   ✓ 数字形态仍然编得出来（别处可能还在用）
   ✓ 不匹配的 hash 返回 null
   ✓ 非法转义不抛，按原样留着
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```
**恰好安全绳那条红。** 已还原，还原后 7/7。

**5.b 去掉 encodeURIComponent**（`? String(ref.path ?? "")`）：

```
   × 路径形态：斜杠被转义，段里没有裸斜杠
   × 往返：编码再解码拿回同一个路径
   × 放大态：?full 不影响路径解析
   ✓ ★ 旧的下标形态仍然认 …
 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)
```
**第 1 条红（brief 要求），连同依赖编码的 2、3 条一起红。** 已还原，还原后 7/7，CRLF 2016/裸LF 0。

> 过程插曲：第一次变异用 `sed -i`，**sed 把整文件从 CRLF 重写成了 LF**（本机 sed -i 的文本模式行为，check-eol 立现 `CRLF=0 裸LF=2016`）——正是 MEMORY「任何整文件重写的工具都可能把 CRLF 转 LF」。已改用 node 字符串替换做变异，并用 node 把文件修回 CRLF。

## 4. 活页探针（真实验收）

靶：链头 run `94f58b8a`（产物 7 件），宿主 http://127.0.0.1:4201（委托方已起的那台，没再起新的，没碰 4173），onboarding 以 `addInitScript` 置 1。真点卡片、真改地址栏、真 `page.reload()`。原始输出：

```
—— 判据 ① ——
点开的产物：e8-b.txt
地址栏：#/run/94f58b8a…/artifact/e8-b.txt
段：e8-b.txt · 解码：e8-b.txt · 纯数字=false
① 路径形态且解码回同一条路径 → ✅

—— 判据 ② ——
刷新后地址栏：#/run/94f58b8a…/artifact/e8-b.txt · 段=e8-b.txt（路径形态=true）
选中格=1 · 标题=e8-b.txt · 期望=e8-b.txt
② 刷新后打开的还是那一件 → ✅

—— ⑤（旁证）——
设 ?full 后地址栏：#/run/94f58b8a…/artifact/e8-b.txt?full（?full 保留=true）· 坞放大=true
⑤ ?full 不剥、放大态恢复 → ✅（旁证，不拦验收）

—— 判据 ③ ——
设旧下标形态 #/run/<id>/artifact/1 后：选中格=1 · 标题=e8-b.txt
活清单第 1 件（设 hash 前）= e8-b.txt
③ 旧下标形态打开的是清单里第 1 件 → ✅

—— 判据 ④ ——
设不存在路径 不存在-9f3e2b/phantom.md 后：选中标签=不存在-9f3e2b/phantom.md
播报（#status-announcer）：运行已完成：…（与本判据无关的旧播报）
画布错误卡（.ac-fallback-text）：文件不在了（可能被移动或删除）。
新增页面异常：零 · 新增控制台错误：Failed to load resource: … 404 (Not Found)
④ 不崩（0 页面异常）、有话说（播报或错误卡有其一）→ ✅
```

判据 ① 用控制器裁决的"不是纯数字"（不是写死路径）。**判据 ④ 与 brief 措辞的出入**：brief 预期 `announceStatus("找不到该产物")` 且 0 控制台错误；实测机制是深链路径分支走 `openArtifactByPath` → `rememberPreviewFile` 先把这一份记成标签（与"打开网页"同一条路）→ 画布取件 → 服务器对不存在文件回 404 → 画布把话写进错误卡。所以"有话说"落在画布错误卡、控制台有一条**预期内**的取件 404。探针按实测机制判：不崩 + 有话说；控制台逐条打印不藏。见偏差 ③。

⑤ 是打印旁证（不拦验收）：验证路径形态下「?full 往返，刷新保持形态」这条既有契约仍然成立——这测的是偏差 ④ 的修复。

## 5. 全量套件：零新增

`npx vitest run`（完整日志）：
```
Test Files  5 failed | 166 passed | 1 skipped (172)
      Tests  12 failed | 3695 passed | 15 skipped (3722)
```
12 条失败全部落在已知基线家族（cloud-sync-env ×2、ui-handoff ×4、ui-patch ×3、run-crash-inject ×2、ui-server ×1 超时），**没有任何 artifact/route 相关测试**；`test/ui-artifact-route.test.ts` ✓7、`test/ui-artifact-canvas.test.ts` ✓93 在全量里都是绿的。基线口径「11 确定 + 1 轮换抖动」：本轮抖动位是 run-crash-inject 的第 2 条（"write_file 发射 prepared/committed"）——**单独跑 `test/run-crash-inject.test.ts` 10/10 全绿**，证明是负载时序抖动不是回归（该测试与本次改动零交集）。合计 12 落在委托方给的 11-13 区间内。

## 6. check-eol

- **提交前**：抓到三处漂移——`artifact-canvas.js` 整文件 LF（CRLF=0 裸LF=2016，我早前整文件重写所致）、两个新文件 LF。全修成 CRLF。中间还有上面说的 sed -i 二次漂移，同法修复。
- **提交后（判据：工作树与 HEAD 归一化后逐字节相同 + 裸LF=0）**：

```
✅  ui/public/features/artifact-canvas.js CRLF= 2016 裸LF=   0 字节 74976/74976
✅  ui/public/index.html       CRLF= 6386 裸LF=   0 字节 234596/234596
✅  test/ui-artifact-route.test.ts CRLF=   63 裸LF=   0 字节 2152/2152
✅  test/ui-artifact-canvas.test.ts CRLF= 1254 裸LF=   0 字节 52897/52897
✅  eval/persona-ux/_audit-20260919/verify-artifact-route.mjs CRLF=  266 裸LF=   0 字节 11810/11810
```

## 7. 文件清单

| 文件 | 动作 |
|---|---|
| `ui/public/features/artifact-canvas.js` | 改（encode/parse 重写；wrapIndex/openCanvas 未动） |
| `ui/public/index.html` | 改（8 处接线） |
| `test/ui-artifact-route.test.ts` | 新建（brief 逐字） |
| `test/ui-artifact-canvas.test.ts` | 改（3 处返回形状 + 1 处期望） |
| `eval/persona-ux/_audit-20260919/verify-artifact-route.mjs` | 新建 |

提交含全部 5 个文件。brief Step 8 的 `git add` 漏了 `test/ui-artifact-canvas.test.ts`（偏差 ⑤），已一并纳入。

## 8. 自审清单

- [x] `openCanvas` 签名未动；内部寻址（wrapIndex/◀▶/关标签落点）未动
- [x] wrapIndex 是导出的（:381）→ import 而非重写取模（控制器裁决 ①）
- [x] 旧数字形态仍认 + 测试锁定（安全绳）
- [x] decodeURIComponent try/catch + 非法转义测试（裁决 ③）
- [x] 判据 ① 判"不是纯数字"（裁决 ②）
- [x] 探针真点、真改地址栏、真刷新；onboarding 置位；4201 现有宿主；链头 run ≥3 产物；AUDIT_RUN 可覆盖
- [x] 两次变异红 + 还原 + 还原后绿
- [x] 全量套件零新增（按基线口径逐条比对）
- [x] check-eol 提交后五 ✅
- [x] 无子代理；提交信息按 brief Step 8（署名尾按环境改为 Claude Sonnet 4.6）

## 9. 出入与偏差（brief ↔ 仓库现实）

**仓库现实优先，逐条报备：**

1. **applyHash 跨 run 重写点（brief 没写）**：路径形态深链指向未选中 run 时，`selectRun` 的 writeHash 会盖掉深链、applyHash 再把它写回；原代码拿 `route.index` 去 encode——路径形态下它是 null，会写成 `artifact/0`。已在 :2231 补 `ref = route.path != null ? {path:route.path} : route.index`。
2. **onSwitch/onExpandChange 两个写地址点（brief 没写）**：仍写数字形态，与 6.e 注释"新写出去的一律是路径"自相矛盾。已改路径形态（:6335、:6345）。
3. **判据 ④ 机制与 brief 措辞不符**：见 §4。探针按实测机制量（不崩+有话说），控制台 404 如实打印。
4. **6.c 路径分支丢 `full`（brief 没写）**：原样抄会让 `?full` 路径深链刷新后丢 `?full`、画布缩回停靠态，破坏 `ui-artifact-canvas.test.ts` 锁着的「?full 往返，刷新保持形态」。已把 `full` 经 `openArtifactByPath(runId, path, {full})` 透传；`openArtifactByIndex` 的 `opts.full` 只在显式布尔时强制画布状态，省略=保持现状不变。探针 ⑤ 实证。
5. **既有测试文件必须跟着改（brief 没提）**：`test/ui-artifact-canvas.test.ts` 断言旧返回形状（无 `path` 键、路径段 `toBeNull`），不改必红。已改 4 处并纳入提交（brief Step 8 的 git add 漏了它）。
6. **Step 7 标题目录名笔误**：正文写 `_audit_20260919`，Files 段与 Step 8 写 `_audit-20260919`。以连字符为准。
7. **Step 2 预期错一条**：预期"前三条 FAIL、第四条 PASS"，实测第四条也红（旧返回形状无 `path` 键）。实现后全绿，无影响。
8. **brief 行号整体偏移**：encodeArtifactHash :318→325、ARTIFACT_ROUTE_RE :333→345、parseArtifactRoute :341→357、wrapIndex :363→381、openCanvas :1665→1683、openArtifactByIndex :932→947、openArtifactByPath :944→963、openPendingArtifact :965→988、6.e 注释 :959-963→983-986、parseRoute :1973→2007、pendingArtifact JSDoc :771→775、赋值 :2193→2226。锚点名称全部对得上，偏移是历史编辑累积。
9. **变异工具教训（不在 brief 里）**：`sed -i` 在本机会把 CRLF 重写成 LF，变异/还原改走 node 字符串替换；两处都靠 check-eol 当场抓住并修复。
10. **openPendingArtifact 守卫语义核对**：路径分支"没开成就留着"的守卫依赖 `pendingArtifact` 引用不变；`openArtifactByPath` 路径畅通时走 `openArtifactByIndex` → hash 不等 → 写 hash → hashchange 异步重进 applyHash → 新 pendingArtifact 对象（引用变）→ 守卫放行。与旧下标形态"open 返回 true 才清"语义一致，探针 ①②④ 实证。**本句已被审查证伪，作废——见 §10.2。**

---

## 10. Fix round 1（审查打回 → 修复 → 复验）

**提交：7a6ecce**（brief Step 8 的同一提交信息逐字；本轮 2 files，+314/−8）
**状态：DONE**

### 10.1 审查发现（0 Critical、1 Important）

审查者判 **Spec ❌ / 质量 Needs fixes**。先说好的：6 条偏差全部属实、改得对；4 个写 hash 的点复核无漏网；`artifactRefForIndex` 退回数字形态比 brief 给的 `?? ""` 更好。唯一一条 Important 逐字：

> **`openPendingArtifact` 的路径分支成功时从不清 `pendingArtifact`。** 成功时它不会被替换，`if (pendingArtifact === before) return;` 判据**永不为真**，它一直留着。而 `openPendingArtifact()` 在**每次渲染末尾**被无条件调用。后果链：每次状态推送都跑 `openArtifactByPath → openArtifactByIndex → hash===target → openCanvas`，而 `openCanvas` 无条件 `void renderCurrent()`（**重取**）、`dock.setExpanded()`（**重置 deck 位置**）、且 `dock.closeBtn.focus()` ⇒ **在跑着的 run 里，每次状态推送都把焦点从输入框抢到画布关闭钮上——而回车会关掉画布。**
>
> ★ 计划自己那段 ★ 警告写的就是这个（"旧的是 **open 返回 true 才清**"），而我给的代码没做到。计划已订正（`9d19be5`）。

### 10.2 修了什么

`openArtifactByPath`（:966）改成**返回布尔**——走 `resolved.mode === "canvas"` 那条路 `true`，两条 `announceStatus("找不到该产物")` 路 `false`（:962-985，JSDoc 同步写明返回语义与为什么不能用替换判）。`openPendingArtifact` 路径分支（:999-1005）据此清，与计划 6.c 订正稿逐字一致：

```js
if (path !== null && path !== undefined) {
  // openArtifactByPath 返回"是否真的开上了"——不能用 pendingArtifact 有没有被替换来判：
  // 成功时它不会替换 pendingArtifact，那个判据永不为真，于是每次渲染都会重开一次画布
  // （重取内容 / 重置 deck 位置 / 并且抢焦点——openCanvas 末尾会 dock.closeBtn.focus()）。
  if (openArtifactByPath(runId, path, { full: Boolean(full) })) pendingArtifact = null;
  // 没开成（找不到）就留着等下一次渲染
  return;
}
```

`openArtifactByPath` 其余 **11 个调用方**逐个 grep 核对（:1050、:2153、:2310-2312、:3164、:3199、:5347、:5359、:5484、:6358）——全部是"打开并忘记"语义，忽略返回值无害。**§9.10 那句"与旧语义等价"作废**：旧下标形态分支是"open 返回 true 才清"，路径分支此前用引用替换判——成功时 hash 相等不写 hash、不发生替换，判据永假。

### 10.3 为什么没有 jsdom 单测（探针替代）

「成功时清、失败时留」住在 `openPendingArtifact`，它定义在 `index.html:522` 起的内联 `<script type="module">` 里——**模块作用域、不导出、无法 import**；现有 jsdom 套件只 import `ui/public/features/*.js` 的纯函数。把这两个函数迁出 index.html 是本任务范围外的重构。替代是活页探针（§10.4/10.5）。

诚实口径：**「失败时留」在探针里只有防御性覆盖**——它经 `openArtifactByPath` 的 false 返回行使，探针 ④（不存在路径）全绿时该路径不被再次触发；真锁它要把纯函数版抽到 features/ 下，已记入账本未做。「成功时清」则被 ⑥ 的"取件零增长"锁死：pending 不清 = 每次渲染重开画布 = 取件必然增长。

### 10.4 探针做法（跑着的 run 判据 ⑥）

审查者明说现有探针抓不到这条——它跑在空闲 run 上，稳定后没有渲染再发生。**做法演进**：

1. `switchLoopView` 抽出来调——模块作用域，死路。
2. 深链打开后另起 follow-up run 跑在同一页面 → fork 子 run **7 个里 5 个死**（宿主 LLM 认证坏：现造 run ~100ms 内 `model_call_end status=error`；活下来的只有 6b925492、abf42461）。
3. **mock 事件流（最终方案）**：`addInitScript` 猴子补丁 `window.EventSource`（localStorage 门 `AUDIT_MOCK_ES=1`），把**靶 run 自己真实的 657 条事件流**抓下来、产物路径改写成 `t5m-*.txt`，按真实 SSE 格式（`id:`/`data:` 块、结尾 `event: replay_done`）以 3ms 间隔重放；`/api/stream` 委派原生 EventSource 转发。中途发现 `page.route` 的 fulfill **喂不动 EventSource**（画布开了但状态从不归约、产物卡=0）——遂弃路由拦截改猴子补丁。

**判据 ⑥ 量法**：12s 采样窗口，每秒读 `document.activeElement`（#task-input / DOCK-CLOSE 关闭钮 / 其他）、产物卡数、对话长度、选中标签、地址段；`page.on("request")` 数 `/artifact?path=` 请求——**画布被重开 = 取件数增长**（renderCurrent 只在 openCanvas 与标注钮里被调）。三条子判据：焦点从未被抢走 / 从未落到关闭钮 / 取件零增长；两道护栏：采样窗口内确有状态推送渲染、画布仍开且 hash 仍路径形态。

### 10.5 原始输出

**（A）修复前·真事件流 RED**（fork 活下来的 abf42461，早前会话；run 已被探针清场删除，此为其摘要，主证据是下面可复现的 mock 对称对）：

```
焦点=DOCK-CLOSE ×6 · 取件数 17 → 19
⑥ 焦点从未被任何渲染抢走=false · 从未被抢到关闭钮=false · 取件零增长=false → ★ 红
```

**（B）修复前·mock 对称 RED**（靶 6139d6d8，真实 657 条事件重放，路径改写 t5m-*.txt，深链靶 t5m-x.txt——流里从未被写）：

```
⑥ mock 模式：重放靶 run 真实事件流（657 条），产物路径改写为 t5m-*.txt
采样基准焦点=#task-input（每 1s，共 12 次）：
  焦点=DOCK-CLOSE · 产物卡=0 · #conversation 长=2636 · 选中=t5m-x.txt · 段=t5m-x.txt
  焦点=DOCK-CLOSE · 产物卡=0 · #conversation 长=2859 · 选中=t5m-x.txt · 段=t5m-x.txt   （×12，全 DOCK-CLOSE）
取件数：采样前 17 → 采样后 74（画布被重开=true）
画布仍开着且 hash 仍路径形态=true · 采样窗口内确有状态推送渲染=true
⑥ 焦点从未被任何渲染抢走=false · 从未被抢到关闭钮=false · 取件零增长=false → ★ 红
```

**（C）修复后·mock GREEN**（同一靶、同一重放、同一深链靶）：

```
采样基准焦点=#task-input（每 1s，共 12 次）：
  焦点=#task-input · 产物卡=0 · #conversation 长=2477 · 选中=t5m-x.txt · 段=t5m-x.txt
  焦点=#task-input · 产物卡=0 · #conversation 长=2859 · 选中=t5m-x.txt · 段=t5m-x.txt   （×12，全 #task-input）
取件数：采样前 10 → 采样后 10（画布被重开=false）
画布仍开着且 hash 仍路径形态=true · 采样窗口内确有状态推送渲染=true
⑥ 焦点从未被任何渲染抢走=true · 从未被抢到关闭钮=true · 取件零增长=true → ✅
✅ 五条全成立：① 点开写路径形态地址、② 刷新复原同一件、③ 旧下标形态仍认、④ 不存在路径不崩有话说、⑥ 跑着的 run 上深链保持打开且焦点不被抢
```

**（D）noteWrites 插曲（为什么深链靶选 t5m-x）**：第一轮 mock 靶是 t5m-1.txt——它在重放流里**被写过**，触发 index.html:3163 "已开则防抖重拉当前预览"（**合法特性**：打开中的文件被写 → 防抖重取，不抢焦点）。修复后 mock-GREEN t5m-1 仍红：焦点 12/12 保持 #task-input、但取件 +1（10→11）。换 t5m-x.txt（流里从未被写）后全绿——把"bug 的重开"与"合法防抖重拉"两条路径分开。

**（E）认证沼泽与探针纪律**：现造 run 全死（d138568f、2d49257c、79338bdd、8c189188、ce6f49db 五连败）；早期探针清场把**链头父 run 94f58b8a 误删**——修成 Set 记录"探针启动前已有的 run" + `childId !== runId` 守卫后才不误伤。

### 10.6 复验

- **聚焦**：`npx vitest run test/ui-artifact-route.test.ts test/ui-artifact-canvas.test.ts` → `Test Files 2 passed (2)` / `Tests 100 passed (100)`（7 + 93）。
- **全量**：`12 failed | 3695 passed | 15 skipped (3722)` = 基线（11 确定 + 1 轮换）。本轮轮换位 ui-server stm32-mutex 超时——`git stash` 撤到干净 HEAD 复跑**照样失败**，证明非本轮引入（该测试全内存 FakeModelClient+mkdtemp，与 UI 改动零交集）；stash pop 还原后 index.html diff 逐字节核对与修复前一致。
- **check-eol（提交后）**：

```
✅  ui/public/index.html       CRLF= 6392 裸LF=   0 字节 234947/234947
✅  eval/persona-ux/_audit-20260919/verify-artifact-route.mjs CRLF=  566 裸LF=   0 字节 27524/27524
```

- 提交不含 `mcp.json`（工作树里另有他务改动，与本任务无关）。

### 10.7 出入与偏差（fix round 追加）

11. **真事件流 RED 只留了摘要**：abf42461 的原始终端输出在早前会话，run 已被探针清场删除；报告引其数字（DOCK-CLOSE ×6、17→19），本轮主证据是可复现的 mock 对称对（B/C）。
12. **「失败时留」无 jsdom 锁**：内联模块不可 import（§10.3）；探针替代锁死「成功时清」（取件零增长），「失败时留」只有防御性路径覆盖。抽纯函数进 features/ 记入账本。
13. **审查者引的行号 :2358 在提交后是 :2364**：渲染末尾的 `openPendingArtifact()` 调用点（:2245 与 :6370 是另外两处调用，语义各自成立）。
