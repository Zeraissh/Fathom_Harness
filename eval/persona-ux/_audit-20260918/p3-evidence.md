# P3 活页证据（2026-09-18）

计划与设计：`docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §P3。

---

## 1. 方法与仪器

| 项 | 本轮事实 |
|---|---|
| 宿主 | `npx tsx ui/serve.ts`，端口 **4199**（隔离） |
| 样本 | **真实归档 run** `5d6a3212-1716-4be7-99db-0dbfb20228e5`（产物 `devin-dir-note.txt`） |
| 脚本 | `p3-announce.mjs` → `p3-announce.json` |
| 走法 | 走用户那条路由 `#/run/<id>/artifact/0`；先把 `#status-announcer` 清空再读，避免读到上一次残留 |

---

## 2. 判据结果：4/4 成立

```
PASS  判据1 选中不播报：播报区不含「产物画布已打开」
PASS  判据1 播报区不含视图事件字样（画布/已打开）
PASS  判据2 坞的可及名称是静态「预览 · X」
PASS  判据2 名称里带的是真实文件名
```

原始事实：

```json
{
  "announcerText": "运行已完成：列一下这个目录有什么，再写一份只有三行的说明到 devin-dir-note.txt。",
  "dockExists": true,
  "dockAriaLabel": "预览 · devin-dir-note.txt",
  "dockHidden": false,
  "tabs": ["devin-dir-note.txt"]
}
```

读法：

- 播报区里那句是**运行完成**的播报（与本刀无关的既有行为），关键是它**不含**「产物画布已打开」——
  以前打开产物会同时响这一句，而那描述的是"你换了个视图"，不是"发生了什么事实"。
- 坞的可及名称从静态的「产物画布」变成「**预览 · devin-dir-note.txt**」：读屏用户照样知道在看哪个文件，
  但不会把一次点击听成一次事件。

---

## 3. 「已写出 X」为什么不在这份活页证据里

它发生在**写盘成功的那一刻**（`index.html` 收 SSE 事件时）。归档 run 是回放，不是当场写盘，
所以活页上量不到「已写出」这句。

覆盖方式：纯函数 `writeAnnouncement`（`ui/public/app.js`）+ 4 条单测（单条 / 多条只念第一条 + 计数 /
空输入不播 / 不含「画布·已打开」这类视图字样）。宿主侧的接线是**一行**（取 `deriveWrittenPaths`
的结果喂给它），没有分支逻辑。

---

## 4. 三分类：只有两支走了活页，第三支如实记为未取证

`previewReadFailureMessage` 的三支：

| 支 | 覆盖方式 |
|---|---|
| 「还没写到磁盘。」 | **单测**（`hasWrittenPath: () => false`）+ `artifactWriteState` 的 `intended` 三态单测。**活页未取证** |
| 「文件不在了（可能被移动或删除）。」 | **单测**（`hasWrittenPath: () => true` + 404） |
| 「读不动：<原因>。」 | **单测** + 既有 canvas 用例（取件失败时出错误卡而不是白屏，且不带 HTTP 码） |

**「还没写到磁盘。」为什么活页量不到**：要构造它，需要一个真实 run 停在**写盘审批**上
（工具已调用、结果还没到）——那要真模型调用，且步数不可控。代价与不确定性都不划算，
所以这一支只由单测覆盖，**不冒充活页通过**。

---

## 5. 本轮修掉的一个自己造的口子

第一版我把「本 run 没写过」直接压成布尔 `false`，于是**从文件树点开一个工作区既有文件**、
而它恰好读不到时，界面会说「还没写到磁盘。」——可那个文件本来就不该由本 run 写，
它只是"本 run 没提过它"。把「不认识」说成了「不存在」。

改成三态（`ui/public/app.js` 的 `artifactWriteState`）：

| 值 | 含义 | 谁走这条 |
|---|---|---|
| `written` | 有成功的写结果 | 产物 |
| `intended` | 有写工具的调用、没有成功结果（等批准 / 失败） | 审计 N2 的形状——**只有它配说「还没写到磁盘。」** |
| `unknown` | 本 run 根本没提过这个路径 | 工作区既有文件；落回 404 / 读不动 两支 |

顺带发现：这条口子是**写测试时想的**，不是单测跑红逼出来的——三态的形状不对，测试全绿也拦不住。

---

## 6. 测试状态

| | 结果 |
|---|---|
| `npx vitest run test/ui-artifact-canvas.test.ts test/ui-app.test.ts test/ui-a11y.test.ts test/ui-file-tree.test.ts test/ui-rail-policy.test.ts test/ui-preview-dock.test.ts test/ui-faces.test.ts` | **675/675 通过** |
| `npm run typecheck` | 无输出 |

新加的单测：`previewReadFailureMessage` 4 条、`writeAnnouncement` 4 条、`artifactWriteState` 4 条、
canvas 层三态 2 条；并把既有那条「取件失败：错误卡而不是白屏」改成守**意图**
（有错误卡 + 说得清是「读不动」+ 不带 HTTP 码），而不是守旧文案的字面。

---

## 7. 本轮没做

- P4（伸手就断：`@` 截断与 `#`/`$` 空响两条**先复现**；看「改了什么」先实拍现状）——单独一刀
- 没提交截图（`p3-announce.png` 留在磁盘）
