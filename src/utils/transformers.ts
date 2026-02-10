import { DealershipTask } from '../types';

// Database task interface (snake_case from Supabase)
export interface DatabaseTask {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  created_at: number;
  deadline?: number;
  completed_at?: number;
  proof?: {
    image_url: string;
    timestamp: number;
  };
  require_photo?: boolean;
  assigned_to?: string; // Employee ID (snake_case)
  assigned_by?: string; // Employee ID (snake_case)
  parent_task_id?: string; // ID of the master task if this is a sub-task
  remarks?: Array<{
    id: string;
    task_id: string;
    employee_id: string;
    employee_name: string;
    remark: string;
    timestamp: number;
  }>;
}

// Transform database task (snake_case) to app task (camelCase)
export const transformTaskToApp = (dbTask: DatabaseTask): DealershipTask => {
  return {
    id: dbTask.id,
    description: dbTask.description,
    status: dbTask.status,
    createdAt: dbTask.created_at,
    deadline: dbTask.deadline,
    completedAt: dbTask.completed_at,
    proof: dbTask.proof ? {
      imageUrl: dbTask.proof.image_url,
      timestamp: dbTask.proof.timestamp,
    } : undefined,
    requirePhoto: dbTask.require_photo,
    assignedTo: dbTask.assigned_to,
    assignedBy: dbTask.assigned_by,
    parentTaskId: dbTask.parent_task_id,
    remarks: dbTask.remarks?.map(remark => ({
      id: remark.id,
      taskId: remark.task_id,
      employeeId: remark.employee_id,
      employeeName: remark.employee_name,
      remark: remark.remark,
      timestamp: remark.timestamp,
    })),
  };
};

// Transform app task (camelCase) to database task (snake_case)
export const transformTaskToDB = (appTask: DealershipTask): DatabaseTask => {
  return {
    id: appTask.id,
    description: appTask.description,
    status: appTask.status,
    created_at: appTask.createdAt,
    deadline: appTask.deadline,
    completed_at: appTask.completedAt,
    proof: appTask.proof ? {
      image_url: appTask.proof.imageUrl,
      timestamp: appTask.proof.timestamp,
    } : undefined,
    require_photo: appTask.requirePhoto,
    assigned_to: appTask.assignedTo,
    assigned_by: appTask.assignedBy,
    parent_task_id: appTask.parentTaskId,
    remarks: appTask.remarks?.map(remark => ({
      id: remark.id,
      task_id: remark.taskId,
      employee_id: remark.employeeId,
      employee_name: remark.employeeName,
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
