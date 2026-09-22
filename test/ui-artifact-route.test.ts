// @vitest-environment jsdom
// @ts-nocheck
/**
 * 产物深链的编解码（计划 3 · T5）。
 *
 * 为什么从下标改成路径：那份清单是**会话态派生**的（产物 ∪ 点开过的 − 关掉的），
 * 可增可减，越界还被 wrapIndex 取模兜住——于是同一个 URL 在不同会话状态下
 * **静静指到另一个文件**，不报错。路径不会动。
 *
 * 用 jsdom 环境：与同族的 `test/ui-preview-dock.test.ts` / `test/ui-file-preview.test.ts`
 * 一致。**严格说这条不是必需的**——本文件的纯函数层（头注写明「可单测」）
 * 不摸 DOM，`document` / `window` 只出现在 `initArtifactCanvas` 的函数体里。
 * 留着是因为它零成本，而这个文件 1700+ 行，模块体里再长出一点 DOM 访问
 * 就会让 node 环境下的 import 当场炸。
 */
import { describe, expect, it } from "vitest";
import {
  encodeArtifactHash,
  parseArtifactRoute,
} from "../ui/public/features/artifact-canvas.js";

describe("产物深链：按路径", () => {
  it("路径形态：斜杠被转义，段里没有裸斜杠", () => {
    const hash = encodeArtifactHash("run-1", { path: "shots/a b.png" });
    expect(hash).toBe("#/run/run-1/artifact/shots%2Fa%20b.png");
    expect(hash.split("/artifact/")[1].split("?")[0]).not.toContain("/");
  });

  it("往返：编码再解码拿回同一个路径", () => {
    for (const p of ["a.txt", "shots/深 空.png", "有?问号#井.txt", "CJK/中文名.md"]) {
      const back = parseArtifactRoute(encodeArtifactHash("r", { path: p }));
      expect(back?.path).toBe(p);
      expect(back?.index).toBeNull();
    }
  });

  it("放大态：?full 不影响路径解析", () => {
    const back = parseArtifactRoute(encodeArtifactHash("r", { path: "a/b.txt" }, { full: true }));
    expect(back?.path).toBe("a/b.txt");
    expect(back?.full).toBe(true);
  });

  it("★ 旧的下标形态仍然认（历史会话里的链接不许断）", () => {
    const back = parseArtifactRoute("#/run/run-1/artifact/3");
    expect(back?.index).toBe(3);
    expect(back?.path).toBeNull();
  });

  it("数字形态仍然编得出来（别处可能还在用）", () => {
    expect(encodeArtifactHash("run-1", 3)).toBe("#/run/run-1/artifact/3");
  });

  it("不匹配的 hash 返回 null", () => {
    expect(parseArtifactRoute("#/run/abc/loop")).toBeNull();
    expect(parseArtifactRoute("#/settings")).toBeNull();
    expect(parseArtifactRoute("")).toBeNull();
  });

  it("非法转义不抛，按原样留着", () => {
    expect(() => parseArtifactRoute("#/run/r/artifact/%E4%B8%AD")).not.toThrow();
    expect(() => parseArtifactRoute("#/run/r/artifact/%")).not.toThrow();
  });
});
