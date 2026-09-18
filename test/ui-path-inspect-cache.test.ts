// @vitest-environment jsdom
// @ts-nocheck
/**
 * 路径存在性探测缓存（走查 UX-D1）。
 *
 * 真机实录：hydrateLocalPathLinks + hydrateArtifactCards 每次重渲染都会为
 * **新节点**探测一次，流式下每批事件一渲染就是 3 条 POST，单会话 84 条。
 * 同一 (runId, path) 在 TTL 内复用上一次结果——但 TTL 过了要重探（文件可能
 * 刚落盘），换了 run 也不许串台。
 */
import { describe, it, expect } from "vitest";
import { createPathInspectCache } from "../ui/public/app.js";

describe("createPathInspectCache", () => {
  it("TTL 内命中、过期重探", () => {
    let t = 1000;
    const cache = createPathInspectCache({ ttlMs: 30000, now: () => t });
    cache.set("r1", "a.txt", { exists: true, input: "a.txt" });
    expect(cache.get("r1", "a.txt")).toEqual({ exists: true, input: "a.txt" });
    t += 29999;
    expect(cache.get("r1", "a.txt")).not.toBeNull();
    t += 2;
    expect(cache.get("r1", "a.txt"), "TTL 过了必须重探（文件可能刚落盘）").toBeNull();
  });

  it("不同 run 不串台", () => {
    const cache = createPathInspectCache({ ttlMs: 30000, now: () => 1000 });
    cache.set("r1", "a.txt", { exists: true, input: "a.txt" });
    expect(cache.get("r2", "a.txt")).toBeNull();
  });

  it("负结果同样缓存（不存在的路径也有 TTL，不是永久缓存）", () => {
    let t = 1000;
    const cache = createPathInspectCache({ ttlMs: 30000, now: () => t });
    cache.set("r1", "nope.txt", { exists: false, input: "nope.txt" });
    expect(cache.get("r1", "nope.txt")).toEqual({ exists: false, input: "nope.txt" });
    t += 31000;
    expect(cache.get("r1", "nope.txt")).toBeNull();
  });
});
