import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import type { ChannelConfig, Reminder } from '../types';

const REMINDERS_KEY = '@strong-reminder/reminders/v1';
const CONFIG_KEY = '@strong-reminder/config/v1';

/**
 * 默认配置直接编译进包里（app.json 的 extra），这样重装/重签后不用重新填。
 * 自用场景：地址和 Key 都写死在客户端没有额外风险；给了别人用再改成引导输入。
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  apiKey?: string;
};

export const DEFAULT_CONFIG: ChannelConfig = {
  apiBaseUrl: extra.apiBaseUrl ?? '',
  apiKey: extra.apiKey ?? '',
  syncEnabled: Boolean(extra.apiBaseUrl),
};

export async function loadReminders(): Promise<Reminder[]> {
  const raw = await AsyncStorage.getItem(REMINDERS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reminder[]) : [];
  } catch {
    return [];
  }
}

export async function saveReminders(list: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
}

export async function loadConfig(): Promise<ChannelConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<ChannelConfig>;
    // 已保存的配置优先，但地址为空时回落到包内默认值
    return {
      apiBaseUrl: parsed.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl,
      apiKey: parsed.apiKey || DEFAULT_CONFIG.apiKey,
      syncEnabled: parsed.syncEnabled ?? DEFAULT_CONFIG.syncEnabled,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: ChannelConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => a.fireAt - b.fireAt);
}

export interface ReminderGroups {
  overdue: Reminder[];
  today: Reminder[];
  later: Reminder[];
  finished: Reminder[];
}

const DAY_MS = 86400_000;

/** 按「待处理 / 今天 / 以后 / 历史」分组 */
export function groupReminders(list: Reminder[], now = Date.now()): ReminderGroups {
  const groups: ReminderGroups = { overdue: [], today: [], later: [], finished: [] };
  for (const item of sortReminders(list)) {
    if (item.status !== 'pending') {
      groups.finished.push(item);
      continue;
    }
    if (item.fireAt <= now) {
      groups.overdue.push(item);
    } else if (item.fireAt - now < DAY_MS) {
      groups.today.push(item);
    } else {
      groups.later.push(item);
    }
  }
  return groups;
}

/** 找到第一条「已到点但还没确认」的提醒（用于 App 内强制确认页） */
export function findOverduePending(list: Reminder[], now = Date.now(), windowMs = DAY_MS): Reminder | null {
  const candidates = list
    .filter((item) => item.status === 'pending' && item.fireAt <= now && now - item.fireAt < windowMs)
    .sort((a, b) => a.fireAt - b.fireAt);
  return candidates[0] ?? null;
}
