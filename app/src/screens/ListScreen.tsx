import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, levelColors, radius, spacing } from '../theme';
import { formatCountdown, formatFireLabel } from '../lib/time';
import type { Reminder } from '../types';
import type { ReminderGroups } from '../store/reminders';

interface Props {
  nearGroups: ReminderGroups;
  longList: Reminder[];
  alarmKitAvailable: boolean;
  syncEnabled: boolean;
  signDaysLeft: number;
  now: number;
  onNew: () => void;
  onAck: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onOpenSettings: () => void;
  onOpenAnniversary: () => void;
}

type Tab = 'near' | 'long';

const REPEAT_LABEL: Record<string, string> = {
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const FORCE_LABEL: Record<number, string> = {
  1: '轻提醒',
  2: '单次',
  3: '标准',
  4: '强力',
  5: '硬核',
  6: '硬核+',
};

function repeatLabel(reminder: Reminder): string {
  if (reminder.repeat === 'yearly') return '每年';
  if (reminder.repeat === 'monthly') return '每月';
  if (reminder.repeat === 'weekly') return '每周';
  return '';
}

/** 长期列表用紧凑行：图标 + 标题 + 日期，点开编辑 */
function iconFor(reminder: Reminder): string {
  if (reminder.id === 'resign-weekly') return '🔧';
  if (reminder.id.startsWith('lunar-') || reminder.note.includes('农历')) return '🌙';
  if (reminder.id.startsWith('anniv-')) return '⏳';
  if (reminder.id.startsWith('yearly-')) return '🎂';
  if (reminder.repeat === 'weekly') return '🗓️';
  if (reminder.repeat === 'monthly') return '📅';
  if (reminder.repeat === 'yearly') return '🎂';
  return '📌';
}

function LongRow({
  reminder,
  now,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  now: number;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const repeat = repeatLabel(reminder);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onEdit(reminder)}
    >
      <View style={styles.rowIconWrap}>
        <Text style={styles.rowIcon}>{iconFor(reminder)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {reminder.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatFireLabel(reminder.fireAt, now)}
          {repeat ? ` · ${repeat}` : ''}
          {pendingCountdown(reminder, now)}
        </Text>
      </View>
      <Pressable
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onDelete(reminder);
        }}
      >
        <Text style={styles.rowDelete}>删除</Text>
      </Pressable>
    </Pressable>
  );
}

function pendingCountdown(reminder: Reminder, now: number): string {
  if (reminder.status !== 'pending' || reminder.fireAt <= now) return '';
  return ` · 还有 ${formatCountdown(reminder.fireAt, now)}`;
}

function ReminderCard({
  reminder,
  now,
  syncEnabled,
  onAck,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  now: number;
  syncEnabled: boolean;
  onAck: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const pending = reminder.status === 'pending';
  const overdue = pending && reminder.fireAt <= now;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        !pending && styles.cardDone,
        pressed && styles.cardPressed,
        {
          borderLeftWidth: 3,
          borderLeftColor: overdue
            ? colors.danger
            : pending
              ? levelColors[reminder.forceLevel] ?? colors.accent
              : colors.border,
        },
      ]}
      onPress={() => onEdit(reminder)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {reminder.title}
        </Text>
        <View style={styles.badgeRow}>
          {reminder.unlock === 'math' ? (
            <View style={styles.hardcoreChip}>
              <Text style={styles.hardcoreText}>强制</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.badge,
              { backgroundColor: overdue ? colors.dangerSoft : colors.accentSoft },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color: overdue
                    ? colors.danger
                    : levelColors[reminder.forceLevel] ?? colors.accentText,
                },
              ]}
            >
              {pending ? (overdue ? '待确认' : FORCE_LABEL[reminder.forceLevel] ?? '标准') : '已完成'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaTime}>{formatFireLabel(reminder.fireAt, now)}</Text>
        {pending ? (
          <Text style={[styles.metaCountdown, overdue && styles.metaOverdue]}>
            {overdue ? '已到点' : formatCountdown(reminder.fireAt, now)}
          </Text>
        ) : null}
        {reminder.repeat && reminder.repeat !== 'none' ? (
          <Text style={styles.metaRepeat}>{REPEAT_LABEL[reminder.repeat] ?? ''}</Text>
        ) : null}
        {reminder.pushCount ? <Text style={styles.metaPush}>已推送 {reminder.pushCount} 次</Text> : null}
        {syncEnabled && reminder.syncedAt ? <Text style={styles.metaSynced}>云端已登记</Text> : null}
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
  nearGroups,
  longList,
  alarmKitAvailable,
  syncEnabled,
  signDaysLeft,
  now,
  onNew,
  onAck,
  onEdit,
  onDelete,
  onOpenSettings,
  onOpenAnniversary,
}: Props) {
  const [tab, setTab] = React.useState<Tab>('near');

  const nearPending =
    nearGroups.overdue.length + nearGroups.today.length + nearGroups.later.length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>强提醒</Text>
          <Text style={styles.subtitle}>
            {nearPending > 0
              ? `近期 ${nearPending} 条${nearGroups.overdue.length ? ` · ${nearGroups.overdue.length} 条待确认` : ''}`
              : '近期没有待触发的提醒'}
            {longList.length > 0 ? ` · 长期 ${longList.length} 条` : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.settingsButton} onPress={onOpenAnniversary} hitSlop={12}>
            <Text style={styles.settingsIcon}>🎂</Text>
          </Pressable>
          <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={12}>
            <Text style={styles.settingsIcon}>⚙︎</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentItem, tab === 'near' && styles.segmentActive]}
          onPress={() => setTab('near')}
        >
          <Text style={[styles.segmentText, tab === 'near' && styles.segmentTextActive]}>
            近期{ nearPending > 0 ? ` ${nearPending}` : '' }
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentItem, tab === 'long' && styles.segmentActive]}
          onPress={() => setTab('long')}
        >
          <Text style={[styles.segmentText, tab === 'long' && styles.segmentTextActive]}>
            长期{ longList.length > 0 ? ` ${longList.length}` : '' }
          </Text>
        </Pressable>
      </View>

      {!alarmKitAvailable ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            未开启闹钟权限：到点只能发通知，静音/勿扰下可能不响。
          </Text>
        </View>
      ) : null}

      {signDaysLeft <= 2 ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            免费签名还剩 {signDaysLeft} 天，到期 App 会打不开。记得连电脑用 Sideloadly 重签。
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {tab === 'near' ? (
          <>
            {nearPending === 0 && nearGroups.finished.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>⏰</Text>
                <Text style={styles.emptyTitle}>近期没有要处理的事</Text>
                <Text style={styles.emptyText}>
                  点右下角「＋」建一条；生日、纪念日这类长期提醒在「长期」里。
                </Text>
              </View>
            ) : null}

            {nearGroups.overdue.length > 0 ? (
              <Section label="待确认" tone="danger">
                {nearGroups.overdue.map((item) => (
                  <ReminderCard
                    key={item.id}
                    reminder={item}
                    now={now}
                    syncEnabled={syncEnabled}
                    onAck={onAck}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            ) : null}

            {nearGroups.today.length > 0 ? (
              <Section label="今天">
                {nearGroups.today.map((item) => (
                  <ReminderCard
                    key={item.id}
                    reminder={item}
                    now={now}
                    syncEnabled={syncEnabled}
                    onAck={onAck}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            ) : null}

            {nearGroups.later.length > 0 ? (
              <Section label="往后 30 天">
                {nearGroups.later.map((item) => (
                  <ReminderCard
                    key={item.id}
                    reminder={item}
                    now={now}
                    syncEnabled={syncEnabled}
                    onAck={onAck}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            ) : null}

            {nearGroups.finished.length > 0 ? (
              <Section label="历史">
                {nearGroups.finished.map((item) => (
                  <ReminderCard
                    key={item.id}
                    reminder={item}
                    now={now}
                    syncEnabled={syncEnabled}
                    onAck={onAck}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            ) : null}
          </>
        ) : (
          <>
            {longList.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🎂</Text>
                <Text style={styles.emptyTitle}>还没有长期提醒</Text>
                <Text style={styles.emptyText}>
                  生日、结婚纪念日、100 天这类，点右上角 🎂 一次生成。
                </Text>
              </View>
            ) : (
              <Section label="30 天以后 / 重复提醒">
                {longList.map((item) => (
                  <LongRow
                    key={item.id}
                    reminder={item}
                    now={now}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            )}
          </>
        )}
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
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
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
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.accentSoft },
  segmentText: { color: colors.textFaint, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: colors.accentText },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.cardPressed },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: { fontSize: 19 },
  rowBody: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  rowDelete: { color: colors.textFaint, fontSize: 12, paddingLeft: spacing.md },
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
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  hardcoreChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.dangerSoft,
  },
  hardcoreText: { color: colors.danger, fontSize: 10, fontWeight: '700' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  badgePending: { backgroundColor: '#1e2b3f' },
  badgeDone: { backgroundColor: '#1d2530' },
  badgeText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md, flexWrap: 'wrap' },
  metaTime: { color: colors.textDim, fontSize: 13 },
  metaCountdown: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  metaOverdue: { color: colors.danger },
  metaRepeat: { color: '#9dc0ff', fontSize: 11 },
  metaPush: { color: colors.warn, fontSize: 11 },
  metaSynced: { color: colors.ok, fontSize: 11 },
  note: { color: colors.textFaint, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionPrimary: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  actionPrimaryText: { color: colors.accentText, fontSize: 13, fontWeight: '600' },
  actionGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  actionGhostText: { color: colors.textFaint, fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 56, marginBottom: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: 36,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
});
