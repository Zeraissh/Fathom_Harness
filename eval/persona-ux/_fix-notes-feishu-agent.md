# 飞书 Agent 中间层（群 @ → run → 回消息）

日期：2026-09-16  
范围：`src/notify.ts`、`ui/serve.ts` 启动行注释、`.env.example` / `README.md` IM 段、`src/cli.ts` env 注释、`test/notify.test.ts`。  
未 commit。未改 `ui/public/app.js` 下一步 chips。

对照常见架构：事件订阅 → 本仓服务 → 飞书 API；大脑仍是已有 loop（`startRun` → `/api/runs`）。中间层补到能当真用，不假装多维表 / 审批已通。仓里没有表格 / 审批 / 云文档半成品。

## 现在群里 @ 实际会发生什么

前提：飞书云要打到公网 HTTPS 的 `POST /api/im/feishu`（本机 `127.0.0.1` 到不了）。`npm run im:tunnel` 只打印 cloudflared 命令。

1. 开放平台把 `im.message.receive_v1` 打到回调。本仓验 `X-Lark-Signature`（Encrypt Key）。坏签名 **401**；没配 Encrypt Key **503**；Verification Token 对不上 **401 事件无效**。
2. 机器人自己发的消息（`sender_type=app`，或 open_id 对上本机器人）丢掉，不当新任务。
3. **群：** 必须带 @ / mention（`mentions[]`、`@_user_N`、`<at>`，或 post 里的 at）。抽出用户问题，剥掉 mention，交给已有 `startRun`。只 @ 没写字 → 忽略。群里闲聊没点名 → 忽略，不开 run。
4. **私聊：** 文本照收（没有 chat_type 的旧事件也按这条，兼容验签测试）。
5. 同一 `chat_id` 同时只开一轮。上一轮还在跑，新消息 **429**（`Retry-After: 5`），避免连炸。飞书若重试同一 `message_id`，已开过的当 duplicate。
6. **回写：**
   - 配齐 `AGENT_FEISHU_APP_ID` + `AGENT_FEISHU_APP_SECRET`：用 `tenant_access_token` 往**同一个 `chat_id`** 发文本。密钥不进启动行 / `/api/im` 快照 / stdout。
   - 没配应用：仍走 `AGENT_FEISHU_WEBHOOK`（自定义机器人那条群，不一定是 @ 的那一群）。启动行写「未配应用，不能回同一会话」。
   - 应用回写失败才回退 webhook。两边都没有 → 结果只在本机 UI。
7. 看板（`project_status`）仍只走出站 webhook，不走应用回会话。

## 还缺哪些开放平台配置（本仓不代注册）

这条 IM 切片**不会**替你建应用、不会申请权限、不会点发布。

| 要在开放平台做的 | 为什么 |
|---|---|
| 企业自建应用 + 事件订阅「请求网址」= `$AGENT_IM_PUBLIC_BASE/api/im/feishu` | 飞书云必须打到签名回调 |
| Encrypt Key → `AGENT_FEISHU_ENCRYPT_KEY`；可选 Verification Token | 无 key 入站不启 |
| 订阅 `im.message.receive_v1`；群里建议只接收 @机器人 | 本仓群消息无 mention 不开跑；不设 `AGENT_FEISHU_BOT_OPEN_ID` 时「有 @ 就算」，请平台侧收窄 |
| 把机器人拉进目标群；给会话发消息权限（`im:message` / 以应用身份发消息） | 否则入站有了也回不了同一会话 |
| 应用可用（版本发布 / 可用性范围含你的人） | 未发布时常能验 URL、群里 @ 没事件 |
| 要回同一会话：把 App ID / Secret 写入 `.env`，**不要贴进终端** | 只配 webhook = 结果打到自定义机器人那条群 |
| 可选 `AGENT_FEISHU_BOT_OPEN_ID` | 用来丢掉「@ 的是别人」和机器人回声 |

**明确没做、不要到设置里找：** 多维表格、审批、云文档、日历。那是另一条（设置 → MCP 的 `feishu-lark` 也**不会**在这个窗口派活）。要那些能力：另开应用权限、管理员授权、另写切片。

## 测试

`npx vitest run test/notify.test.ts`

锁：签名 401 / 无 key 503；群 @ 抽文本开跑、无 mention 忽略；无应用仍走 webhook；应用回同一 `chat_id` 且 webhook 不重复；伪造 token 401；同会话忙 429；App Secret / token 不进 banner 与 `/api/im`。
