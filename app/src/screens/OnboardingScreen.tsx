import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { requestPermissions } from '../services/alarms';

interface Props {
  onDone: () => void;
}

const STEPS = [
  {
    emoji: '⏰',
    title: '强提醒',
    body: '设定一个日期和强制度，到点会像系统闹钟一样响。\n没确认就一直升级：本地闹钟 → 微信推送 → 点链接才算完成。',
  },
  {
    emoji: '🔔',
    title: '需要两个权限',
    body: '通知：到点响铃和推送确认。\n闹钟级（iOS 26+）：静音、勿扰、锁屏下也会响。',
  },
  {
    emoji: '✅',
    title: '可以开始了',
    body: '点右上角 ＋ 建第一条提醒；生日、纪念日点 🎂 一次生成。\n设置页能看权限状态、已排闹钟和最近同步时间。',
  },
];

export default function OnboardingScreen({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  async function next() {
    if (step === 1) {
      setRequesting(true);
      await requestPermissions().catch(() => undefined);
      setRequesting(false);
    }
    if (last) {
      onDone();
      return;
    }
    setStep(step + 1);
  }

  return (
    <View style={styles.root}>
      <Text style={styles.emoji}>{current.emoji}</Text>
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.body}>{current.body}</Text>

      <View style={styles.dots}>
        {STEPS.map((_, index) => (
          <View key={index} style={[styles.dot, index === step && styles.dotActive]} />
        ))}
      </View>

      <Pressable style={styles.primary} onPress={next} disabled={requesting}>
        <Text style={styles.primaryText}>
          {step === 1 ? (requesting ? '请求中…' : '允许权限') : last ? '开始使用' : '下一步'}
        </Text>
      </Pressable>

      {!last ? (
        <Pressable style={styles.skip} onPress={onDone}>
          <Text style={styles.skipText}>跳过</Text>
        </Pressable>
      ) : null}
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
  emoji: { fontSize: 64, marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  body: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.accent, width: 20 },
  primary: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { marginTop: spacing.md, padding: spacing.sm },
  skipText: { color: colors.textFaint, fontSize: 13 },
});
