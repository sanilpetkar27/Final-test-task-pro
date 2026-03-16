import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { lumina, radii, spacing, typography } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const variantStyle = (variant: ButtonVariant): ViewStyle => {
  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: lumina.bg.surface,
        borderColor: lumina.border.subtle,
        borderWidth: 1,
      };
    case 'danger':
      return {
        backgroundColor: lumina.action.danger,
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
      };
    case 'primary':
    default:
      return {
        backgroundColor: lumina.action.primary,
      };
  }
};

const labelColor = (variant: ButtonVariant): string =>
  variant === 'secondary' || variant === 'ghost' ? lumina.text.primary : lumina.text.inverse;

export function AppButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  fullWidth = false,
  style,
}: AppButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyle(variant),
        fullWidth && styles.fullWidth,
        pressed && !isDisabled ? styles.pressed : undefined,
        isDisabled ? styles.disabled : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor(variant)} />
      ) : (
        <Text style={[styles.label, { color: labelColor(variant) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.55,
  },
});

