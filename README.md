# 🐾 班级宠物屋

面向小学老师的班级积分管理工具，用养宠物的方式激励学生。

## 技术栈

- 前端：Vue3 + Vite + TailwindCSS + Pinia
- 后端：Node.js + Express + Sequelize
- 数据库：MySQL

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd backend && npm install

# 前端
cd frontend && npm install
```

### 2. 配置数据库

```bash
cd backend
cp .env.example .env
# 编辑 .env 填写数据库信息
```

### 3. 创建数据库

```sql
CREATE DATABASE class_pet_house CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 启动

```bash
# 后端
cd backend && npm start

# 前端（开发模式）
cd frontend && npm run dev
```

### 5. 生产部署

```bash
# 前端构建
cd frontend && npm run build

# 用 pm2 启动后端
pm2 start backend/src/server.js --name class-pet-house
```

## 功能列表

- ✅ 用户注册/登录/卡密激活
- ✅ 班级管理（多班级切换）
- ✅ 学生管理（单个/批量添加）
- ✅ 50种宠物 × 10级成长阶段
- ✅ 积分加分/扣分（单个/批量）
- ✅ 撤回操作
- ✅ 分组管理
- ✅ 小卖部（徽章兑换商品）
- ✅ 光荣榜排行
- ✅ 成长记录
- ✅ 多主题切换
- ✅ 徽章墙
