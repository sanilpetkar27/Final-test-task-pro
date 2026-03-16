import React, { useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { AppButton, AppCard, AppScreen } from '../../../components/ui';
import type { TasksStackParamList } from '../navigation/TasksStack';
import type { AppTabParamList } from '../../../app/navigation/AppTabs';
import { useAuthStore } from '../../../state/authStore';
import { lumina, spacing, typography } from '../../../theme';
import { canAssignTasks } from '../../../utils/roleGuards';
import { useTasks } from '../hooks/useTasks';
import { TaskTile } from '../components/TaskTile';
import { BellIcon } from '../../notifications/components/BellIcon';
import { Ionicons } from '@expo/vector-icons';

export function TasksScreen() {
  const profile = useAuthStore((state) => state.profile);
  const stackNavigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const tabNavigation = useNavigation<any>(); // Composite navigation for tabs
  const companyId = profile?.companyId;
  const canCreate = profile ? canAssignTasks(profile.role) : false;
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const { data: tasks = [], isLoading, isFetching, refetch, error } = useTasks(companyId);

  // Filter tasks by assignee name
  const filteredTasks = useMemo(() => {
    if (!assigneeFilter.trim()) return tasks;
    const searchTerm = assigneeFilter.toLowerCase().trim();
    return tasks.filter(task => {
      const assigneeName = task.assignedToName?.toLowerCase() || '';
      return assigneeName.includes(searchTerm);
    });
  }, [tasks, assigneeFilter]);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.body}>Realtime task updates for your company workspace.</Text>
        </View>
        <View style={styles.headerActions}>
          <BellIcon
            userId={profile.id}
            onPress={() => tabNavigation.navigate('Notifications')}
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
      ) : (
        <>
          {/* Assignee Filter */}
          <View style={styles.filterContainer}>
            <View style={styles.filterInputWrap}>
              <Ionicons name="filter" size={16} color={lumina.text.secondary} style={styles.filterIcon} />
              <TextInput
                value={assigneeFilter}
                onChangeText={setAssigneeFilter}
                placeholder="Filter by assignee..."
                placeholderTextColor={lumina.text.secondary}
                style={styles.filterInput}
              />
              {assigneeFilter.length > 0 && (
                <Pressable
                  onPress={() => setAssigneeFilter('')}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={18} color={lumina.text.secondary} />
                </Pressable>
              )}
            </View>
          </View>

          {filteredTasks.length === 0 ? (
            <AppCard>
              <Text style={styles.title}>No tasks found</Text>
              <Text style={styles.body}>No tasks match your filter.</Text>
            </AppCard>
          ) : (
            <FlatList
              data={filteredTasks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <TaskTile task={item} onPress={(taskId) => stackNavigation.navigate('TaskDetails', { taskId })} />}
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
        </>
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
  filterContainer: {
    marginBottom: spacing.md,
  },
  filterInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lumina.bg.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    paddingHorizontal: spacing.sm,
    height: 44,
  },
  filterIcon: {
    marginRight: spacing.xs,
  },
  filterInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: lumina.text.primary,
    paddingVertical: spacing.xs,
  },
  clearButton: {
    padding: spacing.xs,
    minWidth: 32,
    minHeight: 32,
  },
});
