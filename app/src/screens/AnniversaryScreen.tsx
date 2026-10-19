import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import CalendarPicker from '../components/CalendarPicker';
import { colors, radius, spacing } from '../theme';
import { formatDateTime, stepsForLevel } from '../lib/time';
import {
  MILESTONE_OPTIONS,
  buildAnniversaryReminders,
  milestoneLabel,
  previewMilestones,
} from '../lib/anniversary';
import {
  LUNAR_MONTHS,
  buildLunarReminders,
  lunarDayLabel,
  lunarLabel,
  nextLunarOccurrences,
} from '../lib/lunar';
import type { Reminder } from '../types';

interface Props {
  onCancel: () => void;
  onGenerate: (reminders: Reminder[]) => void;
}

type Mode = 'milestones' | 'solar' | 'lunar';

const MODES: { value: Mode; label: string }[] = [
  { value: 'milestones', label: '天数 / 周年' },
  { value: 'solar', label: '每年（公历）' },
  { value: 'lunar', label: '每年（农历）' },
];

const LUNAR_DAYS = Array.from({ length: 30 }, (_, index) => index + 1);
/** 一次生成未来几年，够用且不会占太多闹钟额度 */
const LUNAR_YEARS_AHEAD = 5;

export default function AnniversaryScreen({ onCancel, onGenerate }: Props) {
  const [title, setTitle] = useState('');
  const [baseDate, setBaseDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [mode, setMode] = useState<Mode>('milestones');
  const [selected, setSelected] = useState<number[]>([100, 365, 1000]);
  const [customDays, setCustomDays] = useState('');
  const [lunarMonth, setLunarMonth] = useState(8);
  const [lunarDay, setLunarDay] = useState(15);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => previewMilestones(baseDate, selected), [baseDate, selected]);
  const upcoming = previews.filter((item) => !item.skipped);
  const lunarPreview = useMemo(
    () => nextLunarOccurrences(lunarMonth, lunarDay, LUNAR_YEARS_AHEAD),
    [lunarMonth, lunarDay],
  );

  function toggle(days: number) {
    setSelected((prev) => (prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days]));
  }

  function addCustom() {
    const days = Number(customDays.trim());
    if (!Number.isFinite(days) || days <= 0 || days > 20000) {
      setError('自定义天数填 1–20000 之间的整数');
      return;
    }
    if (!selected.includes(days)) setSelected((prev) => [...prev, days]);
    setCustomDays('');
    setError(null);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('先给这个纪念日起个名字');
      return;
    }

    const now = Date.now();

    // 农历每年：每年对应公历日期不同，因此生成未来 N 条
    if (mode === 'lunar') {
      const generated = buildLunarReminders(trimmed, lunarMonth, lunarDay, LUNAR_YEARS_AHEAD);
      if (generated.length === 0) {
        setError('未来几年没有这个农历日期，换一个日子');
        return;
      }
      setError(null);
      onGenerate(generated);
      return;
    }

    // 公历每年：单条 yearly，确认后自动滚到明年
    if (mode === 'solar') {
      const next = new Date(baseDate);
      next.setHours(9, 0, 0, 0);
      while (next.getTime() <= now) next.setFullYear(next.getFullYear() + 1);
      const baseKey = `${baseDate.getFullYear()}-${baseDate.getMonth() + 1}-${baseDate.getDate()}`;
      const fireAt = next.getTime();
      setError(null);
      onGenerate([
        {
          id: `yearly-${baseKey}`,
          title: trimmed,
          note: `每年重复 · 起点 ${baseKey}`,
          fireAt,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
          forceLevel: 3,
          repeat: 'yearly',
          steps: stepsForLevel(3).filter(
            (step) => step.afterSec >= 0 || fireAt + step.afterSec * 1000 > now,
          ),
          status: 'pending',
          createdAt: now,
        },
      ]);
      return;
    }

    // 天数 / 周年里程碑
    if (selected.length === 0) {
      setError('至少勾选一个里程碑');
      return;
    }
    const generated = buildAnniversaryReminders(trimmed, baseDate, selected);
    if (generated.length === 0) {
      setError('这些里程碑都已经过去了，换个日期或天数');
      return;
    }
    setError(null);
    onGenerate(generated);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.headerGhost}>取消</Text>
        </Pressable>
        <Text style={styles.headerTitle}>纪念日</Text>
        <Pressable onPress={submit} hitSlop={12}>
          <Text style={styles.headerDone}>生成</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.label}>纪念日名称</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例如：妈妈生日 / 结婚纪念日 / 入职"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        <Text style={styles.label}>类型</Text>
        <View style={styles.chips}>
          {MODES.map((item) => {
            const active = item.value === mode;
            return (
              <Pressable
                key={item.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setMode(item.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'lunar' ? (
          <>
            <Text style={styles.label}>农历日期</Text>
            <Text style={styles.bigLabel}>{lunarLabel(lunarMonth, lunarDay)}</Text>

            <Text style={styles.subLabel}>月份</Text>
            <View style={styles.chips}>
              {LUNAR_MONTHS.map((name, index) => {
                const active = index + 1 === lunarMonth;
                return (
                  <Pressable
                    key={name}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLunarMonth(index + 1)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.subLabel}>日</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.dayRow}>
                {LUNAR_DAYS.map((day) => {
                  const active = day === lunarDay;
                  return (
                    <Pressable
                      key={day}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setLunarDay(day)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {lunarDayLabel(day)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.label}>接下来 {lunarPreview.length} 次</Text>
            <View style={styles.previewList}>
              {lunarPreview.map((item) => (
                <View key={`${item.lunarYear}`} style={styles.previewRow}>
                  <Text style={styles.previewName}>{item.lunarYear} 年</Text>
                  <Text style={styles.previewDate}>{formatDateTime(item.date.getTime())}</Text>
                </View>
              ))}
              {lunarPreview.length === 0 ? (
                <Text style={styles.previewEmpty}>这个农历日期近几年不存在</Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>起点日期</Text>
            <Text style={styles.bigLabel}>{formatDateTime(baseDate.getTime()).slice(0, 10)}</Text>
            <CalendarPicker value={baseDate} onChange={setBaseDate} showLunar />
          </>
        )}

        {mode === 'solar' ? (
          <Text style={styles.hint}>每年同一天 09:00 提醒，确认后自动滚到明年。</Text>
        ) : null}

        {mode === 'milestones' ? (
          <>
            <Text style={styles.label}>里程碑</Text>
            <View style={styles.chips}>
              {MILESTONE_OPTIONS.map((days) => {
                const active = selected.includes(days);
                return (
                  <Pressable
                    key={days}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggle(days)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {milestoneLabel(days)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.customRow}>
              <TextInput
                value={customDays}
                onChangeText={setCustomDays}
                placeholder="自定义：输入天数"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.customInput}
              />
              <Pressable style={styles.customAdd} onPress={addCustom}>
                <Text style={styles.customAddText}>添加</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>将生成 {upcoming.length} 条提醒</Text>
            <View style={styles.previewList}>
              {previews.map((item) => (
                <View key={item.days} style={styles.previewRow}>
                  <Text style={[styles.previewName, item.skipped && styles.previewSkipped]}>
                    {milestoneLabel(item.days)}
                  </Text>
                  <Text style={[styles.previewDate, item.skipped && styles.previewSkipped]}>
                    {item.skipped ? '已过去' : formatDateTime(item.date.getTime())}
                  </Text>
                </View>
              ))}
              {previews.length === 0 ? <Text style={styles.previewEmpty}>还没选里程碑</Text> : null}
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.submit} onPress={submit}>
          <Text style={styles.submitText}>生成提醒</Text>
        </Pressable>

        <Text style={styles.footnote}>
          生成的是普通提醒：会出现在列表里、参与云端升级。农历生日会一次生成未来 {LUNAR_YEARS_AHEAD} 年的公历提醒，重复生成同一日期会覆盖。
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
  label: {
    color: colors.textFaint,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  subLabel: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm, marginBottom: 6 },
  bigLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: '#16233a' },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextActive: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.textFaint, fontSize: 13, marginTop: spacing.md, lineHeight: 20 },
  customRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  customInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customAdd: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  customAddText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  previewList: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  previewName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  previewDate: { color: colors.textDim, fontSize: 13 },
  previewSkipped: { color: colors.textFaint, textDecorationLine: 'line-through' },
  previewEmpty: { color: colors.textFaint, fontSize: 13, paddingVertical: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: { color: colors.textFaint, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
});
