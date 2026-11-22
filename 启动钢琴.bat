@echo off
rem piano-box launcher (ASCII only to avoid cmd codepage issues)
rem Auto-detect Node even when it is NOT on system PATH (e.g. WorkBuddy private node).
title piano-box launcher
cd /d "%~dp0"

set "NODE_BIN="

rem 1) node on PATH
for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE_BIN set "NODE_BIN=%%i"
)

rem 2) WorkBuddy private node (common on this machine)
if not defined NODE_BIN (
    for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
        if exist "%%d\node.exe" set "NODE_BIN=%%d\node.exe"
    )
)

rem 3) standard install locations
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_BIN (
    echo [ERROR] Node.js not found.
    echo Install Node.js 18+ from https://nodejs.org/ then run this again.
    pause
    exit /b 1
)

echo [OK] Node found: %NODE_BIN%
for /f "delims=" %%v in ('"%NODE_BIN%" -v') do set "NODEV=%%v"
echo [OK] Version: %NODEV%

if not exist "node_modules\vite\bin\vite.js" (
    echo [INFO] Installing dependencies for the first run, please wait...
    call "%NODE_BIN%" "%NODE_BIN%\..\node_modules\npm\bin\npm-cli.js" install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Check your network and retry.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies already present, skipping install.
)

echo.
echo [CHECK] Port 5173 status...
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo [WARN] Port 5173 is already in use. Another instance may be running.
    echo         Close the other piano-box window, or open http://127.0.0.1:5174/
)

echo.
echo [START] Opening http://127.0.0.1:5173/ in your browser...
echo [TIP] Keep this window open while playing. Close it to stop the server.
echo.

start "" http://127.0.0.1:5173/
"%NODE_BIN%" "node_modules\vite\bin\vite.js" --host 127.0.0.1 --strictPort

echo.
echo Server stopped.
pause
