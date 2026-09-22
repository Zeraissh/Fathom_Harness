// @ts-nocheck
/**
 * 「本场改动」卡的同步派生与撤掉文案（计划 3 · T6）。
 *
 * 这一层能测的只有纯函数：卡片真正画出来、真的取到 patch，得靠活页探针
 * （app.js 的渲染链在 jsdom 里跑不起来）。
 */
import { describe, expect, it } from "vitest";
import { deriveTouchedFiles, buildRevertMessage, toRepoRootRelative } from "../ui/public/app.js";

const toolCall = (seq, name, input, id = `t${seq}`) => ({ type: "tool_call", seq, name, input, toolUseId: id });
const okResult = (seq, id) => ({ type: "tool_result", seq, toolUseId: id, resultIsError: false });

describe("deriveTouchedFiles", () => {
  it("只收成功的编辑，按最后触碰的 seq 升序", () => {
    const state = {
      timeline: [
        toolCall(1, "edit_file", { path: "a.txt", old_string: "x", new_string: "y" }, "A"),
        okResult(2, "A"),
        toolCall(3, "edit_file", { path: "b.txt", old_string: "x", new_string: "y" }, "B"),
        okResult(4, "B"),
        toolCall(5, "edit_file", { path: "a.txt", old_string: "y", new_string: "z" }, "C"),
        okResult(6, "C"),
      ],
    };
    expect(deriveTouchedFiles(state)).toEqual([
      { path: "b.txt", edits: 1, lastSeq: 3 },
      { path: "a.txt", edits: 2, lastSeq: 5 },
    ]);
  });

  it("失败的编辑不算（改的是别的东西）", () => {
    const state = {
      timeline: [
        toolCall(1, "edit_file", { path: "a.txt", old_string: "x", new_string: "y" }, "A"),
        { type: "tool_result", seq: 2, toolUseId: "A", resultIsError: true },
      ],
    };
    expect(deriveTouchedFiles(state)).toEqual([]);
  });

  it("write_file 也算碰过（哪怕事件流拿不到它的旧版）", () => {
    const state = {
      timeline: [
        toolCall(1, "write_file", { path: "c.txt", content: "整份" }, "A"),
        okResult(2, "A"),
      ],
    };
    expect(deriveTouchedFiles(state).map((f) => f.path)).toEqual(["c.txt"]);
  });
});

describe("buildRevertMessage", () => {
  it("有行号时说得具体：文件 + 行号 + 增删行数", () => {
    const msg = buildRevertMessage({
      path: "ui/public/app.js",
      header: "@@ -11455,6 +11456,18 @@",
      added: 12, deleted: 1,
    });
    expect(msg).toContain("ui/public/app.js");
    expect(msg).toContain("11456");          // 取新文件的起始行
    expect(msg).toContain("12");
  });

  it("没有行号（旧下标形态 / 非 git）时退化成不提行号，但不许说假话", () => {
    const msg = buildRevertMessage({ path: "a.txt", header: "", added: 3, deleted: 0 });
    expect(msg).toContain("a.txt");
    expect(msg).not.toMatch(/第\s*\d+\s*行/);   // ← 不许编一个行号出来
  });

  it("是一句可以直接发出去的指令（能独立成句）", () => {
    const msg = buildRevertMessage({ path: "a.txt", header: "@@ -1,1 +1,2 @@", added: 1, deleted: 0 });
    expect(msg.trim().length).toBeGreaterThan(6);
    expect(msg).not.toContain("\n");
  });
});

/**
 * 计划 3 · T6 追加（brief Step 1 之外）：契约 1 的安全绳。
 *
 * fetchFilePatch 的 path 是**相对仓库 root** 的，deriveTouchedFiles 给的却是
 * 工具入参路径（相对 workdir，且可能带 ..）——两者基准不同，而服务端的双检
 * 对"落在边界内的错基准"是静默取错文件的。转换必须是纯函数并锁死这几条。
 */
describe("toRepoRootRelative（契约 1：diff 端点要 root 相对路径）", () => {
  const ROOT = "D:/work/repo";

  it("workdir 就是仓库根时，相对路径原样", () => {
    expect(toRepoRootRelative("src/app.js", "D:\\work\\repo", ROOT)).toBe("src/app.js");
  });

  it("workdir 是子目录时，拼上 workdir 相对根的那一段", () => {
    expect(toRepoRootRelative("file.txt", "D:/work/repo/sub", ROOT)).toBe("sub/file.txt");
  });

  it("绝对路径（工具给了全路径）剥掉根前缀", () => {
    expect(toRepoRootRelative("D:\\work\\repo\\sub\\file.txt", "D:/work/repo", ROOT)).toBe("sub/file.txt");
  });

  it("越过仓库根的路径一律 null（宁可取不到，不猜）", () => {
    expect(toRepoRootRelative("../../x.txt", "D:/work/repo/sub", ROOT)).toBeNull();
    expect(toRepoRootRelative("D:/elsewhere/file.txt", "D:/work/repo", ROOT)).toBeNull();
    expect(toRepoRootRelative("D:/work/repo", "D:/work/repo", ROOT)).toBeNull();
  });

  it(".. 段会归一（不把 .. 原样发给服务端）", () => {
    expect(toRepoRootRelative("sub/../x.txt", "D:/work/repo", ROOT)).toBe("x.txt");
  });

  it("拿不到根（非 git 目录）时 null", () => {
    expect(toRepoRootRelative("a.txt", "D:/work/repo", null)).toBeNull();
    expect(toRepoRootRelative("", "D:/work/repo", ROOT)).toBeNull();
  });
});
