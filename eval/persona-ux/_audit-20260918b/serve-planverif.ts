/**
 * 活页复验宿主：编排补发 verification 事件（2026-09-18 二轮走查 §2 遗留的 H8 另一半）。
 *
 * 为什么用脚本化模型而不是真模型：本刀要验的是**事件 → 渲染**这条链，不是模型
 * 行为。确定性脚本能精确造出"两个子任务、包不同、裁决一红一绿"的样本——真模型
 * 造不出来（也烧钱）。真模型那条路径由 test/ui-server.test.ts 的同名契约测试守。
 *
 * 脚本刻意让 s1 先红后绿（返工一轮）：这样对话里同时出现「返工第 1 轮」、
 * 归属行与「（静态推导）」徽标三件事，一屏验完。
 *
 * 起法（.claude/launch.json 的 planverif，:4207）：
 *   AGENT_UI_PORT=4207 npx tsx eval/persona-ux/_audit-20260918b/serve-planverif.ts
 */
import { createUiServer } from "../../../ui/server.js";
import { FakeModelClient, fakeMessage, textBlock } from "../../../test/helpers.js";

const planJson = JSON.stringify({
  subtasks: [
    {
      id: "s1",
      title: "核对统计口径",
      pack: "consult", // 白名单 ["ls","head",...] 无可运行器 → 裁决是静态推导
      description: "汇总三份日志的行数",
      acceptance: ["三份都数过"],
      dependsOn: [],
    },
    {
      id: "s2",
      title: "跑脚本复算",
      pack: "python-coding", // 白名单含 "python -m pytest" → 核查者能亲自运行
      description: "用脚本复算并对比",
      acceptance: ["脚本跑通、数字一致"],
      dependsOn: ["s1"],
    },
  ],
});
const verdict = (passed: boolean, summary: string, issues: string[] = []) =>
  fakeMessage([textBlock(JSON.stringify({ passed, issues, summary }))], "end_turn");

const script = [
  fakeMessage([textBlock(["```json", planJson, "```"].join("\n"))], "end_turn"),
  fakeMessage([textBlock("s1 数完了：三份共 128 行")], "end_turn"),
  verdict(false, "需要返工", ["s1 的第三份只数了表头"]),
  fakeMessage([textBlock("s1 返工：改用 grep -c 重数")], "end_turn"),
  verdict(true, "三份都对上了"),
  fakeMessage([textBlock("s2 复算完成，与 s1 一致")], "end_turn"),
  verdict(true, "脚本跑通，数字逐位一致"),
];

const host = process.env.AGENT_UI_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_UI_PORT ?? 4207);
const workdir = process.env.AGENT_UI_WORKDIR ?? "D:/Work/scratch/fathom-planverif-20260918/work";
const history = process.env.AGENT_RUN_HISTORY ?? "D:/Work/scratch/fathom-planverif-20260918/history";

const handle = createUiServer({
  modelClient: new FakeModelClient(script),
  workdir,
  history,
  ledger: false, // 假模型的运行不记账——记了就是假证据
});

handle.server.listen(port, host, () => {
  console.log(`planverif host → http://${host}:${port}  workdir=${workdir}  history=${history}`);
});
