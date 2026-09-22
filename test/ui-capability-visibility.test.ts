// @vitest-environment jsdom
// @ts-nocheck
/**
 * 能力可见性（2026-09-19 三轮走查 L1/L2）。
 *
 * **病灶：** `deriveAssemblyBar` 是一份写得很对的纯函数（8+ 条单测锁着语义），
 * 但 09-07 那次「桌面级 UI 升级」重建输入框时**丢掉了它的挂载点**——
 * `ui/public/app.js` 里 `assembly: null` / `assemblyWhy: null` 写死，
 * `patchAssemblyBar` 第一句 `if (!host) return;` 当场返回。
 *
 * 后果不是"哪里画错了"，而是**某个东西从此不存在**：`识图 执行者 / 识图 未配 /
 * 识图 不可用` 三态判据连同长理由，从 09-07 起在屏幕上零像素。
 * 于是委托方把执行者从能看图的 `deepseek-flash` 换成 `kimi-k3` 时，
 * **agent 当场失明而界面上一个字都没变**；那条 run 最终以 partial 收尾，
 * 收尾清单里写着「篆字外皮在近景里未实测过」。
 *
 * 这个文件锁三件事：
 *   ① 能力类格子的显示条件（纯函数，弱态才占位）；
 *   ② **挂载点真的存在**——源码级锁，防再一次脱钩（这一类缺陷单测抓不到，
 *      因为纯函数全绿；能抓到的只有"线还在不在"）；
 *   ③ 剩下的在 `ui-models-api.test.ts`：`/api/models` 每条带 `suggestsVision`。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityChips, deriveAssemblyBar, patchCapabilityBar } from "../ui/public/app.js";

const state = (over = {}) => ({ runConfig: {}, verify: false, ...over });

describe("capabilityChips：只留能力类，且只在弱态占位", () => {
  it("执行者看不见图 → 出「识图」一格", () => {
    const chips = capabilityChips(state(), null);
    const vision = chips.find((c) => c.key === "vision");
    expect(vision).toBeTruthy();
    expect(vision.chip).toBe("识图 未配");
  });

  it("执行者自己能看图 → 不出（那是常态，提醒即噪音）", () => {
    const chips = capabilityChips(state({ runConfig: { describeImageBacking: "executor" } }), null);
    expect(chips.find((c) => c.key === "vision")).toBeUndefined();
  });

  it("配了视觉模型（describe_image 走它）→ 照样出：它解释得清'为什么能识图却看不见像素'", () => {
    const chips = capabilityChips(
      state({ runConfig: { describeImageBacking: "vision-role", roleModels: { vision: "d-vision" } } }),
      null,
    );
    expect(chips.find((c) => c.key === "vision")?.chip).toContain("d-vision");
  });

  it("核查关着才出；开着不占位", () => {
    expect(capabilityChips(state({ verify: false }), null).find((c) => c.key === "verify")?.chip).toBe("核查关");
    expect(capabilityChips(state({ verify: true }), null).find((c) => c.key === "verify")).toBeUndefined();
    // 首页没有 run：调用点传进来的是 {}（selectedState ?? {}），verify 是 undefined——
    // 这条默认路径同样必须出「核查关」，undefined 不许滑进「开着」那半。
    expect(capabilityChips({}, null).find((c) => c.key === "verify")?.chip).toBe("核查关");
  });

  it("不夹带其它格子（workdir / git / model / costWarn… 都不是能力提醒）", () => {
    const full = deriveAssemblyBar(state(), { model: "kimi-k3" });
    expect(full.length).toBeGreaterThan(2); // 全量确实有好几格
    const keys = capabilityChips(state(), { model: "kimi-k3" }).map((c) => c.key);
    expect(keys.sort()).toEqual(["verify", "vision"]);
  });

  it("harness 缺席（run_config 未到）也不炸，按最保守的口径出「识图 未配」", () => {
    expect(capabilityChips(state(), null).find((c) => c.key === "vision")).toBeTruthy();
  });
});

describe("patchCapabilityBar：真的画进 DOM", () => {
  const mount = () => {
    document.body.innerHTML =
      `<details><summary id="composer-scope-summary">` +
      `<span class="composer-scope-text">x</span>` +
      `<span id="composer-capability-chips" hidden></span></summary></details>` +
      `<div id="composer-capability-why" hidden></div>`;
  };

  it("弱态格子进摘要行；点开给理由，再点收起", () => {
    mount();
    patchCapabilityBar({ runConfig: {}, verify: false }, null);
    const host = document.getElementById("composer-capability-chips");
    expect(host.hidden).toBe(false);
    expect([...host.querySelectorAll(".assembly-chip")].map((b) => b.textContent))
      .toEqual(["识图 未配", "核查关"]);
    expect(document.getElementById("composer-scope-summary").contains(host)).toBe(true);

    host.querySelector(".assembly-chip").click();
    const why = document.getElementById("composer-capability-why");
    expect(why.hidden).toBe(false);
    expect(why.textContent).toContain("识图");
    host.querySelector(".assembly-chip").click();
    expect(why.hidden).toBe(true);
  });

  it("执行者自己能看图 → 整条收起来（常态不占位）", () => {
    mount();
    patchCapabilityBar({ runConfig: { describeImageBacking: "executor" }, verify: true }, null);
    expect(document.getElementById("composer-capability-chips").hidden).toBe(true);
  });

  it("挂载点缺席时不炸（旧 HTML 混装新 app.js）", () => {
    document.body.innerHTML = "";
    expect(() => patchCapabilityBar({}, null)).not.toThrow();
  });
});

/**
 * ② 挂载点锁。
 *
 * 纯函数测不到"线断没断"——09-07 那次脱钩时，`deriveAssemblyBar` 的测试
 * 全绿、真实屏幕上零像素，两边都没说谎。**能抓住这一类的只有对装配点的断言。**
 */

/** 抠出 syncComposer 的函数体一带（从函数声明到下一个段落标题）。 */
function syncComposerRegion(html) {
  const start = html.indexOf("function syncComposer()");
  if (start < 0) throw new Error("找不到 syncComposer");
  const end = html.indexOf("\n// ---- ", start);
  return html.slice(start, end < 0 ? start + 8000 : end);
}

describe("装配条挂载点（防再次脱钩）", () => {
  it("index.html 里有能力条与理由弹层两个容器", async () => {
    const html = await readFile(join(process.cwd(), "ui/public/index.html"), "utf8");
    expect(html).toContain('id="composer-capability-chips"');
    expect(html).toContain('id="composer-capability-why"');
  });

  it("app.js 的 parts 不把 assembly / assemblyWhy 写死成 null", async () => {
    const app = await readFile(join(process.cwd(), "ui/public/app.js"), "utf8");
    expect(app).not.toMatch(/assembly:\s*null/);
    expect(app).not.toMatch(/assemblyWhy:\s*null/);
  });

  it("parts.assembly 指向的 id 与 index.html 对得上（两边同名才算接线）", async () => {
    const [html, app] = await Promise.all([
      readFile(join(process.cwd(), "ui/public/index.html"), "utf8"),
      readFile(join(process.cwd(), "ui/public/app.js"), "utf8"),
    ]);
    const ids = [...app.matchAll(/getElementById\("(composer-capability-[a-z]+)"\)/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });

  it("syncComposer 一带真的调用 patchCapabilityBar（不是只在 import/注释里出现）", async () => {
    const html = await readFile(join(process.cwd(), "ui/public/index.html"), "utf8");
    // 只锁函数体一带：名字在 603 行的 import 列表里也出现，全文件断言会把
    // 「import 了但没调用」当成「线还在」——删掉调用那一行它照样全绿。
    expect(syncComposerRegion(html)).toContain("patchCapabilityBar(");
  });

  it("syncComposer 一带的核查格接的是 verifyToggle 的接线，不只是提到过它", async () => {
    const html = await readFile(join(process.cwd(), "ui/public/index.html"), "utf8");
    // 断言**接线表达式本身**，不是"这一带出现过这个名字"：函数体里的注释
    // 也写着 verifyToggle（说明"真值是 verifyToggle.checked"），只 toContain
    // 名字的话，把接线删掉、注释留着，它照样绿——这正是上面那条调用点锁
    // 注释里点出的同一种退化，换个形式而已。
    expect(syncComposerRegion(html)).toMatch(/verify:\s*verifyToggle\?\.checked === true/);
  });
});
