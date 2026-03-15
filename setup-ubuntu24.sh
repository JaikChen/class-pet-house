#!/bin/bash

# ==========================================
# Class Pet House - Ubuntu 24.04 部署环境一键安装脚本
# 包含: Node.js (v20), PM2, MySQL 8.0, Nginx
# ==========================================

# 确保脚本以 root 权限运行
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此脚本 (sudo ./setup.sh)"
  exit 1
fi

echo "=========================================="
echo "🚀 开始安装 Class Pet House 基础运行环境..."
echo "=========================================="

# 1. 更新系统包列表
echo "👉 [1/6] 更新系统软件包..."
apt update && apt upgrade -y

# 2. 安装基础依赖
echo "👉 [2/6] 安装 curl, git, unzip 等基础工具..."
apt install -y curl git unzip build-essential fontconfig

# 3. 安装 Node.js v20 (LTS) 和 PM2
echo "👉 [3/6] 安装 Node.js v20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "👉 安装 PM2 进程管理器..."
npm install -g pm2
pm2 startup ubuntu
# (这里不用执行 env 提示的命令，startup 后会自动开机启动 PM2)

# 4. 安装 MySQL 8.0
echo "👉 [4/6] 安装 MySQL 数据库..."
apt install -y mysql-server
systemctl start mysql
systemctl enable mysql

# 【自动配置 MySQL 密码与数据库】
echo "⚙️  自动配置 MySQL 数据库 'class_pet_house'..."
# 这里的密码默认设置为 110120111，为了匹配你本地后端的 .env 默认密码
MYSQL_ROOT_PASSWORD="110120111"

# 使用 root 权限直接给 MySQL root 账户设置密码并放开权限（仅限本机访问安全些）
mysql -u root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS class_pet_house CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
EOF

echo "✅ 数据库 'class_pet_house' 创建完毕，root 密码已临时设置为: ${MYSQL_ROOT_PASSWORD}"

# 5. 安装 Nginx
echo "👉 [5/6] 安装 Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# 6. 配置防火墙 (UFW) - 如果启用了防火墙，放开 HTTP/HTTPS 和后端端口
echo "👉 [6/6] 配置防火墙规则..."
if command -v ufw &> /dev/null; then
  ufw allow 'Nginx Full'
  ufw allow 3000/tcp # 如果你不想通过 Nginx 代理后端，需要放开 3000
  echo "✅ 防火墙规则已更新"
else
  echo "⚠️ UFW 未安装或未启用，请确保云服务器安全组已放行 80, 443 和 3000 端口。"
fi

echo "=========================================="
echo "🎉 恭喜！Class Pet House 基础环境安装完成！"
echo "=========================================="
echo "版本检查:"
node -v
npm -v
pm2 -v
mysql -V
nginx -v

echo "
接下来你需要做的事情:
1. 将你的代码打包并上传到服务器。
2. 配置好服务端的 .env 文件（数据库密码如果不放心可以改掉）。
3. 导入你的 MySQL 数据库结构。
4. 在后端目录运行: pm2 start src/server.js --name 'pet-backend'
5. 在 Nginx 配置中代理你的静态前端代码和后端接口。
"
