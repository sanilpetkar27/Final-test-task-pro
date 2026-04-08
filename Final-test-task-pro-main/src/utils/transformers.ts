import { DealershipTask, TaskType, RecurrenceFrequency, TaskExtensionStatus, TaskPriority, TaskProof } from '../types';
import { toTaskProofValue } from './taskProofs';

// Database task interface (camelCase from Supabase)
export interface DatabaseTask {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'pending_approval' | 'completed';
  priority?: TaskPriority | string | null;
  // Recurrence fields may come from either snake_case or camelCase.
  task_type?: TaskType;
  recurrence_frequency?: RecurrenceFrequency | null;
  recurrence_time?: string | null;
  // Backward-compatible aliases if some rows were written in camelCase.
  taskType?: TaskType;
  recurrenceFrequency?: RecurrenceFrequency | null;
  recurrenceTime?: string | null;
  // Timestamp fields may be camelCase or snake_case depending on schema history.
  createdAt?: number;
  created_at?: number;
  next_recurrence_notification_at?: number | null;
  nextRecurrenceNotificationAt?: number | null;
  extension_status?: TaskExtensionStatus;
  extensionStatus?: TaskExtensionStatus;
  requested_due_date?: number | null;
  requestedDueDate?: number | null;
  deadline?: number;
  completedAt?: number;
  completed_at?: number;
  proof?: TaskProof | null;
  requirePhoto?: boolean;
  require_photo?: boolean;
  assignedTo?: string; // Employee ID (camelCase)
  assigned_to?: string; // Employee ID (snake_case)
  assignedBy?: string; // Employee ID (camelCase)
  assigned_by?: string; // Employee ID (snake_case)
  parentTaskId?: string; // ID of master task if this is a sub-task
  parent_task_id?: string; // ID of master task if this is a sub-task (snake_case)
  company_id?: string; // Company ID for multi-tenancy
  remarks?: Array<{
    id: string;
    taskId: string;
    employeeId: string;
    employeeName: string;
    remark: string;
    timestamp: number;
  }>;
}

// Transform database task (camelCase) to app task (camelCase)
export const transformTaskToApp = (dbTask: DatabaseTask): DealershipTask => {
  const rawPriority = String(dbTask.priority || '').trim().toLowerCase();
  const normalizedPriority: TaskPriority =
    rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
  const normalizedTaskType: TaskType = dbTask.task_type || dbTask.taskType || 'one_time';
  const rawRecurrenceFrequency = dbTask.recurrence_frequency ?? dbTask.recurrenceFrequency ?? null;
  const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
    normalizedTaskType === 'recurring' &&
    (rawRecurrenceFrequency === 'daily' || rawRecurrenceFrequency === 'weekly' || rawRecurrenceFrequency === 'monthly')
      ? rawRecurrenceFrequency
      : null;
  const rawRecurrenceTime = String(dbTask.recurrence_time ?? dbTask.recurrenceTime ?? '').trim();
  const normalizedRecurrenceTime =
    normalizedTaskType === 'recurring' && /^\d{2}:\d{2}$/.test(rawRecurrenceTime)
      ? rawRecurrenceTime
      : null;
  const rawExtensionStatus = String(dbTask.extension_status ?? dbTask.extensionStatus ?? 'NONE').toUpperCase();
  const normalizedExtensionStatus: TaskExtensionStatus =
    rawExtensionStatus === 'REQUESTED' ||
    rawExtensionStatus === 'APPROVED' ||
    rawExtensionStatus === 'REJECTED'
      ? (rawExtensionStatus as TaskExtensionStatus)
      : 'NONE';

  return {
    id: dbTask.id,
    description: dbTask.description,
    status: dbTask.status,
    priority: normalizedPriority,
    taskType: normalizedTaskType,
    recurrenceFrequency: normalizedRecurrenceFrequency,
    recurrenceTime: normalizedRecurrenceTime,
    nextRecurrenceNotificationAt:
      dbTask.next_recurrence_notification_at ?? dbTask.nextRecurrenceNotificationAt ?? null,
    extensionStatus: normalizedExtensionStatus,
    requestedDueDate: dbTask.requested_due_date ?? dbTask.requestedDueDate ?? null,
    createdAt: Number(dbTask.createdAt ?? dbTask.created_at ?? Date.now()),
    deadline: dbTask.deadline,
    completedAt: dbTask.completedAt ?? dbTask.completed_at,
    proof: toTaskProofValue(dbTask.proof),
    requirePhoto: dbTask.requirePhoto ?? dbTask.require_photo,
    assignedTo: dbTask.assignedTo ?? dbTask.assigned_to,
    assignedBy: dbTask.assignedBy ?? dbTask.assigned_by,
    parentTaskId: dbTask.parentTaskId ?? dbTask.parent_task_id,
    company_id: String(dbTask.company_id || '00000000-0000-0000-0000-000000000001'),
    remarks: dbTask.remarks?.map(remark => ({
      id: remark.id,
      taskId: remark.taskId,
      employeeId: remark.employeeId,
      employeeName: remark.employeeName,
      remark: remark.remark,
      timestamp: remark.timestamp,
    })),
  };
};

// Transform app task (camelCase) to database task (camelCase)
export const transformTaskToDB = (appTask: DealershipTask): DatabaseTask => {
  const normalizedPriority: TaskPriority =
    appTask.priority === 'High' || appTask.priority === 'Low' ? appTask.priority : 'Medium';
  const taskType: TaskType = appTask.taskType || 'one_time';
  const recurrenceFrequency: RecurrenceFrequency | null =
    taskType === 'recurring' &&
    (appTask.recurrenceFrequency === 'daily' ||
      appTask.recurrenceFrequency === 'weekly' ||
      appTask.recurrenceFrequency === 'monthly')
      ? appTask.recurrenceFrequency
      : null;
  const recurrenceTime =
    taskType === 'recurring' && /^\d{2}:\d{2}$/.test(String(appTask.recurrenceTime || ''))
      ? String(appTask.recurrenceTime)
      : null;

  return {
    id: appTask.id,
    description: appTask.description,
    status: appTask.status,
    priority: normalizedPriority,
    task_type: taskType,
    recurrence_frequency: recurrenceFrequency,
    recurrence_time: recurrenceTime,
    next_recurrence_notification_at:
      taskType === 'recurring' ? (appTask.nextRecurrenceNotificationAt ?? null) : null,
    extension_status: appTask.extensionStatus || 'NONE',
    requested_due_date: appTask.requestedDueDate ?? null,
    createdAt: appTask.createdAt,
    deadline: appTask.deadline,
    completedAt: appTask.completedAt,
    proof: toTaskProofValue(appTask.proof),
    requirePhoto: appTask.requirePhoto,
    assignedTo: appTask.assignedTo,
    assignedBy: appTask.assignedBy,
    parentTaskId: appTask.parentTaskId,
    company_id: appTask.company_id,
    remarks: appTask.remarks?.map(remark => ({
      id: remark.id,
      taskId: remark.taskId,
      employeeId: remark.employeeId,
      employeeName: remark.employeeName,
      remark: remark.remark,
      timestamp: remark.timestamp,
    })),
  };
};

// Transform array of database tasks to app tasks
export const transformTasksToApp = (dbTasks: DatabaseTask[]): DealershipTask[] => {
  return dbTasks.map(transformTaskToApp);
};

// Transform array of app tasks to database tasks
export const transformTasksToDB = (appTasks: DealershipTask[]): DatabaseTask[] => {
  return appTasks.map(transformTaskToDB);
};
