export type ReminderStatus = 'pending' | 'acked' | 'done' | 'missed';

/** 升级链的一步：afterSec 相对到点时间，负数是提前提醒 */
export interface EscalationStep {
  afterSec: number;
  channels: string[];
}

export interface Reminder {
  id: string;
  title: string;
  note: string;
  /** epoch 毫秒 */
  fireAt: number;
  tz: string;
  /** 1..6，见 PLAN §1.4 */
  forceLevel: number;
  /** none | yearly：每年重复（生日/纪念日用） */
  repeat?: 'none' | 'yearly';
  steps: EscalationStep[];
  status: ReminderStatus;
  createdAt: number;
  ackedAt?: number;
  /** 本地已排的闹钟/通知 id，用于取消重排 */
  alarmIds?: string[];
  /** 最近一次成功同步到云端的时间 */
  syncedAt?: number;
}

export interface ChannelConfig {
  apiBaseUrl: string;
  apiKey: string;
  syncEnabled: boolean;
}
