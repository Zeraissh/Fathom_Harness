# Task 3 报告：非图附件的 chip、上传的进度与失败出路（A4 / A5）

**状态：完成（commit `7008eaf` + fix rounds `2e4d61e` / `a9e77b6` / `4bca1fb`）**
**BASE：`1d5b84f`** · 分支 `feat/attachments-artifacts`

## 做了什么

按 brief Step 1–8 走完：

1. **测试先行**（Step 1–2）：`test/ui-attachments.test.ts` 追加「上传上限不许有两个真值源」与「上传的接线锁」两组共 4 条用例，先跑红（红输出见下）。
2. **最小实现**（Step 3–5）：
   - `ui/public/index.html`：新增 `UPLOAD_MAX_BYTES_CLIENT`（与服务端 `UPLOAD_MAX_BYTES` 同源）、`uploadOne`（XHR + `upload.onprogress`，fetch 没有上传进度）、`attachmentIcon`（Phosphor 类型图标）、`uploadEntry`（首次与重试共用的单文件上传+落账）、`retryUpload`（数据还在内存里，不必重选文件）；`uploadFiles` 改为先挂清单（`status:"uploading"`）再逐条 `await uploadEntry`；`renderUploads` 按 `uploading/failed/done` 三态渲染（失败带原因 + 重试 + 删除）；点击委托加 `data-upload-retry` 一路。
   - `ui/public/styles.css`：`.upload-retry` / `.upload-item--failed` / `.upload-err`。
3. **锁旧行为的用例**（Step 6）：**本仓根本没有这条用例**——见下「与 brief 的偏差」。
4. **活页验收**（Step 7）：新建 `eval/persona-ux/_audit-20260919/verify-attach-states.mjs`，四量全过、0 控制台错误（输出见下）。
5. **提交**（Step 8）：见文末。

## 命令与真实输出

### Step 2 基线（改前，两个文件全绿）

```
$ npx vitest run test/ui-attachments.test.ts
✓ test/ui-attachments.test.ts (13 tests) 8ms
 Test Files 1 passed (1)      Tests 13 passed (13)

$ npx vitest run test/ui-app.test.ts
✓ test/ui-app.test.ts (295 tests) 115ms
 Test Files 1 passed (1)      Tests 295 passed (295)
```

### Step 2 变异前验红（新用例的红输出原文）

```
$ npx vitest run test/ui-attachments.test.ts -t "上传上限|上传的接线"
 Test Files 1 failed (1)      Tests 4 failed | 13 skipped (17)

× 上传上限不许有两个真值源 > index.html 的客户端预检常量与 server.ts 的上限相等 8ms
   → index.html 里没有 UPLOAD_MAX_BYTES_CLIENT: expected undefined to be truthy

× 上传的接线锁… > 走的是能报进度的 XHR，不是 fetch（fetch 没有上传进度） 4ms
   → expected '<!DOCTYPE html>…' to match /new XMLHttpRequest\(\)/

× 上传的接线锁… > 失败的文件留在清单里带重试按钮，不是被 continue 掉 3ms
   → expected '<!DOCTYPE html>…' to match /entry\.status\s*=\s*"failed"/

× 上传的接线锁… > 重试与首次上传共用同一个单文件函数——不许有两份 try/catch 3ms
   AssertionError: expected 1 to be greater than or equal to 2   ← 实际是 undefined（先红于没匹配）

FAIL test/ui-attachments.test.ts > 上传上限不许有两个真值源 > …
AssertionError: index.html 里没有 UPLOAD_MAX_BYTES_CLIENT: expected undefined to be truthy
```

（brief 说"全部五条"是按断言数数的——实际是 4 条 `it`；失败清单覆盖全部 4 条。）

### 变异验红 1：上传上限常量（硬要求）

把客户端常量改成 `21_000_000`，跑：

```
$ npx vitest run test/ui-attachments.test.ts -t "上传上限"
× 上传上限不许有两个真值源 > index.html 的客户端预检常量与 server.ts 的上限相等 9ms
   → expected '21000000' to be '20000000' // Object.is equality
 Tests 1 failed | 17 skipped (18)
```

已还原为 `20_000_000`。

### 变异验红 2：接线锁（硬要求）

四处变异一次做全（`new XMLHttpRequestStub()`、`"failedX"`、`data-upload-redo`、循环里去掉 `await`）：

```
$ npx vitest run test/ui-attachments.test.ts -t "上传的接线"
× …走的是能报进度的 XHR，不是 fetch（fetch 没有上传进度）
   → expected '…' to match /new XMLHttpRequest\(\)/
× …失败的文件留在清单里带重试按钮，不是被 continue 掉
   → expected '…' to match /entry\.status\s*=\s*"failed"/
× …重试与首次上传共用同一个单文件函数——不许有两份 try/catch
   → expected 1 to be greater than or equal to 2
 Tests 3 failed | 17 skipped (20)
```

`data-upload-retry` 那条断言在第一条断言短路后没被独立证明，单独验了一次（只留 `data-upload-redo` 变异、`"failed"` 还原）：

```
× …失败的文件留在清单里带重试按钮，不是被 continue 掉
   → expected '…' to match /data-upload-retry/
 Tests 1 failed | 17 skipped (18)
```

四处变异均已还原；还原后 `git diff` 复核过只有本任务的改动。

### Step 6 收尾跑（实现后）

```
$ npx vitest run test/ui-attachments.test.ts test/ui-app.test.ts
✓ test/ui-attachments.test.ts (18 tests) 18ms
✓ test/ui-app.test.ts (295 tests) 120ms
 Test Files 2 passed (2)      Tests 313 passed (313)
```

### Step 7 活页验收

```
$ node eval/persona-ux/_audit-20260919/verify-attach-states.mjs
工作目录下拉当前值：D:\Work\scratch\fathom-ux-audit-20260918\web-a
① 超限假文件：清单 1 条 · 失败条目在清单里=true · 原因="文件过大：21.0MB 超过 20MB 上限" · 有重试钮=true
   预检后 XHR 次数：0（应为 0——20MB 没白传）
② 非图 chip：条目在=true · 图标="ph ph-file-pdf" · 编号="附件 #1"
③ 注入失败：原因="上传没做成，请稍后再试。" · 有重试钮=true · 点重试前 XHR=2 后=3 · 重试后 done=true 编号="附件 #2"
   超限条目重试后：仍失败=true · 原因="文件过大：21.0MB 超过 20MB 上限" · XHR 仍=3（预检不重发）
④ 失败图片：失败时在清单=true · 缩略图条里它的引用按钮=0（应 0）
   重试成功后：在清单=true · 条里引用按钮=1 · 编号=3

控制台错误： 零
✅ 三条都成立（附④：失败图片不进缩略图条，重试成功带编号进条），0 控制台错误
```

### 行尾纪律

```
$ node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/index.html ui/public/styles.css test/ui-attachments.test.ts
★★ 不一致  ui/public/index.html       CRLF= 6188 裸LF=   0 字节 226973/222195  ← 与 HEAD 不逐字节相同
★★ 不一致  ui/public/styles.css       CRLF=11010 裸LF=   0 字节 275049/274753  ← 与 HEAD 不逐字节相同
★★ 不一致  test/ui-attachments.test.ts CRLF=  164 裸LF=   0 字节 6409/4616  ← 与 HEAD 不逐字节相同
```

「与 HEAD 不逐字节相同」对**被本任务改过的文件**是预期（check-eol 的判据是逐字节等于 HEAD）；关键指标**裸 LF 全为 0**，三个文件都是 CRLF，没有漂。探针（新文件）也归一化过：CRLF=198 裸LF=0。

### 全量（两次跑，失败集逐条一致）

```
$ npx vitest run     （第一次 01:11:34 起；第二次在最终树上 01:14:50 起）
 Test Files 5 failed | 164 passed | 1 skipped (170)
      Tests 11 failed | 3630 passed | 15 skipped (3656)
 Duration 166.39s
```

11 条失败（两次全跑同名同数，与派单给的基线口径一致——11 条确定性失败 + 抖动）：

```
FAIL test/cloud-sync-env.test.ts > cloud-sync-env.sh：Secrets → 工作区 .env > 注释态声明的变量同样参与同步
FAIL test/cloud-sync-env.test.ts > cloud-sync-env.sh：Secrets → 工作区 .env > Secrets 覆盖 .env.cloud 默认项，且每个键只落一行
FAIL test/run-crash-inject.test.ts > RUN-02 crash injection > 审批等待中硬崩溃 → pending 清空为 interrupted；无 checkpoint 不可 same-run
FAIL test/ui-handoff.test.ts > 下一步提议（不挡对话） × 4 条
FAIL test/ui-patch.test.ts > 空态给的是能点的例子 > 设计样例卡是迷你页缩略图，不是小图标 chip
FAIL test/ui-patch.test.ts > 空态给的是能点的例子 > composer 是紧凑胶囊：对话与欢迎共用，起步卡只在欢迎
FAIL test/ui-patch.test.ts > 办公/编码脸与侧栏密度 > 侧栏骨架：列表前没有第三颗满宽标签钮；会话 meta 默认不占行
FAIL test/ui-server.test.ts > 监控闭环… > 跨 run 资源互斥：stm32 包的探针被在飞 run 持有 → 429 附持有者；stop 释放后放行（Test timed out in 5000ms——文档化的抖动）
```

**不是我改坏的证据**：① 失败文件与上传完全无关（cloud-sync / run-crash-inject / handoff / patch 的侧栏与空态 / server 互斥）；② ui-patch 那 3 条是 **CRLF 本地工件**——期望串带裸 `\n`，而工作树（autocrlf=true）是 CRLF，`readFileSync` 原样读不到。实测 LF 针 `false`、CRLF 针 `true`；且**改动前的首轮 check-eol 已证明工作树在 HEAD 时就全 CRLF、裸 LF=0**，即这几条在 HEAD 就红；③ 我的 styles.css 改动是纯插入 11 行，不可能删掉任何既有子串；④ 两次全跑（一次在我最后一处改动之前、一次之后）失败集逐条相同。

## 与 brief 的偏差（及原因）

1. **「锁旧行为的用例」不存在，`test/ui-app.test.ts` 一行没改。**
   brief Step 6 说 `test/ui-app.test.ts:2921-2948` 附近锁着"上传失败之后清单里没有它"。全仓 grep（`上传失败|showSubmitError|continue` 等）确认**没有这条用例**——实际 2921–2948 是「附件清单可删除（壳侧接线）」组，锁的是**删除**行为（清单移除/stripAttachmentLine/revoke/DELETE），与本任务不冲突，且我的改动没有动 `removeUploadedFile` 的任何一行。于是 Step 6 的"ui-app 预计红一条"没有发生；行为变更仍按 brief 写进提交信息，新行为由新加的接线锁（`entry.status = "failed"` 留在清单 + `data-upload-retry`）钉住。
2. **样式换了 token：`var(--danger, #b71c1c)` / `11px` → `var(--red)` / `var(--font-xs)`。**
   brief 的逐字值会撞断两条既有 CI 测试：`--danger` 在本仓 styles.css 里没有定义（"CSS 变量：引用的必须定义过"），`11px` 低于 12px 下限（"低于 12px 的字号"）。改成本仓等价 token（`--red: var(--status-bad)`、`--font-xs: 12px`）后全绿。这是硬约束压过逐字值的一处。
3. **非图 chip 的类型图标改按 `!u.previewUrl` 门控，而不是 brief 代码里的 `u.attachNo === undefined`。**
   brief 自己的验收子弹说"非图 chip **有类型图标、有 附件 #N**"，但 brief 的渲染代码在 done 态（attachNo 已分配）把图标换成空串——按它逐字写，验收子弹永远不成立（活页探针第一次跑就量出 done 态 `图标=null`）。改成"非图附件**每个状态**都带类型图标；图片靠缩略图不需要"，让「图标 + 附件 #N」同时成立（探针 ② 输出为证）。
4. **新增一条焦点守卫接线锁 + 一条探针量 ④。**
   a) brief 没要求，但派单专门点名"Task 2 的焦点守卫不许丢"，而它此前**没有任何测试钉着**（丢在重写里不会红）。在既有「接线锁」组里加了一条 `entry.autoCite && document.activeElement === taskInput` 的锁。
   b) 派单点名的第二坑（Task 2 成果）之外，本任务的"条目先挂清单"还把 Task 2 的缩略图条暴露给**没有 attachNo 的失败图片**：引用按钮会插出「Image #undefined」。修法是缩略图过滤加 `u.attachNo !== undefined`（一行），探针 ④ 量两条（失败时不进条、重试成功带编号进条）——这个缺陷与修复都不在 brief 里，但属于"失败出路"的完整语义（失败的图片不该提供一个会插垃圾文本的按钮）。
5. **接线锁既有用例的区间锚点从 `uploadFiles` 挪到 `uploadEntry`。**
   那条用例的注释自己预告了"uploadEntry 是 Task 3 才引入的符号"；`insertAtCaret` 与传输行搬进 `uploadEntry` 后，原锚点切片里找不到这两行。锚点跟着符号走，判据（先插引用后追加行）一字未动。
6. **探针的失败注入用「200 + 非 JSON body」而不是 500。**
   brief 只要求"可以拦 XMLHttpRequest 数调用次数"，没指定方法。用 500 会在控制台刷 `Failed to load resource`，把"0 控制台错误"验收搅浑；200+非 JSON 走 `uploadOne` 里"非 JSON 就是失败"的既有分支，人话报错（`上传没做成，请稍后再试。`），控制台干净。

## 派单两坑怎么兜的

- **坑一行号漂移**：全部按符号 grep 定位（`renderUploads`/`clearUploads`/`removeUploadedFile`/`uploadFiles`/点击委托实测 4875/4916/4934/4968/5073，与派单给的漂移后行号一致），没照计划行号切。
- **坑二 Task 2 成果**：重写的 `uploadEntry` 里原样保住「先插引用、再追加传输行」与「`document.activeElement === taskInput` 焦点守卫」两条（brief 正文已带 ★ 标注，逐字照抄）；另补了第 4.a 条的焦点守卫锁，让它以后丢不了。修复成果在测试里的可见性：既有的顺序锁照常绿，新的焦点守卫锁新增即绿。

## 遗留顾虑

- 失败/上传中条目的删除：失败条目（未成功上传）点删除会发 DELETE `/api/upload`（`path` 是客户端文件名，服务端 404 或删空）——`removeUploadedFile` 的既有取舍路径（"已从清单移除，但盘上文件保留"）会兜住并说明，但用户会看到一条略带困惑的状态条。brief 未涉及，未动。
- 超限条目重试仍走预检、仍失败——这是设计（bytes 不会变、服务端也拒），错误文案不变，但重试按钮对这类条目"永远无望"，界面上没有单独说破。brief 的取舍如此（预检留在 `uploadEntry` 里，重试共用），如实记。
- 上传中条目没有删除按钮（brief 渲染代码如此）——20MB 大文件在上传途中无法取消。loopback 上几乎无感，远程访问时可能想要一个"取消"；不在 brief 范围。

## Fix round 1（协调方返工）

### 改了什么

1. **失败/上传中条目不再打 DELETE**（`removeUploadedFile`）：`uploaded.splice` + `stripAttachmentLine` + `renderUploads` 照常跑完之后、进 `try` 之前加分流——`u.status !== "done"` 时只 `announceStatus("已从清单移除 …")` 并 return，不去删盘。只有成功落过盘（`status==="done"`，`path` 已是 `uploads/…`）的条目才打 `DELETE /api/upload`。
2. **超限条目不挂重试钮**（`renderUploads` 失败分支）：`const canRetry = u.bytes <= UPLOAD_MAX_BYTES_CLIENT;` 门控 `retryBtn`，超限条目只给删除钮。
3. **活页探针顺手抓出一条真缝，一并修了**：给 ⑤ 量"失败条目删除时 DELETE 一次都不该打"时，页面当场 `PAGEERROR ReferenceError: stripAttachmentLine is not defined`——`stripAttachmentLine` 在 `removeUploadedFile` 里用了（Task 2 起的），但**从没 import**，点删除必炸、清单与输入框都清不掉。修法：`/app.js` 的 import 列表补 `stripAttachmentLine`。这是"纯函数与控制器的缝"（源码 grep 锁只会看文本里有没有这名字，接没接上看不见），补了第三条锁钉住 import 本身。

### 新锁（`test/ui-attachments.test.ts`，describe「Fix round 1 的两条接线锁」）

- 删除分流：抠 `removeUploadedFile` 函数体，`u.status !== "done"` 必须在 `fetch("/api/upload"` **之前**（indexOf 比先后）。
- 重试钮：失败分支切片里 `const canRetry = u.bytes <= UPLOAD_MAX_BYTES_CLIENT;` 与 `const retryBtn = canRetry ?` 两条判据都在。
- import 缝：`} from "/app.js";` 之前最近的 `import {` 块里必须含 `stripAttachmentLine`。

### 变异验红（红输出原文）

**变异 1：删掉分流那行**（`if (u.status !== "done") {`）：

```
FAIL test/ui-attachments.test.ts > Fix round 1 的两条接线锁 > 删除只在 status==="done" 时才打 DELETE——失败/上传中的条目从没落过盘，拿原始文件名打 DELETE 必被拒，那句「盘上文件保留」是假的
AssertionError: 找不到 u.status !== "done" 这道分流: expected -1 to be greater than -1
❯ test/ui-attachments.test.ts:158:50
    156|     const gate = body.indexOf('u.status !== "done"');
    157|     const del = body.indexOf('fetch("/api/upload"');
    158|     expect(gate, '找不到 u.status !== "done" 这道分流').toBeGreaterThan(-1);
       |                                                 ^
 Test Files 1 failed (1)   Tests 1 failed | 19 skipped (20)
```

**变异 2：`canRetry` 恒真**（`const canRetry = true;`）：

```
FAIL test/ui-attachments.test.ts > Fix round 1 的两条接线锁 > 超限条目不挂重试钮——预检会原样再拦一次、点了没反应（canRetry 判据必须在失败分支里）
AssertionError: expected 'if (u.status === "failed") {\r\n     …' to match /const canRetry\s*=\s*u\.bytes\s*<=\s*…/

- Expected:
/const canRetry\s*=\s*u\.bytes\s*<=\s*UPLOAD_MAX_BYTES_CLIENT\s*;/

+ Received:
"if (u.status === \"failed\") {
        // 失败**说清原因**（文件过大 / 网络中断 / 已切走），并给一条出路
        const canRetry = true;
        …"
 Test Files 1 failed (1)   Tests 1 failed | 19 skipped (20)
```

**import 缝的红态即真实缺陷**（不是人工变异，是探针活页抓到的）：

```
$ node eval/persona-ux/_audit-20260919/verify-attach-states.mjs   （改探针后第一跑）
⑤ 失败条目删除：清单里已移除=false · DELETE 次数 0→0（应 0 次——没落过盘不许打 DELETE）
控制台错误： [ 'PAGEERROR ReferenceError: stripAttachmentLine is not defined' ]
★ 有量没达标——看上面哪一行不对
exit=1

$ npx vitest run test/ui-attachments.test.ts -t "stripAttachmentLine 的 import"
❯ test/ui-attachments.test.ts:180
    expect(source.slice(start, end), "import 列表里没有 stripAttachmentLine…").toContain("stripAttachmentLine");
 Test Files 1 failed (1)   Tests 1 failed | 20 skipped (21)
```

两处人工变异均已还原（还原后 `git diff` 复核只含本意改动）；import 缝修掉后锁转绿。

### 命令与结果

```
$ npx vitest run test/ui-attachments.test.ts test/ui-app.test.ts
 Test Files 2 passed (2)      Tests 316 passed (316)   （ui-attachments 21 + ui-app 295）

$ node eval/persona-ux/_audit-20260919/verify-attach-states.mjs   （修后终跑）
① 超限假文件：… 有重试钮=false（应为 false——超限不给空按钮） · 预检后 XHR 次数：0
② 非图 chip：图标="ph ph-file-pdf" · 编号="附件 #1"
③ 注入失败：点重试前 XHR=2 后=3 · 重试后 done=true 编号="附件 #2"
   超限条目：仍失败=true · 重试钮数=0（应为 0——超限不给空按钮）
④ 失败图片：失败时缩略图条引用按钮=0 · 重试成功后=1 · 编号=3
⑤ 失败条目删除：清单里已移除=true · DELETE 次数 0→0（应 0 次——没落过盘不许打 DELETE）
控制台错误： 零
✅ …⑤：失败条目删除不打 DELETE），0 控制台错误
exit=0

$ node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/index.html test/ui-attachments.test.ts eval/persona-ux/_audit-20260919/verify-attach-states.mjs
三文件 CRLF 全部保留、裸LF=0（「与 HEAD 不逐字节相同」对已改文件是预期）

$ git commit（新一笔，未 amend 7008eaf）
2e4d61e fix(ui): 失败条目别去删盘（那句"盘上文件保留"是假的）+ 超限不给重试
```

### 遗留顾虑更新

- 原 ①（失败条目删除的 DELETE 怪状）与 ②（超限重试永远无望）：**本 round 已修**（探针 ⑤ 与 ① 的量分别钉住）。
- 原 ③（上传中不可取消）：**协调方拍板不做**——`uploadOne` 没暴露 XHR 句柄，加取消要改返回形状，属功能缺口不是假话，留给走查按真实需要决定。
- 新增观察：`stripAttachmentLine` 这条 import 缝说明"源码 grep 锁只能锁文本、锁不住接线"，活页探针的删除路径此前没走过。探针已补 ⑤ 量，以后这条路径每次探针都真走。

## Fix round 2（协调方返工）

### 永久护栏：`test/ui-shell-imports.test.ts`

协调方逐字给的静态锁，落在新文件 `test/ui-shell-imports.test.ts`（CRLF=56 裸LF=0）：
把 app.js 的全部导出名（逐个 `export function/const/let/class` + 汇总式 `export { … }`）与
壳里 `/app.js` 三个 import 块（路径正则 `["'][./]*\/?app\.js["']`）做差集，凡在壳里以
「名字(」被**调用**却不在 import 列表里的，点名报缺。

在已修好的树上跑：**0 缺失**——顺带印证了协调方独立核的结论"没有第二处"。

### 变异验红（红输出原文）

把 `index.html` import 块里 `stripAttachmentLine,` 临时注释掉（Edit 工具，非 sed），跑：

```
FAIL test/ui-shell-imports.test.ts > 壳用了 app.js 的名字就必须 import > 没有「用了却没引入」的缝
AssertionError: 壳用了却没 import（点下去会 ReferenceError）：stripAttachmentLine: expected [ 'stripAttachmentLine' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "stripAttachmentLine",
+ ]
```

**点名 stripAttachmentLine，且只有它**——没有假警报。已还原；还原后 `git diff` 复核
`ui/public/index.html` 与 HEAD 零差异，check-eol 裸LF=0。

### 命令与结果

```
$ npx vitest run test/ui-shell-imports.test.ts test/ui-attachments.test.ts test/ui-app.test.ts
 Test Files 3 passed (3)      Tests 317 passed (317)

$ git commit（新一笔，未 amend 2e4d61e）
a9e77b6 test(ui): 给壳的 import 缝上静态锁——它躲过了六道关
```

### 这条缝为什么六道关都没抓住（一句话）

六道关里每一道看的都是**源码文本里"出现过"这个名字**（实现者照抄计划、变异验红撞的是既有文本锁、
审查与独立核实读的是同一份看不见"没接上"的 diff、fix round 的定向复查也全是文本锁），
而"使用"与"引入"是两件事——文本锁的判据对这两件事**不可区分**；只有活页探针把"点删除"
当行为来走，才走到那行缺 import 的代码。这条静态锁把判据换成"导出名 × 调用点 × import 列表"
三者的差集，从根上改掉了判据本身，而不是再加一道同款文本锁。

## Fix round 3（review 的 Important + 两条 Minor）

审查判 **Spec ✅ / Approved —— 0 Critical、1 Important、6 Minor**。本 round 只做三件（Minor 1/2/4 由协调方拍板不改：1 不改写已提交历史、账本记录，2 brief 原样继承的不对称留着，4 审查已全扫其余 14 个 import 块无活缝、纯残余风险接受）。

### ① Important：缩略图过滤上锁 + 探针失败半量补盲

- **静态锁**（`test/ui-attachments.test.ts` 新 describe「缩略图条只给已落盘有编号的条目（review 的 Important）」）：钉表达式 `/u\.attachNo\s*!==\s*undefined/`。
- **探针 ④ 判据换掉**：失败半量不再按 `alt==="uploads/图.png"` 找钮——buggy 状态下失败条目的 path 是原始名（`file.name`），alt 是「图.png」，永远匹配不到、照旧报 0。改成数 `data-upload-cite="undefined"` 的钮（那正是缺陷的形态），并在探针里写明 alt 可以是原始名这件事。

### 变异验红（红输出原文）

**静态锁**（拆掉 `u.attachNo !== undefined` 门槛）：

```
FAIL test/ui-attachments.test.ts > 缩略图条只给已落盘有编号的条目（review 的 Important） > 缩略图只给已落盘且有编号的条目标引用钮（否则会插出 Image #undefined）
AssertionError: expected '<!DOCTYPE html>\r\n<html lang="zh-CN"…' to match /u\.attachNo\s*!==\s*undefined/

- Expected:
/u\.attachNo\s*!==\s*undefined/

+ Received:
"<!DOCTYPE html>
<html lang=\"zh-CN\">
…
```

**探针的活页变异**（同一处拆掉门槛，跑探针——旧判据在这里会报 0、照样绿，新判据当场红）：

```
④ 失败图片：失败时在清单=true · 条上 data-upload-cite="undefined" 的钮=1（应 0——按缺陷形态判，不按 alt）
★ 有量没达标——看上面哪一行不对
exit=1
```

门槛已还原；`check-eol.mjs` 显示 `ui/public/index.html` 与 HEAD **逐字节相同**（✅），探针复跑 exit=0。

### ② 护栏测试文件两处文档错（Minor 5）

- 「有三个 import 块」→ 实为**只有一个** `/app.js` 块（其余是 rail-policy / settings 等）。
- 「光看名字会把注释、字符串全算进来，那是假警报」说满了 → 改为实话：降噪降的是"光看名字"，降到「名字(」的调用形态，**不是**排除注释与字符串（注释/字符串里恰好出现 `foo(` 仍会误报，现状下无此巧合）。

### ③ 探针一句说多了的注释（Minor 3）

头注释声称量了「uploading 态在清单里渲染」，代码没有。选说实话（loopback 上 uploading 态一闪而过、量不到稳定中间态；链路用 ① 的预检 XHR=0 与 ③ 的 XHR 计数间接验），不补这个量——补一个靠"卡住请求"才能截到中间态的检查，引入的是抖动不是防线。

### 命令与结果

```
$ node eval/persona-ux/_audit-20260919/verify-attach-states.mjs   （修后终跑）
① … 有重试钮=false · 预检后 XHR 次数：0
② 非图 chip：图标="ph ph-file-pdf" · 编号="附件 #1"
③ 注入失败：点重试前 XHR=2 后=3 · 重试后 done=true 编号="附件 #2" · 超限条目重试钮数=0
④ 失败图片：… data-upload-cite="undefined" 的钮=0（应 0——按缺陷形态判，不按 alt）
   重试成功后：条里引用按钮=1 · 编号=3
⑤ 失败条目删除：清单里已移除=true · DELETE 次数 0→0
控制台错误： 零
exit=0

$ npx vitest run test/ui-shell-imports.test.ts test/ui-attachments.test.ts test/ui-app.test.ts
 Test Files 3 passed (3)      Tests 318 passed (318)

$ node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/index.html test/ui-attachments.test.ts eval/persona-ux/_audit-20260919/verify-attach-states.mjs test/ui-shell-imports.test.ts
index.html 与 HEAD 逐字节相同；其余三文件裸LF=0

$ git commit（新一笔，未 amend）
4bca1fb test(ui): 给缩略图那道过滤上锁 + 补上探针失败半量的盲点
```

### 遗留顾虑更新

- Minor 2（`autoCite` 清置只在 catch 路径）仍留着——brief 原样继承的不对称，账本在案。
- 探针 ④ 现在的失败半量按缺陷形态判、成功半量按 alt 判（done 态 path 必是 `uploads/…`）——若未来 done 态 path 形态再变，成功半量会回到"永远匹配不到"的老坑；届时该把成功半量也换成按编号判。
