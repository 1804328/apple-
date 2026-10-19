export type ReminderStatus = 'pending' | 'acked' | 'done' | 'missed';

/** 重复规则 */
export type RepeatRule = 'none' | 'weekly' | 'monthly' | 'yearly';

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
  /** none | weekly | monthly | yearly */
  repeat?: RepeatRule;
  /** 强制解锁方式：math = 必须做对数学题才能确认 */
  unlock?: 'none' | 'math';
  /** 云端成功推送次数（来自服务端统计） */
  pushCount?: number;
  /** 最近一次成功推送时间（epoch ms） */
  lastPushAt?: number;
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
