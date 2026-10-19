import type { EscalationStep } from '../types';

const DAY = 86400;

/** 默认升级链：T-1天 → T-2小时 → 到点 → +5min → +15min → +30min */
export const DEFAULT_STEPS: EscalationStep[] = [
  { afterSec: -DAY, channels: ['pushplus'] },
  { afterSec: -7200, channels: ['pushplus'] },
  { afterSec: 0, channels: ['pushplus'] },
  { afterSec: 300, channels: ['pushplus', 'email'] },
  { afterSec: 900, channels: ['sms'] },
  { afterSec: 1800, channels: ['voice'] },
];

/** 按强制度档位生成升级链 */
export function stepsForLevel(forceLevel: number): EscalationStep[] {
  if (forceLevel <= 2) return [{ afterSec: 0, channels: ['pushplus'] }];
  if (forceLevel <= 4) return DEFAULT_STEPS.map((s) => ({ ...s, channels: [...s.channels] }));
  // L5/L6：到点后多催一轮
  return [
    ...DEFAULT_STEPS.map((s) => ({ ...s, channels: [...s.channels] })),
    { afterSec: 3600, channels: ['pushplus'] },
  ];
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 距离到点的可读倒计时 */
export function formatCountdown(ms: number, now = Date.now()): string {
  const diff = ms - now;
  if (diff <= 0) return '已到点';
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  return `${Math.max(1, mins)} 分钟`;
}

/** 2026-10-25 20:00 → "今天 20:00" / "明天 20:00" / "10-25 20:00" */
export function formatFireLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(now);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(n)) / 86400000);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (dayDiff === 0) return `今天 ${time}`;
  if (dayDiff === 1) return `明天 ${time}`;
  if (dayDiff === -1) return `昨天 ${time}`;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`;
}

/** "3 分钟后" / "2 小时后" 这类相对时间的绝对时刻 */
export function fromNow(minutes: number, from = Date.now()): number {
  return from + minutes * 60000;
}

/** 下一年同一天（按本地时区；2/29 会自动滚到 3/1） */
export function nextYear(ms: number): number {
  const d = new Date(ms);
  d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

/** 按重复规则算下一次触发时间 */
export function nextOccurrence(ms: number, repeat: string): number {
  const d = new Date(ms);
  if (repeat === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else if (repeat === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else if (repeat === 'weekly') {
    d.setDate(d.getDate() + 7);
  }
  return d.getTime();
}
