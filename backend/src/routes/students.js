const router = require('express').Router();
const { Student, Class, Group, History, ExchangeRecord } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/class/:classId', auth, requireActivated, asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ where: { id: req.params.classId, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  const students = await Student.findAll({
    where: { class_id: cls.id },
    include: [{ model: Group, as: 'Group', attributes: ['id', 'name'] }],
    order: [['sort_order', 'ASC'], ['created_at', 'ASC']]
  });
  res.json(students);
}));

router.post('/', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id, name, names } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  if (names && Array.isArray(names)) {
    if (names.length > 200) return res.status(400).json({ error: '单次最多添加200名学生' });
    const validNames = names.filter(n => typeof n === 'string' && n.trim() && n.trim().length <= 50);
    const existing = await Student.findAll({ where: { class_id }, attributes: ['name'] });
    const existingNames = new Set(existing.map(s => s.name));
    const total = existing.length;
    if (total + validNames.length > 500) return res.status(400).json({ error: '班级学生总数不能超过500' });

    const newStudents = validNames
      .filter(n => !existingNames.has(n.trim()))
      .map((n, i) => ({ class_id, name: n.trim(), sort_order: total + i }));

    const created = await Student.bulkCreate(newStudents);
    return res.json({ created: created.length, students: created });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: '学生姓名不能为空' });
  if (name.length > 50) return res.status(400).json({ error: '姓名最多50个字符' });

  const totalCount = await Student.count({ where: { class_id } });
  if (totalCount >= 500) return res.status(400).json({ error: '班级学生总数不能超过500' });

  const dup = await Student.findOne({ where: { class_id, name: name.trim() } });
  if (dup) return res.status(400).json({ error: '该班级已有同名学生' });

  const count = await Student.count({ where: { class_id } });
  const student = await Student.create({ class_id, name: name.trim(), sort_order: count });
  res.json(student);
}));

router.put('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const cls = await Class.findOne({ where: { id: student.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  // 核心修改：允许更新 total_badges 字段
  const allowed = ['name', 'pet_type', 'pet_name', 'badges', 'total_badges', 'sort_order', 'group_id'];
  
  if (req.body.food_count !== undefined && Number(req.body.food_count) === 0) {
    allowed.push('food_count');
  }
  
  const updates = {};
  allowed.forEach(k => { 
    if (req.body[k] !== undefined) updates[k] = req.body[k]; 
  });

  await student.update(updates);
  res.json(student);
}));

router.delete('/:id', auth, requireActivated, asyncHandler(async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const cls = await Class.findOne({ where: { id: student.class_id, user_id: req.userId } });
  if (!cls) return res.status(403).json({ error: '无权限' });

  await History.destroy({ where: { student_id: student.id } });
  await ExchangeRecord.destroy({ where: { student_id: student.id } });
  await student.destroy();
  res.json({ message: '删除成功' });
}));

router.post('/reset-all', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });

  await Student.update(
    { food_count: 0, pet_type: null, pet_name: null },
    { where: { class_id } }
  );
  res.json({ message: '全班进度已重置' });
}));

router.post('/random-pets', auth, requireActivated, asyncHandler(async (req, res) => {
  const { class_id, pets } = req.body;
  const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
  if (!cls) return res.status(404).json({ error: '班级不存在' });
  if (!Array.isArray(pets) || !pets.length) return res.status(400).json({ error: '宠物列表不能为空' });

  const students = await Student.findAll({ where: { class_id, pet_type: null } });
  if (!students.length) return res.status(400).json({ error: '没有需要分配宠物的学生' });

  let count = 0;
  for (const s of students) {
    const pet = pets[Math.floor(Math.random() * pets.length)];
    await s.update({ pet_type: pet.id, pet_name: pet.name });
    count++;
  }
  res.json({ message: `已为${count}名学生随机分配宠物` });
}));

module.exports = router;