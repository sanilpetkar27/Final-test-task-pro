import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppButton, AppCard, AppScreen, Badge } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, radii, spacing, typography } from '../../../theme';
import type { TaskItem } from '../../../types/domain';
import { useTasks, tasksKeys } from '../hooks/useTasks';
import type { TasksStackParamList } from '../navigation/TasksStack';
import { tasksRepository } from '../repository/tasksRepository';

type TaskDetailsRoute = RouteProp<TasksStackParamList, 'TaskDetails'>;

const statusToBadgeVariant = (
  status: TaskItem['status']
): 'warning' | 'info' | 'success' => {
  if (status === 'in-progress') return 'info';
  if (status === 'completed') return 'success';
  return 'warning';
};

const formatDateTime = (timestamp: number | null): string => {
  if (!timestamp) return 'Not set';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Invalid date';
  }
};

export function TaskDetailsScreen() {
  const route = useRoute<TaskDetailsRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);

  const taskId = route.params.taskId;
  const companyId = profile?.companyId;
  const { data: tasks = [], isLoading, error } = useTasks(companyId);

  const task = useMemo(
    () => tasks.find((item) => item.id === taskId) ?? null,
    [taskId, tasks]
  );

  const updateStatusMutation = useMutation({
    mutationFn: async (status: TaskItem['status']) => {
      await tasksRepository.updateTaskStatus(taskId, status);
    },
    onSuccess: () => {
      if (companyId) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(companyId) });
      } else {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
      }
    },
  });

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
    <AppScreen style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }

            navigation.navigate('TasksList');
          }}
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={lumina.text.primary} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Task Details</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : error ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load task</Text>
          <Text style={styles.subtitle}>{String((error as Error)?.message || 'Unknown error')}</Text>
        </AppCard>
      ) : !task ? (
        <AppCard>
          <Text style={styles.errorTitle}>Task not found</Text>
          <Text style={styles.subtitle}>This task may have been removed.</Text>
        </AppCard>
      ) : (
        <View style={styles.content}>
          <AppCard style={styles.detailCard}>
            <View style={styles.statusRow}>
              <Badge label={task.status} variant={statusToBadgeVariant(task.status)} />
            </View>

            <Text style={styles.taskTitle}>{task.description || 'Untitled task'}</Text>
            <Text style={styles.meta}>
              Assigned to: {task.assignedToName || task.assignedTo || 'Unassigned'}
            </Text>
            <Text style={styles.meta}>
              Created by: {task.assignedByName || task.assignedBy || 'Unknown'}
            </Text>
            <Text style={styles.meta}>Created: {formatDateTime(task.createdAt)}</Text>
            <Text style={styles.meta}>Due: {formatDateTime(task.deadline)}</Text>
            <Text style={styles.meta}>
              Photo proof: {task.requirePhoto ? 'Required' : 'Not required'}
            </Text>
          </AppCard>

          <AppCard style={styles.actionsCard}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <View style={styles.actionsRow}>
              <AppButton
                label="In Progress"
                onPress={() => updateStatusMutation.mutate('in-progress')}
                disabled={task.status === 'in-progress' || updateStatusMutation.isPending}
                loading={updateStatusMutation.isPending && updateStatusMutation.variables === 'in-progress'}
                variant="secondary"
                style={styles.actionButton}
              />
              <AppButton
                label="Completed"
                onPress={() => updateStatusMutation.mutate('completed')}
                disabled={task.status === 'completed' || updateStatusMutation.isPending}
                loading={updateStatusMutation.isPending && updateStatusMutation.variables === 'completed'}
                style={styles.actionButton}
              />
            </View>
          </AppCard>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backButton: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    backgroundColor: lumina.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  backButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: lumina.text.primary,
  },
  headerTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    flexShrink: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: spacing.md,
  },
  detailCard: {
    gap: spacing.sm,
  },
  actionsCard: {
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  taskTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  sectionTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  meta: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
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
  errorTitle: {
    color: lumina.status.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
});
