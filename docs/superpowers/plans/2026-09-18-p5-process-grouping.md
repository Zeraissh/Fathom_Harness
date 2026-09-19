# P5 · 过程显示（日志面成组）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 事件流里「同一次 run 内连续的 ≥2 个工具调用」收成一组可折叠条目；单个工具不套抽屉，内联一行。

**Architecture:** 新增一个纯函数 `groupToolSteps(entries)`，在 `deriveLogEntries` 派生链的末端（`attachLiveThinkingToLog` 之后）执行。组条目沿用现有条目的 `seq` / `collapsed` / 覆盖表协议——**组键就是组内首条的 seq**，所以 `logCollapseOverrides`（`Map<runId, Map<seq, boolean>>`）与 `appendOnly` 的「一 key 一节点」契约都不用改。渲染沿用现有 `.log-entry` 结构：组展开时把组内每条**以展开态**渲染进 body，避免出现「看起来能点却点不动」的假行。

**Tech Stack:** 零构建前端（`ui/public/app.js` + `index.html` 内联接线）、Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-09-18-ui-center-contract-design.md` §P5

---

## 取证（读实现所得）

| 事实 | 位置 |
|---|---|
| `deriveLogEntries` 合并主/核查时间线、逐条给 `defaultCollapsed`，末了 `attachLiveThinkingToLog` | `ui/public/app.js:3819-3833` |
| `defaultCollapsed` 展开白名单：失败 `tool_result`、审批、重试、端点切换、压缩、信息队列等 | `app.js:3867-3889` |
| 折叠覆盖表 `Map<runId, Map<seq, boolean>>`，`seq` 为 key | `ui/public/index.html:909-911` |
| `applyCollapseOverrides` / `nextCollapseOverride`（必须"先算默认再翻"） | `app.js:3907-3932` |
| 渲染 `renderLogEntry` + 4 个 per-type switch：`renderLogEntryBody`(11485)、`entryIcon`(11634)、`entryActionLabel`(11683)、`entryDetail`(11770) | `app.js` |
| 折叠机制不是 `details/summary`：折叠时 body 根本不生成，靠 `log-entry--collapsed` | `app.js:11438/11452` |
| `patchLogPanel` 的 key = `String(e.seq)`，`update` 用 `log-entry--collapsed` 早退 | `app.js:8573-8615` |
| **对话面**已有 `collapseToolGroups`（`<details class="chat-tool-group">`），但**无 ≥2 阈值** | `app.js:10208-10230`、`renderToolGroup` 10817 |
| 对话面单工具已有现成渲染：`case "tool": renderToolRow(it)` | `app.js:10735-10736` |

---

### Task 1: `groupToolSteps` 纯函数

**Files:**
- Modify: `ui/public/app.js`（`deriveLogEntries` 之后，约 3834 行）
- Test: `test/ui-app.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/ui-app.test.ts` 的 `describe("AC4 日志分层 (R-04)")`（约 1809 行）之后追加一个新的 describe：

```ts
describe("P5 连续工具成组", () => {
  const call = (seq: number, name = "read_file") => ({ seq, type: "tool_call", name, input: {} });
  const ok = (seq: number, toolUseId = "t") => ({ seq, type: "tool_result", toolUseId, resultContent: "ok" });
  const bad = (seq: number, toolUseId = "t") => ({ seq, type: "tool_result", toolUseId, resultContent: "boom", resultIsError: true });
  const text = (seq: number) => ({ seq, type: "assistant_text", text: "讲一句" });

  it("连续两个工具调用收成一组，组键是首条 seq", () => {
    const out = groupToolSteps([call(1), ok(2), call(3), ok(4)]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("tool_group");
    expect(out[0].seq).toBe(1);
    expect(out[0].stepCount).toBe(2);
  });

  it("单个工具不成组，原样内联（不假装有抽屉）", () => {
    const out = groupToolSteps([call(1), ok(2)]);
    expect(out.map((e: any) => e.type)).toEqual(["tool_call", "tool_result"]);
  });

  it("散文夹在中间要把组切断", () => {
    const out = groupToolSteps([call(1), ok(2), text(3), call(4), ok(5)]);
    expect(out.map((e: any) => e.type)).toEqual([
      "tool_call", "tool_result", "assistant_text", "tool_call", "tool_result",
    ]);
  });

  it("失败的工具结果不进组，也不被组吞掉（藏了变量）", () => {
    const out = groupToolSteps([call(1), bad(2), call(3), ok(4), call(5), ok(6)]);
    // 先 1 个不成组 → 失败条独立 → 后两个成组
    expect(out.map((e: any) => (e.type === "tool_group" ? `group(${e.stepCount})` : e.type)))
      .toEqual(["tool_call", "tool_result", "group(2)"]);
  });

  it("开头的孤立成功结果不自己开组", () => {
    const out = groupToolSteps([ok(1), call(2), ok(3)]);
    expect(out.map((e: any) => e.type)).toEqual(["tool_result", "tool_call", "tool_result"]);
  });

  it("组条目自带默认折叠与去重后的工具名", () => {
    const out = groupToolSteps([call(1, "read_file"), ok(2), call(3, "write_file"), ok(4), call(5, "read_file"), ok(6)]);
    expect(out).toHaveLength(1);
    expect(out[0].collapsed).toBe(true);
    expect(out[0].stepCount).toBe(3);
    expect(out[0].names).toEqual(["read_file", "write_file"]);
  });
});
```

把 `groupToolSteps` 加进测试文件顶部从 `../ui/public/app.js` 的 import 列表。

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run test/ui-app.test.ts -t "P5 连续工具成组"`
Expected: FAIL —— `groupToolSteps is not a function`（未导出）。

- [ ] **Step 3: 实现纯函数**

在 `ui/public/app.js` 的 `attachLiveThinkingToLog` 之后插入：

```js
/** 成组门槛：连续 ≥2 个工具调用才收成组。单个工具自己站着——没有组时别假装有抽屉。 */
export const TOOL_GROUP_MIN_STEPS = 2;

/** 能被收进组的条目：tool_call，以及紧随其后的**成功** tool_result。
    失败结果必须独立站着（见 defaultCollapsed 的展开白名单：它藏了变量）。 */
function isGroupableStep(entry) {
  if (entry.type === "tool_call") return true;
  return entry.type === "tool_result" && !entry.resultIsError;
}

/**
 * 把连续的 ≥2 个工具调用收成一条 `tool_group`。
 *
 * 为什么键是**组内首条的 seq**：折叠覆盖表（`Map<runId, Map<seq, boolean>>`）与
 * `appendOnly` 的「一 key 一节点」契约都以 seq 为键。组沿用首条的 seq，两套协议
 * 都不用改；组内成员不再单独渲染，所以不会撞键。
 */
export function groupToolSteps(entries) {
  const out = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].type !== "tool_call") {
      out.push(entries[i]);
      i += 1;
      continue;
    }
    let j = i;
    let calls = 0;
    while (j < entries.length && isGroupableStep(entries[j])) {
      if (entries[j].type === "tool_call") calls += 1;
      j += 1;
    }
    if (calls >= TOOL_GROUP_MIN_STEPS) {
      const steps = entries.slice(i, j);
      const names = [];
      for (const s of steps) {
        if (s.type === "tool_call" && s.name && !names.includes(s.name)) names.push(s.name);
      }
      out.push({
        type: "tool_group",
        seq: steps[0].seq,
        turn: steps[0].turn,
        source: steps[0].source,
        collapsed: true,
        steps,
        stepCount: calls,
        names,
      });
      i = j;
    } else {
      out.push(entries[i]);
      i += 1;
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run test/ui-app.test.ts -t "P5 连续工具成组"`
Expected: PASS（6 条）。

- [ ] **Step 5: 提交**

```bash
git add ui/public/app.js test/ui-app.test.ts
git commit -m "feat(ui): groupToolSteps——连续 ≥2 个工具调用收成组的纯函数"
```

---

### Task 2: 接进派生链

**Files:**
- Modify: `ui/public/app.js:3819-3833`（`deriveLogEntries` 的 return）
- Test: `test/ui-app.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
  it("deriveLogEntries 的输出已经成组：连续两个工具只剩一条 tool_group", () => {
    const state: any = {
      timeline: [
        { seq: 1, type: "turn_start", turn: 1 },
        { seq: 2, type: "tool_call", name: "read_file", input: {}, toolUseId: "a" },
        { seq: 3, type: "tool_result", toolUseId: "a", resultContent: "one" },
        { seq: 4, type: "tool_call", name: "write_file", input: {}, toolUseId: "b" },
        { seq: 5, type: "tool_result", toolUseId: "b", resultContent: "two" },
      ],
      verifierTimeline: [],
      toolNames: {},
      status: "completed",
    };
    const out = deriveLogEntries(state, { thinking: "", text: "" });
    expect(out.map((e: any) => e.type)).toEqual(["turn_start", "tool_group"]);
  });

  it("直播中的思考条不会被吞进组，仍单独存在", () => {
    const state: any = {
      timeline: [
        { seq: 1, type: "tool_call", name: "read_file", input: {}, toolUseId: "a" },
        { seq: 2, type: "tool_result", toolUseId: "a", resultContent: "one" },
        { seq: 3, type: "tool_call", name: "read_file", input: {}, toolUseId: "b" },
        { seq: 4, type: "tool_result", toolUseId: "b", resultContent: "two" },
        { seq: 5, type: "assistant_thinking", text: "想" },
      ],
      verifierTimeline: [],
      toolNames: {},
      status: "running",
    };
    const out = deriveLogEntries(state, { thinking: "还在想", text: "" });
    expect(out.map((e: any) => e.type)).toEqual(["tool_group", "assistant_thinking"]);
    expect(out[1].live).toBe(true);
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run test/ui-app.test.ts -t "已经成组"`
Expected: FAIL —— 实际得到 5 条平铺条目。

- [ ] **Step 3: 接进链尾**

把 `ui/public/app.js:3832` 的：

```js
  return attachLiveThinkingToLog(mapped, state, live);
```

改成：

```js
  // 成组放在最后一步：先让 live 思考贴到它那条上，再分组——组只吞连续的工具步，
  // 思考、散文、失败结果都会把组切断，所以顺序不影响它们的归属。
  return groupToolSteps(attachLiveThinkingToLog(mapped, state, live));
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run test/ui-app.test.ts -t "成组"`
Expected: PASS

- [ ] **Step 5: 跑该文件全量，确认没打坏既有 R-04 断言**

Run: `npx vitest run test/ui-app.test.ts test/ui-faces.test.ts test/ui-patch.test.ts`
Expected: PASS。`ui-app` 的「20. 成功 tool_call / tool_result → collapsed=true」「21. 失败 → collapsed=false」若因成组而失败，是因为它们构造的是**连续两个**工具——把那两条测试的输入改成**单个**工具调用（保留原意：验默认折叠规则，不是验成组）。

- [ ] **Step 6: 提交**

```bash
git add ui/public/app.js test/ui-app.test.ts
git commit -m "feat(ui): 事件流派生链末段成组"
```

---

### Task 3: 渲染 `tool_group` + 样式

**Files:**
- Modify: `ui/public/app.js`（`renderLogEntry` 11435、`renderLogEntryBody` 11485、`entryIcon` 11634、`entryActionLabel` 11683、`entryDetail` 11770）
- Modify: `ui/public/styles.css`（`.log-entry` 段，约 1991-2095 行之后）
- Test: `test/ui-patch.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/ui-patch.test.ts` 里追加：

```ts
describe("P5 组的渲染", () => {
  it("tool_group 渲染成一条可折叠的 .log-entry--group，标题写「用了 N 步」", () => {
    const html = renderLogEntry({
      type: "tool_group",
      seq: 1,
      collapsed: true,
      stepCount: 3,
      names: ["read_file", "write_file"],
      steps: [],
    } as any);
    expect(html).toContain("log-entry--group");
    expect(html).toContain("log-entry--collapsed");
    expect(html).toContain("用了 3 步");
    expect(html).toContain('data-seq="1"');
  });

  it("组展开时把每条以展开态渲染进 body，不留「看起来能点却点不动」的假行", () => {
    const html = renderLogEntry({
      type: "tool_group",
      seq: 1,
      collapsed: false,
      stepCount: 2,
      names: ["read_file"],
      steps: [
        { type: "tool_call", seq: 1, name: "read_file", input: { path: "a.txt" } },
        { type: "tool_result", seq: 2, toolUseId: "a", resultContent: "one" },
      ],
    } as any);
    expect(html).toContain("log-entry-group-body");
    // 成员是展开的：body 里出现 <pre class="log-entry-body">
    expect(html).toContain('<pre class="log-entry-body">');
    // 且 body 内不留折叠态成员
    expect(html).not.toContain('class="log-entry log-entry--collapsed"');
  });
});
```

`ui-patch.test.ts` 的 import 里补 `renderLogEntry`（若未导出，`app.js` 需 `export function renderLogEntry`）。

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run test/ui-patch.test.ts -t "P5 组的渲染"`
Expected: FAIL —— 组类型落到 `entryIcon` 的 `default: "·"`、`entryActionLabel` 的 `default: return e.type`（渲染出 `tool_group` 字样）。

- [ ] **Step 3: 渲染分支**

`renderLogEntry`（`app.js:11435`）：在 `if (e.live && e.type === "assistant_thinking")` 那行之后加一行：

```js
  if (e.type === "tool_group") cls += " log-entry--group";
```

`renderLogEntryBody`（`app.js:11485`）的 switch 里加：

```js
    case "tool_group": {
      // 成员一律以展开态渲染：组内的行没有各自的点击监听（监听只挂在组的 header 上），
      // 若按默认折叠渲染，会出现"看起来能点、点不动"的假行。
      const inner = (Array.isArray(e.steps) ? e.steps : [])
        .map((s) => renderLogEntry({ ...s, collapsed: false }))
        .join("");
      return `<div class="log-entry-group-body">${inner}</div>`;
    }
```

`entryIcon`（`app.js:11634`）加：

```js
    case "tool_group": return "⋯";
```

`entryActionLabel`（`app.js:11683`）加：

```js
    case "tool_group": return `用了 ${e.stepCount ?? (e.steps?.length ?? 0)} 步`;
```

`entryDetail`（`app.js:11770`）加：

```js
    case "tool_group":
      return Array.isArray(e.names) && e.names.length ? e.names.join("、") : "";
```

`renderLogEntry` 加 `export`（`/** @returns {string} */\nexport function renderLogEntry(e)`），供测试直接调。

- [ ] **Step 4: 样式**

在 `ui/public/styles.css` 的 `.log-entry-body` 段（约 2088 行）之后加：

```css
/* P5：连续工具成组。组体左侧拉一条细竖线，让"这些属于同一步过程"看得见 */
.log-entry-group-body {
  margin-left: 4px;
  padding-left: 10px;
  border-left: 2px solid var(--border-1);
}
.log-entry--group > .log-entry-header .log-entry-action {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: 跑测试**

Run: `npx vitest run test/ui-patch.test.ts test/ui-app.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add ui/public/app.js ui/public/styles.css test/ui-patch.test.ts
git commit -m "feat(ui): 渲染 tool_group——可折叠的「用了 N 步」"
```

---

### Task 4: 对话面 ≥2 阈值 —— **已撤回，改为待办**

**执行时的实测结论（2026-09-18）：这一刀不做，做了会退人话。**

把 `collapseToolGroups` 的门槛从 `tools.length > 0` 改成 `>= 2`，会打破 4 条既有测试，而且**不是测试写错了**：

| | 组渲染 `renderToolGroup` | 单行 `renderToolRow` |
|---|---|---|
| 大回执折叠保护 | ✓ | ✓（都走 `renderToolResultBody`） |
| **人话动词**（「把原图载入本轮」） | ✓ 用 `toolHeadline` | **✗ 只显示 `view_image` + 路径** |
| live 高亮类 | `chat-tool-group--live` | `chat-tool--live` |

`renderToolRow` 走 `toolPeek` 而不是 `toolHeadline`，所以退回它等于**用抽屉换掉人话**。人话是 spec §5 的不变量（09-15 审计第 5 节「批准人话」同族），为了兑现本计划里「单工具不套抽屉」这行字而丢掉它，取舍是反的。

**正确改法（留给单独一刀）**：先让单工具渲染**保住人话动词与 live 高亮**（把 `toolHeadline` 与 live 类补进单行渲染），**再**拆掉 `<details>` 抽屉。两步必须同刀做完，只做第二步就是退步。

**受影响、需要在那刀里一起改的 4 条测试**：

- `ui-patch.test.ts` → `流式输出直接长在对话里 > 有增量时直播条让位…`
- `ui-patch.test.ts` → `deriveChatItems… > 直播工具组摘要是关键字高亮，点开只给当前指令`
- `ui-patch.test.ts` → `view_image / describe_image 工具名人话 > 对话工具条写「把原图载入本轮」…`
- `ui-patch.test.ts` → `对话展示层… > 20KB HTML 工具回执不进用户/助手主气泡`

**本刀已交付的部分仍然成立**：日志面（事件流）的成组按 `TOOL_GROUP_MIN_STEPS = 2` 生效——单个工具在事件流里就是它自己那条，不会套组。那是 spec §P5 明确点名的靶子（它点名了 `defaultCollapsed()`）。

---

### Task 5: 活页验收

**Files:**
- Create: `eval/persona-ux/_audit-20260918/p5-evidence.md`

**判据**

1. 一个跑了两步工具的 run：事件流里出现**一条**「用了 2 步」，而不是两条各自折叠的工具条。
2. 点它能展开，展开后看到两条明细。
3. 一个只跑了一步工具的 run：事件流里是**一条内联的工具条**，不是组。
4. 失败的工具结果**不进组**，仍单独展开着。

**取证办法**：不能靠真实模型跑（要花钱且不确定步数）。改为**造一个归档 run** 塞进独立 `AGENT_RUN_HISTORY_DIR`，用只读历史把它加载出来——`ui/history.ts` 的落盘格式是 `meta.json` + `events.jsonl` + `transcript.jsonl`。

- [ ] **Step 1: 造两个归档 run**

写 `eval/persona-ux/_audit-20260918/make-p5-fixtures.mjs`：在 `D:/Work/scratch/p5-hist/<runId>/` 下写 `meta.json` 与 `events.jsonl`，两个 run：
- `p5-two-steps`：`tool_call(read_file)` → 成功 `tool_result` → `tool_call(write_file)` → 成功 `tool_result`
- `p5-one-step`：一条 `tool_call` → 成功 `tool_result`
- `p5-with-failure`：`tool_call` → 失败 `tool_result` → `tool_call` → 成功 → `tool_call` → 成功

事件形状照 `ui/history.ts` 与 `src/run-state.ts` 的 `TimelineEntry` 投影（`seq`/`type`/`turn`/`toolUseId`/`name`/`input`/`resultContent`/`resultIsError`）。

- [ ] **Step 2: 起隔离宿主并逐帧/逐 DOM 取证**

```bash
AGENT_UI_PORT=4199 AGENT_UI_WORKDIR="D:/Work/scratch/p2-check" \
AGENT_RUN_HISTORY_DIR="D:/Work/scratch/p5-hist" AGENT_MEMORY_DIR="D:/Work/scratch/p5-mem" \
npx tsx ui/serve.ts
```

照 `p2-firstpaint.mjs` 的写法新写 `p5-groups.mjs`：打开每个归档 run，取 `.log-entries` 的 DOM，记录
- `.log-entry--group` 的数量与标题文字
- 点开组后 `.log-entry-group-body` 里的明细条数
- 单步 run 里有没有 `.log-entry--group`（必须为 0）
- 失败 run 里失败条目是否独立于组

- [ ] **Step 3: 留档并提交**

屏幕原文与 DOM 记录写进 `p5-evidence.md`，格式照 `_audit-20260915/` 惯例：只写屏幕原文与亲手跑出来的东西。

```bash
git add eval/persona-ux/_audit-20260918/p5-evidence.md eval/persona-ux/_audit-20260918/p5-groups.mjs eval/persona-ux/_audit-20260918/make-p5-fixtures.mjs
git commit -m "docs(eval): P5 活页证据——两步成组、一步内联、失败独立"
```

---

## 完成定义

- [ ] `npx vitest run test/ui-app.test.ts test/ui-patch.test.ts test/ui-faces.test.ts` 全绿
- [ ] `npx vitest run` 失败集合 ⊆ 基线（**不是**全绿，基线本就不绿，见 P2 计划 Task 3 Step 4 勘误）
- [ ] `npm run typecheck` 无输出
- [ ] Task 5 四条判据都成立
- [ ] 5 个提交都在，各自可独立回滚

## 不变量（不许碰）

spec §5 全部，尤其：

1. **`defaultCollapsed` 的展开白名单一条都不许删**——失败、审批、重试、端点切换、压缩、信息队列这些「藏了变量」的条目必须继续展开。
2. **思考块的直播跟尾不许动**（`app.js:6635-6688`、`updateLiveLogThinking` 11409）——那部分已经是对的。
3. `applyCollapseOverrides` / `nextCollapseOverride` 的「先算默认再翻」语义不许改（`app.js:3912-3932` 的注释解释了为什么）。

## 本计划明确不做

- 不做「组的嵌套」（组里再套组）。
- 不给组加「重跑这一步」之类的动作。
- 不动核查面（`renderVerifyTab`，`app.js:11933`）的派生——它不走 `deriveLogEntries`，本刀不碰。
