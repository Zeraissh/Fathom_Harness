# Task 1 报告：git 支撑的 workdir 夹具（计划 2 入场条件）

**状态：DONE** —— 计划 1 那条「两脸 git 规则从未被真实触发」的口子，已在本探针里真实走通。
**探针一次跑通，判据全绿。** commit 见文末。

---

## 做了什么（按 brief 的 Step 1–6）

### Step 1：夹具脚本 `scripts/git-fixture.mjs`

按 brief 逐字落盘。幂等：每次先 `rmSync` 整个目录再重建，绝不留下半截状态。
造出「有未提交改动 + 有未跟踪文件 + 非默认分支」三种 git 芯片要显示的状态。

### Step 2：`.gitignore` 追加 `.git-fixture/`

```
# 计划 2 任务 1：两脸/PR 差异的活页夹具（脚本 scripts/git-fixture.mjs 生成）
.git-fixture/
```

核验（真实输出）：

```
$ git check-ignore -v .git-fixture/git-repo
.gitignore:96:.git-fixture/
```

行尾按字节核验：`.gitignore` 工作树为 CRLF（96 行全部 CRLF，无孤立 LF）；两个新文件按 LF 约定写入（与 repo blob 一致，autocrlf=true）。

### Step 3：跑一次（真实输出）

```
$ node scripts/git-fixture.mjs && git -C .git-fixture/git-repo status --short && git -C .git-fixture/git-repo branch --show-current
D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo
 M src/app.js
?? src/new-file.js
feat/fixture-branch
```

与 brief 期望一致：打印绝对路径；` M src/app.js` + `?? src/new-file.js`；分支 `feat/fixture-branch`。

### Step 4：活页探针 `eval/persona-ux/_audit-20260919/verify-face-git.mjs`

brief 骨架 + 四处偏差（见下节）。核心动作：**自己驱动 UI 把夹具加进白名单**（真实用户路径），再量两张脸下芯片的可见性。

### Step 5：跑探针（真实输出，一次通过）

```
$ FIXTURE_DIR='D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo' node eval/persona-ux/_audit-20260919/verify-face-git.mjs
0) 宿主 /styles.css 两脸规则：work=true code=true
加之前 git 端点 → 403（白名单门，首次运行应 403）
真实路径添加完成：菜单 →「＋ 添加目录…」→ 贴路径 → 前往 → 选这个目录，芯片已读到分支
① /api/workspace/git → 200 {"present":true,"root":"D:\\Work\\Github_pros\\Agent_Design\\.git-fixture\\git-repo","branch":"feat/fixture-branch","detached":false,"dirty":true,"github":null,...
② 真机路径（Work 脸 / Code 脸）：
  Work  data-face=work  hidden=false display=none  「当前分支 feat/fixture-branch *」
  Code  data-face=code  hidden=false display=flex  「当前分支 feat/fixture-branch *」
判据：有仓库时 Work 藏（none）、Code 显（flex），两脸 hidden 属性都=false → ✅ 真的走过一遍了
控制台错误： [ 'Failed to load resource: the server responded with a status of 403 (Forbidden)' ]
```

逐项对上 brief 的判据：

- ① `present: true`，`branch: feat/fixture-branch`，`dirty: true`，`detached: false`（还有 `branches: [feat/fixture-branch, master]`）。
- ② Work 脸藏起、Code 脸显示——**触发路径（白名单加入 → git 数据到场 → 芯片摘 hidden → 两脸 CSS 分流）首次在真机上完整执行**。
- 唯一的控制台错误是探针自己打的**加之前 403 门检**（预期内噪音，不是页面错误）。

持久化旁证（探针跑完后直接问宿主）：

```
$ curl -s http://127.0.0.1:4201/api/workdirs
{"workdirs":[web-a, web-b, Fathom, D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo],
 "source":{"env":[web-a, web-b],"stored":[Fathom, .git-fixture\git-repo]}}
```

夹具在 `stored`（运行时白名单）里，且已落盘到活宿主自己的 store：
`D:/Work/scratch/fathom-ux-audit-20260918/web-a/.agent-workdirs.json`（活宿主 cwd 是 web-a，store 跟着 workdir 走；仓库根的 `.agent-workdirs.json` 属于别的宿主实例，与本宿主无关）。

### Step 6：提交

见文末 commit SHA（brief 的提交信息逐字，含 `Co-Authored-By: Claude Opus 4.8 (1M context)`）。

---

## 与 brief 的偏差及原因

1. **① 放到「添加」之后。** brief 把 ① 排在 UI 添加之前，但 `/api/workspace/git` 对白名单外的 workdir 返 403（`listedWorkdir` 门），添加前问 ① 只会拿到 403。改为：先打一次「加之前 → 403」作为白名单门的证据，添加后再读 ① 拿真数据。
2. **目录加入走真实用户路径**（brief 的 `document.getElementById("workdir-select")` 是猜的）：实际实现是自定义控件（`workdirCombobox` + `workdirPicker` 浮层），`#workdir-select` 只是 sr-only 的提交事实源，直接 set value + change 不会触发宿主接线。探针走：工作目录菜单 →「＋ 添加目录…」→ 浮层贴绝对路径 → 前往 → 选这个目录 → POST /api/workdirs → 芯片刷新。
3. **判据改成用户可见口径（computed display）。** brief 的 `work.hidden === true && code.hidden === false` 恒不可能成立：`hidden` 属性只表达 git 数据有无（有仓库时两脸都是 `false`，`workspace-git.js` 的 `root.hidden = !present`），脸差异只在 CSS display 上。判据改为：Work 脸 `display:none`、Code 脸 `display:flex`、两脸 `hidden` 属性都 `false`、Code 脸文本含分支名。
4. **点菜单前先展开 composer scope。** 这是真机缺陷（见下），探针按真实用户必须先做的动作走，并在文件头记录。

**诊断过程中的一个误判更正**：早期诊断曾认定 Playwright `page.fill` 会剥离反斜杠（`D:\Work\...` → `D:Work...`）。隔离实验证明**误判**——about:blank 上 fill/type 都「剥离」的原因是我自己的诊断脚本 JS 字面量经 bash/JSON 转义层丢了反斜杠（`\\`→`\` 后 JS 解析又丢弃未知转义），与应用、与 Playwright 都无关。路径经 `FIXTURE_DIR` 环境变量传入时，fill 无损（已验证 `D:\Work\...` 原样进 input）。探针因此保持 brief 的 fill 写法，不加绕过。

---

## 顺带发现的两条真机缺陷（计划 3 材料，按纪律只报不修）

1. **折叠的 `#composer-scope` 仍渲染 `#composer-scopebar`，且被透明 `TEXTAREA#task-input` 整个盖住**：`styles.css` 里 `.composer-scopebar { display:flex }`（author 规则）压过 UA 对折叠 details 的隐藏，textarea 画在它上面（25/25 个 elementFromPoint 采样全命中 textarea），于是「工作目录」触发钮在 scope 展开前点不到。真实用户必须先把 scope 展开（或恰好聚焦 textarea 让 scopebar 沉下去）——欢迎页与 run 页都如此；`styles.css:4733` 附近已有注释提到 scopebar 与输入行同 y 会被盖住，这条是它的活页实锤。
2. **Playwright 驱动贴路径走通的附加说明**（不是应用缺陷，但属于真实路径证据）：`.wp-path-input` 只监听 keydown-Enter；`前往` 按钮读 `pathInput.value.trim()`。因此「粘贴 → 前往」是用户主路径，探针的 fill 等价于粘贴，真实路径照走。

---

## 遗留关注点

- **探针在活宿主上留下了持久化痕迹**：真实用户路径的添加会把夹具写进 4201 宿主自己的白名单 store（`web-a/.agent-workdirs.json`）。这是真实路径的必然结果（brief 也预见了「加进宿主白名单」），但以后在别的宿主上重跑会再各加一份。重跑幂等（`added:false` 分支，不会重复条目）。
- **探针强依赖宿主在线且 serve 的是仓库当前版本**：哨兵（第 0 步）只验证两脸 CSS 规则在场，若宿主跑到旧版本，读数可能失真——哨兵没挡住的部分需要人看输出。
- **brief 的「② Work 脸 hidden=true」判据文字与实现矛盾**（见偏差 3）——建议计划收尾时把 brief 里这句改成 display 口径，免得后人照抄。
- 夹具目录 `.git-fixture/` 已 gitignore；`scripts/git-fixture.mjs` 可被后续计划 3（Code 脸 git/PR 面）复用。

---

## 提交

commit SHA：见最终回复（`test(ui): 立 git 夹具，把计划 1 那条从未走过的两脸路径真走一遍`）。
只提交了 brief 指定的三个文件：`scripts/git-fixture.mjs`、`.gitignore`、`eval/persona-ux/_audit-20260919/verify-face-git.mjs`。

---

## Fix round 1

reviewer 回执：Spec ✅ 合规 / 质量 Changes requested——0 Critical、1 Important（夹具脚本 `rmSync(recursive, force)` 零护栏，误传真实项目路径会静默永久删除 `<root>/git-repo`）、3 Minor（探针判据失败置非零退出码；探针头注偏差计数与报告对齐；白名单持久化条目判 Optional、保留）。四条偏差独立复核全部可接受。

### 改了什么

1. **哨兵护栏（Important）**：`scripts/git-fixture.mjs` 删目录前先验哨兵——`existsSync(dir) && !existsSync(join(dir, SENTINEL))` 时拒跑：`console.error` 说清原因 + `process.exit(1)`。哨兵文件 `.git-fixture-sentinel` 在 `git add -A` 之前写入，进夹具首次提交；头注「幂等」句补「重建前先验哨兵；不认识这个目录就拒跑」。
2. **探针判据失败置 `process.exitCode = 1`**——自动化能机械检出失败。
3. **探针头注「三处偏差」→「四处偏差」**，补上漏掉的「① 挪到添加后」条目（与报告对齐）。
4. **（验证中新发现的探针竞态，一并修）**：贴路径前先等浮层初始加载回写落地（见下）。

### 护栏验证：两条路都真跑过

**正常路**。改完脚本后第一次跑，恰好撞上修前造的无哨兵旧夹具——被新护栏拒跑（这本身就是护栏第一击的活体证据）：

```
$ git -C .git-fixture/git-repo status --short && sha1sum .git-fixture/git-repo/src/app.js .git-fixture/git-repo/src/new-file.js .git-fixture/git-repo/README.md && node scripts/git-fixture.mjs; echo "exit=$?"
M src/app.js
?? src/new-file.js
1d3805da25c6d20470ad072634e6dbfd713933a0 *.git-fixture/git-repo/src/app.js
daf79aededda73801dfa6697a9ff7293895b3365 *.git-fixture/git-repo/src/new-file.js
928e85f917636c008cb7dc21429ab2bd8a1f2949 *.git-fixture/git-repo/README.md
拒绝运行：D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo
它已经存在，但没有本夹具的哨兵文件 .git-fixture-sentinel——看起来不是这个脚本造的。
删掉它可能是不可逆的数据损失，所以不替你决定。
确认它确实可以删的话，手动删掉再跑一次。
exit=1
--- 拒跑后旧夹具状态 ---
 M src/app.js
?? src/new-file.js
1d3805da25c6d20470ad072634e6dbfd713933a0 *.git-fixture/git-repo/src/app.js
daf79aededda73801dfa6697a9ff7293895b3365 *.git-fixture/git-repo/src/new-file.js
928e85f917636c008cb7dc21429ab2bd8a1f2949 *.git-fixture/git-repo/README.md
```

拒跑前后 `git status` 与三个 sha1sum 完全一致——一个字节没动。随后手动删掉旧夹具（来源确凿：本脚本旧版所造，正是护栏提示语里「确认可以删就手动删」的那条路），重建：

```
$ rm -rf "D:/Work/Github_pros/Agent_Design/.git-fixture/git-repo" && node scripts/git-fixture.mjs && git -C .git-fixture/git-repo status --short && git -C .git-fixture/git-repo branch --show-current && git -C .git-fixture/git-repo ls-files
D:\Work\Github_pros\Agent_Design\.git-fixture\git-repo
 M src/app.js
?? src/new-file.js
feat/fixture-branch
.git-fixture-sentinel
README.md
src/app.js
```

哨兵进了夹具首次提交（`ls-files` 在列）。再跑一次（哨兵在，应允许）→ 幂等重建成功；宿主端点仍 `present:true`、`dirty:true`、分支 `feat/fixture-branch`。

**★ 拒跑路**（假 `git-repo` 不含哨兵——reviewer 要求必须真跑的一路）：

```
$ find /d/Work/scratch/plan2-task1/fake-root -type f -exec sha1sum {} \; && node scripts/git-fixture.mjs "D:/Work/scratch/plan2-task1/fake-root"; echo "exit=$?"; find /d/Work/scratch/plan2-task1/fake-root -type f -exec sha1sum {} \;
fe31e15ffe64e7c8576e7414b83a68b3774cbdee */d/Work/scratch/plan2-task1/fake-root/git-repo/README.md
拒绝运行：D:\Work\scratch\plan2-task1\fake-root\git-repo
它已经存在，但没有本夹具的哨兵文件 .git-fixture-sentinel——看起来不是这个脚本造的。
删掉它可能是不可逆的数据损失，所以不替你决定。
确认它确实可以删的话，手动删掉再跑一次。
exit=1
fe31e15ffe64e7c8576e7414b83a68b3774cbdee */d/Work/scratch/plan2-task1/fake-root/git-repo/README.md
```

拒绝运行、退出码 1、sha1sum 前后逐字节一致。fake-root 验证后已删除干净（`test -e` 复核「fake-root 已删除干净」）。

### 探针竞态：验证阶段抓到的新真缺陷 + 确定性复现

fix 轮第一次重跑探针失败（`TimeoutError ... 30000ms`、控制台一条 404），Work 脸 chip 停在「—」。定位到一条**应用侧真实竞态**：浮层 `openPicker` 异步 `load(起点目录)`，完成时 `load()` 无条件回写 `pathInput.value = currentPath`（workdir-picker.js:651，token 守卫只挡旧请求覆盖新渲染，不挡它覆盖输入框）——粘贴落在回写之前就被起点目录覆盖，前往去了旧目录，「选这个目录」变成 no-op（added:false）。真实用户打开浮层立刻粘贴就可能中招（低概率但用户可见）——**计划 3 材料，探针只绕开不修**：等回写落地（输入框非空）再贴路径，真实用户也是先看到列表再贴。

确定性复现（`page.route` 掐住 `/api/fs/list` 1.5s，逼粘贴先落地）：

```
fill 刚落地（fs/list 仍被掐着）： "D:\\Work\\Github_pros\\Agent_Design\\.git-fixture\\git-repo"
fs/list 放行后： "D:\\Work\\scratch\\fathom-ux-audit-20260918\\web-a"
```

粘贴被起点目录静默覆盖，实锤。另确认 Playwright 对 8s 显式超时报「Timeout 30000ms exceeded」（默认值文案），失败跑的错误信息与此一致。

### 探针复验

- 修后连跑 3 次：全绿、exit=0、控制台零错误。
- 负例（`FIXTURE_DIR` 指 web-a，非仓库）：① `present:false`、判据 ★★ 没走通、exit=1——机械检出失败成立。
- 失败跑里的那条 404 未复现（负例与三连跑控制台均零错误），判定为竞态路径上的环境噪音，不深追。

### 提交

新一笔（不 amend `7ce7ccc`）：`fix(tools): 夹具脚本删目录前先验哨兵——误传路径不许静默删`。
与 coordinator 给定信息差一句（「顺带」补了竞态修复）——竞态是验证阶段的新发现，和信息一起如实入账。
