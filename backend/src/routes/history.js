const router = require('express').Router();
const { History, Student, Class, ScoreRule, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');
const { broadcast } = require('./sync');

/**
 * 架构师基建：异步错误捕获包装器
 * 作用：替代每个路由里冗余的 try-catch，自动将错误传递给全局 Error Handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 获取班级操作历史
router.get('/class/:classId', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.classId, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const { limit: rawLimit = 50, offset: rawOffset = 0, student_id } = req.query;
  const limit = Math.min(Math.max(1, parseInt(rawLimit) || 50), 200);
  const offset = Math.max(0, parseInt(rawOffset) || 0);
  const where = { class_id: cls.id };

  if (student_id) {
    const sid = parseInt(student_id);
    if (isNaN(sid)) return res.status(400).json({ error: 'student_id 参数无效' });
    where.student_id = sid;
  }

  const history = await History.findAndCountAll({
    where,
    include: [{ model: Student, as: 'Student', attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  res.json(history);
}));

// 创建操作记录（加分/扣分）- 【引入了事务与行级排他锁】
router.post('/', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id, student_ids, rule_id, type: recordType } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const ids = Array.isArray(student_ids) ? student_ids.slice(0, 200) : [student_ids];
  const results = [];

  // 毕业记录（不扣分，仅记录）
  if (!rule_id && recordType === 'graduate') {
    const t = await sequelize.transaction();
    try {
      for (const sid of ids) {
        const student = await Student.findOne({ where: { id: sid, class_id }, transaction: t });
        if (!student) continue;
        const record = await History.create({
          class_id, student_id: sid,
          rule_id: null, rule_name: '宠物毕业',
          value: 0, type: 'graduate'
        }, { transaction: t });
        results.push({ student_id: sid, record_id: record.id });
      }
      await t.commit();
      return res.json({ results });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // 普通加分/扣分
  const rule = await ScoreRule.findByPk(rule_id);
  if (!rule) return res.status(404).json({ error: '规则不存在' });
  if (rule.class_id !== cls.id) return res.status(403).json({ error: '规则不属于当前班级' });

  // 开启事务处理积分变更
  const t = await sequelize.transaction();
  try {
    for (const sid of ids) {
      // 核心修复：lock: t.LOCK.UPDATE 会生成 FOR UPDATE 语句，防止并发覆盖
      const student = await Student.findOne({ 
        where: { id: sid, class_id }, 
        lock: t.LOCK.UPDATE, 
        transaction: t 
      });
      if (!student) continue;

      const newFoodCount = Math.max(0, student.food_count + rule.value);
      await student.update({ food_count: newFoodCount }, { transaction: t });

      const record = await History.create({
        class_id, student_id: sid,
        rule_id: rule.id, rule_name: rule.name,
        value: rule.value, type: 'score'
      }, { transaction: t });

      results.push({ student_id: sid, record_id: record.id, new_food: newFoodCount });
    }
    await t.commit();
    res.json({ results });

    // SSE 广播通知前端刷新 (移至事务成功提交后，避免发送脏数据)
    broadcast(req.userId, { type: 'score_update', class_id, results });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 撤回操作 - 【引入事务与行级锁】
router.post('/revoke', auth, requireActivated, asyncHandler(async (req, res) => {
  const { record_id } = req.body;

  const t = await sequelize.transaction();
  try {
    const record = await History.findByPk(record_id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!record || record.is_revoked) {
      await t.rollback();
      return res.status(400).json({ error: '记录不存在或已撤回' });
    }

    const cls = await Class.findOne({ where: { id: record.class_id, user_id: req.userId }, transaction: t });
    if (!cls) {
      await t.rollback();
      return res.status(403).json({ error: '无权限' });
    }

    const student = await Student.findByPk(record.student_id, { lock: t.LOCK.UPDATE, transaction: t });
    if (student) {
      await student.update({ food_count: Math.max(0, student.food_count - record.value) }, { transaction: t });
    }

    await record.update({ is_revoked: true }, { transaction: t });
    await t.commit();
    res.json({ message: '撤回成功' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 批量撤回 - 【引入事务与行级锁】
router.post('/revoke-batch', auth, requireActivated, asyncHandler(async (req, res) => {
  const { record_ids } = req.body;
  if (!Array.isArray(record_ids)) return res.status(400).json({ error: '参数错误' });
  if (record_ids.length > 100) return res.status(400).json({ error: '单次最多撤回100条' });

  const t = await sequelize.transaction();
  try {
    let count = 0;
    for (const id of record_ids) {
      const record = await History.findByPk(id, { lock: t.LOCK.UPDATE, transaction: t });
      if (!record || record.is_revoked) continue;

      const cls = await Class.findOne({ where: { id: record.class_id, user_id: req.userId }, transaction: t });
      if (!cls) continue;

      const student = await Student.findByPk(record.student_id, { lock: t.LOCK.UPDATE, transaction: t });
      if (student) {
        await student.update({ food_count: Math.max(0, student.food_count - record.value) }, { transaction: t });
      }
      await record.update({ is_revoked: true }, { transaction: t });
      count++;
    }
    await t.commit();
    res.json({ message: `已撤回${count}条记录` });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}));

// 批量删除历史
router.post('/batch-delete', auth, requireActivated, asyncHandler(async (req, res) => {
  const { record_ids } = req.body;
  if (!Array.isArray(record_ids)) return res.status(400).json({ error: '参数错误' });
  if (record_ids.length > 200) return res.status(400).json({ error: '单次最多删除200条' });

  const records = await History.findAll({ where: { id: record_ids } });
  if (records.length === 0) return res.json({ message: '删除成功' });

  // 权限校验：提取所有涉及的班级 ID，验证是否属于当前用户
  const classIds = [...new Set(records.map(r => r.class_id))];
  for (const cid of classIds) {
    const cls = await Class.findOne({ where: { id: cid, user_id: req.userId } });
    if (!cls) return res.status(403).json({ error: '无权限删除其他用户的记录' });
  }

  await History.destroy({ where: { id: record_ids } });
  res.json({ message: '删除成功' });
}));

module.exports = router;