import { Lunar } from 'lunar-javascript';

import type { Reminder } from '../types';
import { stepsForLevel } from './time';

export const LUNAR_MONTHS = [
  '正月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '冬月',
  '腊月',
];

const DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 1 → 初一，10 → 初十，11 → 十一，20 → 二十，21 → 廿一，30 → 三十 */
export function lunarDayLabel(day: number): string {
  if (day <= 10) return `初${DIGITS[day - 1]}`;
  if (day < 20) return `十${DIGITS[day - 11]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${DIGITS[day - 21]}`;
  return '三十';
}

export function lunarLabel(month: number, day: number): string {
  return `农历${LUNAR_MONTHS[month - 1] ?? month}${lunarDayLabel(day)}`;
}

export interface LunarOccurrence {
  lunarYear: number;
  date: Date;
}

/**
 * 未来 count 次「农历某月某日」对应的公历日期。
 * 农历月只有 29/30 天，某年可能没有「三十」，这类年份会跳过。
 */
export function nextLunarOccurrences(
  month: number,
  day: number,
  count = 5,
  now = Date.now(),
): LunarOccurrence[] {
  const out: LunarOccurrence[] = [];
  const startYear = new Date(now).getFullYear();

  for (let year = startYear; year < startYear + 40 && out.length < count; year += 1) {
    try {
      const solar = Lunar.fromYmd(year, month, day).getSolar();
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), 9, 0, 0, 0);
      if (date.getTime() > now) out.push({ lunarYear: year, date });
    } catch {
      // 该农历年没有这一天（例如只有 29 天的月份）
    }
  }

  return out;
}

/**
 * 把「农历月/日」展开成未来 N 年的普通提醒。
 * 每年一条（而不是一条 yearly 规则），因为农历对应的公历日期每年不同。
 */
export function buildLunarReminders(
  title: string,
  month: number,
  day: number,
  count = 5,
  forceLevel = 3,
  now = Date.now(),
): Reminder[] {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const label = lunarLabel(month, day);

  return nextLunarOccurrences(month, day, count, now).map((occ) => {
    const fireAt = occ.date.getTime();
    return {
      id: `lunar-${month}-${day}-${occ.lunarYear}`,
      title: `${title} · ${label}`,
      note: `${label}，${occ.lunarYear} 年对应公历 ${occ.date.getFullYear()}-${occ.date.getMonth() + 1}-${occ.date.getDate()}`,
      fireAt,
      tz,
      forceLevel,
      repeat: 'none' as const,
      steps: stepsForLevel(forceLevel).filter(
        (step) => step.afterSec >= 0 || fireAt + step.afterSec * 1000 > now,
      ),
      status: 'pending' as const,
      createdAt: now,
    };
  });
}
