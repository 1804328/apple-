import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatDateTime } from '../lib/time';
import { MILESTONE_OPTIONS, buildAnniversaryReminders, milestoneLabel, previewMilestones } from '../lib/anniversary';
import type { Reminder } from '../types';

interface Props {
  onCancel: () => void;
  onGenerate: (reminders: Reminder[]) => void;
}

export default function AnniversaryScreen({ onCancel, onGenerate }: Props) {
  const [title, setTitle] = useState('');
  const [baseDate, setBaseDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selected, setSelected] = useState<number[]>([100, 365, 1000]);
  const [customDays, setCustomDays] = useState('');
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => previewMilestones(baseDate, selected), [baseDate, selected]);
  const upcoming = previews.filter((item) => !item.skipped);

  function toggle(days: number) {
    setSelected((prev) =>
      prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days],
    );
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

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>纪念日名称</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例如：和阿哲在一起 / 戒烟 / 入职"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        <Text style={styles.label}>起点日期</Text>
        <Text style={styles.baseDateText}>{formatDateTime(baseDate.getTime()).slice(0, 10)}</Text>
        <DateTimePicker
          value={baseDate}
          mode="date"
          display="spinner"
          themeVariant="dark"
          textColor={colors.text}
          onChange={(_event, date) => {
            if (date) setBaseDate(date);
          }}
        />

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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.submit} onPress={submit}>
          <Text style={styles.submitText}>生成提醒</Text>
        </Pressable>

        <Text style={styles.footnote}>
          生成的是普通提醒：会出现在列表里、参与云端升级，重复生成同一个纪念日会覆盖而不会重复。
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
  baseDateText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
