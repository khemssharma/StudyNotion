#!/usr/bin/env node
// generate-report.js — StudyNotion Load Test HTML Report Generator
// Usage: node generate-report.js <summary.json> <output.html>

const fs = require('fs');
const path = require('path');

const summaryPath = process.argv[2];
const outputPath = process.argv[3] || 'report.html';

let summary = {};
try {
  const raw = fs.readFileSync(summaryPath, 'utf8');
  summary = JSON.parse(raw);
} catch (e) {
  console.warn('Could not read summary file:', e.message);
  summary = { metrics: {} };
}

const m = summary.metrics || {};
const get = (key, field) => {
  const v = m[key] && m[key].values && m[key].values[field];
  return v !== undefined ? (typeof v === 'number' ? v.toFixed(2) : v) : 'N/A';
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>StudyNotion Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; background: #f5f5f5; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; max-width: 700px; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 10px 16px; text-align: left; }
    th { background: #4CAF50; color: #fff; }
    tr:nth-child(even) { background: #f9f9f9; }
    .ok { color: green; } .warn { color: orange; } .fail { color: red; }
  </style>
</head>
<body>
  <h1>StudyNotion Load Test Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Requests</td><td>${get('http_reqs', 'count')}</td></tr>
    <tr><td>Request Rate (req/s)</td><td>${get('http_reqs', 'rate')}</td></tr>
    <tr><td>p(95) Latency</td><td>${get('http_req_duration', "p(95)")} ms</td></tr>
    <tr><td>Avg Latency</td><td>${get('http_req_duration', 'avg')} ms</td></tr>
    <tr><td>Max Latency</td><td>${get('http_req_duration', 'max')} ms</td></tr>
    <tr><td>Error Rate</td><td>${get('http_req_failed', 'rate')}</td></tr>
    <tr><td>VUs (max)</td><td>${get('vus_max', 'max')}</td></tr>
  </table>
</body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log('Report written to', outputPath);
