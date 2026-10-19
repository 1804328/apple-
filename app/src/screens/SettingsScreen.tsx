import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { ChannelConfig } from '../types';
import { checkHealth, testChannel } from '../services/api';
import { getPermissionStatus } from '../services/alarms';

interface Props {
  config: ChannelConfig;
  alarmKitAvailable: boolean;
  stats: { created: number; acked: number; missed: number };
  lastSyncAt?: number;
  alarmStats: { alarmKit: number; notifications: number; total: number };
  onAddResignReminder: () => void;
  onSave: (config: ChannelConfig) => void;
  onBack: () => void;
  onRequestPermissions: () => void;
}

function relativeTime(ts?: number): string {
  if (!ts) return '从未同步';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default function SettingsScreen({
  config,
  alarmKitAvailable,
  stats,
  lastSyncAt,
  alarmStats,
  onAddResignReminder,
  onSave,
  onBack,
  onRequestPermissions,
}: Props) {
  const [apiBaseUrl, setApiBaseUrl] = useState(config.apiBaseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [syncEnabled, setSyncEnabled] = useState(config.syncEnabled);
  const [hardcoreEnabled, setHardcoreEnabled] = useState(Boolean(config.hardcoreEnabled));
  const [testing, setTesting] = useState(false);
  const [testingChannel, setTestingChannel] = useState(false);
  const [permissions, setPermissions] = useState<{ notifications: boolean; alarmKit: boolean } | null>(
    null,
  );

  useEffect(() => {
    getPermissionStatus()
      .then(setPermissions)
      .catch(() => setPermissions(null));
  }, []);

  async function testConnection() {
    setTesting(true);
    const result = await checkHealth({ apiBaseUrl, apiKey, syncEnabled: true });
    setTesting(false);
    Alert.alert(result.ok ? '连接成功' : '连接失败', result.ok ? '服务器可达。' : result.error ?? '未知错误');
  }

  async function testWechat() {
    setTestingChannel(true);
    const result = await testChannel({ apiBaseUrl: apiBaseUrl.trim(), apiKey: apiKey.trim(), syncEnabled: true });
    setTestingChannel(false);
    if (result.skipped) {
      Alert.alert('通道未启用', result.error ?? '服务端没有配置微信通道');
    } else if (result.ok) {
      Alert.alert('已发送', '服务端已通过微信通道发出一条测试消息，去企业微信看看。');
    } else {
      Alert.alert('通道异常', result.error ?? '未知错误');
    }
  }

  function save() {
    onSave({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      syncEnabled,
      hardcoreEnabled,
    });
    onBack();
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerGhost}>返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>设置</Text>
        <Pressable onPress={save} hitSlop={12}>
          <Text style={styles.headerDone}>保存</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>云端升级（微信/短信兜底）</Text>
        <Text style={styles.hint}>
          到点没确认时，由服务器按升级链推送。服务器地址是部署 Cloudflare Worker 后拿到的域名。
        </Text>

        <Text style={styles.label}>服务器地址</Text>
        <TextInput
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          placeholder="https://strong-reminder.xxx.workers.dev"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>API Key</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="与 wrangler secret 里的 API_KEY 一致"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>启用云端升级</Text>
            <Text style={styles.switchHint}>关闭后提醒只在本机响</Text>
          </View>
          <Switch
            value={syncEnabled}
            onValueChange={setSyncEnabled}
            trackColor={{ false: '#2a3442', true: '#2f5da8' }}
            thumbColor={syncEnabled ? colors.accent : '#8b9bb0'}
          />
        </View>

        <Pressable style={styles.secondaryButton} onPress={testConnection} disabled={testing}>
          <Text style={styles.secondaryText}>{testing ? '测试中…' : '测试连接'}</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={testWechat} disabled={testingChannel}>
          <Text style={styles.secondaryText}>
            {testingChannel ? '发送中…' : '通道自检（让服务器发一条微信）'}
          </Text>
        </Pressable>

        <Text style={styles.section}>系统体检</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>通知权限</Text>
          <Text
            style={[
              styles.statusValue,
              { color: permissions?.notifications ? colors.ok : colors.danger },
            ]}
          >
            {permissions?.notifications ? '已允许' : '未允许'}
          </Text>
        </View>
        {!permissions?.notifications ? (
          <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.secondaryText}>去系统设置打开通知</Text>
          </Pressable>
        ) : null}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>闹钟级提醒（AlarmKit）</Text>
          <Text
            style={[
              styles.statusValue,
              { color: permissions?.alarmKit ? colors.ok : colors.warn },
            ]}
          >
            {alarmKitAvailable ? (permissions?.alarmKit ? '已允许' : '未允许') : '不可用'}
          </Text>
        </View>
        <Text style={styles.hint}>
          {alarmKitAvailable
            ? 'iOS 26+ 已启用：静音、勿扰、锁屏下也会像系统闹钟一样响。'
            : '需要 iOS 26+ 且在弹窗里允许。当前只能发普通通知，静音时可能不响。'}
        </Text>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>已排闹钟</Text>
          <Text
            style={[
              styles.statusValue,
              { color: alarmStats.alarmKit >= 30 ? colors.warn : colors.text },
            ]}
          >
            {alarmStats.total} 个（系统闹钟 {alarmStats.alarmKit}）
          </Text>
        </View>
        {alarmStats.alarmKit >= 30 ? (
          <Text style={styles.warnText}>
            系统闹钟数量接近上限，超出后可能被系统忽略。建议删掉一些不重要的提醒。
          </Text>
        ) : null}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>最近同步</Text>
          <Text style={styles.statusValue}>{relativeTime(lastSyncAt)}</Text>
        </View>

        <Pressable style={styles.secondaryButton} onPress={onRequestPermissions}>
          <Text style={styles.secondaryText}>重新申请权限</Text>
        </Pressable>

        <Text style={styles.section}>提醒增强</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>强制模式（数学题解锁）</Text>
            <Text style={styles.switchHint}>
              打开后，新建提醒时才出现这个选项；每条提醒仍需单独勾选
            </Text>
          </View>
          <Switch
            value={hardcoreEnabled}
            onValueChange={setHardcoreEnabled}
            trackColor={{ false: '#2a3442', true: '#2f5da8' }}
            thumbColor={hardcoreEnabled ? colors.accent : '#8b9bb0'}
          />
        </View>

        <Text style={styles.section}>维护</Text>
        <Pressable style={styles.secondaryButton} onPress={onAddResignReminder}>
          <Text style={styles.secondaryText}>添加「每周重签」提醒</Text>
        </Pressable>
        <Text style={styles.hint}>
          免费签名 7 天到期，到期后 App 打不开、提醒全部失效。建议设一条每周提醒自己重签。
        </Text>

        <Text style={styles.section}>本月</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>新建</Text>
          <Text style={styles.statusValue}>{stats.created} 条</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>已确认</Text>
          <Text style={[styles.statusValue, { color: colors.ok }]}>{stats.acked} 条</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>错过的提醒（累计）</Text>
          <Text style={[styles.statusValue, { color: stats.missed > 0 ? colors.warn : colors.textDim }]}>
            {stats.missed} 条
          </Text>
        </View>

        <Text style={styles.section}>关于</Text>
        <Text style={styles.about}>
          强提醒 v0.1.0{'\n'}
          设定日期 → 到点闹钟级响铃 → 没确认就升级到微信 → 点链接即确认。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerGhost: { color: colors.textDim, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerDone: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: 60 },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  warnText: { color: colors.warn, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  label: { color: colors.textFaint, fontSize: 12, marginTop: spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  switchLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  switchHint: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  statusLabel: { color: colors.text, fontSize: 14 },
  statusValue: { fontSize: 13, fontWeight: '700' },
  about: { color: colors.textFaint, fontSize: 12, lineHeight: 20 },
});
