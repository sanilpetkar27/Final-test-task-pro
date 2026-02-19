import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppCard, AppScreen, Avatar, Badge } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, spacing, typography } from '../../../theme';
import { canManageTeam } from '../../../utils/roleGuards';
import { useTeam } from '../hooks/useTeam';

export function TeamScreen() {
  const profile = useAuthStore((state) => state.profile);
  const companyId = profile?.companyId;
  const canManage = profile ? canManageTeam(profile.role) : false;
  const { data: members = [], isLoading, error, refetch, isFetching } = useTeam(companyId);

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Team</Text>
          <Text style={styles.body}>Members from your company workspace.</Text>
        </View>
        <AppButton
          label="Add Member"
          onPress={() => {}}
          disabled={!canManage}
          variant={canManage ? 'primary' : 'secondary'}
          style={styles.addButton}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : error ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load team members</Text>
          <Text style={styles.body}>{String((error as Error)?.message || 'Unknown error')}</Text>
          <AppButton label="Retry" onPress={() => void refetch()} variant="secondary" />
        </AppCard>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          onRefresh={() => void refetch()}
          refreshing={isFetching}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <AppCard style={styles.memberCard}>
              <View style={styles.memberHeader}>
                <Avatar name={item.name} />
                <View style={styles.memberTextWrap}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberMeta}>{item.email || item.mobile || 'No contact'}</Text>
                </View>
                <Badge label={item.role} variant="info" />
              </View>
            </AppCard>
          )}
          ListEmptyComponent={
            <AppCard>
              <Text style={styles.title}>No team members found</Text>
              <Text style={styles.body}>Ensure your account has at least one employee row.</Text>
            </AppCard>
          }
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  headerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  body: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  addButton: {
    minWidth: 112,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: lumina.status.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  list: {
    flex: 1,
  },
  memberCard: {
    paddingVertical: spacing.sm,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  memberName: {
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  memberMeta: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});
