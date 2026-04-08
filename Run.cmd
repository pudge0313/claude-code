@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Claude Code Best

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

echo [INFO] Starting Claude Code...
echo.
call node dist\cli.js --dangerously-skip-permissions %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Claude Code exited with code %EXIT_CODE%.
  echo If you see "API Error: Connection error.", check network access to the configured model endpoint.
  echo.
  pause
)

exit /b %EXIT_CODE%
