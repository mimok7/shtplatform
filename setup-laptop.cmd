@echo off
REM One-click laptop setup wrapper for sht-platform
SETLOCAL
pushd %~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply-laptop-once.ps1" %*
set EXITCODE=%ERRORLEVEL%
popd
ENDLOCAL
exit /b %EXITCODE%