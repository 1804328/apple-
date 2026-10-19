import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import ListScreen from './src/screens/ListScreen';
import NewReminderScreen from './src/screens/NewReminderScreen';
import AnniversaryScreen from './src/screens/AnniversaryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OverdueScreen from './src/screens/OverdueScreen';
import { colors } from './src/theme';
import type { ChannelConfig, Reminder } from './src/types';
import {
  DEFAULT_CONFIG,
  findOverduePending,
  getSignInfo,
  groupReminders,
  loadConfig,
  loadReminders,
  saveConfig,
  saveReminders,
} from './src/store/reminders';
import {
  alarmKitAvailable,
  cancelFor,
  requestPermissions,
  scheduleFor,
  setupNotificationHandler,
} from './src/services/alarms';
import { nextYear } from './src/lib/time';
import { ackOnServer, fetchPendingReminders, removeOnServer, syncReminder } from './src/services/api';

type Screen = 'list' | 'new' | 'settings' | 'anniversary';

const SNOOZE_MS = 5 * 60 * 1000;

export default function App() {
  const [ready, setReady] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [screen, setScreen] = useState<Screen>('list');
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [overdue, setOverdue] = useState<Reminder | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [signDaysLeft, setSignDaysLeft] = useState(7);

  const remindersRef = useRef<Reminder[]>([]);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  // App 在前台时也要能弹出确认页：每 30 秒的 tick 也会触发检查
  useEffect(() => {
    if (!ready || screen === 'new') return;
    const next = findOverduePending(remindersRef.current, now);
    if (next) setOverdue((prev) => prev ?? next);
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

      // 先展示本地数据
      let current: Reminder[] = stored;
      setReminders(current);
      remindersRef.current = current;
      setOverdue(findOverduePending(current));

      if (!storedConfig.syncEnabled) return;

      // 重装 / 重签后本地是空的，从云端把待触发的提醒拉回来
      const cloud = await fetchPendingReminders(storedConfig);
      if (!mounted || !cloud.ok || !cloud.reminders) return;

      const localIds = new Set(current.map((item) => item.id));
      const missing = cloud.reminders.filter((item) => !localIds.has(item.id));
      if (missing.length === 0) return;

      const restored: Reminder[] = [];
      for (const item of missing) {
        const alarmIds = await scheduleFor(item).catch(() => [] as string[]);
        restored.push({ ...item, alarmIds, syncedAt: Date.now() });
      }

      current = [...current, ...restored];
      await saveReminders(current);
      if (!mounted) return;
      setReminders(current);
      remindersRef.current = current;
      setOverdue(findOverduePending(current));
      Alert.alert('已从云端恢复提醒', `恢复了 ${restored.length} 条（重装或重签后会自动同步）。`);
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNow(Date.now());
      const next = findOverduePending(remindersRef.current);
      if (next) setOverdue(next);
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  const persist = useCallback(async (next: Reminder[]) => {
    setReminders(next);
    remindersRef.current = next;
    await saveReminders(next);
  }, []);

  const handleSave = useCallback(
    async (reminder: Reminder) => {
      const previous = editing;
      if (previous) {
        await cancelFor(previous.alarmIds ?? []);
      }
      const alarmIds = await scheduleFor(reminder).catch(() => [] as string[]);
      let saved: Reminder = { ...reminder, alarmIds };

      // 先同步云端：成功就把 syncedAt 一起落本地，卡片上显示「云端已登记」
      let syncError: string | undefined;
      if (config.syncEnabled) {
        const sync = await syncReminder(config, saved);
        if (sync.ok) {
          saved = { ...saved, syncedAt: Date.now() };
        } else {
          syncError = sync.error;
        }
      }

      const exists = reminders.some((item) => item.id === saved.id);
      const next = exists
        ? reminders.map((item) => (item.id === saved.id ? saved : item))
        : [...reminders, saved];

      await persist(next);
      setScreen('list');
      setEditing(null);
      setOverdue(findOverduePending(next));

      if (syncError) {
        Alert.alert(
          '已保存在本机',
          `云端同步失败：${syncError}\n\n到点仍会本地响，但微信兜底暂时不会生效。`,
        );
      }
    },
    [config, editing, persist, reminders],
  );

  const handleGenerateAnniversary = useCallback(
    async (items: Reminder[]) => {
      const generated: Reminder[] = [];
      for (const item of items) {
        const alarmIds = await scheduleFor(item).catch(() => [] as string[]);
        let saved: Reminder = { ...item, alarmIds };
        if (config.syncEnabled) {
          const sync = await syncReminder(config, saved);
          if (sync.ok) saved = { ...saved, syncedAt: Date.now() };
        }
        generated.push(saved);
      }

      // 同 id 覆盖，避免重复生成堆出重复提醒
      const merged = new Map(reminders.map((item) => [item.id, item]));
      for (const item of generated) merged.set(item.id, item);
      const next = [...merged.values()];
      await persist(next);

      setScreen('list');
      setOverdue(findOverduePending(next));
      Alert.alert(
        '已生成纪念日提醒',
        `共 ${generated.length} 条。同一个纪念日重复生成会覆盖，不会产生重复项。`,
      );
    },
    [config, persist, reminders],
  );

  const handleAck = useCallback(
    async (reminder: Reminder) => {
      // 每年重复：不落成"已完成"，而是滚到明年同一天继续提醒
      if (reminder.repeat === 'yearly') {
        await cancelFor(reminder.alarmIds ?? []);
        const fireAt = nextYear(reminder.fireAt);
        const rolled: Reminder = { ...reminder, fireAt, status: 'pending', ackedAt: undefined, alarmIds: [] };
        const alarmIds = await scheduleFor(rolled).catch(() => [] as string[]);
        const saved: Reminder = { ...rolled, alarmIds, syncedAt: Date.now() };
        const nextList = reminders.map((item) => (item.id === saved.id ? saved : item));
        await persist(nextList);
        setOverdue((prev) => (prev?.id === reminder.id ? null : prev));
        if (config.syncEnabled) {
          await syncReminder(config, saved);
        }
        Alert.alert('明年的提醒已排好', `「${reminder.title}」已滚到明年同一天。`);
        return;
      }

      await cancelFor(reminder.alarmIds ?? []);
      const next = reminders.map((item) =>
        item.id === reminder.id
          ? { ...item, status: 'acked' as const, ackedAt: Date.now(), alarmIds: [] }
          : item,
      );
      await persist(next);
      setOverdue((prev) => (prev?.id === reminder.id ? null : prev));

      if (config.syncEnabled) {
        const result = await ackOnServer(config, reminder.id);
        if (!result.ok) {
          console.warn('ack sync failed', result.error);
        }
      }
    },
    [config, persist, reminders],
  );

  const handleSnooze = useCallback(
    async (reminder: Reminder) => {
      const nextFireAt = Date.now() + SNOOZE_MS;
      await cancelFor(reminder.alarmIds ?? []);
      const rescheduled: Reminder = { ...reminder, fireAt: nextFireAt, status: 'pending' };
      const alarmIds = await scheduleFor(rescheduled).catch(() => [] as string[]);
      const saved: Reminder = { ...rescheduled, alarmIds };

      const next = reminders.map((item) => (item.id === saved.id ? saved : item));
      await persist(next);
      setOverdue(null);
      setNow(Date.now());

      if (config.syncEnabled) {
        await syncReminder(config, saved);
      }
    },
    [config, persist, reminders],
  );

  const handleDelete = useCallback(
    async (reminder: Reminder) => {
      Alert.alert('删除提醒', `确定删除「${reminder.title}」？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            await cancelFor(reminder.alarmIds ?? []);
            await persist(reminders.filter((item) => item.id !== reminder.id));
            setOverdue((prev) => (prev?.id === reminder.id ? null : prev));
            if (config.syncEnabled) removeOnServer(config, reminder.id).catch(() => undefined);
          },
        },
      ]);
    },
    [config, persist, reminders],
  );

  const handleSaveConfig = useCallback(
    async (nextConfig: ChannelConfig) => {
      setConfig(nextConfig);
      await saveConfig(nextConfig);
      if (nextConfig.syncEnabled) {
        const pending = reminders.filter((item) => item.status === 'pending');
        const synced = new Map<string, number>();
        for (const item of pending) {
          const result = await syncReminder(nextConfig, item);
          if (result.ok) synced.set(item.id, Date.now());
        }
        if (synced.size > 0) {
          await persist(
            reminders.map((item) =>
              synced.has(item.id) ? { ...item, syncedAt: synced.get(item.id) } : item,
            ),
          );
        }
      }
    },
    [persist, reminders],
  );

  const handleRequestPermissions = useCallback(async () => {
    const result = await requestPermissions();
    Alert.alert(
      '权限状态',
      `通知：${result.notifications ? '已允许' : '未允许'}\n闹钟级（AlarmKit）：${
        result.alarmKit ? '已允许' : '不可用或未允许'
      }`,
    );
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const groups = groupReminders(reminders, now);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {screen === 'list' ? (
        <ListScreen
          groups={groups}
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
          onSave={handleSaveConfig}
          onBack={() => setScreen('list')}
          onRequestPermissions={handleRequestPermissions}
        />
      ) : null}

      {overdue ? (
        <View style={styles.overlay}>
          <OverdueScreen reminder={overdue} onDone={handleAck} onSnooze={handleSnooze} />
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
