import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, levelColors, radius, spacing } from '../theme';
import { formatCountdown, formatFireLabel } from '../lib/time';
import type { Reminder } from '../types';
import type { ReminderGroups } from '../store/reminders';

interface Props {
  nearGroups: ReminderGroups;
  longList: Reminder[];
  alarmKitAvailable: boolean;
  /** 通知权限是否开启；关闭时首页直接提示，避免"默默不响" */
  notificationsAllowed: boolean;
  syncEnabled: boolean;
  signDaysLeft: number;
  now: number;
  onNew: () => void;
  onAck: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onOpenSettings: () => void;
  onOpenAnniversary: () => void;
  onRefresh: () => Promise<void>;
  onClearHistory: () => void;
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

interface LongGroup {
  key: string;
  title: string;
  icon: string;
  items: Reminder[];
}

/** 同系列折叠：农历生日的 5 年、纪念日的多个里程碑，归成一行 */
function groupKeyOf(item: Reminder): string {
  if (item.id.startsWith('lunar-')) return item.id.replace(/-\d+$/, '');
  if (item.id.startsWith('anniv-')) return item.id.replace(/-\d+$/, '');
  return `one:${item.id}`;
}

function buildLongGroups(list: Reminder[]): LongGroup[] {
  const map = new Map<string, LongGroup>();

  for (const item of list) {
    const key = groupKeyOf(item);
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        title: item.title.replace(/\s*·\s*[^·]+$/, ''),
        icon: iconFor(item),
        items: [item],
      });
    }
  }

  return [...map.values()]
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.fireAt - b.fireAt) }))
    .sort((a, b) => a.items[0].fireAt - b.items[0].fireAt);
}

function LongGroupRow({
  group,
  expanded,
  now,
  onToggle,
  onEdit,
  onDelete,
}: {
  group: LongGroup;
  expanded: boolean;
  now: number;
  onToggle: (key: string) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const first = group.items[0];
  const count = group.items.length;
  const repeat = repeatLabel(first);

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => (count > 1 ? onToggle(group.key) : onEdit(first))}
      >
        <View style={styles.rowIconWrap}>
          <Text style={styles.rowIcon}>{group.icon}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {group.title}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {formatFireLabel(first.fireAt, now)}
            {repeat ? ` · ${repeat}` : ''}
            {pendingCountdown(first, now)}
          </Text>
        </View>
        {count > 1 ? <Text style={styles.rowCount}>{count} 次</Text> : null}
        {count > 1 ? (
          <Text style={styles.rowCaret}>{expanded ? '▲' : '▼'}</Text>
        ) : (
          <Pressable
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onDelete(first);
            }}
          >
            <Text style={styles.rowDelete}>删除</Text>
          </Pressable>
        )}
      </Pressable>

      {expanded && count > 1
        ? group.items.map((item) => (
            <View key={item.id} style={styles.subRow}>
              <Text style={styles.subDate}>{formatFireLabel(item.fireAt, now)}</Text>
              <Text style={styles.subMeta}>还有 {formatCountdown(item.fireAt, now)}</Text>
              <Pressable hitSlop={8} onPress={() => onEdit(item)}>
                <Text style={styles.subAction}>编辑</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => onDelete(item)}>
                <Text style={styles.subDelete}>删除</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
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
        {reminder.needsSync ? <Text style={styles.metaUnsynced}>未同步</Text> : null}
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
  notificationsAllowed,
  syncEnabled,
  signDaysLeft,
  now,
  onNew,
  onAck,
  onEdit,
  onDelete,
  onOpenSettings,
  onOpenAnniversary,
  onRefresh,
  onClearHistory,
}: Props) {
  const [tab, setTab] = React.useState<Tab>('near');
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!q) return { near: nearGroups, long: longList };
    const match = (item: Reminder) => `${item.title} ${item.note}`.toLowerCase().includes(q);
    return {
      near: {
        overdue: nearGroups.overdue.filter(match),
        today: nearGroups.today.filter(match),
        later: nearGroups.later.filter(match),
        finished: nearGroups.finished.filter(match),
      },
      long: longList.filter(match),
    };
  }, [nearGroups, longList, q]);

  const near = filtered.near;
  const longGroups = React.useMemo(() => buildLongGroups(filtered.long), [filtered.long]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const nearPending = near.overdue.length + near.today.length + near.later.length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>强提醒</Text>
          <Text style={styles.subtitle}>
            {nearPending > 0
              ? `近期 ${nearPending} 条${near.overdue.length ? ` · ${near.overdue.length} 条待确认` : ''}`
              : '近期没有待触发的提醒'}
            {filtered.long.length > 0 ? ` · 长期 ${filtered.long.length} 条` : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.settingsButton}
            onPress={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setQuery('');
            }}
            hitSlop={12}
          >
            <Text style={styles.settingsIcon}>🔍</Text>
          </Pressable>
          <Pressable style={styles.settingsButton} onPress={onOpenAnniversary} hitSlop={12}>
            <Text style={styles.settingsIcon}>🎂</Text>
          </Pressable>
          <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={12}>
            <Text style={styles.settingsIcon}>⚙︎</Text>
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索提醒内容"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.searchClear}>清除</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
            长期{ filtered.long.length > 0 ? ` ${filtered.long.length}` : '' }
          </Text>
        </Pressable>
      </View>

      {!notificationsAllowed ? (
        <Pressable style={[styles.banner, styles.bannerDanger]} onPress={() => Linking.openSettings()}>
          <Text style={styles.bannerText}>
            通知权限被关闭：到点不会响。点这里去系统设置打开。
          </Text>
          <Text style={styles.bannerAction}>去设置 ›</Text>
        </Pressable>
      ) : null}

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

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        {tab === 'near' ? (
          <>
            {nearPending === 0 && near.finished.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>⏰</Text>
                <Text style={styles.emptyTitle}>
                  {q ? '没有匹配的提醒' : '近期没有要处理的事'}
                </Text>
                <Text style={styles.emptyText}>
                  {q
                    ? '换个关键词，或清空搜索框。'
                    : '点右下角「＋」建一条；生日、纪念日这类长期提醒在「长期」里。'}
                </Text>
              </View>
            ) : null}

            {near.overdue.length > 0 ? (
              <Section label="待确认" tone="danger">
                {near.overdue.map((item) => (
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

            {near.today.length > 0 ? (
              <Section label="今天">
                {near.today.map((item) => (
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

            {near.later.length > 0 ? (
              <Section label="往后 30 天">
                {near.later.map((item) => (
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

            {near.finished.length > 0 ? (
              <View>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>历史</Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert('清空历史', `删除 ${near.finished.length} 条已完成/错过的提醒？`, [
                        { text: '取消', style: 'cancel' },
                        { text: '清空', style: 'destructive', onPress: onClearHistory },
                      ])
                    }
                  >
                    <Text style={styles.sectionAction}>清空历史</Text>
                  </Pressable>
                </View>
                {near.finished.map((item) => (
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
              </View>
            ) : null}
          </>
        ) : (
          <>
            {longGroups.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🎂</Text>
                <Text style={styles.emptyTitle}>{q ? '没有匹配的长期提醒' : '还没有长期提醒'}</Text>
                <Text style={styles.emptyText}>
                  {q
                    ? '换个关键词，或清空搜索框。'
                    : '生日、结婚纪念日、100 天这类，点右上角 🎂 一次生成。'}
                </Text>
              </View>
            ) : (
              <Section label="30 天以后 / 重复提醒">
                {longGroups.map((group) => (
                  <LongGroupRow
                    key={group.key}
                    group={group}
                    expanded={expandedGroups.has(group.key)}
                    now={now}
                    onToggle={toggleGroup}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  searchClear: { color: colors.textDim, fontSize: 13 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionAction: { color: colors.textFaint, fontSize: 12 },
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
  bannerDanger: { borderColor: '#4a2222', backgroundColor: colors.dangerSoft },
  bannerAction: { color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 },
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
  rowCount: { color: colors.accentText, fontSize: 11, marginLeft: spacing.sm },
  rowCaret: { color: colors.textFaint, fontSize: 9, marginLeft: spacing.sm, width: 10, textAlign: 'right' },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 58,
    paddingRight: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  subDate: { color: colors.text, fontSize: 13, flex: 1 },
  subMeta: { color: colors.textDim, fontSize: 11, marginRight: spacing.sm },
  subAction: { color: colors.accentText, fontSize: 12, paddingHorizontal: spacing.sm },
  subDelete: { color: colors.textFaint, fontSize: 12, paddingLeft: spacing.sm },
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
  metaUnsynced: { color: colors.warn, fontSize: 11, fontWeight: '600' },
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
