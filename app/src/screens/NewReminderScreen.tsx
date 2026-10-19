import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatDateTime, stepsForLevel } from '../lib/time';
import type { Reminder } from '../types';

interface Props {
  onCancel: () => void;
  onSave: (reminder: Reminder) => void;
}

const FORCE_OPTIONS = [
  { level: 2, label: '单次', desc: '只在到点提醒一次' },
  { level: 3, label: '标准', desc: '到点 + 没确认就升级到微信' },
  { level: 4, label: '强力', desc: '多级预警 + 短信兜底' },
  { level: 5, label: '硬核', desc: '一直到你确认为止' },
];

const CHANNEL_LABEL: Record<string, string> = {
  pushplus: '微信',
  email: '邮件',
  sms: '短信',
  voice: '电话',
};

function stepLabel(afterSec: number): string {
  if (afterSec < 0) {
    const abs = Math.abs(afterSec);
    if (abs >= 86400) return `提前 ${Math.round(abs / 86400)} 天`;
    if (abs >= 3600) return `提前 ${Math.round(abs / 3600)} 小时`;
    return `提前 ${Math.round(abs / 60)} 分钟`;
  }
  if (afterSec === 0) return '到点';
  const abs = afterSec;
  if (abs >= 3600) return `+${Math.round(abs / 3600)} 小时`;
  return `+${Math.round(abs / 60)} 分钟`;
}

function presetDate(kind: 'hour' | 'tonight' | 'tomorrow'): Date {
  const d = new Date();
  if (kind === 'hour') {
    d.setTime(Date.now() + 3600_000);
    return d;
  }
  if (kind === 'tonight') {
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
    return t;
  }
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(9, 0, 0, 0);
  return t;
}

export default function NewReminderScreen({ onCancel, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [fireAt, setFireAt] = useState<Date>(() => presetDate('hour'));
  const [forceLevel, setForceLevel] = useState(3);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(() => stepsForLevel(forceLevel), [forceLevel]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('先写一句话：这条提醒是干嘛的');
      return;
    }
    if (fireAt.getTime() <= Date.now()) {
      setError('时间已经过去了，选一个未来的时刻');
      return;
    }
    setError(null);
    onSave({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      note: note.trim(),
      fireAt: fireAt.getTime(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      forceLevel,
      steps,
      status: 'pending',
      createdAt: Date.now(),
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.headerGhost}>取消</Text>
        </Pressable>
        <Text style={styles.headerTitle}>新建提醒</Text>
        <Pressable onPress={submit} hitSlop={12}>
          <Text style={styles.headerDone}>保存</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.label}>提醒内容</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例如：10/25 前提交材料"
          placeholderTextColor={colors.textFaint}
          style={styles.titleInput}
        />

        <Text style={styles.label}>什么时候</Text>
        <View style={styles.presetRow}>
          <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('hour'))}>
            <Text style={styles.presetText}>1 小时后</Text>
          </Pressable>
          <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('tonight'))}>
            <Text style={styles.presetText}>今晚 20:00</Text>
          </Pressable>
          <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('tomorrow'))}>
            <Text style={styles.presetText}>明天 09:00</Text>
          </Pressable>
        </View>

        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={fireAt}
            mode="datetime"
            display="spinner"
            themeVariant="dark"
            textColor={colors.text}
            onChange={(_event, date) => {
              if (date) setFireAt(date);
            }}
            style={styles.picker}
          />
        ) : (
          <>
            <Pressable style={styles.androidTime} onPress={() => setShowAndroidPicker(true)}>
              <Text style={styles.androidTimeText}>{formatDateTime(fireAt.getTime())}</Text>
              <Text style={styles.androidTimeHint}>点按修改</Text>
            </Pressable>
            {showAndroidPicker ? (
              <DateTimePicker
                value={fireAt}
                mode="datetime"
                display="default"
                onChange={(_event, date) => {
                  setShowAndroidPicker(false);
                  if (date) setFireAt(date);
                }}
              />
            ) : null}
          </>
        )}

        <Text style={styles.label}>强制度</Text>
        <View style={styles.forceRow}>
          {FORCE_OPTIONS.map((option) => {
            const active = option.level === forceLevel;
            return (
              <Pressable
                key={option.level}
                style={[styles.forceChip, active && styles.forceChipActive]}
                onPress={() => setForceLevel(option.level)}
              >
                <Text style={[styles.forceLabel, active && styles.forceLabelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.forceDesc}>
          {FORCE_OPTIONS.find((o) => o.level === forceLevel)?.desc}
        </Text>

        <Text style={styles.label}>升级链预览</Text>
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={`${step.afterSec}-${index}`} style={styles.stepChip}>
              <Text style={styles.stepText}>
                {stepLabel(step.afterSec)} · {step.channels.map((c) => CHANNEL_LABEL[c] ?? c).join('/')}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.label}>备注（可选）</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="补充信息，会随提醒显示"
          placeholderTextColor={colors.textFaint}
          style={styles.noteInput}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveButton} onPress={submit}>
          <Text style={styles.saveButtonText}>创建提醒</Text>
        </Pressable>

        <Text style={styles.footnote}>
          到点由系统闹钟响铃（iOS 26+），没确认会自动升级到微信；短信/电话需要服务器开启对应通道。
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
  label: { color: colors.textFaint, fontSize: 12, letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.lg },
  titleInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  presetRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  preset: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  presetText: { color: colors.textDim, fontSize: 13 },
  picker: { alignSelf: 'stretch' },
  androidTime: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  androidTimeText: { color: colors.text, fontSize: 16 },
  androidTimeHint: { color: colors.textFaint, fontSize: 12 },
  forceRow: { flexDirection: 'row', gap: spacing.sm },
  forceChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  forceChipActive: { borderColor: colors.accent, backgroundColor: '#16233a' },
  forceLabel: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  forceLabelActive: { color: colors.text },
  forceDesc: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  stepText: { color: colors.textDim, fontSize: 12 },
  noteInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: { color: colors.textFaint, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
});
