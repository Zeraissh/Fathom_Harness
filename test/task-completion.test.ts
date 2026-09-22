// @ts-nocheck
/**
 * finish_task 的 `nextStep`（三轮走查 A+B，2026-09-19）。
 *
 * **病：** 对话末尾那排「下一步」chip 是**纯模板**——`suggestNextActions` 从一张
 * 固定能力表（接着说 / 点名一个文件 / 设个定时…）里挑，跟模型刚干了什么毫无关系。
 * 委托方原话：「没有什么用处」。对标 Claude Code 的做法：收尾后输入框出现一句
 * **灰幽灵问句**（「要不要帮你做 H1？」），按 Tab 落成可编辑的回复、回车即发。
 *
 * **为什么建议必须由模型给：** 那句问句问的是**下一步该做什么**，而这只有刚做完
 * 这件事的人知道。它和 `blockers` 的区别在于——blockers 只装"欠着的账"，
 * 而好的下一步常常是**新主意**（H1 做完 → 要不要加夜景）。这层只有模型给得出。
 *
 * **为什么搭在 `finish_task` 上而不是另发一次请求：** 收尾那轮它本来就在写
 * summary，顺手多写一句问句的成本接近于零；另起一次调用则是每个 run 都多花钱。
 *
 * **不变式（本文件锁的就是这条）：** 这是**可选**字段。给了要原样带出；没给照样
 * 合法（老 run、兼容端点、模型今天心情不好——都得能收尾）；**形状不对只丢这一项，
 * 不许拖垮整条完成声明**——完成声明是整场运行的落款，一个装饰性字段没资格否决它。
 */
import { describe, expect, it } from "vitest";
import { taskCompletionFromObject } from "../src/task-completion.js";

const base = {
  status: "completed",
  summary: "做完了",
  artifacts: ["a.html"],
  verification: ["node --check 通过"],
  assumptions: [],
  blockers: [],
};

describe("finish_task.nextStep", () => {
  it("给了合法 nextStep → 原样带出", () => {
    const c = taskCompletionFromObject({
      ...base,
      nextStep: { ask: "要不要帮你做 H1？", reply: "需要，请做 H1" },
    });
    expect(c?.nextStep).toEqual({ ask: "要不要帮你做 H1？", reply: "需要，请做 H1" });
  });

  it("两端空白 trim 掉（模型很爱在中文里垫空格）", () => {
    const c = taskCompletionFromObject({
      ...base,
      nextStep: { ask: "  要不要？  ", reply: "  需要  " },
    });
    expect(c?.nextStep).toEqual({ ask: "要不要？", reply: "需要" });
  });

  it("不给 → 仍然合法（向后兼容：老 run / 兼容端点 / 模型没答）", () => {
    const c = taskCompletionFromObject(base);
    expect(c).toBeTruthy();
    expect(c?.nextStep).toBeUndefined();
  });

  /**
   * 这条是本文件的**主锁**：装饰性字段坏了只丢它自己。
   * 若哪天有人把它做成强校验，被拖垮的是"整场运行没法收尾"——代价完全不成比例。
   */
  it("形状不对 → 只丢这一项，完成声明必须活下来", () => {
    const bad = [
      "要不要帮你做 H1？", // 直接给了字符串
      { ask: "只有问句" }, // 缺 reply
      { reply: "只有回答" }, // 缺 ask
      { ask: "", reply: "x" }, // 空串
      { ask: "   ", reply: "   " }, // 纯空白
      { ask: 1, reply: "x" }, // 非字符串
      { ask: "x", reply: null }, // null
      null,
      [],
      42,
    ];
    for (const v of bad) {
      const c = taskCompletionFromObject({ ...base, nextStep: v });
      expect(c, `nextStep=${JSON.stringify(v)} 不该拖垮完成声明`).toBeTruthy();
      expect(c?.nextStep, `nextStep=${JSON.stringify(v)} 该被丢掉`).toBeUndefined();
    }
  });

  it("partial 也带得动——未完成项的下一步恰恰最该给", () => {
    const c = taskCompletionFromObject({
      ...base,
      status: "partial",
      blockers: ["夜景泛光未实测"],
      nextStep: { ask: "要不要补夜景实测？", reply: "需要，请补夜景实测" },
    });
    expect(c?.status).toBe("partial");
    expect(c?.nextStep?.ask).toContain("夜景");
  });

  it("核心字段照旧严：nextStep 合法也不能把缺 blockers 的 partial 救活", () => {
    expect(
      taskCompletionFromObject({
        ...base,
        status: "partial",
        blockers: [],
        nextStep: { ask: "x", reply: "y" },
      }),
    ).toBeUndefined();
  });
});
