const router = require('express').Router();
const { ShopItem, ExchangeRecord, Student, Class, History, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 获取班级商品
router.get('/class/:classId', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.classId, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const items = await ShopItem.findAll({
    where: { class_id: cls.id },
    order: [['created_at', 'ASC']]
  });
  res.json(items);
}));

// 添加商品
router.post('/', auth, requireActivated, asyncHandler(async (req, res) => {
  // 核心修改：解构并接收 image 字段
  const { class_id, name, description, icon, image, price, stock } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });
  if (!name || typeof name !== 'string') return res.status(400).json({ error: '商品名称不能为空' });
  if (!price || typeof price !== 'number' || price < 1) return res.status(400).json({ error: '价格至少为1' });

  const itemCount = await ShopItem.count({ where: { class_id } });
  if (itemCount >= 100) return res.status(400).json({ error: '最多创建100个商品' });

  const item = await ShopItem.create({ class_id, name, description, icon, image, price, stock: stock ?? -1 });
  res.json(item);
}));

// 更新商品
router.put('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const item = await ShopItem.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: '商品不存在' });

  const cls = await Class.findOne({ where: { id: item.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  // 核心修改：允许更新 image 字段
  const { name, description, icon, image, price, stock } = req.body;
  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: '商品名称不能为空' });
  }
  
  await item.update({
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description }),
    ...(icon !== undefined && { icon }),
    ...(image !== undefined && { image }),
    ...(price !== undefined && { price }),
    ...(stock !== undefined && { stock })
  });
  res.json(item);
}));

// 删除商品
router.delete('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const item = await ShopItem.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: '商品不存在' });

  const cls = await Class.findOne({ where: { id: item.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  await item.destroy();
  res.json({ message: '删除成功' });
}));

// 兑换商品
router.post('/exchange', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id, student_id, item_id } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const t = await sequelize.transaction();
  try {
    const student = await Student.findOne({ 
      where: { id: student_id, class_id }, 
      lock: t.LOCK.UPDATE, 
      transaction: t 
    });
    if (!student) {
      await t.rollback();
      return res.status(404).json({ error: '学生不存在' });
    }

    const item = await ShopItem.findOne({ 
      where: { id: item_id, class_id }, 
      lock: t.LOCK.UPDATE, 
      transaction: t 
    });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ error: '商品不存在' });
    }

    if (item.stock === 0) {
      await t.rollback();
      return res.status(400).json({ error: '商品库存不足' });
    }

    const badges = student.badges || [];
    if (badges.length < item.price) {
      await t.rollback();
      return res.status(400).json({ error: '徽章不足' });
    }

    const remainingBadges = badges.slice(item.price);
    student.set('badges', remainingBadges);
    await student.save({ transaction: t });

    if (item.stock > 0) {
      await item.update({ stock: item.stock - 1 }, { transaction: t });
    }

    const record = await ExchangeRecord.create({
      class_id, student_id, item_id,
      item_name: item.name, cost: item.price
    }, { transaction: t });

    await History.create({
      class_id, student_id,
      rule_id: null, rule_name: `兑换: ${item.name}`,
      value: -item.price, type: 'exchange'
    }, { transaction: t });

    await t.commit();
    res.json({ message: '兑换成功', record });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

router.get('/exchange/:classId', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.classId, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const records = await ExchangeRecord.findAll({
    where: { class_id: cls.id },
    include: [{ model: Student, as: 'Student', attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: 200
  });
  res.json(records);
}));

module.exports = router;