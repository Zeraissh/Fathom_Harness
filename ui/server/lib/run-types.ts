/**
 * UI 服务端运行态的内部类型：StoredRun 及其挂着的审批 / 计划 / 提问 / 交接状态。
 * 从 ui/server.ts 原样迁出（拆分阶段 1）；只有类型，不含逻辑。
 */
import { type ServerResponse } from "node:http";
import { AgentLoop } from "../../../src/loop.js";
import { type VerifiedRunResult } from "../../../src/orchestrate.js";
import { type CostResult } from "../../../src/pricing.js";
import { type ContextPlan } from "../../../src/context-window.js";
import { type PublicWorkspaceGit } from "../../../src/workspace-git.js";
import type { Plan, PlanNodeState } from "../../../src/planner.js";
import type Anthropic from "@anthropic-ai/sdk";
import { type UserQuestion } from "../../../src/tools/ask-user.js";
import {
  type LedgerApprovalsTally,
  type LedgerCompactionTally,
  type LedgerHooksTally,
  type LedgerRecoveryTally,
  type ToolTally,
} from "../../../src/ledger.js";
import {
  RunHistoryWriter,
  type WorkspaceFace,
  type ArchivedApprovalGrant,
  type ArchivedCheckpoint,
} from "../../history.js";
import { type FileRewindRecord } from "../../conversation-rewind.js";
import { type DurableRunState } from "../../../src/run-state.js";
import { type TraceSpan } from "../../../src/trace.js";
import type {
  Tool,
  Effort,
  SharedRunBudget,
  ExecutionBroker,
  ExecutionBoundaryStatus,
} from "../../../src/types.js";
import type { Verdict } from "../../../src/verifier.js";
import { RUN_OUTCOMES } from "./plan.js";

/**
 * `source` 是自由字符串而非字面量联合：并行编排（runPlanned）的来源形如
 * "s1/main"、"s1/verifier"，本轮虽不接，但契约先放开，避免日后破坏性变更。
 */
export interface SSEEvent {
  seq: number;
  source: string;
  /** 服务端接收时刻——审批等待时长 = ts(approval_resolved) − ts(approval_request) */
  ts: number;
  event: Record<string, unknown>;
}

export interface PendingApproval {
  toolUseId: string;
  name: string;
  input: unknown;
  /** 规范化 JSON 的 SHA-256；常驻规则只能复用完全相同的输入 */
  inputHash: string;
  /** 当前宿主工具定义的授权上限；客户端不能扩大 */
  grantPolicy: ResolvedApprovalGrantPolicy;
  /** 工具 schema/权限/描述摘要；工具定义变化即失效 */
  toolFingerprint?: string;
  /** 发出该请求的事件 seq —— 审批的唯一键，见 approvalId() */
  requestSeq: number;
  at: number;
  respond: (decision: "allow" | "deny", reason?: string) => void;
}

export interface ResolvedApproval {
  decision: "allow" | "deny";
  reason?: string;
  at: number;
}

export type ExactInputApprovalRule = ArchivedApprovalGrant;

export interface ResolvedApprovalGrantPolicy {
  maxScope: "once" | "exact-input";
  maxTtlMs: number;
  maxUses: number;
}

/** run 级终止信息，由 startPlainRun/startVerifiedRun 算出后交给 finalizeRun */
export interface RunEndInfo {
  /**
   * closed = 宿主关停导致的终止（run 本身没跑完），与 run 自己跑完区分开；
   * rejected = 计划确认门被否决——**不是 error**：那是委托方的决定，不是失败。
   * 混进 error 会让界面说谎（V-04 的教训：stopReason 不能压值域）。
   */
  outcome: (typeof RUN_OUTCOMES)[number];
  mainStopReason?: string;
  /**
   * 经 ledgerErrorClass（= classifyApiError 首行）后的错误类。
   * stopReason=error / execution_unavailable 时必填——台账靠它做失败 taxonomy。
   */
  error?: string | null;
}

export interface StoredRun {
  id: string;
  task: string;
  status: "running" | "done";
  verify: boolean;
  createdAt: number;
  finishedAt?: number;
  events: SSEEvent[];
  /**
   * 键是 approvalId（`toolUseId#requestSeq`）而非裸 toolUseId：返工轮会复用同一个
   * toolUseId，按裸 id 存会让后一轮覆盖前一轮，应答时也无法区分是哪一轮的卡片。
   */
  pendingApprovals: Map<string, PendingApproval>;
  respondedApprovals: Map<string, ResolvedApproval>;
  /** 裸 toolUseId 维度的已应答集合，仅用于 409 判定（兼容不带 #seq 的旧式请求） */
  respondedToolUseIds: Set<string>;
  sseClients: Set<ServerResponse>;
  /** 段计数：每个 main/rework 的 done 递增一次，用于把日志按段归属 */
  segmentIndex: number;
  /**
   * 最近一次**核查过的那一轮**的完整结果（含 executionUsage / reworks / 全部裁决）。
   * 会话中心化之后核查是逐轮选项：`outcomeTurn` 记它属于哪一轮——run_end / 台账只在
   * 本轮确实核查过时才带它，列表列则始终报最近一次裁决并标明轮号。
   */
  outcome?: VerifiedRunResult;
  outcomeTurn?: number;
  /**
   * plan 模式收尾时的结构化摘要（子任务 / 结局 / 交接摘要 / 裁决）。计划编排没有
   * 单一执行者正史可续，下一轮对话以它为种子、按单执行者跑——"续的是对话，
   * 不是 DAG"。归档恢复时从 plan / plan_result 事件重建。
   */
  planSummary?: string;
  /**
   * 本 run（single/verified 模式）在宿主级资源表里整体持有的独占标签——
   * 准入时按包声明占用，finalize 释放。plan 模式不走这里：资源按子任务
   * 粒度由调度器经同一张表管理。
   */
  heldResources?: string[];
  /** 最终交付那一段的终止原因，列表接口直接读（不必等客户端订阅） */
  mainStopReason?: string;
  /**
   * 逐段完整会话（V-23）。`done` 事件的 result.messages 一直存在，只是从没
   * 透出过——SSE 里只带 messageCount，几 MB 的会话不能进事件缓冲。
   * 存在这里供 GET /api/runs/:id/transcript 按需拉。
   */
  transcript: { index: number; source: string; messages: unknown[] }[];
  /**
   * 按角色分的工具调用直方图（L6 运行台账）。
   * 在事件旁路里逐条累加，而不是收尾时回扫 `run.events`——续跑会让
   * 事件缓冲跨越多段，回扫容易把上一段的数重复计进来。
   */
  toolTally: ToolTally;
  /** 执行者谱系的恢复决策计数（续跑/停滞/强制收口），与 toolTally 同在事件旁路累加 */
  recoveryTally?: LedgerRecoveryTally;
  /** 上下文压缩计数（全部角色；常规 / 反应式 / 置换块 / 折叠轮），同在事件旁路累加 */
  compactionTally?: LedgerCompactionTally;
  /** 外部 hooks 计数；仅武装时累加。未武装的 run 不建这个字段。 */
  hooksTally?: LedgerHooksTally;
  /** 工具审批结局；在 approval_resolved / approval_expired 旁路累加（不是请求）。 */
  approvalsTally?: LedgerApprovalsTally;
  /**
   * 本对话轮执行者谱系（main / rework / 子任务 main）各段 done.usage.turns 之和。
   * 台账 `turns` 此前只在带核查时有值（读 outcome.executionUsage），裸跑一律 null——
   * 而 max_turns 的 Web 行恰好全是裸跑，"用了多少轮 vs 护栏"就永远算不出来。
   * 每个对话轮起点归零，口径与 executionUsage.turns（本轮各执行段之和）一致。
   */
  turnExecutorTurns?: number;
  /**
   * OBS-02：逐次记账事件的成本折算结果（execution / verification / planner）。
   * 与 toolTally 同一条纪律——事件旁路逐条累加，不在收尾回扫。
   * **视觉不在内**：describe_image 的 client 是宿主级的，调用发生在工具内部，
   * 拿不到是哪个 run 在用它；它只进 /metrics 的成本曲线（与现有 token 记账同边界）。
   */
  costParts?: Array<{ role: string; cost: CostResult }>;
  /** 核查是否撞过轮次上限（"预算不够"这个嫌疑要有据可查，见案例 #8 的三层归因） */
  verifierHitBudget?: boolean;
  /** 本 run 主执行者换端点的次数（MODEL-01a）。未配降级链时恒 0 */
  fallbacks?: number;
  /**
   * 中止闸。**逐 run 一个**——停止的是这一次运行，不是整个宿主。
   * 人按下停止即 abort()，编排层把它传给 AgentLoop，循环在下一次模型调用
   * 之前收手。已经在飞的那个请求不撤（HTTP 已经发出去了，钱已经花了），
   * 所以"停止"的准确语义是**不再往下走**，不是"当场消失"。
   */
  abort?: AbortController;
  /** SAFE-05：逐 run 固定，绝不把全局 bashTool 变成共享可变执行域。 */
  executionBroker?: ExecutionBroker;
  /** 最近一次功能探测/执行边界状态，进入 run_config 与持久事件。 */
  executionBoundaryStatus?: ExecutionBoundaryStatus;
  /**
   * 当前活 run 内的精确输入放行 grant。
   *
   * 四条边界，缺一条这个功能就从"省事"变成"把审批门拆了"：
   *   ① **逐 run**，archive fork/new run 绝不继承 active grant；
   *   ② 键绑定 **工具名 + 规范化输入 SHA-256**。同名 bash 换 command、写文件换
   *      path、硬件工具换 device 都必须重新审批；仅对象 key 顺序不同可以复用；
   *   ③ 固定 TTL + 最大使用次数，工具定义 fingerprint 改变立即失效；
   *   ④ 自动放行**照样进事件流**（actor: "auto-rule"），且留下 grantId/hash。
   */
  autoAllow?: Map<string, ExactInputApprovalRule>;
  /** 本次运行的装配（V-24：可逐 run 覆盖，不再是进程级常量） */
  packName?: string;
  /** 侧栏短标题（启发式或首轮后的模型摘要） */
  title?: string;
  /** 自动匹配领域包时 router 的决定，给界面照实说 */
  packRoute?: { pack: string | null; reason: string };
  effort?: Effort;
  rubric?: string;
  /**
   * 逐 run 上下文预算（MEM-01 窗口 / 预算分离；请求体 `contextTokenLimit`）。建 run 时已按
   * [32k, 窗口 − maxTokens − 边际] 校验过；缺省 = env > 包 > 默认 150k。续跑 / 派生沿用。
   */
  contextTokenLimit?: number;
  /** 最近一次 buildConfig 解析出的窗口 / 预算计划（台账记的是它，不是收尾时重算的） */
  contextPlan?: ContextPlan;
  /** 档案来源。cli = CLI 写下的；缺省 = Web。列表只在 cli 时标徽章。 */
  host?: "cli" | "web";
  /** V-27：编排模式。plan = 走 runPlanned；design = 设计模式门面（单执行者） */
  mode?: "single" | "plan" | "design";
  /** 侧栏 Work/Code 脸；旧档案缺省，列表按 packName=design 回退 */
  workspace?: WorkspaceFace;
  /**
   * 设计门面。档案 mode 仍是 single|plan；直播可暂为 design。
   * 追问按合同改成 single 执行时必须留下这个字段，列表才不会像换了一种产品。
   */
  facade?: "design";
  /** 设计模式路由结果，给界面照实说 */
  designRoute?: {
    id: string | null;
    reason: string;
    seed: string;
    kind: string;
    bundle?: string | null;
    extraSeeds?: string[];
  };
  concurrency?: number | "auto";
  /**
   * 谱系 token/轮次硬顶。缺省 true（真实宿主默认 2M / 120）。
   * false = 本 run 不注入 maxTokensBudget / maxTotalTurns，不会 budget_exhausted。
   */
  lineageBudget?: boolean;
  /**
   * 日预算门。缺省 true（若宿主配了 AGENT_UI_DAILY_TOKEN_BUDGET）。
   * false = 本请求与后续追问跳过 dailyBudgetRefusal。
   */
  dailyBudget?: boolean;
  /**
   * V-28 多轮对话：会话正史（执行者谱系 main/rework 最后一段的完整消息）与本轮的
   * loop 实例。会话中心化之后每轮**新建** AgentLoop：预算与 Context 水位从检查点
   * 延续（与归档派生 / 同 run 热恢复同一口径），不再靠"活对象还在"才能续——
   * 那正是"执行阶段失败就再也续不上"的来源之一。
   */
  loop?: AgentLoop;
  history?: Anthropic.MessageParam[];
  /** 写出这段正史的执行者角色 id（模型库 roles.executor） */
  lastExecutorRoleId?: string;
  /** 写出这段正史的端点身份键（provider|model|origin） */
  lastExecutorIdentityKey?: string;
  /** 写出这段正史时的模型名——换模型 briefing 用 */
  lastExecutorModel?: string;
  /**
   * 信息队列·排队指令（委托方："等队列结束后再发送"）。运行中收到、本轮结束后
   * 由宿主拼成一条自动续跑（见 finalizeRun 尾部的 flushQueuedMessagesAfterDone）。
   * 崩溃恢复由 events.jsonl 里的 message_queued / message_queue_updated 重放重建。
   */
  messageQueue?: string[];
  /**
   * 信息队列·插队指令（"插队重新让 agent 思考"）。loop 在下一次模型调用前
   * drain 进正史；本轮没赶上的余量在收尾时并入自动续跑——消息不丢。
   */
  steeringQueue?: string[];
  /** 已进行的对话轮数（第 1 轮 = 建 run 时那次提交） */
  conversationTurn: number;
  /**
   * 对话轮驱动世代。follow-up / flush / 首轮各占一段；finalize 必须带同一世代，
   * 否则不得发 run_end、不得拆 execution broker。真机事故：planner 抢先收尾
   * 把还在跑的执行者 bash 拆成 "Execution broker is disposed."
   */
  turnDriverEpoch?: number;
  /** 当前是否有一段对话轮驱动在飞（比 status=running 更早立上，挡住 TOCTOU） */
  turnDriverActive?: boolean;
  /** V-29：本次运行的工作目录（工具写入圈禁根），必来自白名单 */
  workdir?: string;
  /** 工作区 git 身份（不带 remote URL）。跟 workdir 走，换包不消失。 */
  workspaceGit?: PublicWorkspaceGit;
  /** 勾选的额外白名单目录。写入圈 = 主 workdir ∪ 这一项，不再拷整张白名单。 */
  extraWorkdirs?: string[];
  /** 可选：本次运行所属项目。slug / 侧栏分组跟这个 id，不是 workdir 末段。 */
  projectId?: string;
  /** 战役 id。导演与子对话共用；注入宿主缺省不落盘。 */
  campaignId?: string;
  campaignRole?: "director" | "child";
  /** 子对话共享父执行谱系预算（同一引用）。 */
  sharedBudget?: SharedRunBudget;
  /** 子对话继承父资源标签：不重占、finalize 不释放。 */
  inheritResources?: boolean;
  campaignMailTool?: Tool;
  /** V-30：本次运行是否启用已配置的独立角色模型 */
  useVerifierModel?: boolean;
  usePlannerModel?: boolean;
  /**
   * 计划确认门（backlog §5.1）：planner 出计划后阻塞，等委托方批准才开跑。
   *
   * **默认关**，逐 run 显式开。不默认开的理由是宿主也被脚本化驱动（eval、
   * 契约测试、无人值守跑批）——默认阻塞会把那些场景全部挂死，而"挂死等人"
   * 正是 V-01 修掉的那类失效。
   *
   * 语义上这是 docs 里"一人公司"那条路线的签字位：人上移为定义任务、
   * 定验收标准、担责，可程序化的执行交给 agent。`runPlanned` 的 onPlan
   * 本来就是 await 的（orchestrate.ts），文档字符串写着"宿主可展示计划、
   * 做人工把关"——harness 侧零改动，缺的一直只是宿主接这条线。
   */
  planGate?: boolean;
  /** 计划门挂起态；同一 run 至多一次（计划只出一次，不像审批会跨返工轮复用） */
  pendingPlan?: PendingPlan;
  planDecision?: { decision: "approve" | "reject"; at: number };
  /**
   * §5.2：给执行者装 `ask_user`。**默认关**（决定 1）——宿主也被脚本化驱动，
   * 默认开会让无人值守的运行挂死等一个不会来的人。
   */
  askUser?: boolean;
  /**
   * 交互式 Web：本 run 自动放行执行者工具。默认关（API / 脚本不能悄悄变成 --yes）。
   * 工作目录圈禁与只读核查边界仍在。
   */
  autoApprove?: boolean;
  /**
   * D3：若请求带了 permissionMode，记下档名；装配条仍展开真实开关。
   * 未带模式、或开关与预设不符时为 undefined（自定义）。
   */
  permissionMode?: "manual" | "plan" | "auto";
  /** 当前提问挂起态；计划并发下其它提问进入 questionQueue，不能覆盖这一项。 */
  pendingQuestion?: PendingQuestion;
  /** 多执行者并发调用 ask_user 时的宿主级串行队列。 */
  questionQueue?: QueuedQuestion[];
  /**
   * 本 run 的 ask_user 工具实例。**必须缓存**：配额是逐实例计数的，
   * buildConfig 每次新造一个等于配额永远用不完（决定 2 当场作废）。
   */
  askUserTool?: Tool;
  /**
   * 不挡对话的「下一步」提议。工具立刻返回；人点同意才开子 run。
   * 文案以包声明为准，不采信模型自己写的按钮字。
   */
  handoffProposal?: HandoffProposalState;
  proposeHandoffTool?: Tool;
  /** AGENT-02：spawn_task 实例缓存（与 ask_user 同款理由） */
  spawnTaskTool?: Tool;
  /** 宿主注入的计划（handoff 同意后）：跳过 planner，也不开计划确认门 */
  injectedPlan?: Plan;
  /**
   * AGENT-01：上一份计划的节点状态 + 已通过节点交接摘要。
   * 重规划时喂给 runPlanned.replan；普通追问不碰。
   */
  planNodes?: PlanNodeState[];
  planHandoffs?: Record<string, string>;
  // ---- B2 运行历史落盘 ----
  /** 本次进程内的落盘写入器；无历史根或显式关闭时缺省（history 一名已被会话正史占用） */
  archiveWriter?: RunHistoryWriter;
  /** true = 从磁盘恢复的归档运行：父档案只读；有检查点时可派生新 run 续跑。 */
  archived?: true;
  /** 归档目录（events/transcript 按需读的来源） */
  archiveDir?: string;
  /** 归档的懒加载：首次访问 events/transcript 时才付读盘代价，且只付一次 */
  hydration?: Promise<void>;
  /** 归档的裁决摘要（列表列用）；活 run 走 outcome，两者在 runSummary 合流 */
  archivedOutcome?: {
    finalPassed: boolean | null;
    reworks: number | null;
    verdict: Verdict | null;
    judgedTurn?: number;
  };
  /** 最近一个完整 main 段的可恢复检查点；归档本身保持只读，续跑会派生新 run。 */
  checkpoint?: ArchivedCheckpoint;
  /** 从 checkpoint 恢复的只读授权审计；永不装进 autoAllow。 */
  archivedApprovalGrantAudit?: ArchivedApprovalGrant[];
  /** 派生谱系。continuedFrom 是直接父级，rootRunId 是最初祖先。 */
  continuedFrom?: string;
  rootRunId?: string;
  /** 本轮收尾摘要（执行者最后一段正文的首句）；列表与 fort 续跑沿用 */
  conversationRecap?: string;
  /**
   * 新开 run 时宿主装配的开机背景（同 workdir 最近会话等）。
   * 只进执行者首轮任务书 / fresh 续跑反馈，不改写委托方原话、不冒充正史。
   */
  bootContext?: string;
  /** 委托方点名引用的【引用】块；与 sibling boot 分开，不改 formatSiblingBootContext。 */
  citeContext?: string;
  /** 本 run 点名引用的会话（进 run_config，供界面画出引用了谁/哪些文件） */
  cited?: Array<{ runId: string; title: string; artifacts: string[]; workdirLabel?: string }>;
  /** 仅供刚派生的新 run 装配首轮；完成后 checkpoint 会从真实 done 事件重建。 */
  resumeBudget?: SharedRunBudget;
  initialContextInputTokens?: number;
  /**
   * RUN-01 / ADR-003：进程内 Durable RunState 游标；与 `state.json` 同步。
   * 崩溃相收成 closed/interrupted；Phase 2 在 interrupted+checkpoint 时可同
   * runId 段边界续跑（不恢复 live loop / active grant）。
   */
  durableState?: DurableRunState;
  // ---- OBS-01 trace ----
  /**
   * 对话回退：子 run 是裁到 parent.seq 的快照；谱系拼聊天时在这一头截断，
   * 不再把父 run 裁点之后的轮次拼回来。
   */
  rewindFrom?: { parentRunId: string; seq: number; revertFiles: boolean };
  /** write_file 等调用前的 before 镜像（进程内）；落盘在档案 rewinds/ */
  fileRewindSnapshots?: FileRewindRecord[];
  fileRewindBlobs?: Map<string, Buffer>;
  /** 本 run 根 span id；子 span 挂在其下 */
  traceRunSpanId?: string;
  /** tool_call → tool_result 开闭配对 */
  openToolSpans?: Map<string, TraceSpan>;
  /** model_call_start → model_call_end 开闭配对 */
  openModelSpans?: Map<string, TraceSpan>;
}

export interface PendingPlan {
  requestSeq: number;
  at: number;
  /** onPlan 里那份活对象：批准时改短句必须写回这里，执行者才看得到 */
  plan: Plan;
  concurrency: number;
  concurrencyMode: "auto" | "fixed";
  plannerMs: number;
  /** 由 waitForPlanDecision 装填：应答或过期时结束等待 */
  settle: (decision: "approve" | "reject" | "expired" | "stopped") => void;
}

export interface HandoffProposalState {
  status: "pending" | "accepted" | "declined";
  id: string;
  handoffId: string;
  summary: string;
  label: string;
  declineLabel: string;
  requestSeq: number;
  childRunId?: string;
}

/**
 * §5.2 需求澄清的挂起态。与计划门同构（同一套挂起/应答/过期三事件），
 * 但**可以出现多次**——配额内每问一次挂一次，所以带 `id` 区分。
 */
export interface PendingQuestion {
  id: string;
  requestSeq: number;
  at: number;
  /** 一次打断里的一组问题（决定 6）——贵的是打断人，不是问题本身 */
  questions: UserQuestion[];
  /**
   * 逐题答复，与 questions 对齐；整体 null = 这次打断没得到任何应答。
   * **都不是错误**——见 ask-user.ts 决定 4。
   */
  settle: (answers: (string | null)[] | null) => void;
}

export interface QueuedQuestion {
  questions: PendingQuestion["questions"];
  resolve: (answers: (string | null)[] | null) => void;
}
