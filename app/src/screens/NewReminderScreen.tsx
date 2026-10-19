import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import CalendarPicker from '../components/CalendarPicker';
import { colors, levelColors, radius, spacing } from '../theme';
import { formatDateTime, mergeDate, mergeTime, stepsForLevel } from '../lib/time';
import type { Reminder, RepeatRule } from '../types';

interface Props {
  onCancel: () => void;
  onSave: (reminder: Reminder) => void;
  initial?: Reminder;
  /** 全局开关：是否展示「强制模式」选项 */
  hardcoreAvailable?: boolean;
}

const FORCE_OPTIONS = [
  { level: 2, label: '单次', desc: '只在到点提醒一次' },
  { level: 3, label: '标准', desc: '到点 + 没确认就升级到微信' },
  { level: 4, label: '强力', desc: '多级预警 + 短信兜底' },
  { level: 5, label: '硬核', desc: '一直到你确认为止' },
];

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
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
  if (afterSec >= 3600) return `+${Math.round(afterSec / 3600)} 小时`;
  return `+${Math.round(afterSec / 60)} 分钟`;
}

type PresetKind = 'hour' | 'tonight' | 'tomorrow' | 'nextMonday' | 'in3days' | 'nextMonthFirst';

function presetDate(kind: PresetKind): Date {
  if (kind === 'hour') {
    const d = new Date();
    d.setTime(Date.now() + 3600_000);
    return d;
  }
  if (kind === 'tonight') {
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
    return t;
  }
  if (kind === 'tomorrow') {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t;
  }
  if (kind === 'nextMonday') {
    const t = new Date();
    t.setHours(9, 0, 0, 0);
    t.setDate(t.getDate() + (((8 - t.getDay()) % 7) || 7));
    return t;
  }
  if (kind === 'in3days') {
    const t = new Date();
    t.setDate(t.getDate() + 3);
    t.setHours(9, 0, 0, 0);
    return t;
  }
  const t = new Date();
  t.setMonth(t.getMonth() + 1, 1);
  t.setHours(9, 0, 0, 0);
  return t;
}

export default function NewReminderScreen({ onCancel, onSave, initial, hardcoreAvailable }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [fireAt, setFireAt] = useState<Date>(() =>
    initial ? new Date(initial.fireAt) : presetDate('hour'),
  );
  const [forceLevel, setForceLevel] = useState(initial?.forceLevel ?? 3);
  const [repeat, setRepeat] = useState<RepeatRule>(initial?.repeat ?? 'none');
  const [hardcore, setHardcore] = useState(initial?.unlock === 'math');
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 已经过去的前置预警不用排（比如 3 小时后的事不该出现「提前 1 天」）
  const steps = useMemo(
    () =>
      stepsForLevel(forceLevel).filter(
        (step) => step.afterSec >= 0 || fireAt.getTime() + step.afterSec * 1000 > Date.now(),
      ),
    [forceLevel, fireAt],
  );

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('先写一句话：这条提醒是干嘛的');
      return;
    }
    if (!initial && fireAt.getTime() <= Date.now()) {
      setError('时间已经过去了，选一个未来的时刻');
      return;
    }
    setError(null);
    onSave({
      id: initial?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      note: note.trim(),
      fireAt: fireAt.getTime(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      forceLevel,
      repeat,
      unlock: hardcore ? 'math' : 'none',
      steps,
      status: 'pending',
      createdAt: initial?.createdAt ?? Date.now(),
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.headerGhost}>取消</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{initial ? '编辑提醒' : '新建提醒'}</Text>
        <Pressable onPress={submit} hitSlop={12}>
          <Text style={styles.headerDone}>保存</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>提醒内容</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="例如：10/25 前提交材料"
            placeholderTextColor={colors.textFaint}
            style={styles.titleInput}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>时间</Text>
            <Text style={styles.cardValue}>{formatDateTime(fireAt.getTime())}</Text>
          </View>

          <View style={styles.presetRow}>
            <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('hour'))}>
              <Text style={styles.presetText}>1 小时后</Text>
            </Pressable>
            <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('tonight'))}>
              <Text style={styles.presetText}>今晚</Text>
            </Pressable>
            <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('tomorrow'))}>
              <Text style={styles.presetText}>明天</Text>
            </Pressable>
            <Pressable style={styles.preset} onPress={() => setFireAt(presetDate('nextMonday'))}>
              <Text style={styles.presetText}>下周一</Text>
            </Pressable>
          </View>

          {Platform.OS === 'ios' ? (
            <>
              <CalendarPicker
                value={fireAt}
                onChange={(date) => setFireAt((prev) => mergeDate(prev, date))}
              />
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>时间</Text>
                <DateTimePicker
                  value={fireAt}
                  mode="time"
                  display="compact"
                  locale="zh-CN"
                  themeVariant="dark"
                  onChange={(_event, date) => {
                    if (date) setFireAt((prev) => mergeTime(prev, date));
                  }}
                />
              </View>
            </>
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
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>提醒方式</Text>

          <Text style={styles.subLabel}>强制度</Text>
          <View style={styles.chipRow}>
            {FORCE_OPTIONS.map((option) => {
              const active = option.level === forceLevel;
              const accent = levelColors[option.level] ?? colors.accent;
              return (
                <Pressable
                  key={option.level}
                  style={[
                    styles.chip,
                    active && { borderColor: accent, backgroundColor: colors.accentSoft },
                  ]}
                  onPress={() => setForceLevel(option.level)}
                >
                  <Text style={[styles.chipText, active && { color: accent, fontWeight: '700' }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {FORCE_OPTIONS.find((o) => o.level === forceLevel)?.desc}
          </Text>

          <Text style={styles.subLabel}>重复</Text>
          <View style={styles.chipRow}>
            {REPEAT_OPTIONS.map((option) => {
              const active = option.value === repeat;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setRepeat(option.value)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {repeat === 'none'
              ? '只提醒这一次'
              : `完成后自动滚到下一个周期（${repeat === 'weekly' ? '下周' : repeat === 'monthly' ? '下月' : '明年'}同一天）`}
          </Text>
        </View>

        <Pressable style={styles.moreToggle} onPress={() => setAdvanced((prev) => !prev)}>
          <Text style={styles.moreText}>
            {advanced ? '收起高级选项' : '高级选项：强制模式 / 升级链 / 备注'}
          </Text>
          <Text style={styles.moreCaret}>{advanced ? '▲' : '▼'}</Text>
        </Pressable>

        {advanced ? (
          <>
            {hardcoreAvailable ? (
              <View style={styles.card}>
                <View style={styles.switchLine}>
                  <View style={styles.switchTextWrap}>
                    <Text style={styles.switchLabel}>强制模式（数学题解锁）</Text>
                    <Text style={styles.hint}>到点后连环响铃，必须在 App 里做对 3 道题才能确认</Text>
                  </View>
                  <Switch
                    value={hardcore}
                    onValueChange={setHardcore}
                    trackColor={{ false: '#2a3442', true: '#2f5da8' }}
                    thumbColor={hardcore ? colors.accent : '#8b9bb0'}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>升级链</Text>
              <View style={styles.steps}>
                {steps.map((step, index) => (
                  <View key={`${step.afterSec}-${index}`} style={styles.stepChip}>
                    <Text style={styles.stepText}>
                      {stepLabel(step.afterSec)} · {step.channels.map((c) => CHANNEL_LABEL[c] ?? c).join('/')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>备注</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="补充信息，会随提醒显示"
                placeholderTextColor={colors.textFaint}
                style={styles.noteInput}
                multiline
              />
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.saveButton} onPress={submit}>
          <Text style={styles.saveButtonText}>{initial ? '保存修改' : '创建提醒'}</Text>
        </Pressable>
      </View>
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
  },
  headerGhost: { color: colors.textDim, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerDone: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardLabel: { color: colors.textFaint, fontSize: 12, letterSpacing: 0.5, marginBottom: spacing.sm },
  cardValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  titleInput: {
    color: colors.text,
    fontSize: 17,
    paddingVertical: spacing.xs,
  },
  presetRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  preset: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    alignItems: 'center',
  },
  presetText: { color: colors.textDim, fontSize: 12 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  timeLabel: { color: colors.textDim, fontSize: 14 },
  androidTime: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  androidTimeText: { color: colors.text, fontSize: 16 },
  androidTimeHint: { color: colors.textFaint, fontSize: 12 },
  subLabel: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  hint: { color: colors.textFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  moreText: { color: colors.textDim, fontSize: 13 },
  moreCaret: { color: colors.textFaint, fontSize: 9 },
  switchLine: { flexDirection: 'row', alignItems: 'center' },
  switchTextWrap: { flex: 1, marginRight: spacing.md },
  switchLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  stepText: { color: colors.textDim, fontSize: 11 },
  noteInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 14,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
