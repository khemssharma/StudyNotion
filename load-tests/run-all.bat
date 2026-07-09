@echo off
REM ══════════════════════════════════════════════════════════════════════════
REM run-all.bat — Windows version of run-all.sh
REM Prerequisites: choco install k6  AND  node (already installed)
REM Usage:
REM   run-all.bat
REM   set BASE_URL=https://your-server.com/api/v1 && run-all.bat
REM ══════════════════════════════════════════════════════════════════════════

IF "%BASE_URL%"=="" SET BASE_URL=http://localhost:4000/api/v1

SET TIMESTAMP=%DATE:~-4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
SET TIMESTAMP=%TIMESTAMP: =0%
SET REPORTS_DIR=load-tests\reports
SET SUMMARY=%REPORTS_DIR%\summary_%TIMESTAMP%.json
SET REPORT=%REPORTS_DIR%\report_%TIMESTAMP%.html

IF NOT EXIST %REPORTS_DIR% mkdir %REPORTS_DIR%

echo.
echo ===== StudyNotion Load Test Suite =====
echo Target: %BASE_URL%
echo.

k6 version >nul 2>&1
IF ERRORLEVEL 1 (
  echo ERROR: k6 not found. Install: choco install k6
  exit /b 1
)

echo [1/5] Smoke test...
k6 run --env BASE_URL=%BASE_URL% load-tests\scenarios\01-smoke.js --summary-export=%REPORTS_DIR%\smoke_%TIMESTAMP%.json --quiet

echo [2/5] Load test (10k/day proof)...
k6 run --env BASE_URL=%BASE_URL% load-tests\scenarios\02-load.js --summary-export=%SUMMARY% --quiet

echo [3/5] Stress test...
k6 run --env BASE_URL=%BASE_URL% load-tests\scenarios\03-stress.js --summary-export=%REPORTS_DIR%\stress_%TIMESTAMP%.json --quiet

echo [4/5] Spike test...
k6 run --env BASE_URL=%BASE_URL% load-tests\scenarios\04-spike.js --summary-export=%REPORTS_DIR%\spike_%TIMESTAMP%.json --quiet

echo [5/5] Critical path journeys...
k6 run --env BASE_URL=%BASE_URL% load-tests\scenarios\06-critical-paths.js --summary-export=%REPORTS_DIR%\journeys_%TIMESTAMP%.json --quiet

echo Generating HTML report...
node load-tests\reports\generate-report.js %SUMMARY% %REPORT%

echo.
echo ===== Done! =====
echo Report: %REPORT%
start %REPORT%
