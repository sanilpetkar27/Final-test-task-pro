import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { AppButton, AppCard, AppScreen } from '../../../components/ui';
import type { AppTabParamList } from '../../../app/navigation/AppTabs';
import { useAuthStore } from '../../../state/authStore';
import { lumina, spacing, typography } from '../../../theme';
import { BellIcon } from '../../notifications/components/BellIcon';

export function SettingsScreen() {
  const profile = useAuthStore((state) => state.profile);
  const signOut = useAuthStore((state) => state.signOut);
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();

  const details = useMemo(
    () => [
      { label: 'Name', value: profile?.name || '-' },
      { label: 'Email', value: profile?.email || '-' },
      { label: 'Role', value: profile?.role || '-' },
      { label: 'Company ID', value: profile?.companyId || '-' },
    ],
    [profile]
  );

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <BellIcon
          userId={profile?.id}
          onPress={() => navigation.navigate('Notifications')}
        />
      </View>

      <AppCard>
        <Text style={styles.body}>Account and workspace details from Supabase profile.</Text>
      </AppCard>

      <AppCard style={styles.detailsCard}>
        {details.map((detail) => (
          <View key={detail.label} style={styles.row}>
            <Text style={styles.label}>{detail.label}</Text>
            <Text style={styles.value}>{detail.value}</Text>
          </View>
        ))}
      </AppCard>

      <AppButton label="Sign Out" variant="danger" onPress={() => void signOut()} fullWidth />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  body: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  detailsCard: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
  },
  label: {
    color: lumina.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
  },
  value: {
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
});
