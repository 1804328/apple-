import type { Reminder } from '../types';
import { stepsForLevel } from './time';

/** 常勾选的里程碑（天） */
export const MILESTONE_OPTIONS = [7, 30, 100, 200, 365, 500, 730, 1000, 1095];

/** 100 → "100 天"，365 → "1 周年"，1095 → "3 周年" */
export function milestoneLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${days / 365} 周年`;
  return `${days} 天`;
}

export interface MilestonePreview {
  days: number;
  date: Date;
  skipped: boolean;
}

export function previewMilestones(baseDate: Date, daysList: number[], now = Date.now()): MilestonePreview[] {
  return [...daysList]
    .sort((a, b) => a - b)
    .map((days) => {
      const d = new Date(baseDate);
      // 周年按「加年」算，不按 365 天近似，闰年也不会差一天
      const years = days >= 365 && days % 365 === 0 ? days / 365 : 0;
      if (years > 0) {
        d.setFullYear(d.getFullYear() + years);
      } else {
        d.setDate(d.getDate() + days);
      }
      d.setHours(9, 0, 0, 0);
      return { days, date: d, skipped: d.getTime() <= now };
    });
}

/**
 * 把「纪念日起点 + 里程碑天数」展开成普通提醒。
 * id 是确定性的：同一纪念日重复生成会覆盖（upsert），不会堆出重复项。
 */
export function buildAnniversaryReminders(
  title: string,
  baseDate: Date,
  daysList: number[],
  forceLevel = 3,
  now = Date.now(),
): Reminder[] {
  const baseKey = `${baseDate.getFullYear()}-${baseDate.getMonth() + 1}-${baseDate.getDate()}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';

  return previewMilestones(baseDate, daysList, now)
    .filter((item) => !item.skipped)
    .map((item) => {
      const fireAt = item.date.getTime();
      return {
        id: `anniv-${baseKey}-${item.days}`,
        title: `${title} · ${milestoneLabel(item.days)}`,
        note: `纪念日起点：${baseKey}`,
        fireAt,
        tz,
        forceLevel,
        steps: stepsForLevel(forceLevel).filter(
          (step) => step.afterSec >= 0 || fireAt + step.afterSec * 1000 > now,
        ),
        status: 'pending' as const,
        createdAt: now,
      };
    });
}
