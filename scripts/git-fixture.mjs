/**
 * 造一个 **git 支撑的 scratch 工作目录**（计划 2 任务 1）。
 *
 * 为什么需要它：计划 1 把两脸差异收在 `body[data-face]` 上，其中一条是
 * 「git 芯片在 Work 脸藏起」。那条规则的**内容**验过了（摘掉 hidden 后
 * none/flex 翻转正确），**接线**也端到端验过了，但**触发路径一次都没被
 * 真实走过**——宿主上所有 workdir 都不是仓库，芯片恒 hidden。
 *
 * 这不是缺陷（无仓库本就不该显示 git 芯片），但它是"测试绿、CSS 对、
 * 而真实路径从未被执行"的典型，而 Code 脸整族差异（分支、脏状态、PR）
 * 全都要靠这条路径。所以先造一个真的仓库出来。
 *
 * 幂等：重复跑会先清掉再重建（重建前先验哨兵；不认识这个目录就拒跑），
 * 绝不留下半截状态。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? join(process.cwd(), ".git-fixture");
const dir = join(root, "git-repo");

const git = (...args) =>
  execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

/** 哨兵：只有它存在，才允许本脚本整目录重建。见下面那段为什么。 */
const SENTINEL = ".git-fixture-sentinel";

/**
 * 删之前先证明"这是我们自己的目录"。
 *
 * 脚本头注写的是"造 scratch 目录"，但**误传真实项目路径完全可能**，
 * 而下一行是 `rmSync(recursive, force)`——`<root>/git-repo` 这种名字
 * 在 monorepo 包名、教学目录、别人的脚手架里都很常见。**删错一次不可逆**，
 * 所以这里宁可拒跑，也不替人决定。
 *
 * 判据两条，满足其一才允许删：
 *   · 目录不存在——没什么可删的
 *   · 它带着我们上次留下的哨兵文件
 * 否则拒跑并说清原因，让人自己去看一眼。
 */
if (existsSync(dir) && !existsSync(join(dir, SENTINEL))) {
  console.error(
    `拒绝运行：${dir}\n` +
      `它已经存在，但没有本夹具的哨兵文件 ${SENTINEL}——看起来不是这个脚本造的。\n` +
      `删掉它可能是不可逆的数据损失，所以不替你决定。\n` +
      `确认它确实可以删的话，手动删掉再跑一次。`,
  );
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "src"), { recursive: true });

// 哨兵进首次提交（在 git add -A 之前），下次重建才有凭据
writeFileSync(join(dir, SENTINEL), "scripts/git-fixture.mjs 的哨兵：有这个文件才允许本脚本整目录重建。\n");

git("init", "-q");
git("config", "user.email", "fixture@example.invalid");
git("config", "user.name", "Fixture");
git("config", "commit.gpgsign", "false");

writeFileSync(join(dir, "README.md"), "# fixture\n\n这不是给人看的目录，是两脸/PR 差异的活页夹具。\n");
// src/app.js 故意写成多行：未提交改动是中间那一行，前后留不改的行——
// 这样工作区 diff 才有上下文行（sign===" "），T6 判据 2「真 patch」验的就是它们。
// 单行文件改一行，diff 只会是 @@ -1 +1 @@，一条上下文行都没有。
writeFileSync(
  join(dir, "src", "app.js"),
  "// 夹具文件：多行，让未提交改动能带上下文行。\n" +
    "export const answer = 42;\n" +
    "\n" +
    "export function double(n) {\n" +
    "  return n * 2;\n" +
    "}\n",
);
git("add", "-A");
git("commit", "-q", "-m", "chore: 夹具初版");

// 造出「有未提交改动」与「有未跟踪文件」两种状态——git 芯片要显示的就是它们
writeFileSync(
  join(dir, "src", "app.js"),
  "// 夹具文件：多行，让未提交改动能带上下文行。\n" +
    "export const answer = 43;\n" +
    "\n" +
    "export function double(n) {\n" +
    "  return n * 2;\n" +
    "}\n",
);
writeFileSync(join(dir, "src", "new-file.js"), "export const fresh = true;\n");
git("checkout", "-q", "-b", "feat/fixture-branch");

console.log(dir);
