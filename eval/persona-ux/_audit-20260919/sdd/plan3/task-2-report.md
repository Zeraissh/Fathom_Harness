# Task 2 报告：打开目录浮层立刻粘贴，不许被起点目录静默覆盖

**状态：DONE（含 4 处偏离，其中 3 处经控制者预先授权、1 处自评后补，见 §八）**
**Commit：`e992b47` fix(ui): 目录浮层的异步回写不再盖掉用户刚粘贴的路径**

---

## 一、实现了什么

1. `ui/public/features/workdir-picker.js`：
   - `:482` 起 `let pathTyped = false;` 脏标记 + 13 行病因注释（逐字 brief Step 3.a）；
   - `:793` `pathInput` 的 `input` 事件打脏（brief 的声明段在 `pathInput` 创建之前，监听器按仓库现实放在 keydown 监听之后）；
   - `:670` `load()` 回写加守卫 `if (path !== null && !pathTyped)`（逐字 brief Step 3.b）；
   - 五处程序性导航在发起 `load()` **之前**清标记：下钻行 `:634`、上一级 `:770`、「前往」按钮 `:778`、回车 `:787`、**面包屑 `:598`**（brief 只列前三处，面包屑是自评后补的，理由见 §八-4）；
   - `:678` `openPicker()` 清标记（逐字 brief Step 3.d）。
2. `test/ui-workdir-picker.test.ts`：`describe("initWorkdirPicker")` 末尾追加两条测试（计划 3 · T2）。
3. `eval/persona-ux/_audit-20260919/verify-picker-paste.mjs`：新建活页探针（三条判据：① 粘贴不被盖 ② 下钻跟得上 ③ 0 控制台错误）。

## 二、TDD 证据

### RED（先写测试，守卫还不存在）

命令：`npx vitest run test/ui-workdir-picker.test.ts`

```
 × initWorkdirPicker > 打开浮层后立刻粘贴：异步回写不许覆盖它（计划 3 · T2） 33ms
   → expected 'D:\start-dir' to be 'D:\pasted-by-user' // Object.is equality
 ✓ initWorkdirPicker > 程序性导航（下钻）仍然会把输入框带过去——脏标记只挡异步回写（计划 3 · T2） 58ms

 Test Files  1 failed (1)
      Tests  1 failed | 30 passed (31)
```

为什么这个失败是预期的：当时 `load()` 无条件回写（`if (path !== null)`），掐住的起点目录响应放行后把粘贴值
`D:\pasted-by-user` 静默换成了 `D:\start-dir`——正是本任务要修的竞态；第二条当时已绿（现状下钻本来就回写），
与 brief Step 2 的预期完全一致。

### GREEN（实现 3.a–3.d 后）

命令：`npx vitest run test/ui-workdir-picker.test.ts`

```
 ✓ test/ui-workdir-picker.test.ts (31 tests) 278ms
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

## 三、变异验红（Step 5）

### 5.a 把 3.b 的守卫去掉（回到 `if (path !== null) …`）

命令：`npx vitest run test/ui-workdir-picker.test.ts`

```
 × initWorkdirPicker > 打开浮层后立刻粘贴：异步回写不许覆盖它（计划 3 · T2） 39ms
 Failed Tests 1
      Tests  1 failed | 30 passed (31)
```

第一条红，符合预期 → 已还原守卫，重跑 31/31 绿。

### 5.b 把 3.c 的 `pathTyped = false;` 删掉一处（下钻行点击）

命令：`npx vitest run test/ui-workdir-picker.test.ts`

```
 × initWorkdirPicker > 程序性导航（下钻）仍然会把输入框带过去——脏标记只挡异步回写（计划 3 · T2） 68ms
   → expected 'D:\root' to be 'D:\root\child' // Object.is equality
 Failed Tests 1
      Tests  1 failed | 30 passed (31)
```

第二条红——脏标记过界（把合法的下钻导航也挡了），正是这条测试要锁的。符合预期 → 已还原，重跑 31/31 绿。

## 四、活页探针（Step 6，含「先探针后修」）

命令：`node eval/persona-ux/_audit-20260919/verify-picker-paste.mjs`（靶 4201 审计宿主）

### 修后（守卫在）

```
靶：http://127.0.0.1:4201/#/
掐住：/api/fs/list?path=D:\Work\scratch\fathom-ux-audit-20260918\web… 1.5s
fill 刚落地（fs/list 仍被掐着）： "D:\Work\Github_pros\Agent_Design\src"
fs/list 放行后：                    "D:\Work\Github_pros\Agent_Design\src"
✅ ① 粘贴没被起点目录盖掉
✅ ② 下钻后输入框跟着变成 "D:\Work\scratch\fathom-ux-audit-20260918\web-a\docs"

③ 控制台： 零

✅ 三条全成立：① 粘贴不被盖 ② 下钻跟得上 ③ 0 控制台错误
exit=0
```

### 先探针后修（把 3.b 的守卫临时去掉）

```
靶：http://127.0.0.1:4201/#/
掐住：/api/fs/list?path=D:\Work\scratch\fathom-ux-audit-20260918\web… 1.5s
fill 刚落地（fs/list 仍被掐着）： "D:\Work\Github_pros\Agent_Design\src"
fs/list 放行后：                    "D:\Work\scratch\fathom-ux-audit-20260918\web-a"
★ ① 粘贴被起点目录静默覆盖（老 bug）
✅ ② 下钻后输入框跟着变成 "D:\Work\scratch\fathom-ux-audit-20260918\web-a\docs"

③ 控制台： 零

★ 有判据没成立，见上。
exit=1
```

① 红得与计划 2 的确定性复现逐字同形（`sdd/plan2/task-1-report.md:188-193`：放行后输入框变成起点目录
web-a）——这条探针真的抓得住。**已还原守卫，重跑探针三判据全绿、exit=0（见上）。**

## 五、下钻行选择器：从哪一行读出来的

**实际使用**：`.wp-dir`，路径按 **`title`** 匹配（`[...document.querySelectorAll(".wp-dir")].find((el) => el.title === "D:\\root\\child")`）。

**出处**：`renderDirs` 在 `ui/public/features/workdir-picker.js:624-625`（提交后行号）：

```js
item.className = "wp-dir";   // :624
item.title = dir.path;       // :625
```

计划原文猜的 `.wp-dir, [data-path]` + `el.dataset?.path` **在本仓找不到行**——`renderDirs` 只写
`className` 与 `title`，从不写 `data-path`（`data-path` 是 combobox 菜单 `.wd-option` 行的属性，
浮层下钻行没有）。沿用猜的选择器会让第二条测试在「没找到下钻行」的 throw 处红，或者被实现者
顺手改绿后变成装饰性锁——所以按控制者的硬要求读了真实类名。

## 六、全量测试：零新增

命令：`npx vitest run`（JSON reporter 摘出失败清单）

```
cloud-sync-env.test.ts :: cloud-sync-env.sh：Secrets → 工作区 .env 注释态声明的变量同样参与同步
cloud-sync-env.test.ts :: cloud-sync-env.sh：Secrets → 工作区 .env Secrets 覆盖 .env.cloud 默认项，且每个键只落一行
run-crash-inject.test.ts :: RUN-02 crash injection 审批等待中硬崩溃 → pending 清空为 interrupted；无 checkpoint 不可 same-run
ui-handoff.test.ts :: 下一步提议（不挡对话） 工具记下提议后对话继续，列表能看见待确认的下一步
ui-handoff.test.ts :: 下一步提议（不挡对话） 调试还在跑时同意被拒绝——探针可能还占着
ui-handoff.test.ts :: 下一步提议（不挡对话） 结束后拒绝只撤卡，不开新 run
ui-handoff.test.ts :: 下一步提议（不挡对话） 结束后同意开一场注入计划：改固件再复测，跳过确认门
ui-patch.test.ts :: 空态给的是能点的例子 设计样例卡是迷你页缩略图，不是小图标 chip
ui-patch.test.ts :: 空态给的是能点的例子 composer 是紧凑胶囊：对话与欢迎共用，起步卡只在欢迎
ui-patch.test.ts :: 办公/编码脸与侧栏密度 侧栏骨架：列表前没有第三颗满宽标签钮；会话 meta 默认不占行
ui-server.test.ts :: 监控闭环：outcome 分档指标与告警文件一致性 跨 run 资源互斥：stm32 包的探针被在飞 run 持有 → 429 附持有者；stop 释放后放行
```

11 条失败 = 控制者点名的基线（cloud-sync-env ×2、ui-handoff ×4、ui-patch ×3、run-crash-inject ×1、
ui-server ×1），**全部在基线清单里，零新增**（本任务首轮全量曾出现 13 条，多出的 2 条是 ui-server
轮换抖动，二轮回到 11）。`test/ui-workdir-picker.test.ts` 31/31 全绿、不在失败清单。

## 七、check-eol（提交后）

```
✅  ui/public/features/workdir-picker.js CRLF=  815 裸LF=   0 字节 27005/27005
✅  test/ui-workdir-picker.test.ts CRLF=  562 裸LF=   0 字节 21016/21016
✅  eval/persona-ux/_audit-20260919/verify-picker-paste.mjs CRLF=  136 裸LF=   0 字节 5219/5219
exit=0
```

四列全 ✅。另注：提交前跑过一次，两文件显示「与 HEAD 不逐字节相同」但**裸LF=0**——那是
HEAD 还没含本次内容改动的必然结果（check-eol 的 ✅ 要求与 HEAD 逐字节一致），不是行尾漂移；
提交后重跑即全 ✅。新探针文件写入时用 LF，提交前已转 CRLF（裸LF=0 复核过）。

## 八、偏离 brief 之处（四处）

1. **测试 init 签名**（控制者授权范围内：以仓库为准）：brief 的
   `initWorkdirPicker(document.body, { fetchImpl })` 与真实签名不符——真实是
   `initWorkdirPicker(host = {}, env = {})` 且 env 键是 `fetch`（workdir-picker.js:457-460）。
   照既有用例写成 `initWorkdirPicker({}, { fetch: fetchImpl })`，否则 `fetchImpl` 为 undefined、
   `load()` 直接早退，两条测试都是假绿。
2. **下钻行选择器**（控制者硬要求）：见 §五，`.wp-dir` + `title`。
3. **第二条测试的假 fetch 按请求路径差异化应答**：brief 的写法对每个 fs/list 都回
   `{ path: "D:\\child", dirs: [deeper] }`——open 回写后输入框已是 `D:\child`，再下钻回写还是
   `D:\child`，**删掉下钻的 clear 输入框值根本不变，5.b 变异就不会红**（装饰性锁）。改成
   `D:\root` → `D:\root\child` 两级应答后，下钻真的改变输入框值，5.b 才红得起来（见 §三）。
4. **面包屑点击也清标记**（brief 之外的一处，自评后补）：`:598`。面包屑与下钻/上一级同形——
   都是"用户明确要走的方向，输入框该跟着变"。不加它的话，本次修复会**新引入**一个不一致：
   用户粘贴后点面包屑导航，输入框不再跟随（旧代码是无条件回写、会跟随）。改动 3 行，
   不影响任何测试。

## 九、自评发现

- 判据是"用户动过"（input 事件打脏），不是"框里有东西"——第二条测试锁的正是脏标记不过界，5.b 变异已验。
- `openPicker` 幂等重开（浮层已开时再 open）也会清标记，与"新开的浮层是干净的"同义。
- `mkdirHere` 的 `load(currentPath)` 刷新**未**清标记：那是原地刷新不是方向性导航，用户粘贴的
  草稿值得保留，且清掉反而会用与用户意图无关的目录冲掉草稿。
- 注释全部属实：声明注释解释为什么是"动过"而不是"有东西"；守卫注释与 brief 逐字一致。
- 未动任何既有档案（`eval/persona-ux/**` 只新增不修改）；未动 mcp.json（入场时已 staged，不是我的改动，未提交）。
- 探针自带宿主哨兵：逐字节比对宿主吐出的 `/features/workdir-picker.js` 与本仓磁盘文件，
  不同步时全部读数作废（静态文件无 Cache-Control，必须看服务端字节）。
- 探针若没掐住起点目录的 fs/list（gated=false）会显式失效退出，不许判据静静绿。

## 十、文件清单

- `ui/public/features/workdir-picker.js`（+43/-6）
- `test/ui-workdir-picker.test.ts`（+72）
- `eval/persona-ux/_audit-20260919/verify-picker-paste.mjs`（新建，136 行）
