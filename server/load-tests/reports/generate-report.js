/**
 * generate-report.js
 * ══════════════════
 * Reads k6 JSON summary output and produces a standalone HTML report
 * that stakeholders can open in any browser — no server needed.
 *
 * Usage:
 *   node load-tests/reports/generate-report.js <summary.json> [output.html]
 *
 * The summary.json is produced by k6 with:
 *   k6 run --summary-export=summary.json scenario.js
 */

const fs   = require("fs");
const path = require("path");

const summaryFile = process.argv[2] || path.join(__dirname, "summary.json");
const outputFile  = process.argv[3] || path.join(__dirname, "report.html");

if (!fs.existsSync(summaryFile)) {
  console.error(`\nERROR: Summary file not found: ${summaryFile}`);
  console.error("Run a k6 test first:\n  k6 run --summary-export=load-tests/reports/summary.json load-tests/scenarios/02-load.js\n");
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
const metrics = summary.metrics || {};

// ── Helper: extract metric value safely ──────────────────────────────────
function val(metricPath, stat = "value") {
  const parts = metricPath.split(".");
  let node = metrics;
  for (const p of parts) {
    if (!node || typeof node !== "object") return null;
    node = node[p];
  }
  if (!node) return null;
  if (stat === "value") return node.values?.value ?? node.values?.rate ?? null;
  return node.values?.[stat] ?? null;
}

function pct(metricName, p) {
  const m = metrics[metricName];
  if (!m) return null;
  return m.values?.[`p(${p})`] ?? null;
}

function fmt(n, decimals = 0) {
  if (n === null || n === undefined) return "N/A";
  if (typeof n === "number") return n.toFixed(decimals);
  return String(n);
}

function fmtMs(n) {
  if (n === null) return "N/A";
  return `${Math.round(n)} ms`;
}

function fmtPct(n) {
  if (n === null) return "N/A";
  return `${(n * 100).toFixed(2)} %`;
}

// ── Collect key numbers ───────────────────────────────────────────────────
const totalReqs    = val("http_reqs");
const failRate     = val("http_req_failed");
const reqRate      = metrics["http_reqs"]?.values?.rate ?? null;
const p50          = pct("http_req_duration", 50);
const p90          = pct("http_req_duration", 90);
const p95          = pct("http_req_duration", 95);
const p99          = pct("http_req_duration", 99);
const avgDur       = metrics["http_req_duration"]?.values?.avg ?? null;
const maxDur       = metrics["http_req_duration"]?.values?.max ?? null;
const vusMax       = metrics["vus_max"]?.values?.max ?? null;
const dataReceived = metrics["data_received"]?.values?.value ?? null;
const dataSent     = metrics["data_sent"]?.values?.value ?? null;

// Threshold pass/fail
const thresholds   = summary.root_group?.checks ?? {};

function passFailBadge(pass) {
  return pass
    ? `<span class="badge pass">✓ PASS</span>`
    : `<span class="badge fail">✗ FAIL</span>`;
}

// ── Threshold table rows ──────────────────────────────────────────────────
const thresholdRows = Object.entries(metrics)
  .filter(([, m]) => m.thresholds)
  .map(([name, m]) => {
    const rows = Object.entries(m.thresholds).map(([expr, result]) => {
      const pass = !result.ok === false ? !result.ok : result.ok;
      return `<tr>
        <td><code>${name}</code></td>
        <td><code>${expr}</code></td>
        <td>${passFailBadge(result.ok)}</td>
      </tr>`;
    });
    return rows.join("");
  })
  .join("");

// ── 10k/day capacity calculation ─────────────────────────────────────────
const dailyCapacity = reqRate ? Math.round(reqRate * 86400) : null;
const capacityClass = dailyCapacity >= 10000 ? "pass" : "fail";

function fmtBytes(b) {
  if (!b) return "N/A";
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(2)} MB`;
  return `${(b / 1e3).toFixed(2)} KB`;
}

// ── HTML ──────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>StudyNotion — Load Test Report</title>
<style>
  :root {
    --pass: #16a34a; --fail: #dc2626; --warn: #d97706;
    --bg: #0f172a; --card: #1e293b; --border: #334155;
    --text: #f1f5f9; --muted: #94a3b8; --accent: #6366f1;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg);
         color: var(--text); padding: 2rem; line-height: 1.6; }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.2rem; color: var(--muted); font-weight: 500; margin-bottom: 2rem; }
  h3 { font-size: 1rem; color: var(--accent); text-transform: uppercase;
       letter-spacing: 0.05em; margin-bottom: 1rem; }
  .header { border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 1.25rem; }
  .card .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase;
                 letter-spacing: 0.05em; margin-bottom: 0.4rem; }
  .card .value { font-size: 2rem; font-weight: 700; }
  .card .sub   { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
  .card.highlight { border-color: var(--accent); }
  .pass { color: var(--pass); }
  .fail { color: var(--fail); }
  .warn { color: var(--warn); }
  .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px;
           font-size: 0.8rem; font-weight: 600; }
  .badge.pass { background: rgba(22,163,74,0.15); color: var(--pass); }
  .badge.fail { background: rgba(220,38,38,0.15); color: var(--fail); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { text-align: left; padding: 0.6rem 1rem; background: rgba(99,102,241,0.1);
       color: var(--accent); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  code { background: rgba(255,255,255,0.06); padding: 0.1rem 0.4rem;
         border-radius: 4px; font-size: 0.85em; }
  .section { background: var(--card); border: 1px solid var(--border);
             border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .capacity-banner { border-radius: 12px; padding: 1.5rem 2rem;
                     margin-bottom: 2rem; display: flex; align-items: center; gap: 1.5rem; }
  .capacity-banner.pass { background: rgba(22,163,74,0.12); border: 1px solid rgba(22,163,74,0.3); }
  .capacity-banner.fail { background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.3); }
  .capacity-banner .icon { font-size: 2.5rem; }
  .capacity-banner .text h3 { color: inherit; font-size: 1.1rem; margin-bottom: 0.25rem; }
  .capacity-banner .text p  { color: var(--muted); font-size: 0.9rem; }
  .footer { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 3rem; }
  @media (max-width: 600px) { body { padding: 1rem; } .grid { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>

<div class="header">
  <h1>📊 StudyNotion — Load Test Report</h1>
  <h2>Performance & Scalability Verification · Generated ${new Date().toLocaleString()}</h2>
</div>

<!-- Capacity verdict banner -->
<div class="capacity-banner ${capacityClass}">
  <div class="icon">${capacityClass === "pass" ? "✅" : "⚠️"}</div>
  <div class="text">
    <h3 class="${capacityClass}">
      ${capacityClass === "pass"
        ? `System verified: handles ${dailyCapacity?.toLocaleString() ?? "10,000+"} requests/day`
        : `Capacity target not yet met — see thresholds below`}
    </h3>
    <p>Target: 10,000 req/day &nbsp;|&nbsp;
       Measured sustained rate: <strong>${reqRate ? reqRate.toFixed(1) + " req/s" : "N/A"}</strong>
       ${dailyCapacity ? "(" + dailyCapacity.toLocaleString() + " req/day extrapolated)" : ""}
    </p>
  </div>
</div>

<!-- Top KPI cards -->
<div class="grid">
  <div class="card highlight">
    <div class="label">Total Requests</div>
    <div class="value">${totalReqs ? Math.round(totalReqs).toLocaleString() : "N/A"}</div>
    <div class="sub">during test run</div>
  </div>
  <div class="card">
    <div class="label">Throughput</div>
    <div class="value">${reqRate ? reqRate.toFixed(1) : "N/A"}<span style="font-size:1rem;font-weight:400"> req/s</span></div>
    <div class="sub">${dailyCapacity ? `≈ ${dailyCapacity.toLocaleString()} / day` : ""}</div>
  </div>
  <div class="card">
    <div class="label">Error Rate</div>
    <div class="value ${failRate !== null && failRate < 0.01 ? "pass" : "fail"}">
      ${fmtPct(failRate)}
    </div>
    <div class="sub">target: &lt; 1%</div>
  </div>
  <div class="card">
    <div class="label">p95 Latency</div>
    <div class="value ${p95 !== null && p95 < 800 ? "pass" : "fail"}">
      ${fmtMs(p95)}
    </div>
    <div class="sub">target: &lt; 800 ms</div>
  </div>
  <div class="card">
    <div class="label">Peak VUs</div>
    <div class="value">${vusMax ?? "N/A"}</div>
    <div class="sub">concurrent users</div>
  </div>
  <div class="card">
    <div class="label">Avg Latency</div>
    <div class="value">${fmtMs(avgDur)}</div>
    <div class="sub">mean response time</div>
  </div>
</div>

<!-- Latency percentile breakdown -->
<div class="section">
  <h3>Response Time Distribution</h3>
  <div class="grid" style="grid-template-columns: repeat(4, 1fr)">
    <div class="card">
      <div class="label">p50 (median)</div>
      <div class="value" style="font-size:1.5rem">${fmtMs(p50)}</div>
    </div>
    <div class="card">
      <div class="label">p90</div>
      <div class="value" style="font-size:1.5rem">${fmtMs(p90)}</div>
    </div>
    <div class="card">
      <div class="label">p95</div>
      <div class="value" style="font-size:1.5rem; color: ${p95 && p95 < 800 ? "var(--pass)" : "var(--fail)"}">${fmtMs(p95)}</div>
    </div>
    <div class="card">
      <div class="label">p99</div>
      <div class="value" style="font-size:1.5rem; color: ${p99 && p99 < 2000 ? "var(--pass)" : "var(--fail)"}">${fmtMs(p99)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Metric</th><th>Value</th><th>SLA Target</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Average</td><td>${fmtMs(avgDur)}</td><td>—</td><td>—</td></tr>
      <tr><td>p50 (median)</td><td>${fmtMs(p50)}</td><td>—</td><td>—</td></tr>
      <tr><td>p95</td><td>${fmtMs(p95)}</td><td>&lt; 800 ms</td><td>${passFailBadge(p95 !== null && p95 < 800)}</td></tr>
      <tr><td>p99</td><td>${fmtMs(p99)}</td><td>&lt; 2000 ms</td><td>${passFailBadge(p99 !== null && p99 < 2000)}</td></tr>
      <tr><td>Max</td><td>${fmtMs(maxDur)}</td><td>—</td><td>—</td></tr>
    </tbody>
  </table>
</div>

<!-- Threshold results -->
<div class="section">
  <h3>Threshold Results (Pass / Fail)</h3>
  <table>
    <thead><tr><th>Metric</th><th>Condition</th><th>Result</th></tr></thead>
    <tbody>
      ${thresholdRows || `<tr><td colspan="3" style="color:var(--muted)">No threshold data in summary — re-run with --summary-export</td></tr>`}
    </tbody>
  </table>
</div>

<!-- Network -->
<div class="section">
  <h3>Network</h3>
  <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
    <div class="card">
      <div class="label">Data Received</div>
      <div class="value" style="font-size:1.4rem">${fmtBytes(dataReceived)}</div>
    </div>
    <div class="card">
      <div class="label">Data Sent</div>
      <div class="value" style="font-size:1.4rem">${fmtBytes(dataSent)}</div>
    </div>
    <div class="card">
      <div class="label">Peak Concurrent Users</div>
      <div class="value" style="font-size:1.4rem">${vusMax ?? "N/A"}</div>
    </div>
  </div>
</div>

<!-- Methodology -->
<div class="section">
  <h3>Test Methodology</h3>
  <table>
    <thead><tr><th>Scenario</th><th>Description</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td><code>01-smoke</code></td><td>1 VU, 30 s</td><td>Verify all endpoints are reachable</td></tr>
      <tr><td><code>02-load</code></td><td>Ramp 2→30 VUs, 5.5 min</td><td><strong>10k/day capacity proof</strong> — simulated peak hour</td></tr>
      <tr><td><code>03-stress</code></td><td>Ramp 30→150 VUs, 7.5 min</td><td>Find breaking point; verify graceful degradation (429 not 500)</td></tr>
      <tr><td><code>04-spike</code></td><td>2→100 VUs in 10 s</td><td>Viral/flash-sale spike resilience</td></tr>
      <tr><td><code>05-soak</code></td><td>15 VUs, 30 min</td><td>Memory leak / connection pool exhaustion detection</td></tr>
      <tr><td><code>06-critical-paths</code></td><td>4 parallel journeys, 3 min</td><td>End-to-end user journey validation</td></tr>
    </tbody>
  </table>
</div>

<div class="footer">
  Generated by StudyNotion Load Test Suite · k6 · ${new Date().toISOString()}
</div>

</body>
</html>`;

fs.writeFileSync(outputFile, html, "utf8");
console.log(`\n✅ Report written to: ${outputFile}\n`);
