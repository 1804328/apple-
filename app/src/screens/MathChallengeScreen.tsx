import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { Reminder } from '../types';

interface Props {
  reminder: Reminder;
  onSolved: (reminder: Reminder) => void;
  onEscape: () => void;
}

interface Problem {
  text: string;
  answer: number;
}

/** 两位数加减 / 一位数乘法，清醒状态下 2 秒内能算出来 */
function makeProblem(): Problem {
  const kind = Math.floor(Math.random() * 3);

  if (kind === 0) {
    const a = 20 + Math.floor(Math.random() * 70);
    const b = 10 + Math.floor(Math.random() * 80);
    return { text: `${a} + ${b}`, answer: a + b };
  }

  if (kind === 1) {
    let a = 20 + Math.floor(Math.random() * 70);
    let b = 10 + Math.floor(Math.random() * 70);
    if (b > a) [a, b] = [b, a];
    return { text: `${a} - ${b}`, answer: a - b };
  }

  const a = 3 + Math.floor(Math.random() * 8);
  const b = 3 + Math.floor(Math.random() * 8);
  return { text: `${a} × ${b}`, answer: a * b };
}

/**
 * 强制解锁：连续做对 3 道题才允许确认。
 * 算错会把 3 道题全部换掉重来，避免"猜"过去。
 */
export default function MathChallengeScreen({ reminder, onSolved, onEscape }: Props) {
  const [problems, setProblems] = useState<Problem[]>(() => Array.from({ length: 3 }, makeProblem));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const current = problems[index];

  function submit() {
    const value = Number(input.trim());
    if (!Number.isFinite(value) || input.trim() === '') {
      setError('输入一个数字');
      return;
    }

    if (value !== current.answer) {
      setError('算错了，题目已重置，重新来');
      setProblems(Array.from({ length: 3 }, makeProblem));
      setIndex(0);
      setInput('');
      return;
    }

    setError(null);
    setInput('');

    if (index + 1 >= problems.length) {
      onSolved(reminder);
      return;
    }
    setIndex(index + 1);
  }

  function longPressEscape() {
    Alert.alert('跳过验证', '这次提醒不会被标记为完成，云端会继续催。确定跳过？', [
      { text: '取消', style: 'cancel' },
      { text: '跳过', style: 'destructive', onPress: onEscape },
    ]);
  }

  return (
    <View style={styles.root}>
      <Pressable onLongPress={longPressEscape} delayLongPress={1500}>
        <Text style={styles.badge}>强制模式 · 做对才能确认</Text>
      </Pressable>

      <Text style={styles.title}>{reminder.title}</Text>

      <Text style={styles.progress}>
        第 {index + 1} / {problems.length} 题
      </Text>
      <Text style={styles.question}>{current.text} = ?</Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        keyboardType="number-pad"
        placeholder="输入答案"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={submit}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.submit} onPress={submit}>
        <Text style={styles.submitText}>提交</Text>
      </Pressable>

      <Text style={styles.hint}>
        算错会把 3 道题全部换掉重来。长按上方标签可跳过（不推荐）。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: '#3a1d1d',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.xl,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  progress: { color: colors.textFaint, fontSize: 13, marginTop: spacing.xl },
  question: {
    color: colors.text,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    width: '80%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 28,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  error: { color: colors.danger, fontSize: 14, marginTop: spacing.md },
  submit: {
    marginTop: spacing.xl,
    width: '80%',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
