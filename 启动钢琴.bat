@echo off
chcp 65001 >nul
title piano-box 音乐盒钢琴 - 启动器
cd /d "%~dp0"

echo ============================================
echo   piano-box 音乐盒钢琴  一键启动器
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js。
    echo 请先安装 Node.js 18+ ： https://nodejs.org/
    echo 安装完成后重新双击本脚本。
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v
echo [OK] 检测到 Node  %NODEV%

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
    echo [OK] 依赖安装完成
) else (
    echo [OK] 依赖已存在，跳过安装
)

echo.
echo [启动] 正在启动服务，浏览器将自动打开 http://127.0.0.1:5173/
echo [提示] 关闭本窗口即可停止服务。
echo.

start "" http://127.0.0.1:5173/
call npm run dev

echo.
echo 服务已停止。
pause
