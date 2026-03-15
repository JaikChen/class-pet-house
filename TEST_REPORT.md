# 测试报告 - 班级宠物屋

## 测试时间：2026-02-27

---

## 🔴 严重缺陷（必须修复）

### BUG-01: auth中间件阻止未激活用户调用激活接口
- 文件: `backend/src/middleware/auth.js`
- 问题: 未激活用户返回403，但 `/api/auth/activate` 也用了auth中间件
- 影响: 注册后无法激活账号，整个系统不可用
- 修复: 激活接口需要跳过is_activated检查

### BUG-02: 注册时密码未加密存储
- 文件: `backend/src/routes/auth.js` 第50行
- 问题: `User.create({ password_hash: password })` 直接存明文
- 影响: 安全漏洞，密码泄露风险
- 修复: 注册时需要 bcrypt.hash(password, 10)

### BUG-03: food_count可以变成负数
- 文件: `backend/src/routes/history.js`
- 问题: 扣分时没有检查 food_count - value >= 0
- 影响: 学生积分显示负数，进度条异常
- 修复: 加分后 Math.max(0, food_count + value)

### BUG-04: 撤回操作缺少student_id过滤
- 文件: `backend/src/routes/history.js`
- 问题: 前端撤回时传了student_id查询参数，但后端没处理
- 影响: 撤回功能无法按学生过滤

### BUG-05: 小卖部兑换不扣减徽章
- 文件: `backend/src/routes/shop.js`
- 问题: 兑换时检查了徽章数量但没有扣减badges数组
- 影响: 徽章可以无限兑换

### BUG-06: History模型缺少is_revoked字段
- 文件: `backend/src/models/History.js`
- 问题: 撤回逻辑用了is_revoked但模型可能没定义
- 影响: 撤回功能报错

## 🟡 中等缺陷

### BUG-07: JWT_SECRET未设置时服务崩溃
- 文件: `backend/src/routes/auth.js`
- 问题: process.env.JWT_SECRET 未设置时 jwt.sign 会报错
- 修复: 提供默认值或启动时检查

### BUG-08: 批量删除历史缺少权限校验
- 文件: `backend/src/routes/history.js` batch-delete
- 问题: 只按record_ids删除，没验证是否属于当前用户
- 影响: 可以删除其他用户的历史记录

### BUG-09: 班级配置缺少.env.example
- 问题: 没有.env.example文件，部署时不知道需要哪些环境变量
- 修复: 创建.env.example

### BUG-10: 前端api.js错误处理可能不完整
- 需要检查axios拦截器是否正确处理401跳转登录

## 🟢 轻微问题

### BUG-11: 前端搜索框focus样式还是pink-300
- 文件: MainLayout.vue 搜索框
- 应改为主题色

### BUG-12: 数据库配置文件缺失
- 需要检查 backend/src/config/database.js
