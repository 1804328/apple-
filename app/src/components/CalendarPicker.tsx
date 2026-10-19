import { Solar } from 'lunar-javascript';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  /** 每个日期下面显示农历（选生日时很有用） */
  showLunar?: boolean;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** 农历副标题：初一显示月份，其它显示日 */
function lunarSubLabel(date: Date): string {
  try {
    // 公历 → 农历
    const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
    if (lunar.getDay() === 1) return `${lunar.getMonthInChinese()}月`;
    return lunar.getDayInChinese();
  } catch {
    return '';
  }
}

export default function CalendarPicker({ value, onChange, showLunar = false }: Props) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(value));
  const today = useMemo(() => new Date(), []);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const offset = first.getDay();
    const total = daysInMonth(cursor);
    const list: (Date | null)[] = [];

    for (let i = 0; i < offset; i += 1) list.push(null);
    for (let day = 1; day <= total; day += 1) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (list.length < 42) list.push(null);
    return list;
  }, [cursor]);

  function shiftMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setCursor(startOfMonth(today))}>
          <Text style={styles.title}>
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </Text>
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(1)} hitSlop={8}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) {
            return <View key={`empty-${index}`} style={styles.cell} />;
          }
          const selected = sameDay(date, value);
          const isToday = sameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              style={[styles.cell, selected && styles.cellSelected, !selected && isToday && styles.cellToday]}
              onPress={() => onChange(date)}
            >
              <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{date.getDate()}</Text>
              {showLunar ? (
                <Text style={[styles.lunarText, selected && styles.lunarTextSelected]} numberOfLines={1}>
                  {lunarSubLabel(date)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  navText: { color: colors.text, fontSize: 22, lineHeight: 24 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', color: colors.textFaint, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: colors.accent },
  cellToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { color: colors.text, fontSize: 15 },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  lunarText: { color: colors.textFaint, fontSize: 9, marginTop: 1 },
  lunarTextSelected: { color: 'rgba(255,255,255,0.85)' },
});
