const router = require('express').Router();
const { Student, Class } = require('../models');
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');
const { createCanvas, loadImage } = require('canvas');
const archiver = require('archiver');
const path = require('path');

// 生成单个证书 PNG
async function generateCertificate(student, badge, template, date) {
  const width = 800, height = 1130;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#FFF8F0';
  ctx.fillRect(0, 0, width, height);

  // 边框装饰
  ctx.strokeStyle = '#F9A8D4';
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 3;
  ctx.strokeRect(45, 45, width - 90, height - 90);

  // 标题
  ctx.fillStyle = '#92400E';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 荣誉证书', width / 2, 150);

  // 学生名字
  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(student.name, width / 2, 280);

  // 描述文字
  ctx.fillStyle = '#6B7280';
  ctx.font = '24px sans-serif';
  ctx.fillText('在班级宠物养成中表现优秀', width / 2, 340);
  ctx.fillText(`成功培养宠物毕业，获得徽章！`, width / 2, 380);

  // 宠物图片
  try {
    const petFolder = badge.pet_type;
    const imgPath = path.join(__dirname, '../../assets/pets', petFolder + '十阶段图片', '10.webp');
    const img = await loadImage(imgPath);
    ctx.drawImage(img, width / 2 - 100, 430, 200, 200);
  } catch (e) {
    ctx.fillStyle = '#F9A8D4';
    ctx.font = '80px sans-serif';
    ctx.fillText('🐾', width / 2, 560);
  }

  // 宠物名字
  if (badge.pet_name) {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '20px sans-serif';
    ctx.fillText(badge.pet_name, width / 2, 660);
  }

  // 日期
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '20px sans-serif';
  ctx.fillText(`授予日期：${date}`, width / 2, 750);

  // 底部装饰
  ctx.fillStyle = '#F9A8D4';
  ctx.font = '16px sans-serif';
  ctx.fillText('🐾 班级宠物屋 🐾', width / 2, height - 80);

  return canvas.toBuffer('image/png');
}

// 生成徽章贴纸 PNG（圆形）
async function generateSticker(student, badge) {
  const size = 300;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // 透明背景 + 圆形裁剪
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // 背景色
  ctx.fillStyle = '#FEF3C7';
  ctx.fillRect(0, 0, size, size);

  // 宠物图片
  try {
    const imgPath = path.join(__dirname, '../../assets/pets', badge.pet_type + '十阶段图片', '10.webp');
    const img = await loadImage(imgPath);
    ctx.drawImage(img, 50, 30, 200, 200);
  } catch (e) {
    ctx.font = '80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐾', size / 2, size / 2);
  }

  // 学生名字
  ctx.fillStyle = '#92400E';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(student.name, size / 2, size - 30);

  return canvas.toBuffer('image/png');
}

// 单个学生导出
router.post('/certificate', auth, requireActivated, async (req, res) => {
  try {
    const { student_id, badge_indexes, type, date } = req.body;
    const student = await Student.findByPk(student_id);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const cls = await Class.findOne({ where: { id: student.class_id, user_id: req.userId } });
    if (!cls) return res.status(403).json({ error: '无权限' });

    const badges = student.badges || [];
    const indexes = badge_indexes || badges.map((_, i) => i);
    const exportDate = date || new Date().toISOString().split('T')[0];

    if (indexes.length === 1) {
      const badge = badges[indexes[0]];
      if (!badge) return res.status(400).json({ error: '徽章不存在' });

      const gen = type === 'sticker' ? generateSticker : generateCertificate;
      const buf = type === 'sticker'
        ? await gen(student, badge)
        : await gen(student, badge, 'gold', exportDate);

      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', `attachment; filename="${student.name}_${type || 'cert'}.png"`);
      return res.send(buf);
    }

    // 多个徽章 → ZIP
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${student.name}_export.zip"`);
    const archive = archiver('zip');
    archive.pipe(res);

    for (const idx of indexes) {
      const badge = badges[idx];
      if (!badge) continue;
      const certBuf = await generateCertificate(student, badge, 'gold', exportDate);
      archive.append(certBuf, { name: `certificate_${idx + 1}.png` });
      const stickerBuf = await generateSticker(student, badge);
      archive.append(stickerBuf, { name: `sticker_${idx + 1}.png` });
    }
    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: '导出失败' });
  }
});

// 批量导出（全班）
router.post('/batch', auth, requireActivated, async (req, res) => {
  try {
    const { class_id, type, date, max_badges } = req.body;
    const cls = await Class.findOne({ where: { id: class_id, user_id: req.userId } });
    if (!cls) return res.status(404).json({ error: '班级不存在' });

    const students = await Student.findAll({ where: { class_id } });
    const exportDate = date || new Date().toISOString().split('T')[0];

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="batch_export.zip"`);
    const archive = archiver('zip');
    archive.pipe(res);

    for (const student of students) {
      const badges = student.badges || [];
      if (!badges.length) continue;

      const selected = max_badges ? badges.slice(-max_badges) : badges;
      for (let i = 0; i < selected.length; i++) {
        const badge = selected[i];
        const certBuf = await generateCertificate(student, badge, 'gold', exportDate);
        archive.append(certBuf, { name: `${student.name}/certificate_${i + 1}.png` });

        if (type === 'sticker' || type === 'both') {
          const stickerBuf = await generateSticker(student, badge);
          archive.append(stickerBuf, { name: `${student.name}/sticker_${i + 1}.png` });
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: '批量导出失败' });
  }
});

module.exports = router;
