import { Solar } from 'lunar-javascript';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  /** 每个日期下面显示农历（选生日时很有用） */
  showLunar?: boolean;
}

/** 国内习惯：周一为一周起点（和系统日历一致） */
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1} 月`);

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

/** 周一为起点时的前置空格数 */
function leadingBlanks(first: Date): number {
  return (first.getDay() + 6) % 7;
}

function lunarSubLabel(date: Date): string {
  try {
    const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
    if (lunar.getDay() === 1) return `${lunar.getMonthInChinese()}月`;
    return lunar.getDayInChinese();
  } catch {
    return '';
  }
}

/**
 * 仿系统日历的日期选择：
 *  - 左右滑动切换月份（松手即翻页）
 *  - 点标题弹出「年 / 月」快速跳转，不用一月一月翻
 *  - 周一为每周起点
 */
export default function CalendarPicker({ value, onChange, showLunar = false }: Props) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(value));
  const [jumpOpen, setJumpOpen] = useState(false);
  const today = useMemo(() => new Date(), []);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const blanks = leadingBlanks(first);
    const total = daysInMonth(cursor);
    const list: (Date | null)[] = [];

    for (let i = 0; i < blanks; i += 1) list.push(null);
    for (let day = 1; day <= total; day += 1) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (list.length < 42) list.push(null);
    return list;
  }, [cursor]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > 45) {
          setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
        } else if (gesture.dx < -45) {
          setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
        }
      },
    }),
  ).current;

  function shiftMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function shiftYear(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear() + delta, prev.getMonth(), 1));
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>

        <Pressable style={styles.titleButton} onPress={() => setJumpOpen((prev) => !prev)}>
          <Text style={styles.title}>
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </Text>
          <Text style={styles.titleCaret}>{jumpOpen ? '▲' : '▼'}</Text>
        </Pressable>

        <Pressable style={styles.navButton} onPress={() => shiftMonth(1)} hitSlop={8}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      {jumpOpen ? (
        <View style={styles.jump}>
          <View style={styles.yearRow}>
            <Pressable style={styles.yearNav} onPress={() => shiftYear(-1)} hitSlop={8}>
              <Text style={styles.yearNavText}>−</Text>
            </Pressable>
            <Text style={styles.yearText}>{cursor.getFullYear()} 年</Text>
            <Pressable style={styles.yearNav} onPress={() => shiftYear(1)} hitSlop={8}>
              <Text style={styles.yearNavText}>＋</Text>
            </Pressable>
          </View>

          <View style={styles.monthGrid}>
            {MONTH_LABELS.map((label, index) => {
              const active = cursor.getMonth() === index;
              return (
                <Pressable
                  key={label}
                  style={[styles.monthCell, active && styles.monthCellActive]}
                  onPress={() => {
                    setCursor(new Date(cursor.getFullYear(), index, 1));
                    setJumpOpen(false);
                  }}
                >
                  <Text style={[styles.monthText, active && styles.monthTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.todayButton}
            onPress={() => {
              setCursor(startOfMonth(today));
              setJumpOpen(false);
            }}
          >
            <Text style={styles.todayText}>回到今天</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((name) => (
              <Text key={name} style={styles.weekday}>
                {name}
              </Text>
            ))}
          </View>

          <View style={styles.grid} {...panResponder.panHandlers}>
            {cells.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.cell} />;

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
                    <Text
                      style={[styles.lunarText, selected && styles.lunarTextSelected]}
                      numberOfLines={1}
                    >
                      {lunarSubLabel(date)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.swipeHint}>左右滑动切换月份 · 点标题快速跳转</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  navButton: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  navText: { color: colors.accentText, fontSize: 22, lineHeight: 24 },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  titleCaret: { color: colors.textFaint, fontSize: 9 },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
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
  swipeHint: {
    color: colors.textFaint,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  jump: { paddingVertical: spacing.xs },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingBottom: spacing.sm,
  },
  yearNav: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  yearNavText: { color: colors.accentText, fontSize: 18, lineHeight: 20 },
  yearText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: '25%',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  monthCellActive: { backgroundColor: colors.accentSoft },
  monthText: { color: colors.textDim, fontSize: 14 },
  monthTextActive: { color: colors.accentText, fontWeight: '700' },
  todayButton: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  todayText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
