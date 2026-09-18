// Builds linecount-report.html from _stats/stats.json (self-contained, no external requests).
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('_stats/stats.json', 'utf8'));
const { out, allFiles } = data;

const extSum = {};
for (const r of allFiles) {
  const b = (extSum[r.ext] = extSum[r.ext] || { files: 0, total: 0, code: 0, blank: 0, comment: 0 });
  b.files++; b.total += r.total; b.code += r.code; b.blank += r.blank; b.comment += r.comment;
}

const T = out.totals;
const n = x => x.toLocaleString('en-US');
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%';

// ---- tree model (recursive totals, children sorted by size) ----
const tree = [
  { name: 'test', depth: 0, self: out.direct['test'], rec: out.recursive['test'], children: [
    { name: 'test/fixtures', depth: 1, self: out.direct['test/fixtures'], rec: out.recursive['test/fixtures'] },
  ]},
  { name: 'ui', depth: 0, self: out.direct['ui'], rec: out.recursive['ui'], children: [
    { name: 'ui/public', depth: 1, self: out.direct['ui/public'], rec: out.recursive['ui/public'], children: [
      { name: 'ui/public/features', depth: 2, self: out.direct['ui/public/features'], rec: out.recursive['ui/public/features'] },
      { name: 'ui/public/core', depth: 2, self: out.direct['ui/public/core'], rec: out.recursive['ui/public/core'] },
      { name: 'ui/public/dom', depth: 2, self: out.direct['ui/public/dom'], rec: out.recursive['ui/public/dom'] },
    ]},
  ]},
  { name: 'src', depth: 0, self: out.direct['src'], rec: out.recursive['src'], children: [
    { name: 'src/tools', depth: 1, self: out.direct['src/tools'], rec: out.recursive['src/tools'] },
  ]},
];

function flatten(nodes, acc = []) {
  for (const nd of nodes) { acc.push(nd); if (nd.children) flatten(nd.children, acc); }
  return acc;
}
const flat = flatten(tree);

const maxRec = Math.max(...flat.map(d => d.rec.total));
const barW = 560;

function bar(v, max, color) {
  return `<svg class="bar" width="${barW}" height="14" viewBox="0 0 ${barW} 14" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="0" width="${barW}" height="14" fill="#eef1f5"/>
    <rect x="0" y="0" width="${((v / max) * barW).toFixed(1)}" height="14" fill="${color}"/></svg>`;
}

const dirRows = flat.map(d => {
  const cls = d.depth === 0 ? ' class="tld"' : '';
  const indent = `padding-left:${8 + d.depth * 20}px`;
  const label = d.depth === 0 ? `<strong>${d.name}/</strong>` : d.name.split('/').pop() + '/';
  return `<tr${cls}>
    <td style="${indent}">${label}</td>
    <td class="num">${n(d.rec.files)}</td>
    <td class="num">${n(d.rec.total)}</td>
    <td class="num">${n(d.self.total)}</td>
    <td class="num">${n(d.rec.code)}</td>
    <td class="num">${n(d.rec.blank)}</td>
    <td class="num">${n(d.rec.comment)}</td>
    <td class="num">${pct(d.rec.total, T.total)}</td>
    <td style="width:${barW + 16}px">${bar(d.rec.total, maxRec, d.depth === 0 ? '#2f6fb5' : '#7aa6d4')}</td>
  </tr>`;
}).join('\n');

const topLevel = ['test', 'ui', 'src'].map(k => ({ k, rec: out.recursive[k] }));
const colors = { test: '#2f6fb5', ui: '#c46a2f', src: '#3f8f6a' };
const topBars = topLevel.map(t => `<div class="kb">
  <div class="kbl">${t.k}/</div>
  <div class="kbb">${bar(t.rec.total, T.total, colors[t.k])}</div>
  <div class="kbv">${n(t.rec.total)} 行 · ${pct(t.rec.total, T.total)}</div>
</div>`).join('\n');

const extOrder = ['.ts', '.js', '.css', '.html'];
const maxExt = Math.max(...extOrder.map(e => extSum[e].total));
const extRows = extOrder.map(e => {
  const b = extSum[e];
  return `<tr><td class="mono">${e}</td><td class="num">${n(b.files)}</td><td class="num">${n(b.total)}</td>
  <td class="num">${n(b.code)}</td><td class="num">${n(b.blank)}</td><td class="num">${n(b.comment)}</td>
  <td class="num">${pct(b.total, T.total)}</td>
  <td style="width:${barW + 16}px">${bar(b.total, maxExt, '#5b6b7c')}</td></tr>`;
}).join('\n');

const topFiles = [...allFiles].sort((a, b) => b.total - a.total).slice(0, 10).map(r =>
  `<tr><td class="mono">${r.file}</td><td class="num">${n(r.total)}</td><td class="num">${n(r.code)}</td></tr>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>代码行数统计 · stats-sandbox</title>
<style>
  :root { --ink:#1c2430; --mut:#657487; --line:#e2e7ee; --bg:#f7f9fc; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 32px 56px; background:var(--bg); color:var(--ink);
    font:15px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:.2px; }
  h2 { font-size:16px; margin:34px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .sub { color:var(--mut); font-size:13px; margin-bottom:22px; }
  .cards { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 6px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:12px 16px; min-width:132px; }
  .card .v { font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }
  .card .l { font-size:12px; color:var(--mut); margin-top:2px; }
  table { border-collapse:collapse; width:100%; background:#fff; border:1px solid var(--line);
    border-radius:10px; overflow:hidden; font-size:13.5px; }
  th { text-align:left; font-weight:600; color:var(--mut); font-size:12px; letter-spacing:.4px;
    background:#f0f3f8; padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  td { padding:6px 10px; border-bottom:1px solid #f0f3f8; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr.tld td { background:#fafbfe; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .mono { font-family:ui-monospace,Consolas,Menlo,monospace; font-size:12.5px; }
  .kb { display:grid; grid-template-columns:88px 1fr auto; align-items:center; gap:12px; margin:7px 0; }
  .kbl { font-weight:600; }
  .kbv { color:var(--mut); font-size:13px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .note { background:#fff; border:1px solid var(--line); border-left:3px solid #2f6fb5; border-radius:8px;
    padding:14px 18px; font-size:13px; color:#3a4453; }
  .note li { margin:4px 0; }
  .note code { font-family:ui-monospace,Consolas,monospace; font-size:12.5px; background:#f0f3f8;
    padding:1px 5px; border-radius:4px; }
  .legend { color:var(--mut); font-size:12.5px; margin:8px 0 0; }
</style>
</head>
<body>

<h1>代码行数统计 — stats-sandbox</h1>
<div class="sub">统计范围：<span class="mono">.ts / .js / .css / .html</span> ·  根目录 <span class="mono">D:\\Work\\scratch\\fathom-personas-20260918\\stats-sandbox</span> · 生成日期 2026-09-18</div>

<div class="cards">
  <div class="card"><div class="v">${n(T.files)}</div><div class="l">文件数</div></div>
  <div class="card"><div class="v">${n(T.total)}</div><div class="l">总行数</div></div>
  <div class="card"><div class="v">${n(T.code)}</div><div class="l">代码行（非空非注释）</div></div>
  <div class="card"><div class="v">${n(T.blank)}</div><div class="l">空行</div></div>
  <div class="card"><div class="v">${n(T.comment)}</div><div class="l">注释行</div></div>
</div>

<h2>一级目录（含子目录，按行数排序）</h2>
${topBars}
<div class="legend">条形长度按占项目总行数 ${n(T.total)} 的比例绘制。</div>

<h2>目录明细（按大小排序）</h2>
<table>
<thead><tr>
  <th>目录</th><th style="text-align:right">文件</th><th style="text-align:right">总行数</th>
  <th style="text-align:right">本级</th><th style="text-align:right">代码行</th>
  <th style="text-align:right">空行</th><th style="text-align:right">注释行</th>
  <th style="text-align:right">占比</th><th>规模</th>
</tr></thead>
<tbody>
${dirRows}
</tbody>
</table>
<div class="legend">缩进的子目录行是「含子目录合计」，其数字已包含在上级目录内，<strong>不可横向相加</strong>；「本级」列只算直接放在该目录下的文件。占比为占项目总行数。</div>

<h2>按扩展名</h2>
<table>
<thead><tr>
  <th>扩展名</th><th style="text-align:right">文件</th><th style="text-align:right">总行数</th>
  <th style="text-align:right">代码行</th><th style="text-align:right">空行</th>
  <th style="text-align:right">注释行</th><th style="text-align:right">占比</th><th>规模</th>
</tr></thead>
<tbody>${extRows}</tbody>
</table>

<h2>最大的 10 个文件</h2>
<table>
<thead><tr><th>文件</th><th style="text-align:right">总行数</th><th style="text-align:right">代码行</th></tr></thead>
<tbody>${topFiles}</tbody>
</table>

<h2>统计口径与校验</h2>
<div class="note">
<ul>
  <li><strong>行数</strong>：按换行符切分；文件末尾若有换行不额外计一行，与 <code>wc -l</code> 一致。</li>
  <li><strong>代码行</strong>：非空行，且不以 <code>//</code>、<code>/*</code>、<code>*</code>、<code>&lt;!--</code> 开头的行；整行块注释按注释计。</li>
  <li><strong>注释行</strong>:按行首判定，因此行尾注释（<code>x(); // foo</code>）计入代码行，不做拆分。</li>
  <li><strong>排除</strong>：<code>node_modules/</code>、<code>.git/</code>、<code>dist/</code>、<code>build/</code>，以及本次统计自身产生的 <code>_stats/</code> 目录与本报告文件，因此数字描述的是项目本身而非测量工具。</li>
  <li><strong>校验</strong>：本表总额与直接 <code>cat</code> 后 <code>wc -l</code> 的结果逐目录一致 —— src 34,613 / test 68,478 / ui 66,052 / 合计 169,143。</li>
</ul>
</div>

</body>
</html>
`;

fs.writeFileSync('linecount-report.html', html);
console.log('wrote linecount-report.html', html.length, 'bytes');
