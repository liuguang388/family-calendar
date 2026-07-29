@echo off
chcp 65001 >nul
echo 🌸 萌家日历启动中...
echo.

if not exist "node_modules" (
  echo 📦 首次运行，正在安装依赖...
  call npm install
)

echo 🚀 启动服务器...
echo.
echo ========================================
echo   请在浏览器打开:
echo   http://localhost:3456
echo.
echo   局域网内其他设备访问本机IP:3456
echo ========================================
echo.

node server.js
pause
