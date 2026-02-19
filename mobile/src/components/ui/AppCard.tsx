import React, { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { lumina, radii, spacing } from '../../theme';

type AppCardProps = PropsWithChildren<{
  style?: ViewStyle;
}>;

export function AppCard({ children, style }: AppCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lumina.bg.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    padding: spacing.md,
    shadowColor: lumina.shadow.card,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 3,
  },
});

