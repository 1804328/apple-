import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChannelConfig, Reminder } from '../types';

const REMINDERS_KEY = '@strong-reminder/reminders/v1';
const CONFIG_KEY = '@strong-reminder/config/v1';

export const DEFAULT_CONFIG: ChannelConfig = {
  apiBaseUrl: '',
  apiKey: '',
  syncEnabled: false,
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
    return { ...DEFAULT_CONFIG, ...parsed };
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

/** 未确认、且还没到点的排在前面 */
export function splitReminders(list: Reminder[]): { upcoming: Reminder[]; finished: Reminder[] } {
  const now = Date.now();
  const upcoming: Reminder[] = [];
  const finished: Reminder[] = [];
  for (const item of sortReminders(list)) {
    if (item.status === 'pending' && item.fireAt >= now - 3600_000) upcoming.push(item);
    else finished.push(item);
  }
  return { upcoming, finished };
}
