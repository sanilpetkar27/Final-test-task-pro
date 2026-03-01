import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppCard, AppScreen, Badge } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, radii, spacing, typography } from '../../../theme';
import { BellIcon } from '../../notifications/components/BellIcon';
import { ApprovalsView, useApprovals } from '../hooks/useApprovals';
import type { ApprovalItem } from '../repository/approvalsRepository';

const statusToBadgeVariant = (status: ApprovalItem['status']): 'warning' | 'info' | 'success' | 'danger' => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'NEEDS_REVIEW') return 'info';
  return 'warning';
};

const formatAmount = (amount: number): string => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `INR ${amount || 0}`;
  }
};

export function ApprovalsListScreen() {
  const profile = useAuthStore((state) => state.profile);
  const navigation = useNavigation<any>();
  const [activeView, setActiveView] = useState<ApprovalsView>('my_requests');
  const {
    data: approvals = [],
    isLoading,
    isFetching,
    refetch,
    error,
  } = useApprovals(profile?.id, activeView);

  const headerSubtitle = useMemo(
    () =>
      activeView === 'my_requests'
        ? 'Track requests you created.'
        : 'Approvals waiting for your decision.',
    [activeView]
  );

  if (!profile) {
    return (
      <AppScreen>
        <AppCard>
          <Text style={styles.title}>Session not ready.</Text>
          <Text style={styles.subtitle}>Please sign in again.</Text>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Approvals</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>
        <AppButton
          label="Approval +"
          onPress={() => navigation.navigate('CreateApproval')}
          variant="primary"
          style={styles.headerApprovalButton}
        />
      </View>

      <View style={styles.switcher}>
        <Pressable
          onPress={() => setActiveView('my_requests')}
          style={({ pressed }) => [
            styles.switchOption,
            activeView === 'my_requests' && styles.switchOptionActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.switchLabel, activeView === 'my_requests' && styles.switchLabelActive]}>
            My Requests
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveView('needs_my_approval')}
          style={({ pressed }) => [
            styles.switchOption,
            activeView === 'needs_my_approval' && styles.switchOptionActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.switchLabel,
              activeView === 'needs_my_approval' && styles.switchLabelActive,
            ]}
          >
            Needs My Approval
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : error ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load approvals</Text>
          <Text style={styles.subtitle}>{String((error as Error)?.message || 'Unknown error')}</Text>
        </AppCard>
      ) : approvals.length === 0 ? (
        <AppCard>
          <Text style={styles.emptyTitle}>No approvals in this view</Text>
          <Text style={styles.subtitle}>
            {activeView === 'my_requests'
              ? 'Create a request to see it here.'
              : 'You have no pending approvals.'}
          </Text>
        </AppCard>
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={() => void refetch()}
              tintColor={lumina.action.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('ApprovalDetails', { approvalId: item.id })}>
              {({ pressed }) => (
                <AppCard style={[styles.approvalCard, pressed && styles.pressed]}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title || 'Untitled request'}
                    </Text>
                    <Badge label={item.status} variant={statusToBadgeVariant(item.status)} />
                  </View>
                  <Text style={styles.cardAmount}>{formatAmount(item.amount)}</Text>
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description || 'No description'}
                  </Text>
                </AppCard>
              )}
            </Pressable>
          )}
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
  headerApprovalButton: {
    minWidth: 100,
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: lumina.bg.surface,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    borderRadius: radii.lg,
    padding: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  switchOption: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchOptionActive: {
    backgroundColor: lumina.action.primary,
  },
  switchLabel: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  switchLabelActive: {
    color: lumina.text.inverse,
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
  emptyTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.xs,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  approvalCard: {
    gap: spacing.xs,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  cardAmount: {
    color: lumina.action.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  cardDescription: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  pressed: {
    opacity: 0.88,
  },
});
