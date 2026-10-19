import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import ListScreen from './src/screens/ListScreen';
import NewReminderScreen from './src/screens/NewReminderScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';
import type { ChannelConfig, Reminder } from './src/types';
import {
  loadConfig,
  loadReminders,
  saveConfig,
  saveReminders,
  splitReminders,
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

const EMPTY_CONFIG: ChannelConfig = { apiBaseUrl: '', apiKey: '', syncEnabled: false };

export default function App() {
  const [ready, setReady] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [config, setConfig] = useState<ChannelConfig>(EMPTY_CONFIG);
  const [screen, setScreen] = useState<Screen>('list');

  // 倒计时需要周期性重算
  const [, tick] = useState(0);

  useEffect(() => {
    setupNotificationHandler();
    const timer = setInterval(() => tick((n) => n + 1), 30_000);

    let mounted = true;
    (async () => {
      const [stored, storedConfig] = await Promise.all([loadReminders(), loadConfig()]);
      if (!mounted) return;
      setReminders(stored);
      setConfig(storedConfig);
      setReady(true);
      // 权限申请放在数据加载之后，避免首屏白屏等弹窗
      requestPermissions().catch(() => undefined);
    })();

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const persist = useCallback(async (next: Reminder[]) => {
    setReminders(next);
    await saveReminders(next);
  }, []);

  const handleCreate = useCallback(
    async (reminder: Reminder) => {
      const alarmIds = await scheduleFor(reminder).catch(() => [] as string[]);
      const saved: Reminder = { ...reminder, alarmIds };
      const next = [...reminders, saved];
      await persist(next);
      setScreen('list');

      const sync = await syncReminder(config, saved);
      if (config.syncEnabled && !sync.ok) {
        Alert.alert('已保存在本机', `云端同步失败：${sync.error ?? '未知错误'}\n\n到点仍会本地响，但微信/短信兜底暂时不会生效。`);
      }
    },
    [config, persist, reminders],
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
      if (config.syncEnabled) {
        const result = await ackOnServer(config, reminder.id);
        if (!result.ok) {
          // 本地已确认；云端确认失败只影响是否继续升级，提示但不阻塞
          console.warn('ack sync failed', result.error);
        }
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

  const { upcoming, finished } = splitReminders(reminders);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {screen === 'list' ? (
        <ListScreen
          upcoming={upcoming}
          finished={finished}
          alarmKitAvailable={alarmKitAvailable}
          syncEnabled={config.syncEnabled && config.apiBaseUrl.length > 0}
          onNew={() => setScreen('new')}
          onAck={handleAck}
          onDelete={handleDelete}
          onOpenSettings={() => setScreen('settings')}
        />
      ) : null}

      {screen === 'new' ? (
        <NewReminderScreen onCancel={() => setScreen('list')} onSave={handleCreate} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
