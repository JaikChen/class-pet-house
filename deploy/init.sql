-- 班级宠物屋 数据库初始化
CREATE DATABASE IF NOT EXISTS class_pet_house
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE class_pet_house;

-- 表结构由 Sequelize 自动同步，这里只需要创建数据库
-- 启动后端时会自动建表：npm start

-- 生成测试卡密（可选）
-- INSERT INTO licenses (code, is_used, created_at, updated_at)
-- VALUES ('TEST-KEY-001', false, NOW(), NOW());
