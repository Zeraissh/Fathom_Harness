// @vitest-environment jsdom
// @ts-nocheck
/**
 * 收尾后的「下一步」幽灵提议（三轮走查 A+B，2026-09-19）。
 *
 * **被它替掉的东西：** 对话末尾那排「下一步」chip——纯模板，从一张固定能力表
 * （接着说 / 点名一个文件 / 设个定时…）里挑，跟模型刚干了什么毫无关系。
 * 委托方原话：「没有什么用处」。
 *
 * **替成什么：** 收尾后输入框里出现一句**灰幽灵问句**（「要不要帮你做 H1？」），
 * 按 Tab 落成可编辑的回复、回车即发（对标 Claude Code）。
 *
 * **两路合流：** ① 模型在 `finish_task.nextStep` 里给的——它能提**新主意**；
 * ② 模型没给时从 `completion.blockers[0]` 长一句——欠着的账至少是有内容的。
 * 都没有 → null（界面不出幽灵，**Tab 也不劫持**）。
 *
 * **本文件最要紧的一条锁**是 `projectCompletion`：那个函数是**逐字段白名单**，
 * 不列出的字段在对话面**静默蒸发**——本仓已经在这上面栽过（blockers）。
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveNextSuggestion, projectCompletion } from "../ui/public/app.js";

const base = {
  status: "completed",
  summary: "做完了",
  artifacts: [],
  verification: [],
  assumptions: [],
  blockers: [],
};

describe("deriveNextSuggestion：模型优先，blockers 兜底", () => {
  it("模型给了 nextStep → 用它", () => {
    const s = deriveNextSuggestion({ ...base, nextStep: { ask: "要不要帮你做 H1？", reply: "需要，请做 H1" } });
    expect(s).toEqual({ ask: "要不要帮你做 H1？", reply: "需要，请做 H1", source: "model" });
  });

  it("模型没给、但有 blocker → 从欠账长一句", () => {
    const s = deriveNextSuggestion({ ...base, status: "partial", blockers: ["夜景泛光未实测"] });
    expect(s?.source).toBe("blocker");
    expect(s?.ask).toContain("夜景泛光未实测");
    expect(s?.reply).toContain("夜景泛光未实测");
  });

  it("两路都没有 → null（界面不出幽灵，Tab 放行）", () => {
    expect(deriveNextSuggestion(base)).toBeNull();
    expect(deriveNextSuggestion(null)).toBeNull();
    expect(deriveNextSuggestion(undefined)).toBeNull();
    expect(deriveNextSuggestion({ ...base, blockers: [] })).toBeNull();
  });

  it("nextStep 残缺 → 落到 blocker 兜底，而不是出个半句", () => {
    const s = deriveNextSuggestion({
      ...base,
      status: "partial",
      blockers: ["篆字外皮近景未实测"],
      nextStep: { ask: "只有问句" },
    });
    expect(s?.source).toBe("blocker");
  });

  it("nextStep 纯空白 → 同样落到兜底", () => {
    const s = deriveNextSuggestion({
      ...base,
      status: "partial",
      blockers: ["夜景未测"],
      nextStep: { ask: "   ", reply: "  " },
    });
    expect(s?.source).toBe("blocker");
  });

  it("blocker 很长时：问句截断、回复留全文——发出去的那句得是完整指令", () => {
    const long = "篆字外皮在近景里未实测过，夜景外皮泛光也未实测过，交互与降级路径全都没跑";
    const s = deriveNextSuggestion({ ...base, status: "partial", blockers: [long] });
    expect(s.ask.length).toBeLessThan(long.length + 12);
    expect(s.ask).toContain("…");
    expect(s.reply).toContain(long);
  });

  it("blockers 里第一条是空白 → 取第一条有内容的", () => {
    const s = deriveNextSuggestion({ ...base, status: "partial", blockers: ["   ", "真正的欠账"] });
    expect(s?.reply).toContain("真正的欠账");
  });
});

/**
 * 投影锁：`projectCompletion` 是 done 事件的**逐字段白名单**。
 * 它漏一个字段，那个字段就在对话面静默消失——多测一条都不报错。
 * 本仓已在 blockers 上栽过一次，注释还留在函数头上。
 */
describe("projectCompletion 不许把 nextStep 漏掉", () => {
  it("带 nextStep 的 done 事件原样投影出来", () => {
    const p = projectCompletion({
      ...base,
      nextStep: { ask: "要不要帮你做 H1？", reply: "需要，请做 H1" },
    });
    expect(p?.nextStep).toEqual({ ask: "要不要帮你做 H1？", reply: "需要，请做 H1" });
    expect(deriveNextSuggestion(p)?.source).toBe("model");
  });

  it("没有这个字段的旧事件照旧投影（不给空壳 nextStep）", () => {
    const p = projectCompletion(base);
    expect(p).toBeTruthy();
    expect(p.nextStep).toBeUndefined();
  });

  it("形状不对 → 投影层就丢掉，别把脏东西传下去", () => {
    expect(projectCompletion({ ...base, nextStep: "字符串" })?.nextStep).toBeUndefined();
    expect(projectCompletion({ ...base, nextStep: { ask: "只有问句" } })?.nextStep).toBeUndefined();
  });
});

/**
 * 接线锁。纯函数对，不代表屏幕上对——能力条那一刀刚用活页抓到过同一类缝
 * （`patchAssemblyBar` 只挂在 run 详情上，首页根本不走那条路，而两条单测全绿）。
 *
 * Tab 这条住在 `index.html` 的**内联控制器**里，单测跑不到它的行为，
 * 只能锁"线还在不在、且挂在对的前提上"。
 */
describe("Tab 采纳的接线（源码锁）", () => {
  it("index.html：Tab 拦截必须挂在「有建议」这个前提上", async () => {
    const html = await readFile(join(process.cwd(), "ui/public/index.html"), "utf8");
    expect(html).toContain("deriveNextSuggestion");
    expect(html).toMatch(/e\.key === "Tab"[\s\S]{0,220}?pendingNextSuggestion/);
    // 幽灵是真的写进 placeholder，不是另起一个没人看的元素
    expect(html).toMatch(/composerMode\.placeholder = pendingNextSuggestion\.ask/);
  });

  it("app.js：tabHint 与发送快捷键合成，不许覆盖", async () => {
    const app = await readFile(join(process.cwd(), "ui/public/app.js"), "utf8");
    expect(app).toMatch(/mode\.tabHint \? .*COMPOSER_SEND_HINT/);
  });
});
