import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Reminder } from '../types';
import { formatFireLabel } from '../lib/time';

declare const require: (name: string) => unknown;

const ALARMKIT_PREFIX = 'alarmkit:';
const isIOS = Platform.OS === 'ios';

/**
 * 只在 iOS 上加载原生模块：
 * 该包在 import 时会创建 Nitro HybridObject，Android 上没有对应实现，
 * 静态 import 会在 Android 启动时抛错，所以用运行时 require 隔离。
 */
type AlarmKitApi = {
  isSupported: boolean;
  requestAuthorization: () => Promise<boolean>;
  getAuthorizationState?: () => Promise<'notDetermined' | 'authorized' | 'denied'>;
  cancel: (id: string) => Promise<boolean>;
  schedule: (id: string, configuration: unknown) => Promise<{ id: string } | null>;
};
type AlarmKitModule = {
  default: AlarmKitApi;
  AlarmKitManager: { shared: AlarmKitApi };
  AlarmConfigurationFactory: {
    alarm: (options: unknown) => unknown;
  };
};

let mod: AlarmKitModule | null = null;
if (isIOS) {
  try {
    mod = require('react-native-ios-alarmkit') as AlarmKitModule;
  } catch {
    mod = null;
  }
}

const manager = mod?.AlarmKitManager?.shared ?? mod?.default ?? null;
const factory = mod?.AlarmConfigurationFactory ?? null;

export const alarmKitAvailable = isIOS && Boolean(manager?.isSupported);

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** 申请通知 + 闹钟级权限（iOS 26+ 才有） */
export async function requestPermissions(): Promise<{ notifications: boolean; alarmKit: boolean }> {
  const notifications = await ensureNotificationPermission();
  let alarmKit = false;
  if (alarmKitAvailable && manager) {
    try {
      alarmKit = await manager.requestAuthorization();
    } catch {
      alarmKit = false;
    }
  }
  return { notifications, alarmKit };
}

/** 只查询当前权限状态，不弹窗（用于设置页体检） */
export async function getPermissionStatus(): Promise<{ notifications: boolean; alarmKit: boolean }> {
  let notifications = false;
  try {
    const current = await Notifications.getPermissionsAsync();
    notifications = Boolean(current.granted);
  } catch {
    notifications = false;
  }

  let alarmKit = false;
  if (alarmKitAvailable && manager) {
    try {
      const state = manager.getAuthorizationState ? await manager.getAuthorizationState() : undefined;
      alarmKit = state === 'authorized';
    } catch {
      alarmKit = false;
    }
  }

  return { notifications, alarmKit };
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function offsetLabel(afterSec: number): string {
  const abs = Math.abs(afterSec);
  if (abs >= 86400) return `${Math.round(abs / 86400)} 天`;
  if (abs >= 3600) return `${Math.round(abs / 3600)} 小时`;
  return `${Math.round(abs / 60)} 分钟`;
}

/**
 * 为一条提醒排本地闹钟 + 前置通知。
 *
 * 策略（PLAN §4.3 / §2.1）：
 *  - 前置预警全部走本地通知，不占用 AlarmKit 的闹钟额度
 *  - 到点提醒走 AlarmKit 的 fixed schedule（闹钟级：静音/勿扰也响）
 *  - AlarmKit 不可用时退回时间敏感通知
 *
 * 已知限制：AlarmKit 的 Stop 只是停止响铃，不会回调 JS。
 * 所以"已确认"必须来自 App 内点击或微信推送里的确认链接，服务端升级负责兜住。
 */
export async function scheduleFor(reminder: Reminder): Promise<string[]> {
  const ids: string[] = [];
  await cancelFor(reminder.alarmIds ?? []);

  // 1) 前置预警：本地通知
  for (const step of reminder.steps) {
    if (step.afterSec >= 0) continue;
    const at = reminder.fireAt + step.afterSec * 1000;
    if (at <= Date.now()) continue;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `还有 ${offsetLabel(step.afterSec)}：${reminder.title}`,
        body: `${formatFireLabel(reminder.fireAt)} 到期`,
        sound: true,
        data: { reminderId: reminder.id },
        interruptionLevel: 'timeSensitive',
      } as Notifications.NotificationContentInput,
      trigger: { type: 'date', date: new Date(at), channelId: 'default' } as unknown as Notifications.NotificationTriggerInput,
    });
    ids.push(id);
  }

  // 2) 到点：AlarmKit fixed 闹钟（强制模式再排 +2/+4/+6 分钟的连环闹钟）
  const buildAlarmConfig = (at: number) =>
    factory!.alarm({
      // date 单位是毫秒（原生层 /1000 转成 Date）
      schedule: { type: 'fixed', date: at },
      attributes: {
        presentation: {
          // 只放 alert：countdown / paused 两套 presentation 需要额外的
          // Widget Extension，没有它系统可能直接忽略闹钟（见封装库 README）。
          alert: {
            title: reminder.title.slice(0, 20),
            stopButton: { text: '完成', textColor: '#ffffff', systemImageName: 'checkmark.circle.fill' },
          },
        },
        tintColor: '#ff5c5c',
        metadata: { reminderId: reminder.id },
      },
    });

  const scheduleAlarmAt = async (at: number): Promise<boolean> => {
    if (!alarmKitAvailable || !manager || !factory || at <= Date.now()) return false;
    try {
      const alarm = await manager.schedule(uuidv4(), buildAlarmConfig(at));
      if (alarm?.id) {
        ids.push(`${ALARMKIT_PREFIX}${alarm.id}`);
        return true;
      }
    } catch {
      // 额度用尽 / 未授权 / iOS 版本不支持：退回通知
    }
    return false;
  };

  const scheduledAlarmKit = await scheduleAlarmAt(reminder.fireAt);

  // 强制模式：连环闹钟。按停一次，2/4/6 分钟后还会再响，直到在 App 里做对题确认
  if (reminder.unlock === 'math') {
    for (const minutes of [2, 4, 6]) {
      const at = reminder.fireAt + minutes * 60_000;
      if (at <= Date.now()) continue;
      const alarmOk = await scheduleAlarmAt(at);
      if (alarmOk) continue;

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `还没确认：${reminder.title}`,
            body: '完成数学题才算确认',
            sound: true,
            data: { reminderId: reminder.id },
            interruptionLevel: 'timeSensitive',
          } as Notifications.NotificationContentInput,
          trigger: { type: 'date', date: new Date(at), channelId: 'default' } as unknown as Notifications.NotificationTriggerInput,
        });
        ids.push(id);
      } catch {
        // ignore
      }
    }
  }

  // 3) 兜底：到点的时间敏感通知
  if (!scheduledAlarmKit && reminder.fireAt > Date.now()) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: '时间到了',
        sound: true,
        data: { reminderId: reminder.id },
        interruptionLevel: 'timeSensitive',
      } as Notifications.NotificationContentInput,
      trigger: { type: 'date', date: new Date(reminder.fireAt), channelId: 'default' } as unknown as Notifications.NotificationTriggerInput,
    });
    ids.push(id);
  }

  return ids;
}

export async function cancelFor(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        if (id.startsWith(ALARMKIT_PREFIX)) {
          if (manager) await manager.cancel(id.slice(ALARMKIT_PREFIX.length));
        } else {
          await Notifications.cancelScheduledNotificationAsync(id);
        }
      } catch {
        // 已经被系统清掉，忽略
      }
    }),
  );
}
