const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SECRET_ID = (process.env.COS_SECRET_ID || '').trim();
const SECRET_KEY = (process.env.COS_SECRET_KEY || '').trim();
const BUCKET = (process.env.COS_BUCKET || '').trim();
const REGION = (process.env.COS_REGION || '').trim();

const LOCAL_DIR = path.resolve(
  process.env.COS_LOCAL_DIR || path.resolve(__dirname, '../assets/pets')
);
const KEY_PREFIX = (process.env.COS_KEY_PREFIX || '').replace(/^\/+|\/+$/g, '');
const STORAGE_CLASS = (process.env.COS_STORAGE_CLASS || 'MAZ_STANDARD').trim();
const CONCURRENCY = Number(process.env.COS_CONCURRENCY || 10);
const RETRY = Number(process.env.COS_RETRY || 2);
const MAX_FILES = Number(process.env.COS_MAX_FILES || 0);
const SKIP_EXISTING = String(process.env.COS_SKIP_EXISTING || 'false').toLowerCase() === 'true';

if (!SECRET_ID || !SECRET_KEY || !BUCKET || !REGION) {
  console.error('❌ 缺少 COS 配置。请在 backend/.env 中配置:');
  console.error('COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION');
  process.exit(1);
}

if (!fs.existsSync(LOCAL_DIR)) {
  console.error(`❌ 本地目录不存在: ${LOCAL_DIR}`);
  process.exit(1);
}

const cos = new COS({
  SecretId: SECRET_ID,
  SecretKey: SECRET_KEY,
});

function getAllFiles(dirPath, filesArray = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file.startsWith('.')) continue;
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, filesArray);
    } else {
      filesArray.push(fullPath);
    }
  }
  return filesArray;
}

function toCosKey(localFilePath) {
  const relativePath = path.relative(LOCAL_DIR, localFilePath).split(path.sep).join('/');
  return KEY_PREFIX ? `${KEY_PREFIX}/${relativePath}` : relativePath;
}

function headObjectIfExists(key) {
  return new Promise((resolve, reject) => {
    cos.headObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
      },
      (err) => {
        if (!err) return resolve(true);
        const code = err.statusCode || err.error?.Code;
        if (code === 404 || code === 'NoSuchKey' || code === 'Not Found') return resolve(false);
        reject(err);
      }
    );
  });
}

function putObject(localFilePath, key, storageClass) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        StorageClass: storageClass,
        Body: fs.createReadStream(localFilePath),
      },
      (err, data) => {
        if (err) return reject(err);
        resolve(data);
      }
    );
  });
}

async function uploadWithRetry(localFilePath) {
  const key = toCosKey(localFilePath);

  if (SKIP_EXISTING) {
    const exists = await headObjectIfExists(key);
    if (exists) {
      console.log(`⏭️ 已存在，跳过: ${key}`);
      return { ok: true, skipped: true, key };
    }
  }

  let lastErr = null;
  let storageClass = STORAGE_CLASS;
  const maxTry = Math.max(1, RETRY + 1);

  for (let i = 1; i <= maxTry; i++) {
    try {
      await putObject(localFilePath, key, storageClass);
      console.log(`✅ 上传成功: ${key}`);
      return { ok: true, skipped: false, key };
    } catch (err) {
      lastErr = err;
      const code = err.code || err.error?.Code || 'UnknownError';

      // 若误配为单 AZ 存储类型，自动切换并重试
      if (code === 'SAZOperationNotSupportOnMAZBucket' && !storageClass.startsWith('MAZ_')) {
        storageClass = 'MAZ_STANDARD';
      }

      if (i < maxTry) {
        console.warn(`⚠️ 上传重试(${i}/${maxTry - 1}): ${key} | ${code}`);
        await new Promise((r) => setTimeout(r, 300 * i));
        continue;
      }
    }
  }

  console.error(`❌ 上传失败: ${key}`);
  console.error(lastErr?.Message || lastErr?.message || lastErr);
  return { ok: false, skipped: false, key, err: lastErr };
}

async function runInBatches(files) {
  let success = 0;
  let skipped = 0;
  const failed = [];

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((file) => uploadWithRetry(file)));
    for (const r of results) {
      if (r.ok && r.skipped) skipped++;
      else if (r.ok) success++;
      else failed.push(r);
    }
  }

  return { success, skipped, failed };
}

async function main() {
  console.log(`🔍 扫描目录: ${LOCAL_DIR}`);
  console.log(`☁️ Bucket=${BUCKET} Region=${REGION} StorageClass=${STORAGE_CLASS}`);

  let allFiles = getAllFiles(LOCAL_DIR);
  if (MAX_FILES > 0) allFiles = allFiles.slice(0, MAX_FILES);

  console.log(`📦 待处理文件数: ${allFiles.length}\n`);
  if (!allFiles.length) {
    console.log('没有可上传文件。');
    return;
  }

  const { success, skipped, failed } = await runInBatches(allFiles);

  console.log('\n---- 上传结果 ----');
  console.log(`成功: ${success}`);
  console.log(`跳过: ${skipped}`);
  console.log(`失败: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\n失败列表(前20):');
    failed.slice(0, 20).forEach((f) => {
      const code = f.err?.code || f.err?.error?.Code || 'UnknownError';
      console.log(`- ${f.key} | ${code}`);
    });
    process.exitCode = 1;
  } else {
    const base = `https://${BUCKET}.cos.${REGION}.myqcloud.com/`;
    console.log(`\n🎉 全部完成。访问前缀: ${base}`);
  }
}

main().catch((err) => {
  console.error('❌ 脚本异常退出:', err?.message || err);
  process.exit(1);
});
