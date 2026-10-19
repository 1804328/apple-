/**
 * 升级引擎（纯函数，可单测、不碰网络和数据库）。
 *
 * 一条提醒的升级链用 steps 表示：
 *   [{ after_sec: -86400, channels: ['pushplus'] }, ...]
 * after_sec 相对 fire_at：
 *   -86400 = 提前一天；0 = 到点；900 = 到点后 15 分钟。
 */

/** 到点后最多补发多久（服务端宕机/断网恢复后的追赶窗口） */
export const MAX_CATCHUP_SEC = 6 * 3600;

/** 默认升级链：T-1天 → T-2小时 → 到点 → +5min 微信 → +15min 短信 → +30min 电话 */
export const DEFAULT_STEPS = [
  { after_sec: -86400, channels: ['pushplus'] },
  { after_sec: -7200, channels: ['pushplus'] },
  { after_sec: 0, channels: ['pushplus'] },
  { after_sec: 300, channels: ['pushplus', 'email'] },
  { after_sec: 900, channels: ['sms'] },
  { after_sec: 1800, channels: ['voice'] },
];

/**
 * 清洗 steps：非法输入回退默认链，过滤掉没有渠道的步骤，按时间排序。
 * @param {unknown} raw
 * @returns {{after_sec: number, channels: string[]}[]}
 */
export function normalizeSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_STEPS.map((s) => ({ after_sec: s.after_sec, channels: [...s.channels] }));
  }
  const cleaned = raw
    .filter((s) => s && Number.isFinite(s.after_sec) && Array.isArray(s.channels))
    .map((s) => ({
      after_sec: Number(s.after_sec),
      channels: s.channels.filter((c) => typeof c === 'string' && c.length > 0),
    }))
    .filter((s) => s.channels.length > 0);

  if (cleaned.length === 0) {
    return DEFAULT_STEPS.map((s) => ({ after_sec: s.after_sec, channels: [...s.channels] }));
  }
  return cleaned.sort((a, b) => a.after_sec - b.after_sec);
}

/**
 * 计算此刻应当下发的步骤。
 *
 * 规则：
 *  1. 已确认（acked/done）→ 不下发
 *  2. due_at = fire_at + after_sec，还没到不下发
 *  3. due_at 早于提醒创建时间（前置预警设晚了）→ 跳过，避免一次性轰炸
 *  4. due_at 早于 now - catchup → 过期太久，不再补发
 *  5. 已投递过的 step 不重复
 *
 * @param {object} args
 * @param {{fire_at:number, created_at:number, status:string, acked_at?:number}} args.reminder
 * @param {{after_sec:number, channels:string[]}[]} args.steps
 * @param {number} args.now            epoch 秒
 * @param {Set<number>|number[]} [args.delivered] 已投递的 step 下标
 * @param {number} [args.catchupSec]
 * @param {number} [args.graceSec]     创建时间与 due 的容差（防止边界抖动）
 * @returns {{index:number, step:{after_sec:number,channels:string[]}, due:number}[]}
 */
export function dueSteps({
  reminder,
  steps,
  now,
  delivered = [],
  catchupSec = MAX_CATCHUP_SEC,
  graceSec = 60,
}) {
  if (!reminder) return [];
  if (reminder.status !== 'pending') return [];
  if (reminder.acked_at) return [];

  const deliveredSet = delivered instanceof Set ? delivered : new Set(delivered);
  const createdAt = Number(reminder.created_at ?? 0);
  const fireAt = Number(reminder.fire_at);

  const out = [];
  steps.forEach((step, index) => {
    if (deliveredSet.has(index)) return;

    const due = fireAt + Number(step.after_sec);
    if (due > now) return;
    if (due < createdAt - graceSec) return;

    const isPreAlert = Number(step.after_sec) < 0;
    if (isPreAlert) {
      // 前置预警只在其本身有意义的窗口内发：到点之后就不该再补发"提前一天"的提醒
      if (now >= fireAt) return;
    } else {
      // 到点后的升级步骤：服务端宕机/断网恢复后，超过补发窗口就不再补，避免半夜轰炸
      if (due < now - catchupSec) return;
    }

    out.push({ index, step, due });
  });

  return out.sort((a, b) => a.due - b.due || a.index - b.index);
}

/**
 * 是否已彻底错过（用于把状态落成 missed，停止继续升级）。
 * @param {{fire_at:number, status:string, acked_at?:number}} reminder
 * @param {number} now
 * @param {number} [catchupSec]
 */
export function shouldMarkMissed(reminder, now, catchupSec = MAX_CATCHUP_SEC) {
  if (!reminder || reminder.status !== 'pending' || reminder.acked_at) return false;
  return Number(reminder.fire_at) + catchupSec < now;
}
