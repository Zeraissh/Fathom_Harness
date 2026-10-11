/**
 * ui/server/router.ts 的直接单测。
 *
 * matchRoute 原在 createUiServer 闭包里，只能经 HTTP 间接测到；拆分阶段 1 把它
 * 迁成纯函数后可以直接喂 method + url。这里补的主要是此前没有任何 HTTP 用例
 * 走到的那几条路由，以及「形状不对就 malformed」的边界。
 */
import { describe, expect, it } from "vitest";
import { matchRoute } from "../ui/server/router.js";

describe("matchRoute：此前无用例覆盖的路由", () => {
  it.each([
    ["GET", "/", { type: "static", filePath: "index.html" }],
    ["GET", "/index.html", { type: "static", filePath: "index.html" }],
    ["POST", "/api/mcp/uninstall", { type: "mcpUninstall" }],
    ["POST", "/api/mcp/skills", { type: "mcpSkills" }],
    ["GET", "/api/campaigns", { type: "campaignsList" }],
    ["GET", "/api/runs/run-1/trace", { type: "trace", runId: "run-1" }],
    ["POST", "/api/runs/run-1/extend-budget", { type: "extendBudget", runId: "run-1" }],
  ] as const)("%s %s", (method, url, expected) => {
    expect(matchRoute(method, url)).toEqual(expected);
  });

  it("路径参数按 URI 解码（草稿名 / campaign id / 子 run id）", () => {
    expect(matchRoute("DELETE", "/api/packs/drafts/my%20pack")).toEqual({ type: "packsDiscard", name: "my pack" });
    expect(matchRoute("GET", "/api/campaigns/c%2F1")).toEqual({ type: "campaignGet", id: "c/1" });
    expect(matchRoute("POST", "/api/campaigns/c1/children/r%201/cancel")).toEqual({
      type: "campaignChildCancel",
      id: "c1",
      childRunId: "r 1",
    });
  });

  it("method 不对就不认：同一路径换个动词落不到同一个处理器", () => {
    expect(matchRoute("GET", "/api/mcp/uninstall")).not.toEqual({ type: "mcpUninstall" });
    expect(matchRoute("GET", "/api/runs/run-1/extend-budget")).not.toEqual({ type: "extendBudget", runId: "run-1" });
    expect(matchRoute("POST", "/api/campaigns/c1")).not.toEqual({ type: "campaignGet", id: "c1" });
  });
});

describe("matchRoute：形状校验", () => {
  it("整站预览路径解码失败或含 `..` 段 → malformed，不落到 site 处理器", () => {
    expect(matchRoute("GET", "/api/runs/run-1/site/%E0%A4%A")).toEqual({ type: "malformed" });
    expect(matchRoute("GET", "/api/runs/run-1/site/a/%2E%2E/b")).toEqual({ type: "malformed" });
  });

  it("整站预览正常路径带查询开关", () => {
    expect(matchRoute("GET", "/api/runs/run-1/site/demo/index.html?inspect=1")).toEqual({
      type: "site",
      runId: "run-1",
      path: "demo/index.html",
      inspect: true,
      deck: false,
      print: false,
    });
  });

  it("静态文件不许 `..` 越出 public", () => {
    expect(matchRoute("GET", "/../secret")).toEqual({ type: "malformed" });
  });

  it("记忆名：畸形百分号编码不抛错，嵌套名放行，`..` 拒绝", () => {
    expect(matchRoute("GET", "/api/memory/lessons/foo.md")).toEqual({ type: "memoryRead", name: "lessons/foo.md" });
    expect(matchRoute("GET", "/api/memory/..%2Fsecret.md")).toEqual({ type: "malformed" });
    expect(() => matchRoute("GET", "/api/memory/%E0%A4%A")).not.toThrow();
  });

  it("认不出的 API 路径 → malformed", () => {
    expect(matchRoute("GET", "/api/no-such-endpoint")).toEqual({ type: "malformed" });
  });
});
