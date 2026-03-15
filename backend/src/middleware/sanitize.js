const xss = require('xss');

// 递归清理对象中的字符串值（带深度限制）
function sanitizeValue(val, depth = 0) {
  if (depth > 10) return val;
  if (typeof val === 'string') return xss(val);
  if (Array.isArray(val)) return val.map(v => sanitizeValue(v, depth + 1));
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && val.constructor === Object) {
    const clean = {};
    for (const k of Object.keys(val)) {
      clean[k] = sanitizeValue(val[k], depth + 1);
    }
    return clean;
  }
  return val;
}

const sanitize = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  next();
};

module.exports = sanitize;
