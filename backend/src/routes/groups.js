const router = require('express').Router();
const { Group, Student, Class, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');

// 架构师基建：异步错误捕获包装器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 获取班级分组
router.get('/class/:classId', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.classId, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const groups = await Group.findAll({
    where: { class_id: cls.id },
    include: [{ model: Student, as: 'students', attributes: ['id', 'name'] }],
    order: [['sort_order', 'ASC']]
  });
  res.json(groups);
}));

// 创建分组
router.post('/', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id, name } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });
  if (!name) return res.status(400).json({ error: '分组名称不能为空' });

  const count = await Group.count({ where: { class_id } });
  if (count >= 50) return res.status(400).json({ error: '最多创建50个分组' });

  const group = await Group.create({ class_id, name, sort_order: count });
  res.json(group);
}));

// 更新分组
router.put('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const group = await Group.findByPk(req.params.id);
  if (!group) return res.status(404).json({ error: '分组不存在' });

  const cls = await Class.findOne({ where: { id: group.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  const { name, sort_order } = req.body;
  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: '分组名称不能为空' });
  }
  
  await group.update({
    ...(name !== undefined && { name: name.trim() }),
    ...(sort_order !== undefined && { sort_order })
  });
  res.json(group);
}));

// 删除分组 - 【核心重构：引入事务，确保级联更新原子性】
router.delete('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const group = await Group.findByPk(req.params.id);
  if (!group) return res.status(404).json({ error: '分组不存在' });

  const cls = await Class.findOne({ where: { id: group.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  const t = await sequelize.transaction();
  try {
    // 将该组学生设为未分组
    await Student.update({ group_id: null }, { where: { group_id: group.id }, transaction: t });
    await group.destroy({ transaction: t });
    await t.commit();
    res.json({ message: '删除成功' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 随机分组 - 【核心重构：引入事务，确保批量更新状态一致】
router.post('/random-assign', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const groups = await Group.findAll({ where: { class_id } });
  if (!groups.length) return res.status(400).json({ error: '请先创建分组' });

  const students = await Student.findAll({ where: { class_id } });
  
  // Fisher-Yates 洗牌算法
  const shuffled = [...students];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const t = await sequelize.transaction();
  try {
    for (let i = 0; i < shuffled.length; i++) {
      const group = groups[i % groups.length];
      await shuffled[i].update({ group_id: group.id }, { transaction: t });
    }
    await t.commit();
    res.json({ message: '随机分组完成' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

module.exports = router;