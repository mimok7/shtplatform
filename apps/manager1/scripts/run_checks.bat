@echo off
REM Usage: run_checks.bat https://example.com
if "%~1"=="" (
  echo Usage: run_checks.bat https://example.com
  exit /b 1
)
set URL=%~1

echo ===== Basic HTTP HEAD =====
curl -I -L %URL%
echo.

echo ===== Resolve Host and Ping =====
for /f "tokens=3 delims=/" %%a in ("%URL%") do set HOST=%%a
echo Host=%HOST%
ping -n 4 %HOST%
echo.

echo ===== Timing (curl) =====
curl -o NUL -s -w "time_namelookup: %{time_namelookup}\ntime_connect: %{time_connect}\ntime_starttransfer: %{time_starttransfer}\ntime_total: %{time_total}\n" %URL%
echo.

echo ===== Lighthouse (if available) =====
where lighthouse >nul 2>&1
if %errorlevel%==0 (
  lighthouse %URL% --output html --output-path=lh-report.html
) else (
  echo lighthouse not installed globally. Trying npx (may install):
  npx lighthouse %URL% --output html --output-path=lh-report.html
)

echo ===== Done =====
echo Reports: lh-report.html (if Lighthouse ran)
