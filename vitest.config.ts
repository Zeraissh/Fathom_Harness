import { defineConfig } from "vitest/config";

// 只收 test/ 下的单测——eval/fixtures/ 里的 fixture 自带 node:test 测试文件，
// 是被测【数据】而非本框架的测试；vitest 误收会以失败文件形式污染 npm test
// （2026-08-01 发现：此前靠 grep 管道掩盖了非零退出）。
//
// Coverage 棘轮（TEST-01a）：阈值锁在实测值下方一点，只许升不许降。
// 数字与理由见 docs/08-maturity-optimization-checklist.md TEST-01。
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "ui/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "ui/**/*.d.ts",
        // serve launcher 是 thin wrapper；覆盖率记在 server/history 上。
        "ui/serve.ts",
      ],
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // 棘轮基线 2026-10-11 全量（vitest 5 / coverage-v8 5）：
      //   statements 77.68% · lines 80.35% · branches 70.11% · functions 84.54%
      // 锁在实测下方约 2–3pt，防偶然抖动误红，仍挡住真回退。
      //
      // 口径换过一次，数字不能跨口径比：vitest 4 起 v8 覆盖率按 AST 重映射——
      // 注释 / 空行不再算行（lines 分母 38,620 → 17,049），`??` / `?.` / 默认参数
      // 计作分支、每个箭头函数计作函数（分母变大）。同一批 3936 条用例、同一份源码，
      // 旧口径（vitest 3）测得 lines 80.72 · branches 79.89 · functions 93.23，
      // 阈值 75 / 78 / 88 / 75。branches / functions 的阈值数字下调是换尺，不是放松。
      thresholds: {
        lines: 78,
        branches: 68,
        functions: 82,
        statements: 75,
      },
    },
  },
});
