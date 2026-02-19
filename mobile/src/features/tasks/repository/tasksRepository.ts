import { supabase } from '../../../services/api/supabase';
import type { RecurrenceFrequency, TaskItem, TaskStatus, TaskType } from '../../../types/domain';

export type CreateTaskInput = {
  description: string;
  companyId: string;
  assignedTo?: string | null;
  assignedBy?: string | null;
  deadline?: number | null;
  requirePhoto?: boolean;
  taskType?: TaskType;
  recurrenceFrequency?: RecurrenceFrequency | null;
};

const mapTask = (row: any): TaskItem => {
  const rawTaskType = String(row?.task_type ?? row?.taskType ?? 'one_time').toLowerCase();
  const rawRecurrence = String(row?.recurrence_frequency ?? row?.recurrenceFrequency ?? '').toLowerCase();
  const recurrenceFrequency: TaskItem['recurrenceFrequency'] =
    rawRecurrence === 'daily' || rawRecurrence === 'weekly' || rawRecurrence === 'monthly'
      ? rawRecurrence
      : null;
  const taskType: TaskItem['taskType'] =
    rawTaskType === 'recurring' || recurrenceFrequency ? 'recurring' : 'one_time';

  return {
    id: String(row.id),
    description: String(row.description || ''),
    status: (row.status || 'pending') as TaskStatus,
    assignedTo: row.assignedTo ?? row.assigned_to ?? null,
    assignedBy: row.assignedBy ?? row.assigned_by ?? null,
    companyId: String(row.company_id || ''),
    createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
    deadline: row.deadline ? Number(row.deadline) : null,
    requirePhoto: Boolean(row.requirePhoto ?? row.require_photo ?? false),
    taskType,
    recurrenceFrequency,
    nextRecurrenceNotificationAt: Number(
      row?.next_recurrence_notification_at ?? row?.nextRecurrenceNotificationAt ?? 0
    ) || null,
  };
};

export const tasksRepository = {
  async listTasks(companyId: string): Promise<TaskItem[]> {
    const { data, error } = await supabase.from('tasks').select('*').eq('company_id', companyId);

    if (error) throw error;
    return (data || [])
      .map(mapTask)
      .sort((left, right) => right.createdAt - left.createdAt);
  },

  async createTask(input: CreateTaskInput): Promise<TaskItem> {
    const taskType = input.taskType ?? 'one_time';
    const recurrenceFrequency =
      taskType === 'recurring' ? input.recurrenceFrequency ?? null : null;

    if (taskType === 'recurring' && !recurrenceFrequency) {
      throw new Error('Recurring tasks require a recurrence frequency.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        description: input.description.trim(),
        status: 'pending',
        assignedTo: input.assignedTo ?? null,
        assignedBy: input.assignedBy ?? null,
        company_id: input.companyId,
        createdAt: Date.now(),
        deadline: input.deadline ?? null,
        requirePhoto: Boolean(input.requirePhoto),
        task_type: taskType,
        recurrence_frequency: recurrenceFrequency,
        next_recurrence_notification_at: null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return mapTask(data);
  },

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (error) throw error;
  },
};
