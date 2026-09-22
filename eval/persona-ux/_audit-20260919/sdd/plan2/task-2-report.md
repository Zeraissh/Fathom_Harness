# Task 2 报告：附件的编号（设计案 A1 / A2）

**状态：DONE_WITH_CONCERNS** · **Commit：`72c8071`**

---

## 做了什么

按 brief Step 1–8 走完 TDD 全流程，并超出 brief 补了三处收尾（详见「偏差」）。

1. 新建 `test/ui-attachments.test.ts`（brief 逐字）：parse / strip / split 三组纯函数用例 + 两条接线锁（锁表达式本身，不锁名字出现）。
2. `ui/public/app.js`：放宽 `ATTACH_RE` / `ATTACH_CAPTURE_RE`（新格式 `附件 #N：`，捕获组 ① 编号 ② 路径）；新增 `parseAttachmentLine`、`stripAttachmentLine`；`splitUserMessageAttachments` 返回值新增 `attachmentRefs`，`attachments` 形状不变；`deriveRunTitle` 改用 `parseAttachmentLine`（原 `m?.[1]` 在新正则下取到编号，全量跑出回归后修掉）。
3. `ui/public/index.html`：`attachSeq`（清稿归零，放在提前 return 之前）；新函数 `insertAtCaret`；`renderUploads` 缩略图按钮化 + 编号徽章 + 清单行编号标签；上传行写成 `` `附件 #${attachNo}：${info.path}` ``，单张自动插 `Image #N `；删除走 `stripAttachmentLine`；`composerMedia` 单独挂点击委托插引用。
4. `ui/public/styles.css`：`.composer-media-preview` 按钮剥皮（brief 的块，去掉 var() 兜底）；新增 `.composer-media-no` 徽章与 `.upload-no`。
5. 超出 brief：`ui/title.ts`（服务器端标题推导，`ui/server.ts` 在用）持同一份旧正则，同步放宽 + 捕获组下标 `m?.[2]`；`test/title.test.ts` 加新格式锁；`test/ui-app.test.ts:2941` 的「删除做三件事」断言从锁旧内联过滤 `` `附件：${u.path}` `` 迁移为锁 `stripAttachmentLine(taskInput.value, u.path)` 接线（意图不变，不喂注释）。

## 命令与真实输出

**Step 1/2 写测试 → 红**

```
$ npx vitest run test/ui-attachments.test.ts
Test Files  1 failed (1)
     Tests  10 failed | 1 passed (11)
```

与 brief 预期一致：10 红（`parseAttachmentLine is not a function` + 两条接线锁不匹配），唯一绿的是「`附件列表如下` 不许被当成附件行」——旧正则本来就不吃它，这条钉住放宽时守卫不丢。

**Step 3/4 app.js 实现 → 半绿**

```
$ npx vitest run test/ui-attachments.test.ts
Test Files  1 failed (1)
     Tests  2 failed | 9 passed (11)
```

红的就是那两条接线锁（index.html 还没改）。

**Step 5 index.html + styles.css → Step 6 三个文件**

第一次跑 `test/ui-attachments.test.ts test/ui-file-preview.test.ts test/ui-app.test.ts` 出现 2 红：

```
× AC8 CSS 令牌统一 (P2) > 36. styles.css 除主题定义块外无裸十六进制色值
× V-20 字体阶梯 > 全表无小于 12px 的字号——辅助信息的硬下限
```

原因：brief 的 CSS 里 `#fff` 撞 AC8 裸十六进制门、`font-size: 10px/11px` 撞 V-20 的 12px 硬下限。修法：徽章改 scrim 先例 `color-mix(in srgb, var(--text-1) 62%, transparent)` + `color: var(--surface-0)`（同一对互补令牌，亮暗双主题可读），字号改 `var(--font-xs)`（12px）。修后：

```
$ npx vitest run test/ui-attachments.test.ts test/ui-file-preview.test.ts test/ui-app.test.ts
Test Files  3 passed (3)
     Tests  335 passed (335)
```

**Step 7 变异验红（硬要求，实测）**

把 `` const line = `附件 #${attachNo}：${info.path}` `` 临时改回 `` `附件：${info.path}` ``：

```
× 接线锁 > 上传写进输入框的是带编号的行
AssertionError: expected '<!DOCTYPE html>...' to match /`附件 #\$\{[^}]+\}：\$\{info\.path\}`/
Test Files  1 failed (1)
     Tests  1 failed | 10 passed (11)
```

恰好只有这条红。还原后 11/11 绿。

**全量回归与基线对照（本仓纪律：stash 建基线）**

`npx vitest run` 全量：`13 failed | 3621 passed`（5 个文件）。逐个 stash 到 HEAD 复验：

- `test/ui-patch.test.ts` 3 红（设计样例卡 / composer 紧凑胶囊 / 侧栏骨架）→ **HEAD 基线同样红**，预存。
- `test/ui-handoff.test.ts` 4 红、`test/cloud-sync-env.test.ts` 2 红、`test/run-crash-inject.test.ts` 1 红、`test/ui-server.test.ts` 1 红 → **HEAD 基线同样红**（4 文件共 8 条，与我的全量红完全同名同数）。
- 我新增的回归：`ui-patch` 的「只有附件时拿文件名当标题」在 HEAD 是绿的、我改后红——根因 `deriveRunTitle` 里 `ATTACH_CAPTURE_RE.exec(...)` 取 `m?.[1]`（旧捕获组 1 = 路径，新组 1 = 编号）→ 已修，全量复验零新增失败。

**EOL 纪律**

改完随手跑 `node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/app.js ui/public/index.html ui/public/styles.css`。改后：三个文件**裸 LF = 0**（「与 HEAD 不逐字节相同」是改过文件的预期表现）；提交后再跑：三文件逐字节与 HEAD 一致，全 ✅。Edit 工具全程保持 CRLF，未触发 `rm + checkout` 修复流程。新测试文件先用 node 一行归一化成 CRLF（check-eol 对未在 HEAD 里的文件要求裸 LF = 0）。注：`ui/title.ts` 与 `test/title.test.ts` 在 HEAD 里本就是 LF 文件（早于 CRLF 纪律），编辑沿用 LF，未引入破坏。

**Step 8 提交**

```
72c8071 feat(ui): 附件带编号，正文可按位置引用（A 簇）
 7 files changed, 200 insertions(+), 32 deletions(-)
```

未纳入：`mcp.json`（任务前就有的他人修改）、`docs/superpowers/plans/…`、`check-eol.mjs`（Task 1 的产物）。

## 与 brief 的偏差及原因

1. **`ui/title.ts` 同步放宽（brief 文件清单之外）**。orchestrator 只 grep 了 `ATTACH_RE` 的消费者，但 `ui/title.ts`（服务器端标题推导，`ui/server.ts` 的 run 创建路径在用）持有一份**独立副本**的旧正则。不同步的话，A1 主场景（单张附件新消息）的服务器标题会铺出整条 `附件 #1：uploads/…` 行；且 `title.ts:70` 注释明写「与前端 deriveRunTitle 同口径」，只改前端这注释就成了假话。已同步三处（两条正则 + `m?.[2]`）并加测试锁。
2. **`test/ui-app.test.ts:2941` 断言迁移**。旧断言 `expect(body).toContain("附件：${u.path}")` 锁的是旧内联过滤——Step 5 ⑤ 换成纯函数后必然红。改为锁 `stripAttachmentLine(taskInput.value, u.path)`，测试意图（删除做三件事）不变。刻意不靠注释喂断言（计划 1 的教训）。
3. **CSS 门适配**（brief Step 5 ⑦ 自己预告的方向）：
   - `--border` / `--accent` 在 `:root` 有定义 → 去兜底直接引用；
   - `--text-dim` **不存在** → 换成既有令牌 `--text-2`（brief 说「换成既有的令牌名，别新造」）；
   - brief 没预告的两条：`#fff` 撞 AC8（裸十六进制）、`10px/11px` 撞 V-20（12px 硬下限）→ 徽章改 `color-mix` scrim 先例 + `--surface-0`，字号改 `var(--font-xs)`。
4. **样式块按 brief 整块替换**：`.composer-media-preview` 原来的 `aspect-ratio: 4/3; overflow: hidden` 随 brief 的替换块消失——缩略图从统一 4:3 裁切变成按自然宽高比整图显示。brief 的块就是这么写的（A2 六张编号缩略图要看全每张），照 brief 落地，见「遗留顾虑」。

## 遗留顾虑

1. **缩略图自然宽高比**（偏差 4）：竖向长图（如手机截屏）会让 composer 行变得很高；`flex-shrink: 0` 也随之消失，极端情况下可能溢出。纯 CSS 判定无法覆盖，需要真浏览器走查一眼（本任务 brief 不含浏览器验证步）。
2. `ui/title.ts` / `test/title.test.ts` 是 LF 行尾（HEAD 即是），与仓库 CRLF 纪律不一致，但属历史形态；本次未顺手归一化（会制造整文件 diff），留待专门清理。
3. 分支基线（HEAD = d38d796）全量有 13 条预存失败（ui-handoff×4、cloud-sync-env×2、run-crash-inject×1、ui-server×1、ui-patch×3），与本任务无关，本任务零新增。

---

## Fix round 1

控制者 review 后的两处收口（本任务自己的顾虑 1 + 控制者发现的两份真值源）。

### ① `.composer-media-preview` 补回布局语义

改前（Task 2 的替换块）丢了原 div 的 `display: block` / `aspect-ratio: 4/3` / `overflow: hidden` / `flex-shrink: 0` / `border-radius: 10px` / `background: var(--bg)` / `border: 1px solid var(--border-1)`——`img { height:100% }` 在无确定高度的父级里解析不出，退回自然比例。按控制者的块逐字补回，只在上面加按钮需要的 `position: relative` / `padding: 0` / `cursor: pointer` / `line-height: 0`。

**六项（外加 border）与 `72c8071^` 原 div 的机械比对**（node 脚本抽取两边声明逐条比，不靠眼睛）：

```
display        "block"                    一致
aspect-ratio   "4 / 3"                    一致
overflow       "hidden"                   一致
flex-shrink    "0"                        一致
border-radius  "10px"                     一致
background     "var(--bg)"                一致
border         "1px solid var(--border-1)" 一致
position       "relative"                 按钮新增（旧无）
padding        "0"                        按钮新增（旧无）
cursor         "pointer"                  按钮新增（旧无）
line-height    "0"                        按钮新增（旧无）
★ 六项布局语义全部与原 div 逐字一致
```

`.composer-media-preview:focus-visible` 与 `.composer-media-no` 两条按控制者指示保持 Task 2 写法不动（`--border` / `--accent` / `--text-1` / `--surface-0` 四个令牌均已在 `:root` 定义，`ui-app.test.ts:2586` 变量门在跑且绿）。

### ② 两份 ATTACH_CAPTURE_RE 的相等锁

`ui/public/app.js` 与 `ui/title.ts` 各持一份正则真值源（一个浏览器 ESM、一个 host TS，共享不了）。在 `test/ui-attachments.test.ts` 新增「附件正则只有两处，必须同口径」——钉住两份 `const ATTACH_CAPTURE_RE = …` 逐字相同。

**变异验红（实测）**：把 `ui/title.ts` 那份临时改回旧正则 `/^附件[：:]\s*(.+)$/` 后：

```
× 附件正则只有两处，必须同口径 > app.js 与 ui/title.ts 里的 ATTACH_CAPTURE_RE 逐字相同
AssertionError: expected '/^附件[：:]\s*(.+)$/' to be '/^附件(?:\s*#(\d+))?[：:]\s*(.+)$/' // Object.is equality

Expected: "/^附件(?:\s*#(\d+))?[：:]\s*(.+)$/"
Received: "/^附件[：:]\s*(.+)$/"
```

恰好只有这一条红。还原后 `git diff --stat` 中 `ui/title.ts` 消失（逐字节回到已提交状态），复跑全绿。

### ③ 明确不动

`ui/title.ts` / `test/title.test.ts` 保持 HEAD 的 LF 行尾，未归一化（控制者同口径）。

### 命令与结果

```
$ npx vitest run test/ui-attachments.test.ts
Test Files  1 passed (1)     Tests  12 passed (12)     # 11 旧 + 1 新锁

$ npx vitest run test/ui-attachments.test.ts test/title.test.ts test/ui-app.test.ts test/ui-file-preview.test.ts
Test Files  4 passed (4)     Tests  350 passed (350)

$ npx vitest run test/ui-patch.test.ts
# 仍恰 3 条基线预存失败（设计样例卡 / 紧凑胶囊 / 侧栏骨架），零新增
```

EOL：`ui/public/styles.css` 与 `test/ui-attachments.test.ts` 改后裸 LF = 0（CRLF 纪律）。提交后 `check-eol.mjs` 复验三热点文件全 ✅。

---

## Fix round 2

Task 2 review（Spec ✅ / Approved / 0 Critical / 0 Important / 4 Minor）后开的三条 Minor。第四条 Minor（手打「附件 #N：」正文会被当附件行吃掉）按控制者决定**接受、不动**。

### ① 引用落点：先插引用、再追加传输行（+ 焦点守卫）

reviewer 抓的「代码与它自己的说法不符」：上一条 `taskInput.value = …` 赋值把光标推到文末，`insertAtCaret` 实际插在**全文末尾**，而提交信息写着"在光标处插"。修法：把「单张且图片 → 插 `Image #N `」整段搬到 `const line` 与 `.value` 赋值**之前**，条件里加 `document.activeElement === taskInput`（没焦点时 `selectionStart` 是 0，会插到全文最前面）。

**控制者中途更正**（值得记一句）：他第一封信里的代码引用了 `entry.autoCite` 与 `Object.assign(entry, …)`——那是计划正文里 **Task 3 重写 `uploadFiles` 才引入的符号**，当前代码里不存在。改按现状真代码落地：条件保持内联的 `files.length === 1 && file.type.startsWith("image/")`，不引入新变量。这与 Fix round 1 抓出的 `ui/title.ts` 是同一个根：**跨文件/跨时刻的接口藏在散文里，抄的人不去核**。

**顺序锁**（jsdom 跑不了内联脚本，锁结构；区间锚点适配：`uploadEntry` 当前不存在，改用 `async function uploadFiles` → `if (fileUpload)`）：

**变异验红 ① 实测**（把两段调回原顺序）红输出原文：

```
× 接线锁 > 自动插引用发生在追加传输行**之前**（否则光标已被推到文末，插的就不是光标处）
AssertionError: ★ 插引用必须在追加传输行之前: expected 2431 to be less than 1933
```

恰只这一条红，还原后 351/351 绿。

### ② 相等锁补齐两条正则

原锁只钉 `ATTACH_CAPTURE_RE`——只改 `ui/title.ts` 的 `ATTACH_RE` 测试仍会全绿，而宿主 `titleSourceText` 会把「附件 #1：」行当正文首句。锁扩成循环比对 `ATTACH_RE` 与 `ATTACH_CAPTURE_RE`，测试名改为「附件正则只有两份副本、两条正则，必须同口径」。

**变异验红 ② 实测**（只把 `ui/title.ts` 的 `ATTACH_RE` 改回旧正则，`ATTACH_CAPTURE_RE` 不动）红输出原文：

```
× 附件正则只有两份副本、两条正则，必须同口径 > app.js 与 ui/title.ts 里的 ATTACH_RE / ATTACH_CAPTURE_RE 逐字相同
AssertionError: ATTACH_RE 两份副本不同口径: expected '/^附件[：:]/' to be '/^附件(?:\s*#\d+)?[：:]/' // Object.is equality

Expected: "/^附件(?:\s*#\d+)?[：:]/"
Received: "/^附件[：:]/"
```

恰只这一条红，还原后 `git diff --stat` 中 `ui/title.ts` 消失（逐字节回到已提交状态）。

### ③ `appearance: none;`

`.composer-media-preview` 加 `appearance: none;`——按钮化了但外观要还原成裸图，Safari 原生按钮外观会压过 `border-radius` 与 `background`。

### 命令与结果

```
$ npx vitest run test/ui-attachments.test.ts test/title.test.ts test/ui-app.test.ts test/ui-file-preview.test.ts
Test Files  4 passed (4)     Tests  351 passed (351)     # 350 + 1 新顺序锁

$ node eval/persona-ux/_audit-20260919/check-eol.mjs ui/public/index.html ui/public/styles.css test/ui-attachments.test.ts ui/public/app.js
# 四文件裸 LF = 0（三个改过的文件报「与 HEAD 不逐字节相同」是未提交的预期表现）
```


