import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import ListScreen from './src/screens/ListScreen';
import NewReminderScreen from './src/screens/NewReminderScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OverdueScreen from './src/screens/OverdueScreen';
import { colors } from './src/theme';
import type { ChannelConfig, Reminder } from './src/types';
import {
  DEFAULT_CONFIG,
  findOverduePending,
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
import { ackOnServer, removeOnServer, syncReminder } from './src/services/api';

type Screen = 'list' | 'new' | 'settings';

const SNOOZE_MS = 5 * 60 * 1000;

export default function App() {
  const [ready, setReady] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [screen, setScreen] = useState<Screen>('list');
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [overdue, setOverdue] = useState<Reminder | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
      setReminders(stored);
      remindersRef.current = stored;
      setConfig(storedConfig);
      setOverdue(findOverduePending(stored));
      setReady(true);
      requestPermissions().catch(() => undefined);
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
      const saved: Reminder = { ...reminder, alarmIds };

      const exists = reminders.some((item) => item.id === saved.id);
      const next = exists
        ? reminders.map((item) => (item.id === saved.id ? saved : item))
        : [...reminders, saved];

      await persist(next);
      setScreen('list');
      setEditing(null);
      setOverdue(findOverduePending(next));

      const sync = await syncReminder(config, saved);
      if (config.syncEnabled && !sync.ok) {
        Alert.alert(
          '已保存在本机',
          `云端同步失败：${sync.error ?? '未知错误'}\n\n到点仍会本地响，但微信/短信兜底暂时不会生效。`,
        );
      }
    },
    [config, editing, persist, reminders],
  );

  const handleAck = useCallback(
    async (reminder: Reminder) => {
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
        for (const item of pending) {
          await syncReminder(nextConfig, item);
        }
      }
    },
    [reminders],
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
