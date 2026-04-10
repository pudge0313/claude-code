@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Claude Code

where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bun ^(https://bun.sh/^) is not installed or not in PATH.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [INFO] node_modules not found. Running bun install...
  call bun install
  if errorlevel 1 (
    echo.
    echo [ERROR] bun install failed.
    pause
    exit /b 1
  )
)

if not exist dist\cli.js (
  echo [INFO] dist\cli.js not found. Running bun run build...
  call bun run build
  if errorlevel 1 (
    echo.
    echo [ERROR] bun run build failed.
    pause
    exit /b 1
  )
)

:: Enterprise-safe defaults: no third-party endpoint, no dangerous permission bypass,
:: disable nonessential outbound traffic unless user explicitly overrides.
if not defined CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
if not defined DISABLE_TELEMETRY set DISABLE_TELEMETRY=1
if not defined DISABLE_AUTOUPDATER set DISABLE_AUTOUPDATER=1
if not defined DISABLE_FEEDBACK_COMMAND set DISABLE_FEEDBACK_COMMAND=1
if not defined DISABLE_ERROR_REPORTING set DISABLE_ERROR_REPORTING=1

echo [INFO] Starting Claude Code in enterprise-safe mode...
echo.
call node dist\cli.js %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Claude Code exited with code %EXIT_CODE%.
  echo If you see API connection errors, configure your approved internal model endpoint explicitly.
  echo.
  pause
)

exit /b %EXIT_CODE%
