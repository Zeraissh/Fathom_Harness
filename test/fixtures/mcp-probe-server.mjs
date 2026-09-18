/**
 * 假 MCP 探针 server —— H8「静态推导」判据③的活页替身。
 *
 * 存在的理由：判据③要看"核查者的工具面上**实际**挂上了 MCP 工具没有"，而那
 * 条链（mcp.json → connectMcpServers → selectPackTools 按包 includeTools 收窄
 * → verifierMeansFor）需要真的连上一个 MCP server 才走得通。注入几个假工具
 * 对象测不到这条链。
 *
 * 工具名与 stm32-debug 的 `mcp.includeTools` 对齐（self_check / read_memory）：
 * 这样"这个子任务的核查者手里有没有探针"就由**包的收窄规则**决定，而不是由
 * 夹具代劳——测试断言的才是产品行为。
 *
 * stdout 是 MCP 协议通道，任何调试输出都必须走 stderr。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "probe-fixture", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "self_check",
      description: "夹具：真机自检",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "read_memory",
      description: "夹具：读一段内存",
      inputSchema: {
        type: "object",
        properties: { address: { type: "string" }, length: { type: "number" } },
        required: ["address", "length"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async () => ({
  content: [{ type: "text", text: "fixture ok" }],
}));

await server.connect(new StdioServerTransport());
