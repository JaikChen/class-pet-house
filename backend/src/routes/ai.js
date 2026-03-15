const router = require('express').Router();
const auth = require('../middleware/auth');
const { requireActivated } = require('../middleware/auth');
const { Student, Class, Group, History } = require('../models');
const { Op } = require('sequelize');

/**
 * POST /api/ai/evaluate - 生成单个学生AI评语（流式）
 */
router.post('/evaluate', auth, requireActivated, async (req, res) => {
    try {
        const { studentId, classId } = req.body;
        if (!studentId || !classId) return res.status(400).json({ error: '参数不完整' });

        // 验证权限
        const cls = await Class.findOne({ where: { id: classId, user_id: req.userId } });
        if (!cls) return res.status(404).json({ error: '班级不存在' });

        const student = await Student.findOne({
            where: { id: studentId, class_id: classId },
            include: [{ model: Group, as: 'Group', attributes: ['id', 'name'] }]
        });
        if (!student) return res.status(404).json({ error: '学生不存在' });

        // 查询最近30天的历史记录
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const histories = await History.findAll({
            where: {
                student_id: studentId,
                class_id: classId,
                is_revoked: false,
                createdAt: { [Op.gte]: thirtyDaysAgo }
            },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        // 组装学生数据摘要
        const totalScore = histories.filter(h => h.type === 'score').reduce((sum, h) => sum + h.value, 0);
        const scoreDetails = histories
            .filter(h => h.type === 'score' && h.rule_name)
            .reduce((acc, h) => {
                acc[h.rule_name] = (acc[h.rule_name] || 0) + h.value;
                return acc;
            }, {});

        const growthStages = cls.growth_stages || [0, 5, 10, 20, 30, 45, 60, 75, 90, 100];
        let petLevel = 1;
        for (let i = growthStages.length - 1; i >= 0; i--) {
            if (student.food_count >= growthStages[i]) { petLevel = i + 1; break; }
        }

        const prompt = `你是一位温暖且专业的小学/幼儿园班主任助手。请根据以下学生数据，生成一段鼓励性的评语（80-12s0字），适合发给家长。语气亲切温暖，突出进步和优点，委婉提出改进建议。不要使用markdown格式。

学生信息：
- 姓名：${student.name}
- 所在班级：${cls.name}
- 小组：${student.Group?.name || '未分组'}
- 宠物类型：${student.pet_name || '未领养'}（Lv.${petLevel}）
- 当前累计积分：${student.food_count}
- 获得的徽章数：${student.badges?.length || 0}

最近30天表现：
- 总获得积分：${totalScore}
- 各项目得分：${Object.entries(scoreDetails).map(([k, v]) => `${k}(+${v})`).join('、') || '暂无记录'}

请生成评语：`;

        // 调用 DeepSeek API（流式）
        const apiKey = process.env.AI_API_KEY;
        const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';
        const model = process.env.AI_MODEL || 'deepseek-chat';

        if (!apiKey) {
            return res.status(400).json({ error: 'AI未配置，请在设置中配置AI API Key' });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                max_tokens: 500,
                temperature: 0.8
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('AI API error:', errText);
            return res.status(502).json({ error: 'AI服务调用失败' });
        }

        // 流式转发
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留未完成的行

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                } catch (e) { /* 忽略解析错误 */ }
            }
        }

        res.end();
    } catch (err) {
        console.error('AI evaluate error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: '生成评语失败' });
        }
    }
});

/**
 * POST /api/ai/generate-pet-name - AI起名（非流式）
 */
router.post('/generate-pet-name', auth, requireActivated, async (req, res) => {
    try {
        const { studentName, petType } = req.body;
        if (!studentName || !petType) return res.status(400).json({ error: '参数不完整' });

        const themes = [
            '干饭人专属，全是以好吃的、零食结尾（如：X芋泥、X小土豆、X波波）',
            '搞怪职场风，像个苦逼打工人或者霸道老板（如：X总、X厂长、纯情X少、X老六）',
            '二次元中二病，名字特别长或者像动漫必杀技（如：X搭子、X神、X的奇妙冒险、X大魔王）',
            '极致抽象发疯文学，毫无逻辑只有离谱（如：X了个X、尊嘟假嘟X、X不发胖、X爱摸鱼）',
            '土豪炫富风，名字听起来就很多金、很有排面（如：镶金X、X百亿、X老板、欧皇X）',
            '可爱萌物风，极致的叠词或者可爱后缀（如：X小宝、布丁X、X喵喵、X哈基米）'
        ];
        const randomTheme = themes[Math.floor(Math.random() * themes.length)];

        const prompt = `你是一个精通当下年轻圈层、B站、小红书等全网最潮流行语的00后宠物起名大师。
学生的名字叫“${studentName}”，他领养了一只宠物：“${petType}”。
请你为这只宠物起一个现在年轻人超爱用的、极具“网感”的网红名字或搞怪名字。

【本次必须遵守的三大强制规则，违反则视为失败】：
1. 你的起名风格这次必须是：【${randomTheme}】！！！并围绕这个风格去起名！！！
2. 名字的第一个字，必须是该学生的姓氏（即“${studentName}”的首字，如果是复姓也可以直接用全称）！
3. 绝对禁止使用老年代的“土味”或“俗气”名字（不要出现：铁柱、翠花、建国、富贵、旺财 等）。

尽量简短、萌、好笑且现代，长度控制在2到6个字最佳。
本次随机种子因子：${Math.random().toString(36).substring(7)}，确切保证不与之前重复。

只需要直接返回最终的名字（包含姓氏），不要任何标点符号，不要解释，也绝对不要加上“【】”或说多余的废话！`;

        const apiKey = process.env.AI_API_KEY;
        const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';
        const model = process.env.AI_MODEL || 'deepseek-chat';

        if (!apiKey) return res.status(400).json({ error: '未配置AI API Key' });

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                max_tokens: 20,
                temperature: 0.9 // 稍微高一点增加创意
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('AI API error:', errText);
            return res.status(502).json({ error: 'AI服务调用失败' });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '大聪明';
        res.json({ name: content });
    } catch (err) {
        console.error('AI generate name error:', err);
        res.status(500).json({ error: '生成名字失败' });
    }
});

/**
 * POST /api/ai/weekly-report - 生成全班周报（流式）
 */
router.post('/weekly-report', auth, requireActivated, async (req, res) => {
    try {
        const { classId, days = 7 } = req.body;
        if (!classId) return res.status(400).json({ error: '参数不完整' });

        const cls = await Class.findOne({ where: { id: classId, user_id: req.userId } });
        if (!cls) return res.status(404).json({ error: '班级不存在' });

        const students = await Student.findAll({
            where: { class_id: classId },
            include: [{ model: Group, as: 'Group', attributes: ['id', 'name'] }]
        });

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const histories = await History.findAll({
            where: {
                class_id: classId,
                is_revoked: false,
                createdAt: { [Op.gte]: since }
            },
            order: [['createdAt', 'DESC']]
        });

        // 按学生汇总
        const studentMap = {};
        students.forEach(s => {
            studentMap[s.id] = {
                name: s.name,
                group: s.Group?.name || '未分组',
                food_count: s.food_count,
                badges: s.badges?.length || 0,
                period_score: 0,
                details: {}
            };
        });

        histories.forEach(h => {
            if (h.type === 'score' && studentMap[h.student_id]) {
                studentMap[h.student_id].period_score += h.value;
                if (h.rule_name) {
                    studentMap[h.student_id].details[h.rule_name] =
                        (studentMap[h.student_id].details[h.rule_name] || 0) + h.value;
                }
            }
        });

        const studentSummaries = Object.values(studentMap)
            .sort((a, b) => b.period_score - a.period_score)
            .map(s => `${s.name}(${s.group}): 本期+${s.period_score}, 累计${s.food_count}, 徽章${s.badges}`)
            .join('\n');

        const totalScore = Object.values(studentMap).reduce((sum, s) => sum + s.period_score, 0);
        const activeCount = Object.values(studentMap).filter(s => s.period_score > 0).length;

        const prompt = `你是一位专业的班主任助手。请根据以下班级数据，生成一份班级周报/月报（300-500字），适合发到家长群。语气积极向上，重点表扬进步学生，对表现一般的学生给予鼓励。最后给出简短的班级建议。不要使用markdown格式，用纯文本。

班级：${cls.name}
统计周期：最近${days}天
学生总数：${students.length}
本期有积分学生：${activeCount}人
本期全班总积分：${totalScore}

各学生表现（按积分排序）：
${studentSummaries}

请生成报告：`;

        const apiKey = process.env.AI_API_KEY;
        const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';
        const model = process.env.AI_MODEL || 'deepseek-chat';

        if (!apiKey) {
            return res.status(400).json({ error: 'AI未配置，请在设置中配置AI API Key' });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                max_tokens: 1000,
                temperature: 0.8
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('AI API error:', errText);
            return res.status(502).json({ error: 'AI服务调用失败' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                } catch (e) { /* 忽略解析错误 */ }
            }
        }

        res.end();
    } catch (err) {
        console.error('AI weekly-report error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: '生成周报失败' });
        }
    }
});

/**
 * POST /api/ai/config - 保存AI配置
 */
router.post('/config', auth, requireActivated, async (req, res) => {
    try {
        const { apiKey, apiUrl, model } = req.body;
        // 运行时更新环境变量（重启后失效，需手动写 .env）
        if (apiKey) process.env.AI_API_KEY = apiKey;
        if (apiUrl) process.env.AI_API_URL = apiUrl;
        if (model) process.env.AI_MODEL = model;
        res.json({ message: '配置已保存' });
    } catch (err) {
        res.status(500).json({ error: '保存失败' });
    }
});

/**
 * GET /api/ai/config - 获取AI配置状态
 */
router.get('/config', auth, requireActivated, async (req, res) => {
    res.json({
        hasKey: !!process.env.AI_API_KEY,
        apiUrl: process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions',
        model: process.env.AI_MODEL || 'deepseek-chat'
    });
});

module.exports = router;
