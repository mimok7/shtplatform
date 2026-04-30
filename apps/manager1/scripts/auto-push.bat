@echo off
REM Auto push script - checks for git changes and pushes if any
SETLOCAL ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

REM Ensure we're inside a git repo
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Not a git repository, skipping auto-push.
  exit /b 0
)

REM Check for changes
for /f "delims=" %%i in ('git status --porcelain') do (
  set CHANGED=1
)

if not defined CHANGED (
  echo No changes to commit.
  exit /b 0
)

echo Changes detected. Committing and pushing...
git add .
git commit -m "chore: auto apply changes" || echo No commit created (maybe nothing to commit).
git push mimok7 main || git push origin main || echo Push failed.

endlocal
