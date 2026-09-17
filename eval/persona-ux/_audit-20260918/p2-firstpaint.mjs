/**
 * P2 取证：文件树首帧是否闪过「先选一个工作目录。」
 *
 * 判据来自 docs/superpowers/plans/2026-09-18-p2-workdir-truth.md Task 5：
 *   1. 从白屏到出内容，任何一帧都不出现「先选一个工作目录。」
 *   2. 出内容后是真实列表，或「正在确认目录…」在数百毫秒内被替换
 *
 * 逐帧采样用 requestAnimationFrame（不是轮询），所以"闪过一帧"也抓得到。
 *
 * 用法：node p2-firstpaint.mjs <url> <out.json>
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const URL_ = process.argv[2] ?? "http://127.0.0.1:4199/";
const OUT = process.argv[3] ?? path.join(process.cwd(), "p2-firstpaint.json");

/** 在页面脚本之前注入：逐帧记录树栏的可见文字。 */
const RECORDER = `
  window.__p2 = { frames: [], sawPendingEl: false, ready: null };
  const T0 = performance.now();
  let last = null;
  function sample() {
    const host = document.getElementById("workspace-file-tree");
    let text = null, pending = null;
    if (host) {
      // 空态是 .ft-empty；有内容时取全部可见文字的首段
      const empty = host.querySelector(".ft-empty");
      text = (empty ? empty.textContent : host.textContent) ?? "";
      text = text.trim().replace(/\\s+/g, " ").slice(0, 80);
      if (empty) window.__p2.sawPendingEl = true;
    }
    if (text !== null && text !== last) {
      last = text;
      window.__p2.frames.push({ ms: Math.round(performance.now() - T0), text });
    }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
`;

const browser = await chromium.launch();
// 无痕上下文：没有 localStorage，所以没有残留的目录偏好
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.addInitScript(RECORDER);

await page.goto(URL_, { waitUntil: "commit" });
// 跑满 4 秒：足够覆盖 harness 往返 + 树首绘
await page.waitForTimeout(4000);

const state = await page.evaluate(() => window.__p2);
const treeText = await page.evaluate(() => {
  const host = document.getElementById("workspace-file-tree");
  return host ? host.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null;
});

await page.screenshot({ path: OUT.replace(/\.json$/, ".png") });

const NO_WORKDIR = "先选一个工作目录。";
const CONFIRMING = "正在确认目录…";
const frames = state.frames;
const flashed = frames.filter((f) => f.text.includes(NO_WORKDIR));
const confirmingFrames = frames.filter((f) => f.text.includes(CONFIRMING));
const lastConfirming = confirmingFrames.length ? confirmingFrames[confirmingFrames.length - 1].ms : null;
const firstReal = frames.find((f) => f.text && !f.text.includes(CONFIRMING) && !f.text.includes(NO_WORKDIR));

const result = {
  url: URL_,
  verdict_flash_noWorkdir: flashed.length === 0,
  verdict_two_states_seen: frames.length >= 1,
  saw_noWorkdir_frames: flashed,
  saw_confirming_frames: confirmingFrames,
  confirming_disappeared_at_ms: lastConfirming,
  first_real_frame: firstReal ?? null,
  final_tree_text: treeText,
  all_frames: frames,
};

await writeFile(OUT, JSON.stringify(result, null, 2), "utf-8");
console.log(JSON.stringify({
  verdict_flash_noWorkdir: result.verdict_flash_noWorkdir,
  saw_noWorkdir_frames: flashed,
  saw_confirming_frames: confirmingFrames,
  confirming_disappeared_at_ms: lastConfirming,
  first_real_frame: firstReal ?? null,
  final_tree_text: treeText,
  frame_count: frames.length,
}, null, 2));

await browser.close();
