import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { AppButton, AppCard, AppScreen } from '../../../components/ui';
import type { AppTabParamList } from '../../../app/navigation/AppTabs';
import { useAuthStore } from '../../../state/authStore';
import { lumina, spacing, typography } from '../../../theme';
import { canAssignTasks } from '../../../utils/roleGuards';
import { useTasks } from '../hooks/useTasks';
import { TaskTile } from '../components/TaskTile';
import { BellIcon } from '../../notifications/components/BellIcon';

export function TasksScreen() {
  const profile = useAuthStore((state) => state.profile);
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const companyId = profile?.companyId;
  const canCreate = profile ? canAssignTasks(profile.role) : false;

  const { data: tasks = [], isLoading, isFetching, refetch, error } = useTasks(companyId);

  if (!profile) {
    return (
      <AppScreen>
        <AppCard>
          <Text style={styles.title}>Session not ready.</Text>
          <Text style={styles.body}>Please sign in again.</Text>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.body}>Realtime task updates for your company workspace.</Text>
        </View>
        <View style={styles.headerActions}>
          <BellIcon
            userId={profile.id}
            onPress={() => navigation.navigate('Notifications')}
          />
          <AppButton
            label="Create"
            onPress={() => {}}
            disabled={!canCreate}
            variant={canCreate ? 'primary' : 'secondary'}
            style={styles.createButton}
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : error ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load tasks</Text>
          <Text style={styles.body}>{String((error as Error)?.message || 'Unknown error')}</Text>
          <AppButton label="Retry" onPress={() => void refetch()} variant="secondary" />
        </AppCard>
      ) : tasks.length === 0 ? (
        <AppCard>
          <Text style={styles.title}>No tasks yet</Text>
          <Text style={styles.body}>Your company has no tasks in the database.</Text>
        </AppCard>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TaskTile task={item} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={() => void refetch()}
              tintColor={lumina.action.primary}
            />
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
  createButton: {
    minWidth: 100,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
});
