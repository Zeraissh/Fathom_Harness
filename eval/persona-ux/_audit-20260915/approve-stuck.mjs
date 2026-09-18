const BASE = "http://127.0.0.1:4174";

async function waitApproval(runId, ms = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const res = await fetch(`${BASE}/api/runs/${runId}/events`, { signal: ac.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (!data) continue;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        const event = evt.event ?? evt;
        if (event?.type === "approval_request") {
          clearTimeout(timer);
          await reader.cancel().catch(() => {});
          return { envelope: evt, event };
        }
      }
    }
  } catch { /* abort */ }
  clearTimeout(timer);
  return null;
}

const runs = await (await fetch(`${BASE}/api/runs`)).json();
const report = [];
for (const run of runs.filter((r) => r.status === "running")) {
  const hit = await waitApproval(run.runId);
  const event = hit?.event;
  const id = event?.approvalId || (event?.toolUseId && event?.requestSeq != null
    ? `${event.toolUseId}#${event.requestSeq}`
    : event?.toolUseId);
  const decision = /hello-b2|denied|nope/.test(run.task) ? "deny" : "allow";
  let status = 0;
  let body = "no-approval";
  if (id) {
    const res = await fetch(`${BASE}/api/runs/${run.runId}/approvals/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, reason: decision === "deny" ? "评测拒绝" : undefined }),
    });
    status = res.status;
    body = (await res.text()).slice(0, 240);
  }
  report.push({
    runId: run.runId,
    task: run.task.slice(0, 80),
    mode: run.mode,
    id,
    name: event?.name,
    cardHint: event,
    decision,
    status,
    body,
  });
}
console.log(JSON.stringify(report, null, 2));
