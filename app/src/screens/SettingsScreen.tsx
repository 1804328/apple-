import React, { useState } from 'react';
import {
  Alert,
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
import { checkHealth } from '../services/api';

interface Props {
  config: ChannelConfig;
  alarmKitAvailable: boolean;
  onSave: (config: ChannelConfig) => void;
  onBack: () => void;
  onRequestPermissions: () => void;
}

export default function SettingsScreen({
  config,
  alarmKitAvailable,
  onSave,
  onBack,
  onRequestPermissions,
}: Props) {
  const [apiBaseUrl, setApiBaseUrl] = useState(config.apiBaseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [syncEnabled, setSyncEnabled] = useState(config.syncEnabled);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    const result = await checkHealth({ apiBaseUrl, apiKey, syncEnabled: true });
    setTesting(false);
    Alert.alert(result.ok ? '连接成功' : '连接失败', result.ok ? '服务器可达。' : result.error ?? '未知错误');
  }

  function save() {
    onSave({ apiBaseUrl: apiBaseUrl.trim(), apiKey: apiKey.trim(), syncEnabled });
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

        <Text style={styles.section}>系统权限</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>闹钟级提醒（AlarmKit）</Text>
          <Text style={[styles.statusValue, { color: alarmKitAvailable ? colors.ok : colors.warn }]}>
            {alarmKitAvailable ? '已可用' : '不可用'}
          </Text>
        </View>
        <Text style={styles.hint}>
          {alarmKitAvailable
            ? 'iOS 26+ 已启用：静音、勿扰、锁屏下也会像系统闹钟一样响。'
            : '需要 iOS 26+ 且在弹窗里允许。当前只能发普通通知，静音时可能不响。'}
        </Text>

        <Pressable style={styles.secondaryButton} onPress={onRequestPermissions}>
          <Text style={styles.secondaryText}>重新申请权限</Text>
        </Pressable>

        <Text style={styles.section}>关于</Text>
        <Text style={styles.about}>
          强提醒 v0.1.0{'\n'}
          设定日期 → 到点闹钟级响铃 → 没确认就升级到微信/短信 → 点链接即确认。
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
