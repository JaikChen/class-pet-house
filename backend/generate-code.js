require('dotenv').config();
const crypto = require('crypto');
const { License } = require('./src/models');

async function generate() {
    const count = parseInt(process.argv[2]) || 1;
    const codes = [];

    try {
        console.log(`⏳ 正在生成 ${count} 个激活码...`);
        for (let i = 0; i < count; i++) {
            const code = 'CPH-' + crypto.randomBytes(8).toString('hex').toUpperCase();
            await License.create({ code });
            codes.push(code);
        }

        console.log('\n✅ 激活码生成成功！请保存在安全的地方：\n');
        codes.forEach((c, index) => {
            console.log(`[${index + 1}] ${c}`);
        });
        console.log('');
        process.exit(0);
    } catch (error) {
        console.error('❌ 生成失败:', error.message);
        process.exit(1);
    }
}

generate();
