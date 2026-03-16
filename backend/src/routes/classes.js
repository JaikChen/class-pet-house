const router = require('express').Router();
const { Class, Student, ScoreRule, ShopItem, Group, History, ExchangeRecord, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 获取班级列表
router.get('/', auth, requireActivated, asyncHandler(async (req, res) => {
  const classes = await Class.findAll({
    where: { user_id: req.userId },
    order: [['sort_order', 'ASC'], ['created_at', 'ASC']]
  });
  res.json(classes);
}));

// 创建班级
router.post('/', auth, requireActivated, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: '班级名称不能为空' });

  const count = await Class.count({ where: { user_id: req.userId } });
  if (count >= 20) return res.status(400).json({ error: '最多创建20个班级' });

  const cls = await Class.create({
    user_id: req.userId,
    name: name.trim(),
    sort_order: count
  });
  res.json(cls);
}));

// 更新班级
router.put('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const { name, system_name, theme, growth_stages, sort_order } = req.body;

  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: '班级名称不能为空' });
  }

  // growth_stages 格式校验
  if (growth_stages !== undefined) {
    if (!Array.isArray(growth_stages) || growth_stages.length < 2 || growth_stages.length > 20
      || !growth_stages.every(v => typeof v === 'number' && v >= 0)) {
      return res.status(400).json({ error: '成长阶段格式不正确' });
    }
  }

  await cls.update({
    ...(name !== undefined && { name }),
    ...(system_name !== undefined && { system_name }),
    ...(theme !== undefined && { theme }),
    ...(growth_stages !== undefined && { growth_stages }),
    ...(sort_order !== undefined && { sort_order })
  });
  res.json(cls);
}));

// 删除班级 - 【引入事务确保级联删除的原子性】
router.delete('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const count = await Class.count({ where: { user_id: req.userId } });
  if (count <= 1) return res.status(400).json({ error: '至少保留一个班级' });

  const cls = await Class.findOne({ where: { id: req.params.id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const t = await sequelize.transaction();
  try {
    await History.destroy({ where: { class_id: cls.id }, transaction: t });
    await ExchangeRecord.destroy({ where: { class_id: cls.id }, transaction: t });
    await Student.destroy({ where: { class_id: cls.id }, transaction: t });
    await ScoreRule.destroy({ where: { class_id: cls.id }, transaction: t });
    await ShopItem.destroy({ where: { class_id: cls.id }, transaction: t });
    await Group.destroy({ where: { class_id: cls.id }, transaction: t });
    await cls.destroy({ transaction: t });

    await t.commit();
    res.json({ message: '删除成功' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 复制班级配置（积分规则+商品+成长阶段） - 【引入事务确保复制过程完整】
router.post('/copy-config', auth, requireActivated, asyncHandler(async (req, res) => {
  const { from_class_id, to_class_id } = req.body;
  const fromCls = await Class.findOne({ where: { id: from_class_id, user_id: req.userId } });
  const toCls = await Class.findOne({ where: { id: to_class_id, user_id: req.userId } });
  
  if (!fromCls || !toCls) return res.status(404).json({ error: '班级不存在' });
  if (fromCls.id === toCls.id) return res.status(400).json({ error: '不能复制到自身' });

  const t = await sequelize.transaction();
  try {
    // 1. 复制成长阶段
    await toCls.update({ growth_stages: fromCls.growth_stages }, { transaction: t });

    // 2. 复制积分规则 (使用 bulkCreate 提高性能)
    const rules = await ScoreRule.findAll({ where: { class_id: from_class_id } });
    const newRules = rules.map(r => ({
      class_id: to_class_id, name: r.name,
      icon: r.icon, value: r.value, sort_order: r.sort_order
    }));
    await ScoreRule.bulkCreate(newRules, { transaction: t });

    // 3. 复制商品
    const items = await ShopItem.findAll({ where: { class_id: from_class_id } });
    const newItems = items.map(item => ({
      class_id: to_class_id, name: item.name,
      description: item.description, icon: item.icon,
      price: item.price, stock: item.stock
    }));
    await ShopItem.bulkCreate(newItems, { transaction: t });

    await t.commit();
    res.json({ message: '配置复制成功' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

module.exports = router;