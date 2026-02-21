
export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskType = 'one_time' | 'recurring';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type UserRole = 'owner' | 'manager' | 'staff' | 'super_admin';

export interface Company {
  id: string;
  name: string;
  subscription_status: string;
  created_at: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mobile: string;
  points: number;
  company_id: string;
  auth_user_id?: string;
  manager_id?: string | null;
}

export interface StaffManagerLink {
  company_id: string;
  staff_id: string;
  manager_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface RewardConfig {
  targetPoints: number;
  rewardName: string;
}

export interface TaskRemark {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName: string;
  remark: string;
  timestamp: number;
}

export interface DealershipTask {
  id: string;
  description: string;
  status: TaskStatus;
  taskType?: TaskType; // One-time vs recurring task type
  recurrenceFrequency?: RecurrenceFrequency | null; // Required when taskType is recurring
  nextRecurrenceNotificationAt?: number | null; // Next reminder timestamp for recurring task notifications
  createdAt: number;
  deadline?: number; // Timestamp for when the task is due
  completedAt?: number;
  proof?: {
    imageUrl: string;
    timestamp: number;
  };
  requirePhoto?: boolean; // Whether photo proof is required for completion
  assignedTo?: string; // Employee ID (The person doing the work)
  assignedBy?: string; // Employee ID (The person who created the task)
  parentTaskId?: string; // ID of the master task if this is a sub-task
  company_id: string; // Company ID for multi-tenancy
  remarks?: TaskRemark[]; // Array of progress remarks
}

export interface FinanceRecord {
  id: string;
  lenderName: string;
  type: 'Trade Advance' | 'Inventory Funding' | 'Working Capital' | 'Other';
  status: 'pending' | 'paid' | 'overdue';
  amount: number;
  dueDate: number; // timestamp
  description?: string;
}

export interface ReceivableRecord {
  id: string;
  sourceName: string;
  category: 'OEM Incentive' | 'Insurance Payout' | 'Finance Payout' | 'Warranty Payout' | 'Other';
  amount: number;
  expectedDate: number; // timestamp
  description?: string;
}

export type DocCategory = 'GST' | 'PAN' | 'Aadhaar' | 'ITR' | 'Trade License' | 'Bank Docs' | 'Other';

export interface DocumentRecord {
  id: string;
  name: string;
  category: DocCategory;
  fileData: string; // Base64
  mimeType: string;
  uploadDate: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export enum AppTab {
  DASHBOARD = 'dashboard',
  TASKS = 'tasks',
  TEAM = 'team',
  FINANCE = 'finance',
  RECEIVABLES = 'receivables',
  DOCUMENTS = 'documents'
}
