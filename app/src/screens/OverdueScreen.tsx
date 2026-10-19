import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatDateTime } from '../lib/time';
import type { Reminder } from '../types';

interface Props {
  reminder: Reminder;
  onDone: (reminder: Reminder) => void;
  onSnooze: (reminder: Reminder) => void;
  /** 重复提醒专用：跳过本次，直接滚到下一个周期 */
  onSkip?: (reminder: Reminder) => void;
}

/**
 * App 内强制确认页。
 * AlarmKit 的「完成」按钮不会回调 JS，所以到点后进 App 时用这个页面兜住确认动作，
 * 避免「响了但云端一直不知道你处理了」。
 */
export default function OverdueScreen({ reminder, onDone, onSnooze, onSkip }: Props) {
  const repeatable = Boolean(reminder.repeat && reminder.repeat !== 'none');

  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>已到点</Text>
      </View>

      <Text style={styles.title}>{reminder.title}</Text>
      <Text style={styles.time}>{formatDateTime(reminder.fireAt)}</Text>
      {reminder.note ? <Text style={styles.note}>{reminder.note}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.done} onPress={() => onDone(reminder)}>
          <Text style={styles.doneText}>已完成</Text>
        </Pressable>
        <Pressable style={styles.snooze} onPress={() => onSnooze(reminder)}>
          <Text style={styles.snoozeText}>5 分钟后再提醒</Text>
        </Pressable>
        {repeatable && onSkip ? (
          <Pressable style={styles.skip} onPress={() => onSkip(reminder)}>
            <Text style={styles.skipText}>跳过本次</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.hint}>
        不确认的话，云端会继续按升级链推送企业微信。确认后停止。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  badge: {
    backgroundColor: '#3a1d1d',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.xl,
  },
  badgeText: { color: colors.danger, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 38 },
  time: { color: colors.textDim, fontSize: 15, marginTop: spacing.md },
  note: {
    color: colors.textFaint,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  actions: { alignSelf: 'stretch', marginTop: 48, gap: spacing.md },
  done: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  snooze: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  snoozeText: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  skip: { alignSelf: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textFaint, fontSize: 13 },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
