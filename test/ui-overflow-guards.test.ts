// @vitest-environment jsdom
// @ts-nocheck
/**
 * 溢出批（走查 UX-C2 / O2–O10）的样式守卫锁。
 *
 * 每条对应报告 §5 的一个条目：长内容（MCP 全名 / 长 bash / 无分隔长文件名 /
 * 长 URL / 长 label）不得撑破容器或被硬切到不可读。断言的是"守卫存在"，
 * 形式与 styles.css 保持同源；真机复核在 uxaudit/ 脚本与报告 §9。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "public", "styles.css"),
  "utf-8",
);

describe("溢出守卫（UX-C2）", () => {
  it("O2 消耗图表：日期标签不再在列内硬切（溢出列宽由步长兜间距）", () => {
    expect(css).toMatch(/\.usage-col-label\s*\{[^}]*overflow:\s*visible/);
    expect(css, "text-overflow: clip 会切出半个字，必须去掉").not.toMatch(
      /\.usage-col-label\s*\{[^}]*text-overflow:\s*clip/,
    );
  });

  it("O3 工具行：工具名可省略（MCP 全名可达 67 字符）", () => {
    expect(css).toMatch(/\.chat-tool > summary > code\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.chat-tool > summary > code\s*\{[^}]*min-width:\s*0/);
  });

  it("O4 工具组摘要：长 bash 在列右缘出省略号，而不是戛然而止", () => {
    expect(css).toMatch(/\.tool-headline\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.tool-headline\s*\{[^}]*min-width:\s*0/);
  });

  it("O5 审批卡首行：无分隔符长文件名换行而不是压出卡框", () => {
    expect(css).toMatch(/\.approval-tool-name\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("O6 来源表：宽表自己横滚（.md 祖先要求对 .chat-sources 不成立）", () => {
    expect(css).toMatch(/\.chat-sources \.md-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("O7 活动行：「正在 <工具>」的名字可省略", () => {
    expect(css).toMatch(/\.chat-activity code\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it("O9 子对话 chip：标题有上限、出省略号", () => {
    expect(css).toMatch(/\.campaign-chip-title\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.campaign-chip-title\s*\{[^}]*max-width/);
  });

  it("O10 设置模型名：无空格长 label 会换行（small 早有守卫，strong 补上）", () => {
    expect(css).toMatch(/\.settings-model-copy strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
