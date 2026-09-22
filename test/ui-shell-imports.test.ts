// @ts-nocheck
/**
 * 壳的 import 缝（2026-09-19）。
 *
 * `index.html` 的内联脚本从 app.js 引入一堆名字，**"使用"与"引入"是两件事**：
 * 用了却忘了 import，文件里当然出现过那个名字——**源码文本锁照样绿**，
 * 点下去才 ReferenceError。
 * 本仓已经因为这个漏过一回：`stripAttachmentLine` 是 Task 2 加的，而它连着
 * 三笔提交（72c8071 / 1d5b84f / 7008eaf）都没有 import——过了实现者、变异验红、
 * 任务审查、控制者独立核实、两轮 fix round 与两轮定向复查，**六道关全绿而它是坏的**，
 * 最后是活页探针真去点了一下删除才现形。
 *
 * 所以这条锁的意义是：**把"靠人真去点"换成"静态就能红"**。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("壳用了 app.js 的名字就必须 import", () => {
  it("没有「用了却没引入」的缝", () => {
    const app = readFileSync(join(__dirname, "..", "ui", "public", "app.js"), "utf-8");
    const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

    // app.js 的全部导出名：逐个 export 声明 + 汇总形式的 export { ... }
    const exported = new Set();
    for (const m of app.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
      exported.add(m[1]);
    }
    for (const m of app.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const part of m[1].split(",")) {
        const n = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(n)) exported.add(n);
      }
    }

    // 壳从 app.js 引入的那些名字。路径实测是 "/app.js"——全文只有这一个
    // /app.js import 块（其余块是 rail-policy / settings 等别的文件）。
    // 第一版只认 "./app.js"，一条都匹配不到，于是把 275 个导出全报成缺失（假警报）。
    const imported = new Set();
    for (const m of html.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][./]*\/?app\.js["']/g)) {
      for (const part of m[1].split(",")) {
        const n = part.trim().split(/\s+as\s+/).pop().trim();
        if (n) imported.add(n);
      }
    }

    const missing = [];
    for (const name of exported) {
      // 只看"当真被调用"的样子：名字后面跟左括号。降噪降的是"光看名字"——
      // 降到「名字(」的调用形态，**不是**"排除注释与字符串"：注释或字符串里
      // 恰好出现 `foo(` 仍会误报（本仓现状下没有这种巧合，有的话该收紧形态
      // 识别，而不是放宽这条锁）。
      if (new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\s*\\(`).test(html) && !imported.has(name)) {
        missing.push(name);
      }
    }
    expect(missing, `壳用了却没 import（点下去会 ReferenceError）：${missing.join(", ")}`).toEqual([]);
  });
});
