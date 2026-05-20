#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# run-all.sh — Run the full StudyNotion load test suite and generate report
#
# Prerequisites:
#   brew install k6          (macOS)
#   choco install k6         (Windows)
#   apt install k6           (Ubuntu — see https://k6.io/docs/getting-started/installation)
#
# Usage:
#   chmod +x load-tests/run-all.sh
#   ./load-tests/run-all.sh                              # test localhost:4000
#   BASE_URL=https://your-server.com/api/v1 ./load-tests/run-all.sh
#   SKIP_SOAK=1 ./load-tests/run-all.sh                 # skip 30-min soak
# ══════════════════════════════════════════════════════════════════════════

set -e

BASE_URL="${BASE_URL:-http://localhost:4000/api/v1}"
REPORTS_DIR="load-tests/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SUMMARY="$REPORTS_DIR/summary_${TIMESTAMP}.json"
REPORT="$REPORTS_DIR/report_${TIMESTAMP}.html"

mkdir -p "$REPORTS_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   StudyNotion Load Test Suite                        ║"
echo "║   Target: $BASE_URL"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check k6 is installed
if ! command -v k6 &> /dev/null; then
  echo "❌  k6 is not installed. Install it from https://k6.io/docs/getting-started/installation/"
  exit 1
fi

K6_OPTS="--env BASE_URL=$BASE_URL"

# ── 1. Smoke test ─────────────────────────────────────────────────────────
echo "▶  [1/5] Smoke test (30 s)…"
k6 run $K6_OPTS load-tests/scenarios/01-smoke.js \
  --summary-export="$REPORTS_DIR/smoke_${TIMESTAMP}.json" \
  --quiet
echo "   ✓ Smoke passed"
echo ""

# ── 2. Load test (main 10k/day proof) ─────────────────────────────────────
echo "▶  [2/5] Load test — 10k/day capacity proof (5.5 min)…"
k6 run $K6_OPTS load-tests/scenarios/02-load.js \
  --summary-export="$SUMMARY" \
  --out json="$REPORTS_DIR/load_raw_${TIMESTAMP}.json" \
  --quiet
echo "   ✓ Load test complete — summary saved to $SUMMARY"
echo ""

# ── 3. Stress test ────────────────────────────────────────────────────────
echo "▶  [3/5] Stress test — finding breaking point (7.5 min)…"
k6 run $K6_OPTS load-tests/scenarios/03-stress.js \
  --summary-export="$REPORTS_DIR/stress_${TIMESTAMP}.json" \
  --quiet || true  # stress intentionally hits limits; don't fail the suite
echo "   ✓ Stress test complete"
echo ""

# ── 4. Spike test ─────────────────────────────────────────────────────────
echo "▶  [4/5] Spike test (3 min)…"
k6 run $K6_OPTS load-tests/scenarios/04-spike.js \
  --summary-export="$REPORTS_DIR/spike_${TIMESTAMP}.json" \
  --quiet
echo "   ✓ Spike test complete"
echo ""

# ── 5. Critical paths ─────────────────────────────────────────────────────
echo "▶  [5/5] Critical user journey tests (3 min)…"
k6 run $K6_OPTS load-tests/scenarios/06-critical-paths.js \
  --summary-export="$REPORTS_DIR/journeys_${TIMESTAMP}.json" \
  --quiet
echo "   ✓ Journey tests complete"
echo ""

# ── Soak test (opt-in) ────────────────────────────────────────────────────
if [ -z "$SKIP_SOAK" ]; then
  echo "▶  [+] Soak test — endurance (30 min, set SKIP_SOAK=1 to skip)…"
  k6 run $K6_OPTS load-tests/scenarios/05-soak.js \
    --summary-export="$REPORTS_DIR/soak_${TIMESTAMP}.json" \
    --quiet
  echo "   ✓ Soak test complete"
  echo ""
fi

# ── Generate HTML report ──────────────────────────────────────────────────
echo "▶  Generating stakeholder HTML report…"
node load-tests/reports/generate-report.js "$SUMMARY" "$REPORT"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   All tests complete!                                ║"
echo "║   📄 Report: $REPORT"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Open the report in your browser:"
echo "  open $REPORT          (macOS)"
echo "  start $REPORT         (Windows)"
echo "  xdg-open $REPORT      (Linux)"
echo ""
