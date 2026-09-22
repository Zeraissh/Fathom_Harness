/**
 * 活页探针（计划 3 · T4）：/api/workspace/git/diff —— 单个文件「工作区相对
 * HEAD」的真 patch（有行号、有上下文行）。不经浏览器，直接 fetch 端点。
 *
 * 语义如实：这探针量的正是「工作区相对 HEAD」——夹具里 src/app.js 的 M 是
 * 夹具自己造的未提交改动，不是本场 run 的。事件流那条链给不了位置，这条
 * 链给不了 run 归属，两条链各有各的活。
 *
 * 判据（七条）：
 *   ① 夹具里改过的 src/app.js（M）拿到 ≥1 个 hunk，且 header 匹配
 *      @@ -…+…@@（有行号）
 *   ② 未跟踪的 src/new-file.js 拿到全 + 的 hunk（write_file 覆盖场景的
 *      形状——事件流那条链在这里是瞎的，git diff 给得出）
 *   ③ 一个非 git 的 workdir 拿到 present:false 且 note 是人话
 *   ④ 路径越界（../../etc/passwd）被 400 挡住
 *   ⑤ path 指向目录不返 500（审查 Minor #2：目录含未跟踪子文件时曾
 *      EISDIR 漏成 500）——现在是带 note 的结构化结果
 *   ⑥ 终审 I2：workdir 是仓库子目录时，子目录之外的路径（仓库根里的
 *      README.md）被 400 挡住——圈禁第二道（同时落在 workdir 内）活着，
 *      只靠第一道（落在 root 内）这条会漏过去
 *   ⑦ 终审 I2：workdir=子目录 + path=src/app.js（按 workdir 读是错的基、
 *      按 root 读是对的）拿到 repo/src/app.js 的 patch——把「path 一律
 *      按 root 相对」这个契约钉成有判据的事实，不靠人记
 */
import { join } from "node:path";
const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:4201";
const FIXTURE = process.env.FIXTURE_DIR ?? "D:\\Work\\Github_pros\\Agent_Design\\.git-fixture\\git-repo";
// 非 git 的 workdir：**从宿主自己的白名单里现取**（见 resolveNoGit）。
// ★ 计划 4 · T5 修：原来写死 `D:\Work\scratch\fathom-ux-audit-20260918\web-a`，
//   实测它**不在**这个宿主(4201)的白名单里 ⇒ 端点先被"白名单门"拦成 403、
//   body 只有 `{error}` ⇒ 探针读 `d.note` 得空串 ⇒ 判据 ③ 假红。
//   而 403（白名单门）与 200+present:false（非 git 那条路）是**两条不同的路**，
//   拿 403 去判"非 git 的降级"根本量错了对象。白名单是宿主**进程**的启动配置
//   （AGENT_UI_WORKDIRS + 界面里加过的），写死路径必然腐烂 ⇒ 改成现取。
let NOGIT = process.env.NOGIT_DIR ?? null;

const diffUrl = (workdir, path) =>
  `${BASE}/api/workspace/git/diff?workdir=${encodeURIComponent(workdir)}&path=${encodeURIComponent(path)}`;

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? "✅" : "★"} ${name}${detail ? ` —— ${detail}` : ""}`);
}

// 0) 宿主哨兵：端点必须存在（旧代码没有这条路由 → 404）
const alive = await fetch(diffUrl(FIXTURE, "src/app.js"));
if (alive.status === 404) {
  console.log("★★ 宿主 404：/api/workspace/git/diff 不存在（宿主还在服务旧代码）——下面全部作废");
  process.exit(1);
}

// ① 改过的 src/app.js（夹具 M）：≥1 个 hunk，header 有行号
{
  const res = await fetch(diffUrl(FIXTURE, "src/app.js"));
  const d = await res.json();
  const h0 = d.hunks?.[0]?.header ?? "";
  check(
    "① 改过的 src/app.js 有带行号的 hunk",
    res.ok && d.present === true && d.tracked === true && (d.hunks?.length ?? 0) >= 1
      && /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(h0),
    `status=${res.status} hunks=${d.hunks?.length ?? 0} header="${h0}"`,
  );
}

// ② 未跟踪的 src/new-file.js：全 + 行
{
  const res = await fetch(diffUrl(FIXTURE, "src/new-file.js"));
  const d = await res.json();
  const h0 = d.hunks?.[0];
  const lines = h0?.lines ?? [];
  const allPlus = lines.length > 0 && lines.every((l) => l.sign === "+");
  check(
    "② 未跟踪的 src/new-file.js 全 + 行",
    res.ok && d.present === true && d.tracked === false && d.hunks?.length === 1 && allPlus
      && h0.header === `@@ -0,0 +1,${lines.length} @@`,
    `lines=${lines.length} header="${h0?.header ?? ""}"`,
  );
}

// ③ 非 git workdir：present:false + 人话
/**
 * 现取一个"**在白名单内、且不是 git 仓库**"的目录：
 * `GET /api/workdirs` 给宿主自己的白名单，逐个问 `GET /api/workspace/git`
 * 看 `present`——第一个 false 的就是。
 * `NOGIT_DIR` 仍可覆盖（但会顺手核对它在不在白名单里，好早发现写死的路径已腐烂）。
 */
async function resolveNoGit() {
  const wl = await fetch(`${BASE}/api/workdirs`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const list = Array.isArray(wl?.workdirs) ? wl.workdirs : [];
  if (NOGIT) {
    console.log(`${list.includes(NOGIT) ? "✅" : "★"} NOGIT_DIR 在白名单内=${list.includes(NOGIT)}（${NOGIT}）`);
    return NOGIT;
  }
  for (const dir of list) {
    if (dir === FIXTURE) continue;
    const g = await fetch(`${BASE}/api/workspace/git?workdir=${encodeURIComponent(dir)}`);
    const gj = g.ok ? await g.json().catch(() => null) : null;
    if (gj && gj.present === false) { NOGIT = dir; return dir; }
  }
  return null;
}
{
  const dir = await resolveNoGit();
  if (!dir) {
    check("③ 非 git 的 workdir 拿到 present:false 且 note 是人话", false,
      `白名单（GET /api/workdirs）里找不到非 git 目录——这条量不了`);
  } else {
    const res = await fetch(diffUrl(dir, "whatever.txt"));
    const d = await res.json().catch(() => ({}));
    check(
      "③ 非 git 的 workdir 拿到 present:false 且 note 是人话",
      res.ok && d.present === false && Array.isArray(d.hunks) && d.hunks.length === 0
        && typeof d.note === "string" && d.note.length > 0,
      `dir=${dir} status=${res.status} note="${d.note ?? ""}"`,
    );
  }
}

// ④ 路径越界：400
{
  const res = await fetch(diffUrl(FIXTURE, "../../etc/passwd"));
  const body = await res.text();
  check(
    "④ 路径越界（../../etc/passwd）被 400 挡住",
    res.status === 400,
    `status=${res.status} body=${body.slice(0, 120)}`,
  );
}

// ⑤ path 指向目录（夹具的 src/ 里有 M 的 app.js 与 ?? 的 new-file.js，
//    正是审查 Minor #2 的触发形状）：不返 500，给带 note 的结构化结果
{
  const res = await fetch(diffUrl(FIXTURE, "src"));
  const d = await res.json().catch(() => ({}));
  check(
    "⑤ path 指向目录不返 500，给带 note 的结构化结果",
    res.status !== 500 && Array.isArray(d.hunks) && typeof d.note === "string" && d.note.length > 0,
    `status=${res.status} note="${d.note ?? ""}" hunks=${Array.isArray(d.hunks) ? d.hunks.length : "?"}`,
  );
}

// ⑥⑦ 需要夹具的子目录也进白名单：白名单是精确集合，子目录不自动白。
// 探针自己加、自己删（只删自己加的那一次），不留宿主状态。
const SUB = join(FIXTURE, "src");
let addedSub = false;
{
  const listRes = await fetch(`${BASE}/api/workdirs`);
  const list = await listRes.json().catch(() => ({}));
  const inList = Array.isArray(list.workdirs)
    && list.workdirs.some((w) => String(w).toLowerCase() === SUB.toLowerCase());
  if (!inList) {
    const addRes = await fetch(`${BASE}/api/workdirs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: SUB }),
    });
    if (!addRes.ok) {
      console.log(`★★ 白名单加不上 ${SUB}：status=${addRes.status} body=${(await addRes.text()).slice(0, 200)}`);
      process.exit(1);
    }
    addedSub = true;
  }
}

// ⑥ workdir=子目录（fixture/src），path 指到仓库根（README.md）：
//    第一道（落在 root 内）放过，第二道（同时落在 workdir 内）必须 400。
{
  const res = await fetch(diffUrl(SUB, "README.md"));
  const body = await res.text();
  check(
    "⑥ workdir 是仓库子目录时，子目录之外的路径被 400 挡住（圈禁第二道活着）",
    res.status === 400,
    `status=${res.status} body=${body.slice(0, 120)}`,
  );
}

// ⑦ workdir=子目录 + path=src/app.js：按 workdir 读是错的基（src/src/app.js
//    不存在），按 root 读是对的（repo/src/app.js 有 M）——契约说 path 一律
//    按 root 相对，那就把拿到 repo/src/app.js 的 patch 钉成事实。
{
  const res = await fetch(diffUrl(SUB, "src/app.js"));
  const d = await res.json().catch(() => ({}));
  check(
    "⑦ workdir=子目录时 path 仍按 root 相对：拿到 repo/src/app.js 的 patch",
    res.ok && d.present === true && d.tracked === true && d.path === "src/app.js"
      && (d.hunks?.length ?? 0) >= 1,
    `status=${res.status} path="${d.path ?? ""}" hunks=${d.hunks?.length ?? 0}`,
  );
}

// 探针加的临时白名单，探针自己删（只删自己加的那一次）
if (addedSub) {
  await fetch(`${BASE}/api/workdirs`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: SUB }),
  });
}

if (checks.every(Boolean)) {
  console.log("\n✅ 七条全成立：有行号 / 未跟踪全 + / 非 git 人话 / 越界 400 / 目录不 500 / workdir 双检 400 / root 相对契约");
  process.exit(0);
}
console.log("\n★ 有判据没成立，见上。");
process.exit(1);
