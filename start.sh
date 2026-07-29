#!/bin/bash
echo "🌸 萌家日历启动中..."
echo ""
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "📦 首次运行，正在安装依赖..."
  npm install
fi

echo "🚀 启动服务器..."
echo ""
echo "========================================"
echo "  请在浏览器打开:"
echo "  http://localhost:3456"
echo ""
echo "  局域网内其他设备访问:"
echo "  http://$(hostname -I | awk '{print $1}'):3456"
echo "========================================"
echo ""

node server.js
