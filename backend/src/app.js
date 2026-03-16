const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const sanitize = require('./middleware/sanitize');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitize);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 给点容错
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

const petImagesStatic = express.static(path.join(__dirname, '../../assets/pets'));
app.use('/pet-images', petImagesStatic);
app.use('/动物图片', petImagesStatic);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/students', require('./routes/students'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/history', require('./routes/history'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/score-rules', require('./routes/scoreRules'));
app.use('/api/export', require('./routes/export'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/sync', require('./routes/sync').router);
app.use('/api/ai', require('./routes/ai'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get(/(.*)/, (req, res) => {
    if (!req.path.startsWith('/api/')) res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 🚀 核心增加：全局错误处理兜底
app.use((err, req, res, next) => {
  console.error('❌ [Server Internal Error]:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : '服务器开小差了，请稍后再试'
  });
});

module.exports = app;