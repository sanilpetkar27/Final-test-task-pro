import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { lumina, radii, spacing, typography } from '../../theme';

type AppTextInputProps = TextInputProps & {
  label: string;
  error?: string | null;
};

export function AppTextInput({ label, error, style, ...props }: AppTextInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={lumina.text.secondary}
        style={[styles.input, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    color: lumina.text.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    backgroundColor: lumina.bg.surface,
    paddingHorizontal: spacing.md,
    color: lumina.text.primary,
    fontSize: typography.size.md,
  },
  error: {
    color: lumina.status.danger,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});

