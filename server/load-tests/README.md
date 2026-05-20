# StudyNotion Load & Performance Tests

Proves the platform handles **10,000+ users/day** under realistic traffic patterns.

## Quick Start

### 1. Install k6

| Platform | Command |
|----------|---------|
| macOS    | `brew install k6` |
| Windows  | `choco install k6` |
| Ubuntu   | `sudo apt install k6` (after adding k6 apt repo) |
| Docker   | `docker run grafana/k6 run -` |

### 2. Start your server

```bash
cd server && npm start        # must be running before tests
```

### 3. Run the full suite

```bash
# Against localhost (default)
./load-tests/run-all.sh

# Against staging/production
BASE_URL=https://studynotion-oylf.onrender.com/api/v1 ./load-tests/run-all.sh

# Windows
run-all.bat
```

The suite runs all tests, then opens a **standalone HTML report** in your browser — no server required, shareable with stakeholders.

---

## Test Scenarios

| File | Type | VUs | Duration | What it proves |
|------|------|-----|----------|----------------|
| `01-smoke.js` | Smoke | 1 | 30 s | All endpoints respond |
| `02-load.js` | **Load** | 2→30 | 5.5 min | **10k req/day capacity** |
| `03-stress.js` | Stress | 30→150 | 7.5 min | Graceful degradation at 5× load |
| `04-spike.js` | Spike | 2→100 | 3 min | Viral surge resilience |
| `05-soak.js` | Soak | 15 | 30 min | No memory leaks / connection exhaustion |
| `06-critical-paths.js` | Journey | 23 | 3 min | 4 key user flows under load |

---

## How the 10k/day maths works

```
10,000 req/day ÷ 24 h = 417 req/h average
Peak hour ≈ 5× average = ~2,080 req/h = ~35 req/min

Each virtual user (VU) sends ~6 req/min with realistic think-time.
35 req/min ÷ 6 req/VU/min ≈ 6 VUs needed for average load.

The load test ramps to 30 VUs = 5× headroom above daily average peak.
Sustained 30 VUs × 6 req/min = 180 req/min = 259,200 req/day capacity.
```

---

## SLA Thresholds (Pass/Fail in report)

| Metric | Target |
|--------|--------|
| p95 response time | < 800 ms |
| p99 response time | < 2,000 ms |
| Error rate | < 1 % |
| Throughput | > 12 req/s sustained |
| Auth success rate | > 95 % |
| Recommendation p95 | < 1,000 ms |

---

## Run individual tests

```bash
# Smoke only
k6 run load-tests/scenarios/01-smoke.js

# Load test with HTML output
k6 run --summary-export=summary.json load-tests/scenarios/02-load.js
node load-tests/reports/generate-report.js summary.json report.html

# Stress test
k6 run load-tests/scenarios/03-stress.js

# Spike test
k6 run load-tests/scenarios/04-spike.js

# Soak test (30 min by default)
k6 run load-tests/scenarios/05-soak.js

# Critical journey tests
k6 run load-tests/scenarios/06-critical-paths.js

# Soak for 2 hours (for overnight run)
SOAK_DURATION=2h k6 run load-tests/scenarios/05-soak.js
```

---

## Live dashboard (optional)

Stream results to Grafana in real-time:

```bash
# Start InfluxDB + Grafana
docker-compose -f load-tests/docker-compose.grafana.yml up -d

# Run with live streaming
k6 run --out influxdb=http://localhost:8086/k6 load-tests/scenarios/02-load.js
```

Then open http://localhost:3000 (admin/admin).
