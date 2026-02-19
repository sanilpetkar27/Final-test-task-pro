import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { lumina, radii, spacing, typography } from '../../theme';

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
};

const variantStyle = (variant: BadgeVariant): ViewStyle => {
  switch (variant) {
    case 'success':
      return { backgroundColor: lumina.dot.done };
    case 'warning':
      return { backgroundColor: lumina.dot.pending };
    case 'danger':
      return { backgroundColor: lumina.dot.overdue };
    case 'info':
      return { backgroundColor: lumina.dot.progress };
    case 'neutral':
    default:
      return { backgroundColor: lumina.bg.surface };
  }
};

export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  return (
    <View style={[styles.root, variantStyle(variant), style]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  text: {
    color: lumina.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
  },
});

