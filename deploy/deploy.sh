#!/bin/bash
# 班级宠物屋 - 一键部署脚本
# 使用方法: bash deploy.sh

set -e

echo "🐾 班级宠物屋 部署开始..."

# 1. 安装后端依赖
echo "📦 安装后端依赖..."
cd backend && npm install --production
cd ..

# 2. 安装前端依赖并构建
echo "📦 安装前端依赖..."
cd frontend && npm install
echo "🔨 构建前端..."
npm run build
cd ..

# 3. 检查 .env
if [ ! -f backend/.env ]; then
  echo "⚠️  请先配置 backend/.env 文件！"
  echo "   cp backend/.env.example backend/.env"
  echo "   然后编辑填写数据库信息"
  exit 1
fi

# 4. 启动后端
echo "🚀 启动后端服务..."
if command -v pm2 &> /dev/null; then
  pm2 start deploy/ecosystem.config.json
  echo "✅ 已用 pm2 启动"
else
  echo "⚠️  未安装 pm2，请手动启动: cd backend && npm start"
fi

echo "🎉 部署完成！"
