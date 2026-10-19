import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 兜底错误边界：JS 渲染出错时不再直接闪退，而是把错误显示出来，方便在真机上定位。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[app] render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>App 出错了</Text>
          <Text style={styles.hint}>把下面这段内容发给开发者：</Text>
          <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
            <Text style={styles.mono}>{String(this.state.error.message || this.state.error)}</Text>
            <Text style={styles.mono}>{this.state.error.stack ?? ''}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: 80 },
  title: { color: colors.danger, fontSize: 22, fontWeight: '800', marginBottom: spacing.sm },
  hint: { color: colors.textDim, fontSize: 13, marginBottom: spacing.md },
  box: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  boxContent: { padding: spacing.md },
  mono: { color: colors.textFaint, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
});
