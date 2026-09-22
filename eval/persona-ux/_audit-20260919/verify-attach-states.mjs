/**
 * 计划 2 · Task 3 活页验收（A4 / A5）：非图 chip、上传进度与失败出路。
 *
 * 量三件事（brief Step 7）：
 * ① 超过 20MB 的假文件（Buffer.alloc，不真生成内容）走客户端预检——
 *    条目带原因、留在清单里不被清掉，且**一次 XHR 都不发**（预检挡住了白传）；
 * ② 一个 .pdf 走非图 chip——有类型图标（ph-file-pdf）、有「附件 #N」；
 * ③ 失败条目有「重试」按钮，点它真的重发（拦 POST /api/upload 数次数）。
 * ④（附）：失败图片不挂进缩略图条——没编号时引用按钮会插「Image #undefined」，
 *    重试成功后才带着编号进条。
 *
 * Fix round 1 起，① 的量改为「超限条目**没有**重试钮」——超限重试只会被预检
 * 原样再拦一次，给按钮就是给空承诺。
 *
 * ③④ 的失败用注入法：第一次 POST「会断.txt」「图.png」时回 200 但 body 不是
 * JSON——uploadOne 判「非 JSON 就是失败」。不用 500：非 2xx 会在控制台刷
 * 「Failed to load resource」，把「0 控制台错误」这条验收搅浑。
 * 网络层失败在宿主本地跑不出来，注入才有确定性的失败态可点。
 *
 * 本机事实（brief 背景，如实记）：宿主在 loopback 上，进度条基本看不见。
 * 进度不单独量（uploading 态在 loopback 上一闪而过，量不到稳定的中间态）；
 * 上传链路用 ① 的「预检 XHR=0」与 ③ 的「点重试 XHR 计数 +1」间接验。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone", "1"); } catch {} });

// 数 POST /api/upload 的次数；「会断.txt」「图.png」「会断2.txt」的第一次必败
// （200 + 非 JSON body），第二次放行。DELETE /api/upload 只数次数（Fix round 1 的 ⑤）。
const attempts = new Map();
let deletes = 0;
await page.route("**/api/upload", async (route) => {
  const req = route.request();
  if (req.method() === "DELETE") { deletes += 1; return route.continue(); }
  if (req.method() !== "POST") return route.continue();
  let name = "";
  try { name = req.postDataJSON()?.name ?? ""; } catch { /* 读不到 body 也放行 */ }
  const n = (attempts.get(name) ?? 0) + 1;
  attempts.set(name, n);
  if (["会断.txt", "图.png", "会断2.txt"].includes(name) && n === 1) {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "注入故障：不是 JSON" });
  } else {
    await route.continue();
  }
});

const postCount = () => [...attempts.values()].reduce((a, b) => a + b, 0);

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);

const workdir = await page.evaluate(() => document.getElementById("workdir-select")?.value ?? "");
console.log(`工作目录下拉当前值：${workdir || "（空——服务端用默认目录）"}`);

// ① 超限假文件：21MB，走预检，一次 XHR 都不该发
await page.setInputFiles("#file-upload", {
  name: "大文件.bin",
  mimeType: "application/octet-stream",
  buffer: Buffer.alloc(21_000_000),
});
await page.waitForTimeout(600);
const big = await page.evaluate(() => {
  const items = [...document.querySelectorAll("#upload-list li")];
  const failed = items.find((li) => li.classList.contains("upload-item--failed"));
  return {
    listLen: items.length,
    failedInList: Boolean(failed),
    errText: failed?.querySelector(".upload-err")?.textContent ?? null,
    hasRetryBtn: Boolean(failed?.querySelector("[data-upload-retry]")),
  };
});
console.log(`① 超限假文件：清单 ${big.listLen} 条 · 失败条目在清单里=${big.failedInList} · 原因="${big.errText}" · 有重试钮=${big.hasRetryBtn}（应为 false——超限不给空按钮）`);
console.log(`   预检后 XHR 次数：${postCount()}（应为 0——20MB 没白传）`);

// ② .pdf 非图 chip：等它传完（done），看图标与编号
await page.setInputFiles("#file-upload", {
  name: "报告.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% 假 PDF，只验 chip 不验内容\n"),
});
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li")].some((li) =>
    li.querySelector("code")?.textContent === "uploads/报告.pdf" &&
    li.textContent.includes("附件 #")),
  undefined, { timeout: 8000 },
).catch(() => {});
const pdf = await page.evaluate(() => {
  const li = [...document.querySelectorAll("#upload-list li")].find((x) =>
    x.querySelector("code")?.textContent === "uploads/报告.pdf");
  return {
    found: Boolean(li),
    icon: li?.querySelector(".upload-no i")?.className ?? null,
    tag: li?.querySelector(".upload-no")?.textContent ?? null,
  };
});
console.log(`② 非图 chip：条目在=${pdf.found} · 图标="${pdf.icon}" · 编号="${pdf.tag}"`);

// ③ 注入失败 → 重试真的重发
await page.setInputFiles("#file-upload", {
  name: "会断.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("第一次会断，重试能成\n"),
});
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li.upload-item--failed code")].some((c) => c.textContent === "会断.txt"),
  undefined, { timeout: 8000 },
).catch(() => {});
const before = postCount();
const failedTxt = await page.evaluate(() => {
  const li = [...document.querySelectorAll("#upload-list li")].find((x) =>
    x.classList.contains("upload-item--failed") && x.querySelector("code")?.textContent === "会断.txt");
  return {
    errText: li?.querySelector(".upload-err")?.textContent ?? null,
    hasRetryBtn: Boolean(li?.querySelector("[data-upload-retry]")),
  };
});
await page.click('li.upload-item--failed:has(code:text-is("会断.txt")) [data-upload-retry]');
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li")].some((li) =>
    li.querySelector("code")?.textContent === "uploads/会断.txt" &&
    li.textContent.includes("附件 #")),
  undefined, { timeout: 8000 },
).catch(() => {});
const after = postCount();
const retried = await page.evaluate(() => {
  const li = [...document.querySelectorAll("#upload-list li")].find((x) =>
    x.querySelector("code")?.textContent === "uploads/会断.txt");
  return { doneInList: Boolean(li), tag: li?.querySelector(".upload-no")?.textContent ?? null };
});
console.log(`③ 注入失败：原因="${failedTxt.errText}" · 有重试钮=${failedTxt.hasRetryBtn} · 点重试前 XHR=${before} 后=${after} · 重试后 done=${retried.doneInList} 编号="${retried.tag}"`);

// 附（Fix round 1 后）：超限条目不挂重试钮——预检会原样再拦、点了没反应，
// 那是空按钮。量"没有钮"，顺带确认 XHR 计数没被任何误点带起来。
const bigNoRetry = await page.evaluate(() => {
  const li = [...document.querySelectorAll("#upload-list li")].find((x) =>
    x.classList.contains("upload-item--failed") && x.querySelector("code")?.textContent === "大文件.bin");
  return {
    stillFailed: Boolean(li),
    retryBtnCount: li ? li.querySelectorAll("[data-upload-retry]").length : -1,
  };
});
console.log(`   超限条目：仍失败=${bigNoRetry.stillFailed} · 重试钮数=${bigNoRetry.retryBtnCount}（应为 0——超限不给空按钮） · XHR=${postCount()}`);

// ④ 失败图片不挂进缩略图条：没有编号，引用按钮会插「Image #undefined」——
// 那是 Task 2 的引用路径被"条目先挂清单"改坏的样子。注入首败，量两条：
// 失败时条上**没有**它的引用按钮；重试成功后它带着编号进条。
// 判据**不许按 alt 找钮**：buggy 状态下失败条目的 path 还是原始名（file.name，
// 即「图.png」），img 的 alt 是「图.png」而不是「uploads/图.png」——按 alt
// 过滤永远匹配不到、照旧报 0。缺陷的真实形态是 data-upload-cite="undefined"，
// 按它判，门槛被拆时当场红。成功那半（alt 是 uploads/图.png）不受影响。
await page.setInputFiles("#file-upload", {
  name: "图.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
});
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li.upload-item--failed code")].some((c) => c.textContent === "图.png"),
  undefined, { timeout: 8000 },
).catch(() => {});
const imgFailed = await page.evaluate(() => {
  const inList = [...document.querySelectorAll("#upload-list li.upload-item--failed code")]
    .some((c) => c.textContent === "图.png");
  const citeBtns = [...document.querySelectorAll("#composer-media [data-upload-cite]")];
  const undefinedCite = citeBtns.filter((b) => b.getAttribute("data-upload-cite") === "undefined").length;
  return { inList, undefinedCite };
});
await page.click('li.upload-item--failed:has(code:text-is("图.png")) [data-upload-retry]');
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li")].some((li) =>
    li.querySelector("code")?.textContent === "uploads/图.png"),
  undefined, { timeout: 8000 },
).catch(() => {});
const imgDone = await page.evaluate(() => {
  const inList = [...document.querySelectorAll("#upload-list li")].some((li) =>
    li.querySelector("code")?.textContent === "uploads/图.png");
  const citeBtns = [...document.querySelectorAll("#composer-media [data-upload-cite]")];
  const mine = citeBtns.filter((b) => b.querySelector("img")?.getAttribute("alt") === "uploads/图.png");
  return { inList, stripCiteCount: mine.length, citeTarget: mine[0]?.getAttribute("data-upload-cite") ?? null };
});
console.log(`④ 失败图片：失败时在清单=${imgFailed.inList} · 条上 data-upload-cite="undefined" 的钮=${imgFailed.undefinedCite}（应 0——按缺陷形态判，不按 alt）`);
console.log(`   重试成功后：在清单=${imgDone.inList} · 条里引用按钮=${imgDone.stripCiteCount} · 编号=${imgDone.citeTarget}`);

// ⑤（Fix round 1）：没落过盘的失败条目删除时**一次 DELETE 都不该打**——
// 盘上本来就没有，打了必被拒、还会把假话「盘上文件保留」打给用户。
await page.setInputFiles("#file-upload", {
  name: "会断2.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("删我不该碰盘\n"),
});
await page.waitForFunction(() =>
  [...document.querySelectorAll("#upload-list li.upload-item--failed code")].some((c) => c.textContent === "会断2.txt"),
  undefined, { timeout: 8000 },
).catch(() => {});
const deletesBefore = deletes;
await page.click('li.upload-item--failed:has(code:text-is("会断2.txt")) [data-upload-remove]');
await page.waitForTimeout(400);
const delRes = await page.evaluate(() => ({
  gone: ![...document.querySelectorAll("#upload-list li code")].some((c) => c.textContent === "会断2.txt"),
}));
console.log(`⑤ 失败条目删除：清单里已移除=${delRes.gone} · DELETE 次数 ${deletesBefore}→${deletes}（应 0 次——没落过盘不许打 DELETE）`);

console.log("\n控制台错误：", errs.length ? errs.slice(0, 5) : "零");
await browser.close();

const ok =
  big.failedInList && big.errText?.includes("文件过大") && !big.hasRetryBtn &&
  pdf.found && pdf.icon?.includes("ph-file-pdf") && pdf.tag?.includes("附件 #1") &&
  failedTxt.hasRetryBtn && after - before === 1 && retried.doneInList &&
  bigNoRetry.stillFailed && bigNoRetry.retryBtnCount === 0 &&
  imgFailed.inList && imgFailed.undefinedCite === 0 &&
  imgDone.inList && imgDone.stripCiteCount === 1 && imgDone.citeTarget === "3" &&
  delRes.gone && deletes === 0 &&
  errs.length === 0;
console.log(ok ? "✅ 三条都成立（附④：失败图片不进缩略图条，重试成功带编号进条；⑤：失败条目删除不打 DELETE），0 控制台错误" : "★ 有量没达标——看上面哪一行不对");
process.exitCode = ok ? 0 : 1;
