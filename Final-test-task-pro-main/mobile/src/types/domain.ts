export type UserRole = 'super_admin' | 'owner' | 'manager' | 'staff';
export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskType = 'one_time' | 'recurring';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface SessionUser {
  id: string;
  email: string;
}

export interface UserProfile {
  id: string;
  companyId: string;
  email: string;
  name: string;
  mobile: string;
  role: UserRole;
}

export interface TaskItem {
  id: string;
  description: string;
  status: TaskStatus;
  assignedTo: string | null;
  assignedBy: string | null;
  companyId: string;
  createdAt: number;
  deadline: number | null;
  requirePhoto: boolean;
  taskType: TaskType;
  recurrenceFrequency: RecurrenceFrequency | null;
  nextRecurrenceNotificationAt: number | null;
}

export interface TeamMember {
  id: string;
  companyId: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  points?: number;
  onesignalId?: string | null;
}
