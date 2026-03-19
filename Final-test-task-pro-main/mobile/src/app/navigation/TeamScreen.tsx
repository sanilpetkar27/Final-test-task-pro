import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppScreen } from '../../../components/ui';
import { lumina, typography } from '../../../theme';

export function TeamScreen() {
  return (
    <AppScreen>
      <View style={styles.container}>
        <Text style={styles.title}>Team</Text>
        <Text style={styles.subtitle}>Team management features will be here.</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: lumina.text.secondary,
    fontSize: typography.size.md,
    marginTop: 8,
  },
});