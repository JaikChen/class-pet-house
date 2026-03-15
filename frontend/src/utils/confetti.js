import confetti from 'canvas-confetti';

/**
 * 触发基于全屏两侧的绚丽彩带雨特效
 * 适用于宠物满级(毕业)或大额积分奖励时的震撼反馈
 */
export function fireGrandConfetti() {
    const duration = 3000;
    const end = Date.now() + duration;

    // 软糖美学配色
    const colors = ['#fde047', '#38bdf8', '#fb7185', '#a78bfa', '#34d399'];

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 1 },
            colors: colors
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 1 },
            colors: colors
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

/**
 * 触发中心轻微爆点彩带
 * 适用于日常中小额加分反馈
 */
export function firePopConfetti() {
    confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#38bdf8', '#fde047']
    });
}
