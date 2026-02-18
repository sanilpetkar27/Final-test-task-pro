import { DealershipTask, TaskType, RecurrenceFrequency } from '../types';

// Database task interface (camelCase from Supabase)
export interface DatabaseTask {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  task_type?: TaskType;
  recurrence_frequency?: RecurrenceFrequency | null;
  // Backward-compatible aliases if some rows were written in camelCase
  taskType?: TaskType;
  recurrenceFrequency?: RecurrenceFrequency | null;
  createdAt: number;
  deadline?: number;
  completedAt?: number;
  proof?: {
    imageUrl: string;
    timestamp: number;
  };
  requirePhoto?: boolean;
  assignedTo?: string; // Employee ID (camelCase)
  assignedBy?: string; // Employee ID (camelCase)
  parentTaskId?: string; // ID of master task if this is a sub-task
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
  const normalizedTaskType: TaskType = dbTask.task_type || dbTask.taskType || 'one_time';
  const rawRecurrenceFrequency = dbTask.recurrence_frequency ?? dbTask.recurrenceFrequency ?? null;
  const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
    normalizedTaskType === 'recurring' &&
    (rawRecurrenceFrequency === 'daily' || rawRecurrenceFrequency === 'weekly' || rawRecurrenceFrequency === 'monthly')
      ? rawRecurrenceFrequency
      : null;

  return {
    id: dbTask.id,
    description: dbTask.description,
    status: dbTask.status,
    taskType: normalizedTaskType,
    recurrenceFrequency: normalizedRecurrenceFrequency,
    createdAt: dbTask.createdAt,
    deadline: dbTask.deadline,
    completedAt: dbTask.completedAt,
    proof: dbTask.proof ? {
      imageUrl: dbTask.proof.imageUrl,
      timestamp: dbTask.proof.timestamp,
    } : undefined,
    requirePhoto: dbTask.requirePhoto,
    assignedTo: dbTask.assignedTo,
    assignedBy: dbTask.assignedBy,
    parentTaskId: dbTask.parentTaskId,
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
  const taskType: TaskType = appTask.taskType || 'one_time';
  const recurrenceFrequency: RecurrenceFrequency | null =
    taskType === 'recurring' &&
    (appTask.recurrenceFrequency === 'daily' ||
      appTask.recurrenceFrequency === 'weekly' ||
      appTask.recurrenceFrequency === 'monthly')
      ? appTask.recurrenceFrequency
      : null;

  return {
    id: appTask.id,
    description: appTask.description,
    status: appTask.status,
    task_type: taskType,
    recurrence_frequency: recurrenceFrequency,
    createdAt: appTask.createdAt,
    deadline: appTask.deadline,
    completedAt: appTask.completedAt,
    proof: appTask.proof ? {
      imageUrl: appTask.proof.imageUrl,
      timestamp: appTask.proof.timestamp,
    } : undefined,
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
