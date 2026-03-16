const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { User, Class, ScoreRule, License, sequelize } = require('../models');
const auth = require('../middleware/auth');

// 架构师基建：异步错误捕获包装器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const generateToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'class-pet-house-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const DEFAULT_RULES = [
  { name: '早读打卡', icon: '📖', value: 1 },
  { name: '作业优秀', icon: '⭐', value: 3 },
  { name: '课堂表现好', icon: '🙋', value: 2 },
  { name: '帮助同学', icon: '🤝', value: 2 },
  { name: '考试进步', icon: '📈', value: 5 },
  { name: '迟到', icon: '⏰', value: -1 },
  { name: '未交作业', icon: '📝', value: -2 },
  { name: '不守纪律', icon: '⚠️', value: -1 }
];

// 注册与激活合并 - 【引入事务与行级锁，防止并发刷激活码】
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, activationCode } = req.body;
  if (!username || !password || !activationCode) return res.status(400).json({ error: '参数不完整' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: '用户名长度需为3-20个字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });

  const t = await sequelize.transaction();
  try {
    // 使用排他锁锁定激活码，防止同一毫秒内多次使用同一激活码
    const license = await License.findOne({ 
      where: { code: activationCode, is_used: false }, 
      lock: t.LOCK.UPDATE,
      transaction: t 
    });
    if (!license) {
      await t.rollback();
      return res.status(400).json({ error: '激活码无效或已被使用' });
    }

    const existing = await User.findOne({ where: { username }, lock: t.LOCK.UPDATE, transaction: t });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 触发 User 模型的 beforeSave 钩子自动加密
    const user = await User.create({
      username,
      password_hash: password, 
      activation_code: activationCode,
      is_activated: true
    }, { transaction: t });

    await license.update({ is_used: true, used_by: user.id, used_at: new Date() }, { transaction: t });

    const cls = await Class.create({ user_id: user.id, name: '默认班级' }, { transaction: t });
    const rulesData = DEFAULT_RULES.map((r, i) => ({ class_id: cls.id, ...r, sort_order: i }));
    await ScoreRule.bulkCreate(rulesData, { transaction: t });

    await t.commit();
    res.status(201).json({
      token: generateToken(user),
      user: { id: user.id, username: user.username, is_activated: true },
      status: 'authenticated'
    });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 登录
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(401).json({ error: '用户名或密码错误' });

  const user = await User.findOne({ where: { username } });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  res.json({
    token: generateToken(user),
    user: { id: user.id, username: user.username, is_activated: user.is_activated },
    status: user.is_activated ? 'authenticated' : 'not_activated'
  });
}));

// 修改密码
router.put('/change-password', auth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6个字符' });

  const valid = await req.user.comparePassword(oldPassword);
  if (!valid) return res.status(400).json({ error: '旧密码错误' });

  // 直接赋值，自动走 beforeSave 钩子加密
  await req.user.update({ password_hash: newPassword });
  res.json({ message: '密码修改成功' });
}));

// 重置密码
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { username, activationCode, newPassword } = req.body;
  if (!username || !activationCode || !newPassword) return res.status(400).json({ error: '请填写完整' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6个字符' });

  const user = await User.findOne({ where: { username, activation_code: activationCode } });
  if (!user) return res.status(400).json({ error: '用户名或激活码不匹配' });

  await user.update({ password_hash: newPassword });
  res.json({ message: '密码重置成功' });
}));

// 获取当前用户 (无数据库异步查询需求，但保持结构一致)
router.get('/me', auth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username, is_activated: req.user.is_activated, settings: req.user.settings }});
});

// 退出登录
router.post('/logout', auth, (req, res) => res.json({ message: '已退出' }));

// 更新设置
router.put('/settings', auth, asyncHandler(async (req, res) => {
  const allowedKeys = ['theme', 'sound', 'animation', 'language', 'fontSize'];
  const filtered = {};
  allowedKeys.forEach(k => { if (req.body[k] !== undefined) filtered[k] = req.body[k]; });
  await req.user.update({ settings: { ...req.user.settings, ...filtered } });
  res.json({ message: '设置已保存', settings: req.user.settings });
}));

module.exports = router;