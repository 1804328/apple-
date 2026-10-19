import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import ListScreen from './src/screens/ListScreen';
import NewReminderScreen from './src/screens/NewReminderScreen';
import AnniversaryScreen from './src/screens/AnniversaryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OverdueScreen from './src/screens/OverdueScreen';
import MathChallengeScreen from './src/screens/MathChallengeScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { colors } from './src/theme';
import type { ChannelConfig, Reminder } from './src/types';
import {
  DEFAULT_CONFIG,
  findOverduePending,
  getSignInfo,
  loadConfig,
  loadLastSync,
  loadReminders,
  saveConfig,
  saveLastSync,
  saveReminders,
  splitHorizon,
} from './src/store/reminders';
import {
  alarmKitAvailable,
  cancelFor,
  requestPermissions,
  scheduleFor,
  setupNotificationHandler,
} from './src/services/alarms';
import { nextOccurrence, stepsForLevel } from './src/lib/time';
import { ackOnServer, fetchPendingReminders, removeOnServer, syncReminder } from './src/services/api';

type Screen = 'list' | 'new' | 'settings' | 'anniversary';

const SNOOZE_MS = 5 * 60 * 1000;

function AppInner() {
  const [ready, setReady] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [screen, setScreen] = useState<Screen>('list');
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [overdue, setOverdue] = useState<Reminder | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [signDaysLeft, setSignDaysLeft] = useState(7);
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>();

  const remindersRef = useRef<Reminder[]>([]);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  const configRef = useRef<ChannelConfig>(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const markSync = useCallback(async () => {
    const ts = Date.now();
    setLastSyncAt(ts);
    await saveLastSync(ts);
  }, []);

  /** 拉云端：补回缺失提醒 + 刷新推送统计 */
  const mergeCloud = useCallback(
    async (cfg: ChannelConfig, local: Reminder[]): Promise<Reminder[]> => {
      const cloud = await fetchPendingReminders(cfg);
      if (!cloud.ok || !cloud.reminders) return local;
      await markSync();

      const byId = new Map(local.map((item) => [item.id, item]));
      for (const item of cloud.reminders) {
        const existing = byId.get(item.id);
        if (existing) {
          // 只合并推送统计，不覆盖本地编辑
          byId.set(item.id, {
            ...existing,
            pushCount: item.pushCount,
            lastPushAt: item.lastPushAt,
          });
        } else {
          const alarmIds = await scheduleFor(item).catch(() => [] as string[]);
          byId.set(item.id, { ...item, alarmIds, syncedAt: Date.now() });
        }
      }
      return [...byId.values()];
    },
    [markSync],
  );

  // App 在前台时也要能弹出确认页：每 30 秒的 tick 也会触发检查
  useEffect(() => {
    if (!ready || screen === 'new') return;
    const next = findOverduePending(remindersRef.current, now);
    if (next && !skippedIdsRef.current.has(next.id)) setOverdue((prev) => prev ?? next);
  }, [now, ready, screen]);

  useEffect(() => {
    setupNotificationHandler();
    const timer = setInterval(() => setNow(Date.now()), 30_000);

    let mounted = true;
    (async () => {
      const [stored, storedConfig] = await Promise.all([loadReminders(), loadConfig()]);
      if (!mounted) return;

      setConfig(storedConfig);
      setReady(true);
      requestPermissions().catch(() => undefined);
      getSignInfo()
        .then((info) => {
          if (mounted) setSignDaysLeft(info.daysLeft);
        })
        .catch(() => undefined);
      loadLastSync()
        .then((ts) => {
          if (mounted) setLastSyncAt(ts);
        })
        .catch(() => undefined);

      // 先展示本地数据
      let current: Reminder[] = stored;
      setReminders(current);
      remindersRef.current = current;
      setOverdue(findOverduePending(current));

      if (!storedConfig.syncEnabled) return;

      // 重装 / 重签后本地是空的：从云端补回缺失提醒，并刷新推送统计
      const before = current.length;
      const merged = await mergeCloud(storedConfig, current);
      if (!mounted || merged.length === current.length) return;

      current = merged;
      await saveReminders(current);
      if (!mounted) return;
      setReminders(current);
      remindersRef.current = current;
      setOverdue(findOverduePending(current));
      Alert.alert('已从云端恢复提醒', `恢复了 ${current.length - before} 条（重装或重签后会自动同步）。`);
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNow(Date.now());
      const next = findOverduePending(remindersRef.current);
      if (next && !skippedIdsRef.current.has(next.id)) setOverdue(next);

      // 回到前台顺手刷新云端状态（推送次数 / 其他设备改动）
      if (configRef.current.syncEnabled) {
        mergeCloud(configRef.current, remindersRef.current)
          .then((merged) => {
            setReminders(merged);
            remindersRef.current = merged;
            saveReminders(merged);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  // 点通知直接弹出对应提醒的确认页（而不是只打开 App）
  useEffect(() => {
    const openFromNotification = (id?: string) => {
      if (!id) return;
      const target = remindersRef.current.find((item) => item.id === id);
      if (target && target.status === 'pending') setOverdue(target);
    };

    let subscription: { remove: () => void } | undefined;
    try {
      if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as { reminderId?: string } | undefined;
          openFromNotification(data?.reminderId);
        });
      }

      // 冷启动从通知进入：不同 SDK 版本 API 名/行为不完全一致，这里做兼容保护
      const readLast = (Notifications as unknown as {
        getLastNotificationResponseAsync?: () => Promise<unknown>;
        getLastNotificationResponse?: () => unknown;
      });
      const maybePromise =
        typeof readLast.getLastNotificationResponseAsync === 'function'
          ? readLast.getLastNotificationResponseAsync()
          : undefined;

      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        (maybePromise as Promise<unknown>)
          .then((response) => {
            const data = (response as { notification?: { request?: { content?: { data?: unknown } } } } | null)
              ?.notification?.request?.content?.data as { reminderId?: string } | undefined;
            openFromNotification(data?.reminderId);
          })
          .catch(() => undefined);
      }
    } catch (err) {
      console.warn('[app] notification listener setup failed', err);
    }

    return () => {
      try {
        subscription?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const persist = useCallback(async (next: Reminder[]) => {
    setReminders(next);
    remindersRef.current = next;
    await saveReminders(next);
  }, []);

  const actionLockRef = useRef<Set<string>>(new Set());
  /** 用户主动跳过的强制提醒（不标记完成，云端继续催） */
  const skippedIdsRef = useRef<Set<string>>(new Set());

  /** 同一操作执行期间忽略重复触发：防连点重复排闹钟 / 重复请求 */
  const runExclusive = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (actionLockRef.current.has(key)) return;
    actionLockRef.current.add(key);
    try {
      await fn();
    } finally {
      actionLockRef.current.delete(key);
    }
  }, []);

  const handleSave = useCallback(
    (reminder: Reminder) =>
      runExclusive(`save:${reminder.id}`, async () => {
        const previous = editing;

        // 1) 立即返回列表并本地落盘，不等闹钟排程和网络
        setScreen('list');
        setEditing(null);

        const list = remindersRef.current;
        const exists = list.some((item) => item.id === reminder.id);
        let saved: Reminder = { ...reminder, alarmIds: [] };
        let next = exists
          ? list.map((item) => (item.id === saved.id ? saved : item))
          : [...list, saved];
        await persist(next);
        setOverdue(findOverduePending(next));

        // 2) 后台：取消旧闹钟、排新闹钟
        if (previous) {
          await cancelFor(previous.alarmIds ?? []).catch(() => undefined);
        }
        const alarmIds = await scheduleFor(reminder).catch(() => [] as string[]);
        saved = { ...saved, alarmIds };

        // 3) 后台：同步云端
        let syncError: string | undefined;
        if (config.syncEnabled) {
          const sync = await syncReminder(config, saved);
          if (sync.ok) {
            saved = { ...saved, syncedAt: Date.now() };
            await markSync();
          } else {
            syncError = sync.error;
          }
        }

        next = remindersRef.current.some((item) => item.id === saved.id)
          ? remindersRef.current.map((item) => (item.id === saved.id ? saved : item))
          : [...remindersRef.current, saved];
        await persist(next);
        setOverdue(findOverduePending(next));

        if (syncError) {
          Alert.alert(
            '已保存在本机',
            `云端同步失败：${syncError}\n\n到点仍会本地响，但微信兜底暂时不会生效。`,
          );
        }
      }),
    [config, editing, markSync, persist, runExclusive],
  );

  const handleGenerateAnniversary = useCallback(
    (items: Reminder[]) =>
      runExclusive('anniversary:generate', async () => {
        setScreen('list');

        const generated: Reminder[] = [];
        for (const item of items) {
          const alarmIds = await scheduleFor(item).catch(() => [] as string[]);
          let saved: Reminder = { ...item, alarmIds };
          if (config.syncEnabled) {
            const sync = await syncReminder(config, saved);
            if (sync.ok) {
              saved = { ...saved, syncedAt: Date.now() };
              await markSync();
            }
          }
          generated.push(saved);
        }

        // 同 id 覆盖，避免重复生成堆出重复提醒
        const merged = new Map(remindersRef.current.map((item) => [item.id, item]));
        for (const item of generated) merged.set(item.id, item);
        const next = [...merged.values()];
        await persist(next);

        setOverdue(findOverduePending(next));
        Alert.alert(
          '已生成纪念日提醒',
          `共 ${generated.length} 条。同一个纪念日重复生成会覆盖，不会产生重复项。`,
        );
      }),
    [config, markSync, persist, runExclusive],
  );

  const handleAck = useCallback(
    (reminder: Reminder) =>
      runExclusive(`ack:${reminder.id}`, async () => {
        const list = remindersRef.current;
        skippedIdsRef.current.delete(reminder.id);

        // 重复提醒：不落成「已完成」，而是滚到下一周期继续提醒
        if (reminder.repeat && reminder.repeat !== 'none') {
          await cancelFor(reminder.alarmIds ?? []);
          const fireAt = nextOccurrence(reminder.fireAt, reminder.repeat);
          const rolled: Reminder = {
            ...reminder,
            fireAt,
            status: 'pending',
            ackedAt: undefined,
            alarmIds: [],
          };
          const alarmIds = await scheduleFor(rolled).catch(() => [] as string[]);
          let saved: Reminder = { ...rolled, alarmIds };

          if (config.syncEnabled) {
            const result = await syncReminder(config, saved);
            if (result.ok) {
              saved = { ...saved, syncedAt: Date.now() };
              await markSync();
            }
          }

          const nextList = list.map((item) => (item.id === saved.id ? saved : item));
          await persist(nextList);
          setOverdue((prev) => (prev?.id === reminder.id ? null : prev));
          Alert.alert('下一次的提醒已排好', `「${reminder.title}」已滚到下一个周期。`);
          return;
        }

        await cancelFor(reminder.alarmIds ?? []);
        const nextList = list.map((item) =>
          item.id === reminder.id
            ? { ...item, status: 'acked' as const, ackedAt: Date.now(), alarmIds: [] }
            : item,
        );
        await persist(nextList);
        setOverdue((prev) => (prev?.id === reminder.id ? null : prev));

        if (config.syncEnabled) {
          const result = await ackOnServer(config, reminder.id);
          if (!result.ok) {
            console.warn('ack sync failed', result.error);
          }
        }
      }),
    [config, markSync, persist, runExclusive],
  );

  const handleSnooze = useCallback(
    (reminder: Reminder) =>
      runExclusive(`snooze:${reminder.id}`, async () => {
        const nextFireAt = Date.now() + SNOOZE_MS;
        await cancelFor(reminder.alarmIds ?? []);
        const rescheduled: Reminder = { ...reminder, fireAt: nextFireAt, status: 'pending' };
        const alarmIds = await scheduleFor(rescheduled).catch(() => [] as string[]);
        const saved: Reminder = { ...rescheduled, alarmIds };

        const next = remindersRef.current.map((item) => (item.id === saved.id ? saved : item));
        await persist(next);
        setOverdue(null);
        setNow(Date.now());

        if (config.syncEnabled) {
          await syncReminder(config, saved);
        }
      }),
    [config, persist, runExclusive],
  );

  const handleDelete = useCallback(
    async (reminder: Reminder) => {
      Alert.alert('删除提醒', `确定删除「${reminder.title}」？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () =>
            runExclusive(`delete:${reminder.id}`, async () => {
              await cancelFor(reminder.alarmIds ?? []);
              await persist(remindersRef.current.filter((item) => item.id !== reminder.id));
              setOverdue((prev) => (prev?.id === reminder.id ? null : prev));
              if (config.syncEnabled) removeOnServer(config, reminder.id).catch(() => undefined);
            }),
        },
      ]);
    },
    [config, persist, runExclusive, reminders],
  );

  const handleSaveConfig = useCallback(
    (nextConfig: ChannelConfig) =>
      runExclusive('settings:save', async () => {
        setConfig(nextConfig);
        await saveConfig(nextConfig);
        if (nextConfig.syncEnabled) {
          const pending = remindersRef.current.filter((item) => item.status === 'pending');
          const synced = new Map<string, number>();
          for (const item of pending) {
            const result = await syncReminder(nextConfig, item);
            if (result.ok) synced.set(item.id, Date.now());
          }
          if (synced.size > 0) {
            await persist(
              remindersRef.current.map((item) =>
                synced.has(item.id) ? { ...item, syncedAt: synced.get(item.id) } : item,
              ),
            );
            await markSync();
          }
        }
      }),
    [markSync, persist, runExclusive],
  );

  /** 一键创建「每周重签」提醒：免费签名 7 天到期，靠它保住兜底链 */
  const handleAddResignReminder = useCallback(async () => {
    const nowTs = Date.now();
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));

    const reminder: Reminder = {
      id: 'resign-weekly',
      title: '重签强提醒（每周日 20:00）',
      note: '连电脑打开 Sideloadly，用同一个 IPA 重新签名安装。',
      fireAt: d.getTime(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      forceLevel: 3,
      repeat: 'weekly',
      steps: stepsForLevel(3).filter(
        (step) => step.afterSec >= 0 || d.getTime() + step.afterSec * 1000 > nowTs,
      ),
      status: 'pending',
      createdAt: nowTs,
    };

    await handleSave(reminder);
    Alert.alert('已添加', '每周日 20:00 提醒你重签（已存在会覆盖）。');
  }, [handleSave]);

  const handleRequestPermissions = useCallback(async () => {
    const result = await requestPermissions();
    Alert.alert(
      '权限状态',
      `通知：${result.notifications ? '已允许' : '未允许'}\n闹钟级（AlarmKit）：${
        result.alarmKit ? '已允许' : '不可用或未允许'
      }`,
    );
  }, []);

  const monthStats = useMemo(() => {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return {
      created: reminders.filter((item) => item.createdAt >= start).length,
      acked: reminders.filter((item) => item.status === 'acked' && (item.ackedAt ?? 0) >= start).length,
      missed: reminders.filter((item) => item.status === 'missed').length,
    };
  }, [reminders, now]);

  const alarmStats = useMemo(() => {
    let alarmKit = 0;
    let notifications = 0;
    for (const item of reminders) {
      for (const id of item.alarmIds ?? []) {
        if (id.startsWith('alarmkit:')) alarmKit += 1;
        else notifications += 1;
      }
    }
    return { alarmKit, notifications, total: alarmKit + notifications };
  }, [reminders]);

  const horizon = splitHorizon(reminders, now);

  // 注意：所有 hook 必须在任何提前 return 之前调用，否则会触发
  // "Rendered more hooks than during the previous render"
  if (!ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {screen === 'list' ? (
        <ListScreen
          nearGroups={horizon.near}
          longList={horizon.long}
          alarmKitAvailable={alarmKitAvailable}
          syncEnabled={config.syncEnabled && config.apiBaseUrl.length > 0}
          signDaysLeft={signDaysLeft}
          now={now}
          onNew={() => {
            setEditing(null);
            setScreen('new');
          }}
          onAck={handleAck}
          onEdit={(item) => {
            setEditing(item);
            setScreen('new');
          }}
          onDelete={handleDelete}
          onOpenSettings={() => setScreen('settings')}
          onOpenAnniversary={() => setScreen('anniversary')}
        />
      ) : null}

      {screen === 'new' ? (
        <NewReminderScreen
          initial={editing ?? undefined}
          hardcoreAvailable={Boolean(config.hardcoreEnabled)}
          onCancel={() => {
            setEditing(null);
            setScreen('list');
          }}
          onSave={handleSave}
        />
      ) : null}

      {screen === 'anniversary' ? (
        <AnniversaryScreen
          onCancel={() => setScreen('list')}
          onGenerate={handleGenerateAnniversary}
        />
      ) : null}

      {screen === 'settings' ? (
        <SettingsScreen
          config={config}
          alarmKitAvailable={alarmKitAvailable}
          stats={monthStats}
          lastSyncAt={lastSyncAt}
          alarmStats={alarmStats}
          onAddResignReminder={handleAddResignReminder}
          onSave={handleSaveConfig}
          onBack={() => setScreen('list')}
          onRequestPermissions={handleRequestPermissions}
        />
      ) : null}

      {overdue ? (
        <View style={styles.overlay}>
          {overdue.unlock === 'math' ? (
            <MathChallengeScreen
              reminder={overdue}
              onSolved={handleAck}
              onEscape={() => {
                skippedIdsRef.current.add(overdue.id);
                setOverdue(null);
              }}
            />
          ) : (
            <OverdueScreen reminder={overdue} onDone={handleAck} onSnooze={handleSnooze} />
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
});

/** 用错误边界兜底：渲染出错时显示错误而不是直接闪退 */
export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
