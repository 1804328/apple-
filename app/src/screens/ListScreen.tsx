import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { formatCountdown, formatFireLabel } from '../lib/time';
import type { Reminder } from '../types';
import type { ReminderGroups } from '../store/reminders';

interface Props {
  groups: ReminderGroups;
  alarmKitAvailable: boolean;
  syncEnabled: boolean;
  now: number;
  onNew: () => void;
  onAck: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onOpenSettings: () => void;
}

const FORCE_LABEL: Record<number, string> = {
  1: '轻提醒',
  2: '单次',
  3: '标准',
  4: '强力',
  5: '硬核',
  6: '硬核+',
};

function ReminderCard({
  reminder,
  now,
  onAck,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  now: number;
  onAck: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const pending = reminder.status === 'pending';
  const overdue = pending && reminder.fireAt <= now;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, !pending && styles.cardDone, pressed && styles.cardPressed]}
      onPress={() => onEdit(reminder)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {reminder.title}
        </Text>
        <View style={[styles.badge, pending ? styles.badgePending : styles.badgeDone]}>
          <Text style={styles.badgeText}>
            {pending ? (overdue ? '待确认' : FORCE_LABEL[reminder.forceLevel] ?? '标准') : '已完成'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaTime}>{formatFireLabel(reminder.fireAt, now)}</Text>
        {pending ? (
          <Text style={[styles.metaCountdown, overdue && styles.metaOverdue]}>
            {overdue ? '已到点' : formatCountdown(reminder.fireAt, now)}
          </Text>
        ) : null}
      </View>

      {reminder.note ? (
        <Text style={styles.note} numberOfLines={2}>
          {reminder.note}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {pending ? (
          <Pressable
            style={styles.actionPrimary}
            onPress={(event) => {
              event.stopPropagation();
              onAck(reminder);
            }}
          >
            <Text style={styles.actionPrimaryText}>已确认</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.actionGhost}
          onPress={(event) => {
            event.stopPropagation();
            onDelete(reminder);
          }}
        >
          <Text style={styles.actionGhostText}>删除</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Section({ label, tone, children }: { label: string; tone?: 'danger'; children: React.ReactNode }) {
  return (
    <View>
      <Text style={[styles.sectionLabel, tone === 'danger' && styles.sectionDanger]}>{label}</Text>
      {children}
    </View>
  );
}

export default function ListScreen({
  groups,
  alarmKitAvailable,
  syncEnabled,
  now,
  onNew,
  onAck,
  onEdit,
  onDelete,
  onOpenSettings,
}: Props) {
  const total = groups.overdue.length + groups.today.length + groups.later.length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>强提醒</Text>
          <Text style={styles.subtitle}>
            {total > 0
              ? `${total} 条待触发${groups.overdue.length > 0 ? ` · ${groups.overdue.length} 条待确认` : ''}`
              : '还没有待触发的提醒'}
          </Text>
        </View>
        <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={12}>
          <Text style={styles.settingsIcon}>⚙︎</Text>
        </Pressable>
      </View>

      {!alarmKitAvailable ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            未开启闹钟权限：到点只能发通知，静音/勿扰下可能不响。
          </Text>
        </View>
      ) : null}

      {!syncEnabled ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>云端升级未开启，微信兜底不会生效。</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {total === 0 && groups.finished.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>⏰</Text>
            <Text style={styles.emptyTitle}>设一个不会错过的日期</Text>
            <Text style={styles.emptyText}>
              报名截止、还房租、签证到期——到点它会响，没确认就升级到微信。
            </Text>
          </View>
        ) : null}

        {groups.overdue.length > 0 ? (
          <Section label="待确认" tone="danger">
            {groups.overdue.map((item) => (
              <ReminderCard
                key={item.id}
                reminder={item}
                now={now}
                onAck={onAck}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Section>
        ) : null}

        {groups.today.length > 0 ? (
          <Section label="今天">
            {groups.today.map((item) => (
              <ReminderCard
                key={item.id}
                reminder={item}
                now={now}
                onAck={onAck}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Section>
        ) : null}

        {groups.later.length > 0 ? (
          <Section label="以后">
            {groups.later.map((item) => (
              <ReminderCard
                key={item.id}
                reminder={item}
                now={now}
                onAck={onAck}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Section>
        ) : null}

        {groups.finished.length > 0 ? (
          <Section label="历史">
            {groups.finished.map((item) => (
              <ReminderCard
                key={item.id}
                reminder={item}
                now={now}
                onAck={onAck}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Section>
        ) : null}
      </ScrollView>

      <Pressable style={styles.fab} onPress={onNew}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsIcon: { color: colors.textDim, fontSize: 20 },
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  bannerWarn: { borderColor: '#3a2f1a' },
  bannerText: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionDanger: { color: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardPressed: { backgroundColor: colors.cardPressed },
  cardDone: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgePending: { backgroundColor: '#1e2b3f' },
  badgeDone: { backgroundColor: '#1d2530' },
  badgeText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  metaTime: { color: colors.textDim, fontSize: 13 },
  metaCountdown: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  metaOverdue: { color: colors.danger },
  note: { color: colors.textFaint, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionPrimary: {
    backgroundColor: '#1c3355',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  actionPrimaryText: { color: '#9dc0ff', fontSize: 13, fontWeight: '600' },
  actionGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  actionGhostText: { color: colors.textFaint, fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '300' },
});
