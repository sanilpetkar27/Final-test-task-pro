import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard, Badge } from '../../../components/ui';
import { lumina, spacing, typography } from '../../../theme';
import type { TaskItem } from '../../../types/domain';

type TaskTileProps = {
  task: TaskItem;
};

const statusToVariant = (status: TaskItem['status']): 'warning' | 'info' | 'success' => {
  if (status === 'in-progress') return 'info';
  if (status === 'completed') return 'success';
  return 'warning';
};

const formatDateTime = (timestamp: number | null): string => {
  if (!timestamp) return 'No due date';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Invalid date';
  }
};

const formatRecurrence = (task: TaskItem): string | null => {
  if (task.taskType !== 'recurring' || !task.recurrenceFrequency) {
    return null;
  }

  return `Recurring: ${task.recurrenceFrequency}`;
};

export function TaskTile({ task }: TaskTileProps) {
  const recurrenceLabel = formatRecurrence(task);

  return (
    <AppCard style={styles.card}>
      <View style={styles.headerRow}>
        <Badge label={task.status} variant={statusToVariant(task.status)} />
        {recurrenceLabel ? <Badge label={recurrenceLabel} variant="info" /> : null}
      </View>

      <Text style={styles.description}>{task.description}</Text>
      <Text style={styles.meta}>Created: {formatDateTime(task.createdAt)}</Text>
      <Text style={styles.meta}>Due: {formatDateTime(task.deadline)}</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  description: {
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  meta: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});

