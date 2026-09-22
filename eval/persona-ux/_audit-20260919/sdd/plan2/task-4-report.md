# Task 4 报告：文件树的降噪折叠与展开态记忆（设计案 A6）

状态：**完成** · commit `见文末` · 基线：全量 11 条确定性失败 + 抖动，零新增

## 做了什么

在 `ui/public/features/file-tree.js` 上落了 A6 的三个面：

1. **降噪折叠**：`noiseGroupOf(name)`（下划线开头、组名取到第一个连字符/数字前）、
   `foldNoiseEntries(entries)`（返回 `{items}` 有序一摞，组落在第一个成员的位置，
   只有 ≥2 个目录成员才成组；文件与单个 `_qa` 原样）。
2. **组行渲染**：`_probe 系列（N 个，已降噪折叠）` 一行，点击展开成员，
   `aria-expanded` 同步；组折叠态是内存态（`expandedGroups` + `groupKey(parentRel,key)`，
   两样只定义一次，键带父目录防不同父下的同名组互相折叠）。
3. **展开态跨会话记忆**：`TREE_EXPANDED_PREF = "agent.ui.pref.treeExpanded"`，
   `readTreeExpanded`/`writeTreeExpanded`（按工作目录分组、20 个工作目录上限、
   坏值全部容忍）；`toggleDir` 落盘，`reload` 换目录时从记忆恢复。
   「展开到第二层」按钮 + title 写明界限；「折叠」按钮清空并落盘。

样式（`styles.css`）：`.ft-group-name`（弱化色 + 窄栏换行）、`.ft-group-label`、
`.ft-group-count`（小字计数）、`.files-rail-all`（与 `.files-rail-toggle` 同一档，
收起态隐藏）。测试（`test/ui-layout.test.ts`）新增 8 条（降噪 4 + 记忆 4），
活页探针 `eval/persona-ux/_audit-20260919/verify-tree-noise.mjs` 新建。

## 各 Step 命令与真实输出

**Step 2–5（TDD 红绿）**：先在 `ui-layout.test.ts` 写 8 条测试，跑红（`noiseGroupOf`
等未导出），再实现纯函数与渲染，跑绿。收尾全量复跑：

```
$ npx vitest run test/ui-file-tree.test.ts test/ui-layout.test.ts
 ✓ test/ui-layout.test.ts (17 tests) 25ms
 ✓ test/ui-file-tree.test.ts (18 tests) 165ms
 Test Files  2 passed (2)
      Tests  35 passed (35)
```

**Step 7（活页验收）**：探针三易其址才立住，两次失败都有实锤（见「偏离」）：

```
$ node eval/persona-ux/_audit-20260919/verify-tree-noise.mjs
PASS  欢迎页有重开右列的把手
PASS  树里有降噪组行
PASS  降噪组是**一行**（只有一条 _probe 系列）  · ["_probe 系列（2 个，已降噪折叠）"]
PASS  组行文案是「_probe 系列（2 个，已降噪折叠）」
PASS  折叠时成员不显示（_probe2-p1 / _probe3-p2 不在树里）
PASS  单个 _qa 不成组，原样一行
PASS  正常目录 src 与 README 原样（降噪只收拾噪音）
PASS  树宽 ≥ 200px  · railW=200
PASS  组名没被截断（目录名可读）  · truncated=false
PASS  点组后成员显出来（_probe2-p1 / _probe3-p2）  · {"p1":true,"p2":true,"aria":"true"}
PASS  组行 aria-expanded=true（读屏听得见）
PASS  展开 src 后子文件可见
PASS  刷新后 src 仍展开（A6 的「跨会话记住」）
PASS  刷新后组回到折叠（组折叠态是内存态，按设计不跨会话）
PASS  0 控制台错误
合计 15/15 通过
```

夹具自建于 `D:\Work\scratch\fathom-ux-audit-20260918\tree-noise-fixture`，
POST `/api/workdirs` 进白名单，量完 DELETE 撤出并删目录（finally 兜底）。

**全量套件对照基线**：11 条确定性失败（cloud-sync-env×2、run-crash-inject、
ui-handoff×4、ui-patch×3、ui-server 互斥 429）+ 4 条 5s 超时抖动（安静复跑即绿），
与基线一致，**零新增失败**。复跑 JSON 报告核过失败名单，无一条落在
ui-layout / ui-file-tree / 本任务触碰的代码。

**换行纪律**：`check-eol.mjs` 收尾——四个文件全部 `裸LF=0`（修改文件与 HEAD
逐字节不同是改动的应有之义，非漂移）；探针新文件 CRLF=200 裸LF=0。

## 与设计案 / 派工单的偏离（含三个授权判断的落法）

1. **`foldNoiseEntries` 返回 `{items}`**（派工判断①）：落成。排序是服务端的事
   （`ui/workspace-files.ts:90-96`），渲染层按序直画，两摞并排等于在这再排一次序。
2. **`groupKey`/`expandedGroups` 只定义一处**（派工判断②）：落成，键为
   `${parentRel}::${key}`。
3. **「展开全部」→「展开到第二层」**（派工判断③，记录在案不许顺手改）：按钮
   title 写明「展开到第二层（整棵树是逐层拉的，真的全开会把每一层都请求一遍）」。
4. **恢复的展开态要补拉子层**（brief ① 之外新增）：brief 只让 `reload` 恢复
   `expanded` 集合；照搬的话刷新后 twist 朝下却没有子行，看着像坏了，且 Step 7
   的「刷新后展开态还在」在浏览器里不可观察。改法：`renderLevel` 里展开的目录
   没缓存就 `void loadDir()` 补拉（拉到后 paint 自愈），`loadDir` 加
   「非根层在拉就不重拉」闸（防补拉与「展开到第二层」双发；根除外——根靠
   loadToken 判旧，重进必须真重拉）。
5. **组行窄栏换行**：树列最小 200px（TREE_MIN_PX）时，组名 64px + 计数 118px
   放不进 179px 的按钮，原 CSS 把组名截成 28px——「目录名可读」这条验收
   在最小栏宽下不成立（活页量出 truncated=true）。`.ft-group-name` 加
   `flex-wrap: wrap`：宽栏一行，窄栏计数落到第二行，名字与计数都保全文。
   这是对设计案「一行」的最小偏离——一行指树里只占一行（不是 N 行），
   不是文案永不换行。
6. **探针打主页不打 run 页**：run 页的 `selectRun → syncComposer → patchComposer`
   （app.js:3775）会把作曲栏目录钉回该 run 自己的 workdir，与「用户上次选过
   夹具」的设定互斥——用原型 setter 抓了写入栈实锤（t=138 快照恢复选中夹具，
   t=148 被 patchComposer 覆盖成 web-a）。主页走快照恢复路径，正是「跨会话
   记忆」发生的地方。欢迎页右栏恒收起（rail-policy 的 welcome 规则），探针点
   `#right-rail-handle`（应用自己的重开把手）开栏，不越过 UI。
7. **两 span 结构**：文案拆成 `ft-group-label` + `ft-group-count` 两个 span，
   合起来仍是一整句（探针按整句找）；拆开才能各写各的字号（设计案要计数小字）。
8. **自扫后删了两样**：`ft-group` 类（无对应 CSS 规则）与 `dataset.group`
   （无任何读取方）——派工三查「新 CSS 类要有规则、新 data-* 要有处理者」，
   没有就删，不留死面。
9. **`test/ui-file-tree.test.ts` 未动**：Step 8 的 add 清单里有它，但 18 条既有
   锁全程绿、无一条咬住新行为，没有可改的——不进提交。

## 三查自扫结果

- 新 CSS 类全部有规则、规则全部有用户：`.ft-group-name` / `.ft-group-label` /
  `.ft-group-count`（file-tree.js renderGroupRow 用），`.files-rail-all` 及其
  hover / focus-visible / 收起态隐藏（「展开」「折叠」两钮共用）。
- 新 `data-*` 属性：无残留（`dataset.group` 已删；`data-path`/`data-kind` 是
  既有面，测试与探针都在用）。
- 新纯函数导出全部被测试真正 import 并调用：`noiseGroupOf`、`foldNoiseEntries`、
  `readTreeExpanded`、`writeTreeExpanded`、`TREE_EXPANDED_PREF` 在
  `ui-layout.test.ts` 的 8 条新测试里全部命中。

## 遗留顾虑

- 组行在 200px 窄栏下是两行（计数换行）——与「折成一行」的视觉期望有出入，
  是「名字可读」优先的取舍；280px 宽栏下是一行。若后续想窄栏也一行，出路是
  缩短文案或让树列下限 > 200px，都是另一个任务。
- 探针依赖共享 dev server 的运行态（白名单 POST/DELETE），量完即撤；
  server 没起时探针第一步就会失败，属预期。
- `mcp.json` 的工作区改动不属于本任务，未提交（提交前已核）。

## Fix round 1（2026-09-20 review：0 Critical / 1 Important / 6 Minor）

### ① Important：非根层过期应答也要弃——判据用工作目录，不用全局 token

**推演（协调者两封信都要求先推演，且第二封承认第一版修法有坑）**：

- `loadToken` 是全局计数器，`loadDir` 每次进入都 `++loadToken`。若把判旧行改成
  无条件的 `if (token !== loadToken) return;`，`expandTopLevel` / 补拉并发拉
  N 个目录时，先发的 N-1 个完成时 `token !== loadToken` → 全被弃——「展开到
  第二层」点完只有最后一个目录有子行。更糟的是每个被弃请求的 finally 都
  paint，paint 里的补拉 kick 会把缺缓存的目录再拉一遍，逐轮收敛、请求翻倍。
  协调者第二封信给了同一结论：**照抄会把功能弄坏**。
- 「按目录 token（Map<dir, token>）」也不行：工作目录切换后，旧目录在飞的
  sub 请求其键仍是当前键（新目录还没人拉过 sub），按目录判旧判不出它过期。
  这个 bug 的条件本来就是「换了工作目录」，不是「同目录有新请求」。
- **落法**：判据用 `workdirNow() !== wd`（`wd` 是函数开头取的，天然是
  「这份请求属于哪个目录」的标签）。只在真换目录时弃，并发不受影响；
  同目录重复拉由既有的 `loading` 去重闸挡住，根层保留原 token 判旧（根只有
  reload 拉、不存在并发误杀，token 保证同目录快慢两次重拉后发者赢）。
- **弃掉之后那层显示什么**（协调者点名要推演）：`return` 在 try 里，finally
  仍跑 `loading.delete + paint()`；不写 cache（保持「没拉到」的原状，不把
  notice 写进新目录的 cache）；paint 里 renderLevel 对展开且无缓存的目录会
  再 kick——这次带着**当前**目录重拉，自愈。

**锁与变异验红**（行为锁，在 `test/ui-file-tree.test.ts` 新增 describe
「A6 补拉的过期与自愈锁」）：gate 卡住 A 的 sub 应答 → 切到 B → 放行旧应答 →
B 下展开同名 sub，断言看到 b-new、看不到 a-old。变异（删掉判旧行）跑红：

```
FAIL test/ui-file-tree.test.ts > A6 补拉的过期与自愈锁 > 非根层在飞应答跨工作目录切换后落地必须被弃，不得写进新目录的 cache
AssertionError: expected null to be truthy
- Expected:
true
+ Received:
null
❯ test/ui-file-tree.test.ts:355:70
    expect(root.querySelector('.ft-row[data-path="sub/b-new.txt"]')).toBeTruthy();
```

### ② Minor-1：补拉覆盖组成员

组展开后 `expanded.has(member.relative)` 走 `renderLevel`，缓存缺失时静默
return——上一会话展开过 `_probe2-p1`、刷新后组回到折叠、再点开组，成员
twist 朝下却没有子行。与顶层修掉的症状同一个，藏在组里。落法同顶层：
`cache.has` 则 render，否则 `void loadDir` 补拉。

**锁与变异验红**：storage 预置 `_probe2-p1` 展开 → 点开组 → 断言
`_probe2-p1/x.txt` 出现且发过 `q=_probe2-p1%2F` 请求。变异（退回静默
renderLevel）跑红：

```
FAIL test/ui-file-tree.test.ts > A6 补拉的过期与自愈锁 > 组展开后，记忆里展开的成员缓存缺失时补拉子层（不静默空转）
AssertionError: expected null to be truthy
- Expected:
true
+ Received:
null
❯ test/ui-file-tree.test.ts:390:73
    expect(root.querySelector('.ft-row[data-path="_probe2-p1/x.txt"]')).toBeTruthy();
```

### 验证与提交

- `npx vitest run test/ui-file-tree.test.ts test/ui-layout.test.ts` → **37/37
  绿**（ui-file-tree 18 旧 + 2 新，ui-layout 17）。
- 活页探针复跑 **15/15 绿**（判旧行不影响单目录流程）。
- 全量套件：失败名单与基线**逐条一致**（cloud-sync-env×2、run-crash-inject、
  ui-handoff×4、ui-patch×3、ui-server 互斥）——**零新增**。
- `check-eol.mjs`：file-tree.js / ui-layout.test.ts / ui-file-tree.test.ts
  全部 `裸LF=0`。
- 碎屑清理：scroll-snap/ 下两个 probe-*.mjs 与 collapse-after.png 已不在
  （本轮开始时已清）；剩一张 `preview-col-after-collapse.png` 是**已提交**
  探针 `rail-preview/verify-preview-col.mjs:92` 的运行产物，可再生，不入库、
  不删（删了下一次跑探针还会再生成）。三个已提交 repro（repro-4173 /
  catch-the-yank / verify-fix-4173）与 rail-preview/ 三个探针未动。
- 提交为**新一笔**（未 amend `26edc82`），commit 见文末更新。
