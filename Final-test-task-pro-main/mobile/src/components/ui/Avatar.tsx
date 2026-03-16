import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lumina, radii, spacing, typography } from '../../theme';

type AvatarProps = {
  name: string;
  size?: number;
};

const initialsFromName = (name: string): string => {
  const chunks = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return 'U';
  return chunks
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

export function Avatar({ name, size = 36 }: AvatarProps) {
  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: radii.pill }]}>
      <Text style={styles.text}>{initialsFromName(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lumina.dot.progress,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    paddingHorizontal: spacing.xs,
  },
  text: {
    color: lumina.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
});

