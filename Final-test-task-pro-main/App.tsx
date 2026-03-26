import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppTab, DealershipTask, Employee, UserRole, TaskStatus, TaskType, RecurrenceFrequency, TaskPriority, TaskRemark, StaffManagerLink } from './types';
import Dashboard from './components/Dashboard';
import StatsScreen from './components/StatsScreen';
import TeamManager from './components/TeamManager';
import ApprovalsPanel from './components/ApprovalsPanel';
import LoginScreen from './components/LoginScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { supabase, supabaseAuth } from './src/lib/supabase';
import { useNotificationSetup } from './src/hooks/useNotificationSetup';
import { transformTaskToApp, transformTaskToDB, transformTasksToApp, DatabaseTask } from './src/utils/transformers';
import { sendTaskAssignmentNotification, sendTaskCompletionNotification } from './src/utils/pushNotifications';
import { Toaster, toast } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import {
  ClipboardList,
  CheckCircle2,
  Users,
  LayoutDashboard,
  LogOut,
  Loader2,
  AlertTriangle,
  Bell,
  X
} from 'lucide-react';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const USER_CACHE_KEY = 'universal_app_user';
const ACTIVE_TAB_CACHE_KEY = 'universal_app_active_tab';
const EMPLOYEES_CACHE_KEY = 'universalAppEmployees';
const TASKS_CACHE_KEY = 'universalAppTasks';
const STAFF_MANAGER_LINKS_CACHE_KEY = 'universalAppStaffManagerLinks';
const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;
const MONTHLY_MS = 30 * DAILY_MS;

const getRecurrenceIntervalMs = (frequency: RecurrenceFrequency | null | undefined): number => {
  if (frequency === 'daily') return DAILY_MS;
  if (frequency === 'weekly') return WEEKLY_MS;
  if (frequency === 'monthly') return MONTHLY_MS;
  return 0;
};

const computeNextRecurrenceNotificationAt = (
  baseTimestamp: number,
  frequency: RecurrenceFrequency | null | undefined
): number | null => {
  const intervalMs = getRecurrenceIntervalMs(frequency);
  if (!intervalMs) return null;
  return Number(baseTimestamp || Date.now()) + intervalMs;
};

const resolveRecurringFrequencyForTask = (
  task: DealershipTask | undefined
): RecurrenceFrequency | null => {
  if (!task) return null;

  const rawTaskType = String((task as any).taskType ?? (task as any).task_type ?? 'one_time').toLowerCase();
  if (rawTaskType !== 'recurring') {
    return null;
  }

  const rawFrequency = String(
    (task as any).recurrenceFrequency ?? (task as any).recurrence_frequency ?? ''
  ).toLowerCase();

  if (rawFrequency === 'daily' || rawFrequency === 'weekly' || rawFrequency === 'monthly') {
    return rawFrequency as RecurrenceFrequency;
  }

  return null;
};

const normalizeTaskPriority = (task: DealershipTask | undefined): TaskPriority => {
  const rawPriority = String((task as any)?.priority || '').trim().toLowerCase();
  return rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
};

const normalizeRole = (role: unknown): Employee['role'] => {
  return role === 'owner' || role === 'manager' || role === 'staff' || role === 'super_admin'
    ? role
    : 'staff';
};

const getRoleLabel = (role: Employee['role']): string => {
  if (role === 'super_admin' || role === 'owner') return 'Owner';
  if (role === 'manager') return 'Manager';
  return 'Staff';
};

const isManagerLevelRole = (role: unknown): boolean =>
  role === 'manager' || role === 'owner' || role === 'super_admin';

const canAccessTeamTab = (role: Employee['role'] | null | undefined): boolean => {
  return role === 'manager' || role === 'super_admin' || role === 'owner';
};

const normalizePersistedAppTab = (tabValue: string | null): AppTab | null => {
  if (tabValue === AppTab.TASKS || tabValue === AppTab.APPROVALS || tabValue === AppTab.TEAM) {
    return tabValue;
  }

  return null;
};

const resolveActiveTabForRole = (
  nextTab: AppTab | null | undefined,
  role: Employee['role'] | null | undefined
): AppTab => {
  if (nextTab === AppTab.APPROVALS) return AppTab.APPROVALS;
  if (nextTab === AppTab.TEAM && canAccessTeamTab(role)) return AppTab.TEAM;
  return AppTab.TASKS;
};

const readPersistedActiveTab = (userId?: string | null): AppTab | null => {
  if (typeof window === 'undefined') return null;

  const normalizedUserId = String(userId || '').trim();
  const lookupKeys = normalizedUserId
    ? [`${ACTIVE_TAB_CACHE_KEY}:${normalizedUserId}`, ACTIVE_TAB_CACHE_KEY]
    : [ACTIVE_TAB_CACHE_KEY];

  for (const key of lookupKeys) {
    try {
      const rawTab = localStorage.getItem(key);
      const parsedTab = normalizePersistedAppTab(rawTab);
      if (parsedTab) return parsedTab;
    } catch {
      // Ignore local storage read failures and continue with defaults.
    }
  }

  return null;
};

const toFallbackEmployeeFromAuthUser = (authUser: any): Employee => {
  const metadata = authUser?.user_metadata || {};
  const email = String(authUser?.email || metadata.email || '').trim();
  const name = String(metadata.name || email.split('@')[0] || 'User').trim();
  const mobile = String(metadata.mobile || '').trim();

  return {
    id: String(authUser?.id || `temp-${Date.now()}`),
    name: name || 'User',
    email: email || `${authUser?.id || 'user'}@taskpro.local`,
    mobile: mobile || String(authUser?.id || '0000000000').slice(0, 10),
    role: normalizeRole(metadata.role),
    company_id: String(metadata.company_id || DEFAULT_COMPANY_ID),
  };
};

const normalizeMobile = (mobile: unknown): string => {
  return String(mobile || '').replace(/\D/g, '');
};

const isMissingColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
};

const isMissingRelationError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return code === '42P01' || (message.includes('relation') && message.includes('does not exist'));
};

const isMissingTaskRecurrenceColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const missingRecurrenceColumn =
    message.includes('recurrence_frequency') || message.includes('task_type');
  const missingInSchema =
    message.includes('schema cache') || (message.includes('column') && message.includes('does not exist'));
  return missingRecurrenceColumn && missingInSchema;
};

const isMissingNextRecurrenceNotificationColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('next_recurrence_notification_at') &&
    (message.includes('schema cache') || (message.includes('column') && message.includes('does not exist')))
  );
};

const stripTaskRecurrenceFields = (payload: Record<string, any>) => {
  const legacyPayload = { ...payload };
  delete legacyPayload.task_type;
  delete legacyPayload.recurrence_frequency;
  delete legacyPayload.taskType;
  delete legacyPayload.recurrenceFrequency;
  delete legacyPayload.next_recurrence_notification_at;
  delete legacyPayload.nextRecurrenceNotificationAt;
  return legacyPayload;
};

const toCamelTaskRecurrencePayload = (payload: Record<string, any>) => {
  const camelPayload = { ...payload };
  camelPayload.taskType = camelPayload.task_type ?? camelPayload.taskType ?? 'one_time';
  camelPayload.recurrenceFrequency =
    camelPayload.recurrence_frequency ?? camelPayload.recurrenceFrequency ?? null;
  camelPayload.nextRecurrenceNotificationAt =
    camelPayload.next_recurrence_notification_at ?? camelPayload.nextRecurrenceNotificationAt ?? null;
  delete camelPayload.task_type;
  delete camelPayload.recurrence_frequency;
  delete camelPayload.next_recurrence_notification_at;
  return camelPayload;
};

const stripTaskNextRecurrenceField = (payload: Record<string, any>) => {
  const legacyPayload = { ...payload };
  delete legacyPayload.next_recurrence_notification_at;
  delete legacyPayload.nextRecurrenceNotificationAt;
  return legacyPayload;
};

const isEmployeesPolicyError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('infinite recursion') && message.includes('employees');
};

const isPolicyRecursionError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('infinite recursion');
};

const parseCachedArray = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const filterEmployeesByCompany = (employeeRows: Employee[], companyId: string | null): Employee[] => {
  if (!companyId) {
    return employeeRows;
  }
  return employeeRows.filter((employee) => String(employee?.company_id || '').trim() === companyId);
};

const isCompletedStatus = (status: unknown): boolean =>
  String(status || '').toLowerCase() === 'completed';

const filterActiveTasks = (taskRows: DealershipTask[]): DealershipTask[] =>
  taskRows.filter((task) => !isCompletedStatus(task.status));

const filterTasksByCompany = (taskRows: DealershipTask[], companyId: string | null): DealershipTask[] => {
  if (!companyId) {
    return taskRows;
  }
  return taskRows.filter((task) => {
    const taskCompanyId = String(task?.company_id || '').trim();
    // Keep legacy cached tasks that were missing company_id due older transforms.
    return !taskCompanyId || taskCompanyId === companyId;
  });
};

const normalizeEmployeeProfile = (employee: Partial<Employee> & { id: string }): Employee => {
  const safeId = String(employee.id || `temp-${Date.now()}`);
  const safeEmail = String(employee.email || `${safeId}@taskpro.local`).trim();
  const safeName = String(employee.name || safeEmail.split('@')[0] || 'User').trim();
  const safeMobile = String(employee.mobile || '').trim();
  const rawManagerId = (employee as any)?.manager_id ?? (employee as any)?.managerId;
  const safeManagerId =
    typeof rawManagerId === 'string' && rawManagerId.trim()
      ? rawManagerId.trim()
      : null;

  return {
    id: safeId,
    name: safeName || 'User',
    email: safeEmail,
    mobile: safeMobile || safeId.slice(0, 10),
    role: normalizeRole(employee.role),
    company_id: String(employee.company_id || DEFAULT_COMPANY_ID),
    auth_user_id: employee.auth_user_id ? String(employee.auth_user_id) : undefined,
    manager_id: safeManagerId,
  };
};

const filterStaffManagerLinksByCompany = (
  links: StaffManagerLink[],
  companyId: string | null
): StaffManagerLink[] => {
  if (!companyId) {
    return links;
  }
  return links.filter((link) => String(link?.company_id || '').trim() === companyId);
};

const getManagerIdsForStaff = (
  staffId: string,
  staffManagerLinks: StaffManagerLink[],
  fallbackManagerId?: string | null
): string[] => {
  const normalizedStaffId = String(staffId || '').trim();
  if (!normalizedStaffId) {
    return [];
  }

  const ids = new Set<string>();
  for (const link of staffManagerLinks || []) {
    if (!link) continue;
    if (String(link.staff_id || '').trim() !== normalizedStaffId) continue;
    const managerId = String(link.manager_id || '').trim();
    if (managerId) {
      ids.add(managerId);
    }
  }

  const fallback = String(fallbackManagerId || '').trim();
  if (fallback) {
    ids.add(fallback);
  }

  return Array.from(ids);
};

const resolveTaskCompletionApproverId = (
  task: DealershipTask,
  currentUser: Employee,
  employees: Employee[],
  staffManagerLinks: StaffManagerLink[]
): string | null => {
  const candidateIds: string[] = [];
  const pushCandidate = (candidateId?: string | null) => {
    const normalized = String(candidateId || '').trim();
    if (!normalized || normalized === currentUser.id || candidateIds.includes(normalized)) {
      return;
    }
    candidateIds.push(normalized);
  };

  const assigner = employees.find((employee) => employee.id === task.assignedBy);
  if (assigner && isManagerLevelRole(assigner.role)) {
    pushCandidate(assigner.id);
  }

  getManagerIdsForStaff(currentUser.id, staffManagerLinks, currentUser.manager_id || null).forEach(pushCandidate);

  employees
    .filter((employee) => isManagerLevelRole(employee.role))
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((employee) => pushCandidate(employee.id));

  return candidateIds[0] || null;
};

const createTaskRemarkEntry = (
  taskId: string,
  employee: Pick<Employee, 'id' | 'name'>,
  remark: string,
  timestamp: number = Date.now()
): TaskRemark => ({
  id: `remark_${taskId}_${timestamp}`,
  taskId,
  employeeId: employee.id,
  employeeName: employee.name,
  remark,
  timestamp,
});

const scopeEmployeesForCurrentUser = (
  employeeRows: Employee[],
  taskRows: DealershipTask[],
  currentUser: Employee | null,
  staffManagerLinks: StaffManagerLink[] = []
): Employee[] => {
  const mergedEmployees = mergeCurrentUserIntoEmployees(employeeRows, currentUser);
  if (!currentUser) {
    return mergedEmployees;
  }

  if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
    return mergedEmployees;
  }

  if (currentUser.role === 'manager') {
    const visibleAssignerIds = new Set<string>([currentUser.id]);
    for (const task of taskRows || []) {
      if (task.assignedTo === currentUser.id && task.assignedBy) {
        visibleAssignerIds.add(task.assignedBy);
      }
    }

    return mergedEmployees.filter((employee) => {
      if (visibleAssignerIds.has(employee.id)) return true;
      if (employee.id === currentUser.id) return true;
      if (employee.role !== 'staff') return false;
      const managerIds = getManagerIdsForStaff(
        employee.id,
        staffManagerLinks,
        typeof employee.manager_id === 'string' ? employee.manager_id : null
      );
      return managerIds.includes(currentUser.id);
    });
  }

  // Staff: show own profile and direct manager when available.
  const managerIds = new Set<string>();
  const profileManagerIds = getManagerIdsForStaff(
    currentUser.id,
    staffManagerLinks,
    typeof currentUser.manager_id === 'string' ? currentUser.manager_id : null
  );
  for (const managerId of profileManagerIds) {
    managerIds.add(managerId);
  }

  taskRows.forEach((task) => {
    if (task.assignedTo === currentUser.id && task.assignedBy) {
      managerIds.add(task.assignedBy);
    }
  });

  return mergedEmployees.filter((employee) => employee.id === currentUser.id || managerIds.has(employee.id));
};

const mergeCurrentUserIntoEmployees = (employeeRows: Employee[], currentUser: Employee | null): Employee[] => {
  const normalizedRows = (employeeRows || []).map((employee) => normalizeEmployeeProfile(employee));
  if (!currentUser) {
    return normalizedRows;
  }

  const normalizedCurrentUser = normalizeEmployeeProfile(currentUser);
  const existingIndex = normalizedRows.findIndex((employee) => employee.id === normalizedCurrentUser.id);

  if (existingIndex >= 0) {
    const mergedRows = [...normalizedRows];
    mergedRows[existingIndex] = { ...mergedRows[existingIndex], ...normalizedCurrentUser };
    return mergedRows;
  }

  return [normalizedCurrentUser, ...normalizedRows];
};

const syncEmployeeProfileToDatabase = async (employee: Employee, authUserId?: string): Promise<Employee | null> => {
  const normalizedProfile = normalizeEmployeeProfile(employee);
  const payloadWithAuthLink = {
    id: normalizedProfile.id,
    name: normalizedProfile.name,
    email: normalizedProfile.email,
    mobile: normalizedProfile.mobile,
    role: normalizedProfile.role,
    company_id: normalizedProfile.company_id,
    auth_user_id: authUserId || normalizedProfile.auth_user_id || null,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from('employees')
    .upsert(payloadWithAuthLink, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error && isMissingColumnError(error)) {
    const { data: retryData, error: retryError } = await supabase
      .from('employees')
      .upsert({
        id: normalizedProfile.id,
        name: normalizedProfile.name,
        email: normalizedProfile.email,
        mobile: normalizedProfile.mobile,
        role: normalizedProfile.role,
        company_id: normalizedProfile.company_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    data = retryData;
    error = retryError;
  }

  if (error) {
    if (!isEmployeesPolicyError(error)) {
      console.warn('Employee profile auto-sync failed:', error);
    }
    return null;
  }

  return data ? normalizeEmployeeProfile(data as Employee) : null;
};

const resolveEmployeeProfileFromAuthUser = async (authUser: any): Promise<Employee | null> => {
  const authUserId = String(authUser?.id || '').trim();
  const authEmail = String(authUser?.email || '').trim().toLowerCase();
  const authMobile = normalizeMobile(authUser?.user_metadata?.mobile || authUser?.phone || '');
  const authCompanyId = String(authUser?.user_metadata?.company_id || '').trim();

  if (authUserId) {
    const { data: byId, error: byIdError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', authUserId)
      .limit(1)
      .maybeSingle();

    if (byId) {
      return byId as Employee;
    }

    if (byIdError && !isEmployeesPolicyError(byIdError)) {
      console.warn('Session profile lookup by id failed:', byIdError);
    }

    let byAuthUserIdQuery = supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', authUserId)
      .limit(1);

    if (authCompanyId) {
      byAuthUserIdQuery = byAuthUserIdQuery.eq('company_id', authCompanyId);
    }

    const { data: byAuthUserId, error: byAuthUserIdError } = await byAuthUserIdQuery.maybeSingle();

    if (byAuthUserId) {
      return byAuthUserId as Employee;
    }

    if (byAuthUserIdError && !isMissingColumnError(byAuthUserIdError) && !isEmployeesPolicyError(byAuthUserIdError)) {
      console.warn('Session profile lookup by auth_user_id failed:', byAuthUserIdError);
    }
  }

  if (authEmail) {
    let byEmailQuery = supabase
      .from('employees')
      .select('*')
      .eq('email', authEmail)
      .limit(1);

    if (authCompanyId) {
      byEmailQuery = byEmailQuery.eq('company_id', authCompanyId);
    }

    const { data: byEmail, error: byEmailError } = await byEmailQuery.maybeSingle();

    if (byEmail) {
      return byEmail as Employee;
    }

    if (byEmailError && !isMissingColumnError(byEmailError) && !isEmployeesPolicyError(byEmailError)) {
      console.warn('Session profile lookup by email failed:', byEmailError);
    }
  }

  if (authMobile) {
    let mobileQuery = supabase
      .from('employees')
      .select('*')
      .limit(200);

    if (authCompanyId) {
      mobileQuery = mobileQuery.eq('company_id', authCompanyId);
    }

    const { data: employeeRows, error: mobileError } = await mobileQuery;

    if (employeeRows && employeeRows.length > 0) {
      const matchedByMobile = employeeRows.find((emp: any) => normalizeMobile(emp?.mobile) === authMobile);
      if (matchedByMobile) {
        return matchedByMobile as Employee;
      }
    }

    if (mobileError && !isEmployeesPolicyError(mobileError)) {
      console.warn('Session profile lookup by mobile failed:', mobileError);
    }
  }

  return null;
};

const upsertTaskAtTop = <T extends { id: string }>(items: T[], nextItem: T): T[] => {
  const filtered = items.filter((item) => item.id !== nextItem.id);
  return [nextItem, ...filtered];
};

const upsertTaskInPlace = <T extends { id: string }>(items: T[], nextItem: T): T[] => {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [nextItem, ...items];
  }

  const updated = [...items];
  updated[index] = { ...updated[index], ...nextItem };
  return updated;
};

const buildTaskScopeIds = (currentUser: Employee | null, employeeRows: Employee[] = []): string[] => {
  if (!currentUser) {
    return [];
  }

  const ids = new Set<string>();
  const normalizedEmail = String(currentUser.email || '').trim().toLowerCase();
  const normalizedMobile = normalizeMobile(currentUser.mobile || '');
  const currentAuthUserId = String((currentUser as any).auth_user_id || '').trim();

  const addId = (value: unknown) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };

  addId(currentUser.id);
  addId(currentAuthUserId);

  for (const employee of employeeRows || []) {
    if (!employee) continue;

    const employeeEmail = String(employee.email || '').trim().toLowerCase();
    const employeeMobile = normalizeMobile(employee.mobile || '');
    const employeeAuthUserId = String((employee as any).auth_user_id || '').trim();

    const matchByAuth = currentAuthUserId && employeeAuthUserId && employeeAuthUserId === currentAuthUserId;
    const matchByEmail = normalizedEmail && employeeEmail && employeeEmail === normalizedEmail;
    const matchByMobile = normalizedMobile && employeeMobile && employeeMobile === normalizedMobile;

    if (matchByAuth || matchByEmail || matchByMobile) {
      addId(employee.id);
      addId(employeeAuthUserId);
    }
  }

  return Array.from(ids);
};

const applyTaskVisibilityFilter = (
  query: any,
  currentUser: Employee | null,
  employeeRows: Employee[] = []
) => {
  if (!currentUser || currentUser.role === 'super_admin' || currentUser.role === 'owner') {
    return query;
  }

  const scopeIds = buildTaskScopeIds(currentUser, employeeRows);
  if (scopeIds.length === 0) {
    return query;
  }

  if (scopeIds.length === 1) {
    const id = scopeIds[0];
    return query.or(`assignedTo.eq.${id},assignedBy.eq.${id}`);
  }

  const scopedIdCsv = scopeIds.join(',');
  return query.or(`assignedTo.in.(${scopedIdCsv}),assignedBy.in.(${scopedIdCsv})`);
};

const isTaskVisibleToUser = (
  taskRow: Partial<DatabaseTask> | Record<string, unknown>,
  currentUser: Employee | null,
  scopeIds: string[] = []
): boolean => {
  if (!currentUser) return false;
  if (currentUser.role === 'super_admin' || currentUser.role === 'owner') return true;

  const row = taskRow as Record<string, unknown>;
  const assignedTo = String(row.assignedTo ?? row.assigned_to ?? '').trim();
  const assignedBy = String(row.assignedBy ?? row.assigned_by ?? '').trim();
  const candidateIds = scopeIds.length > 0 ? scopeIds : buildTaskScopeIds(currentUser);
  return candidateIds.some((id) => id === assignedTo || id === assignedBy);
};

const toTimestampNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numericCandidate = Number(value);
    if (Number.isFinite(numericCandidate)) {
      return numericCandidate;
    }

    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }

  return Date.now();
};

const toOptionalTimestampNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numericCandidate = Number(value);
    if (Number.isFinite(numericCandidate) && numericCandidate > 0) {
      return numericCandidate;
    }

    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }

  return null;
};

const normalizeRealtimeRemarks = (rawRemarks: unknown, taskId: string): TaskRemark[] | null => {
  if (!Array.isArray(rawRemarks)) {
    return null;
  }

  const parsedRemarks = rawRemarks
    .map((rawRemark, index): TaskRemark | null => {
      if (!rawRemark || typeof rawRemark !== 'object') {
        return null;
      }

      const remarkRecord = rawRemark as Record<string, unknown>;
      const remarkText =
        typeof remarkRecord.remark === 'string' ? remarkRecord.remark.trim() : '';

      if (!remarkText) {
        return null;
      }

      const remarkId =
        typeof remarkRecord.id === 'string' && remarkRecord.id.trim()
          ? remarkRecord.id
          : `remark_${taskId}_${index}`;
      const employeeId =
        typeof remarkRecord.employeeId === 'string' && remarkRecord.employeeId.trim()
          ? remarkRecord.employeeId
          : 'unknown';
      const employeeName =
        typeof remarkRecord.employeeName === 'string' && remarkRecord.employeeName.trim()
          ? remarkRecord.employeeName.trim()
          : 'Unknown User';
      const remarkTaskId =
        typeof remarkRecord.taskId === 'string' && remarkRecord.taskId.trim()
          ? remarkRecord.taskId
          : taskId;
      const mentionedUserIds = Array.isArray(remarkRecord.mentionedUserIds)
        ? remarkRecord.mentionedUserIds
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : [];
      const mentionedDisplayNames = Array.isArray(remarkRecord.mentionedDisplayNames)
        ? remarkRecord.mentionedDisplayNames
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : [];

      return {
        id: remarkId,
        taskId: remarkTaskId,
        employeeId,
        employeeName,
        remark: remarkText,
        timestamp: toTimestampNumber(remarkRecord.timestamp),
        ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
        ...(mentionedDisplayNames.length > 0 ? { mentionedDisplayNames } : {})
      };
    })
    .filter((remark): remark is TaskRemark => Boolean(remark))
    .sort((left, right) => left.timestamp - right.timestamp);

  return parsedRemarks;
};

type InAppNotification = {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  entity_type?: string | null;
  entity_id?: string | null;
};

const formatNotificationTimeAgo = (createdAt: string): string => {
  const createdTs = Date.parse(createdAt);
  if (!Number.isFinite(createdTs)) return 'Just now';

  const diff = Math.max(0, Date.now() - createdTs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(createdAt).toLocaleDateString();
};

const App: React.FC = () => {
  // --- 1. USER & STATE MANAGEMENT ---
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem(USER_CACHE_KEY);
      if (!saved || saved === 'undefined') return null;

      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        role: normalizeRole(parsed?.role),
        email: parsed?.email || `${parsed?.id || 'user'}@taskpro.local`,
        company_id: parsed?.company_id || DEFAULT_COMPANY_ID,
      } as Employee;
    } catch (error) {
      console.warn('Failed to parse cached user profile, clearing local cache.', error);
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const cachedTab = readPersistedActiveTab(currentUser?.id);
    return resolveActiveTabForRole(cachedTab, currentUser?.role);
  });
  const [tasksTabReselectSignal, setTasksTabReselectSignal] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [userNotifications, setUserNotifications] = useState<InAppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const lastForegroundRefreshAtRef = useRef(0);
  const lastRealtimeTasksRefetchAtRef = useRef(0);

  const unreadNotificationCount = userNotifications.filter((item) => !item.is_read).length;

  const loadUserNotifications = useCallback(async () => {
    const userId = String(currentUser?.id || '').trim();
    if (!userId) {
      setUserNotifications([]);
      return;
    }

    setNotificationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, is_read, created_at, entity_type, entity_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.warn('Failed to load notifications:', error);
        return;
      }

      setUserNotifications((data || []) as InAppNotification[]);
    } finally {
      setNotificationsLoading(false);
    }
  }, [currentUser?.id]);

  // --- OneSignal Notification Setup ---
  useNotificationSetup({
    userId: currentUser?.id || null,
    userMobile: currentUser?.mobile || null,
    companyId: currentUser?.company_id || null,
    isLoggedIn: !!currentUser
  });

  // --- 2. UPDATED EMPLOYEES LIST (With Your Number) ---
  const DEFAULT_EMPLOYEES: Employee[] = [
    {
      id: 'emp-admin',
      name: 'Admin User', // Updated Name
      email: 'admin@company.com', // Added email
      mobile: '9000000001',
      role: 'manager'
    },
    { id: 'emp-staff-1', name: 'Staff Member 1', email: 'staff1@company.com', mobile: '8888888888', role: 'staff' },
    { id: 'emp-staff-2', name: 'Staff Member 2', email: 'staff2@company.com', mobile: '7777777777', role: 'staff' }
  ];

  const DEFAULT_TASKS = [
    {
      id: 'task-demo-1',
      description: 'Welcome to your new OpenTask',
      status: 'pending' as TaskStatus,
      priority: 'Medium' as TaskPriority,
      createdAt: Date.now(),
      assignedBy: 'emp-admin',
      assignedTo: 'emp-staff-1'
    }
  ];

  const [employees, setEmployees] = useState<Employee[]>(() => parseCachedArray<Employee>(EMPLOYEES_CACHE_KEY));
  const [staffManagerLinks, setStaffManagerLinks] = useState<StaffManagerLink[]>(() =>
    parseCachedArray<StaffManagerLink>(STAFF_MANAGER_LINKS_CACHE_KEY)
  );
  // Load data logic
  const loadInitialData = async (isSilent: boolean = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
      }
      setLoadError(null);

      const activeCompanyId = currentUser?.company_id || null;

      // Fetch employees from Supabase (company-scoped when available)
      let employeesQuery = supabase
        .from('employees')
        .select('*');

      if (activeCompanyId) {
        employeesQuery = employeesQuery.eq('company_id', activeCompanyId);
      }

      const { data: employeesData, error: employeesError } = await employeesQuery;

      let finalStaffManagerLinks = filterStaffManagerLinksByCompany(
        parseCachedArray<StaffManagerLink>(STAFF_MANAGER_LINKS_CACHE_KEY),
        activeCompanyId
      );

      if (activeCompanyId) {
        const { data: staffManagerLinksData, error: staffManagerLinksError } = await supabase
          .from('staff_manager_links')
          .select('*')
          .eq('company_id', activeCompanyId);

        if (!staffManagerLinksError && Array.isArray(staffManagerLinksData)) {
          finalStaffManagerLinks = staffManagerLinksData as StaffManagerLink[];
        } else if (staffManagerLinksError && !isMissingRelationError(staffManagerLinksError)) {
          console.warn('Staff manager links error:', staffManagerLinksError);
        }
      }

      // Fetch tasks from Supabase with role + company filtering
      let tasksQuery = supabase.from('tasks').select('*');

      if (activeCompanyId) {
        tasksQuery = tasksQuery.eq('company_id', activeCompanyId);
      }
      tasksQuery = tasksQuery.in('status', ['pending', 'in_progress', 'in-progress', 'overdue', 'completed']);
      
      // Apply role-based filtering using all known IDs for the active user profile.
      tasksQuery = applyTaskVisibilityFilter(tasksQuery, currentUser, (employeesData || []) as Employee[]);
      
      const { data: tasksData, error: tasksError } = await tasksQuery;

      // Cache fallback is always tenant-scoped to avoid leaking demo/other-company users.
      const cachedEmployees = filterEmployeesByCompany(
        parseCachedArray<Employee>(EMPLOYEES_CACHE_KEY),
        activeCompanyId
      );
      const cachedTasks = filterTasksByCompany(
        parseCachedArray<DealershipTask>(TASKS_CACHE_KEY),
        activeCompanyId
      );

      const finalEmployeesBase = (employeesData && employeesData.length > 0)
        ? employeesData
        : (cachedEmployees.length > 0 ? cachedEmployees : []);

      // Transform database tasks to app tasks
      const finalTasks = (tasksData && tasksData.length > 0)
        ? transformTasksToApp(tasksData as DatabaseTask[])
        : (cachedTasks.length > 0 ? cachedTasks : []);
      const activeTasks = finalTasks;
      const mergedEmployees = mergeCurrentUserIntoEmployees(finalEmployeesBase as Employee[], currentUser).map((employee) => {
        if (employee.role !== 'staff') {
          return employee;
        }

        const managerIds = getManagerIdsForStaff(employee.id, finalStaffManagerLinks, employee.manager_id || null);
        if (!managerIds.length) {
          return employee;
        }

        return {
          ...employee,
          manager_id: managerIds[0],
        };
      });
      const finalEmployees = scopeEmployeesForCurrentUser(
        mergedEmployees,
        activeTasks,
        currentUser,
        finalStaffManagerLinks
      );

      if (employeesError || tasksError) {
        console.warn('using fallback data due to Supabase error');
        if (employeesError) console.warn('Employees error:', employeesError);
        if (tasksError) console.warn('Tasks error:', tasksError);
      }

      localStorage.setItem(EMPLOYEES_CACHE_KEY, JSON.stringify(mergedEmployees));
      localStorage.setItem(STAFF_MANAGER_LINKS_CACHE_KEY, JSON.stringify(finalStaffManagerLinks));
      if (tasksData && tasksData.length > 0) {
        localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(finalTasks));
      }

      return {
        employees: finalEmployees,
        tasks: activeTasks,
        staffManagerLinks: finalStaffManagerLinks
      };
    } catch (error) {
      console.error('Supabase connection failed - using cached fallback data');
      const activeCompanyId = currentUser?.company_id || null;
      const cachedEmployees = filterEmployeesByCompany(
        parseCachedArray<Employee>(EMPLOYEES_CACHE_KEY),
        activeCompanyId
      );
      const cachedTasks = filterTasksByCompany(
        parseCachedArray<DealershipTask>(TASKS_CACHE_KEY),
        activeCompanyId
      );
      const cachedStaffManagerLinks = filterStaffManagerLinksByCompany(
        parseCachedArray<StaffManagerLink>(STAFF_MANAGER_LINKS_CACHE_KEY),
        activeCompanyId
      );
      const mergedEmployees = mergeCurrentUserIntoEmployees(cachedEmployees, currentUser);
      return {
        employees: scopeEmployeesForCurrentUser(mergedEmployees, cachedTasks, currentUser, cachedStaffManagerLinks),
        tasks: cachedTasks,
        staffManagerLinks: cachedStaffManagerLinks
      };
    } finally {
      setLoading(false);
    }
  };

  const [tasks, setTasks] = useState<DealershipTask[]>(() =>
    parseCachedArray<DealershipTask>(TASKS_CACHE_KEY)
  );
  const tasksRef = useRef<DealershipTask[]>(tasks);
  const recurringReopenInFlightRef = useRef(false);

  // Ref for fetchTasks to prevent infinite loop
  const fetchTasksRef = useRef(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Extract fetchTasks logic as useCallback to prevent stale closures
  const fetchTasks = useCallback(async () => {
    try {
      
      const activeCompanyId = currentUser?.company_id || null;

      // Fetch employees from Supabase (company-scoped when available)
      let employeesQuery = supabase
        .from('employees')
        .select('*');

      if (activeCompanyId) {
        employeesQuery = employeesQuery.eq('company_id', activeCompanyId);
      }

      const { data: employeesData, error: employeesError } = await employeesQuery;

      // Fetch tasks from Supabase with role + company filtering
      let tasksQuery = supabase.from('tasks').select('*');

      if (activeCompanyId) {
        tasksQuery = tasksQuery.eq('company_id', activeCompanyId);
      }
      tasksQuery = tasksQuery.in('status', ['pending', 'in_progress', 'in-progress', 'overdue', 'completed']);
      
      // Apply role-based filtering using all known IDs for the active user profile.
      tasksQuery = applyTaskVisibilityFilter(tasksQuery, currentUser, (employeesData || []) as Employee[]);
      
      const { data: tasksData, error: tasksError } = await tasksQuery;
      
      if (tasksError) {
        console.error('❌ Failed to fetch tasks:', tasksError);
      } else {
        const freshTasks = transformTasksToApp((tasksData || []) as DatabaseTask[]);
        setTasks(freshTasks);
      }
    } catch (err) {
      console.error('🚨 Unexpected error fetching tasks:', err);
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.company_id]); // Keep scoped to active user/company

  // Keep ref updated with latest fetchTasks function
  useEffect(() => {
    fetchTasksRef.current = fetchTasks;
  }, [fetchTasks]);

  // --- ROBUST SYNCHRONIZATION EFFECT ---
  useEffect(() => {
    // Check for existing auth session on app load
    const checkAuthSession = async () => {
      try {
        const { data: { session }, error } = await supabaseAuth.getSession();

        if (error) {
          console.error('Error fetching auth session:', error);
          return;
        }

        if (!session?.user) {
          // Prevent stale cached profile from bypassing login after refresh.
          setCurrentUser(null);
          localStorage.removeItem(USER_CACHE_KEY);
          localStorage.removeItem(EMPLOYEES_CACHE_KEY);
          localStorage.removeItem(TASKS_CACHE_KEY);
          localStorage.removeItem(STAFF_MANAGER_LINKS_CACHE_KEY);
          return;
        }

        const authUserId = session.user.id;

        const resolvedProfile = await resolveEmployeeProfileFromAuthUser(session.user);

        if (resolvedProfile) {
          setCurrentUser(resolvedProfile);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(resolvedProfile));
          return;
        }

        const fallbackUser = toFallbackEmployeeFromAuthUser(session.user);
        const syncedFallbackUser = await syncEmployeeProfileToDatabase(fallbackUser, session.user.id);
        const nextUser = syncedFallbackUser || fallbackUser;

        if (
          currentUser &&
          String(currentUser.email || '').toLowerCase() === String(nextUser.email || '').toLowerCase() &&
          currentUser.role !== 'staff'
        ) {
          return;
        }

        setCurrentUser(nextUser);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextUser));
      } catch (err) {
        console.error('Auth session check error:', err);
      } finally {
        setLoading(false);
      }
    };

    checkAuthSession();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setEmployees([]);
      setStaffManagerLinks([]);
      setTasks([]);
      return;
    }

    // Initial Load for the active logged-in user/company
    loadInitialData(false).then(data => {
      if (data) {
        setEmployees(data.employees);
        setStaffManagerLinks(data.staffManagerLinks || []);
        setTasks(data.tasks);
      }
    });
  }, [currentUser?.id, currentUser?.company_id, currentUser?.role]);

  useEffect(() => {
    const normalizedTab = resolveActiveTabForRole(activeTab, currentUser?.role);

    if (normalizedTab !== activeTab) {
      setActiveTab(normalizedTab);
      return;
    }

    if (typeof window === 'undefined') return;

    const normalizedUserId = String(currentUser?.id || '').trim();
    const perUserTabKey = normalizedUserId
      ? `${ACTIVE_TAB_CACHE_KEY}:${normalizedUserId}`
      : ACTIVE_TAB_CACHE_KEY;

    try {
      localStorage.setItem(ACTIVE_TAB_CACHE_KEY, normalizedTab);
      localStorage.setItem(perUserTabKey, normalizedTab);
    } catch {
      // Ignore local storage write failures so tab navigation remains functional.
    }
  }, [activeTab, currentUser?.id, currentUser?.role]);

  // --- REALTIME SUBSCRIPTION FOR TASKS ---
  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    const companyFilter = currentUser.company_id ? `company_id=eq.${currentUser.company_id}` : undefined;
    const taskChangeFilter: { schema: 'public'; table: 'tasks'; filter?: string } = {
      schema: 'public',
      table: 'tasks',
      ...(companyFilter ? { filter: companyFilter } : {}),
    };
    const taskScopeIdsForRealtime = buildTaskScopeIds(currentUser, employees);
    const triggerRealtimeTasksRefetch = () => {
      const now = Date.now();
      if (now - lastRealtimeTasksRefetchAtRef.current < 700) {
        return;
      }
      lastRealtimeTasksRefetchAtRef.current = now;
      const refetchTasks = fetchTasksRef.current as null | (() => Promise<void>);
      if (refetchTasks) {
        void refetchTasks();
      }
    };

    const taskListener = supabase
      .channel(`public:tasks:${currentUser.company_id || 'all'}:${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', ...taskChangeFilter }, async (payload) => {
        try {
          const payloadTaskId = String((payload.new as any)?.id || '');
          if (!payloadTaskId) {
            console.warn('Realtime INSERT payload missing task id:', payload);
            return;
          }

          const payloadRow = (payload.new || {}) as DatabaseTask;
          if (!isTaskVisibleToUser(payloadRow, currentUser, taskScopeIdsForRealtime)) {
            triggerRealtimeTasksRefetch();
            return;
          }

          // Apply realtime row immediately so UI updates without waiting for refetch.
          const optimisticTask = transformTaskToApp(payloadRow);
          setTasks(prev => upsertTaskAtTop(prev, optimisticTask as DealershipTask));

          // Step 1: Fetch the raw task
          const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', payloadTaskId)
            .single();
          
          if (taskError || !task) {
            console.warn('Realtime INSERT: using payload fallback; failed to refetch full task row.', taskError);
            return;
          }

          // Step 2: Fetch assignee if exists
          let assignee = null;
          const taskAssignedTo = (task as any).assignedTo ?? (task as any).assigned_to;
          if (taskAssignedTo) {
            const { data: assigneeData, error: assigneeError } = await supabase
              .from('employees')
              .select('*')
              .eq('id', taskAssignedTo)
              .single();
            
            if (!assigneeError && assigneeData) {
              assignee = assigneeData;
            }
          }

          // Step 3: Fetch assigner if exists
          let assigner = null;
          const taskAssignedBy = (task as any).assignedBy ?? (task as any).assigned_by;
          if (taskAssignedBy) {
            const { data: assignerData, error: assignerError } = await supabase
              .from('employees')
              .select('*')
              .eq('id', taskAssignedBy)
              .single();
            
            if (!assignerError && assignerData) {
              assigner = assignerData;
            }
          }

          // Step 4: Transform database task to app task and combine with user data
          const appTask = transformTaskToApp(task as DatabaseTask);
          const richTask = {
            ...appTask,
            assignedTo_user: assignee,
            assigned_by_user: assigner
          };

          setTasks(prev => upsertTaskAtTop(prev, richTask as DealershipTask));

        } catch (err) {
          console.error('🚨 Error in realtime INSERT handler:', err);
          triggerRealtimeTasksRefetch();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', ...taskChangeFilter }, async (payload) => {
        try {
          const payloadTaskId = String((payload.new as any)?.id || '');
          if (!payloadTaskId) {
            console.warn('Realtime UPDATE payload missing task id:', payload);
            return;
          }

          const payloadRow = (payload.new || {}) as DatabaseTask;
          if (!isTaskVisibleToUser(payloadRow, currentUser, taskScopeIdsForRealtime)) {
            triggerRealtimeTasksRefetch();
            return;
          }

          // Apply realtime row immediately; later refetch enriches employee lookups.
          const optimisticTask = transformTaskToApp(payloadRow);
          setTasks(prev => upsertTaskInPlace(prev, optimisticTask as DealershipTask));

          if (payloadTaskId) {
            const payloadRemarks = normalizeRealtimeRemarks((payload.new as any)?.remarks, payloadTaskId);
            if (payloadRemarks) {
              setTasks((prev) =>
                prev.map((task) =>
                  task.id === payloadTaskId
                    ? { ...task, remarks: payloadRemarks }
                    : task
                )
              );
            }
          }

          // Step 1: Fetch the raw task
          const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', payloadTaskId)
            .single();
          
          if (taskError || !task) {
            console.warn('Realtime UPDATE fallback applied; failed to refetch full task row.', taskError);
            return;
          }

          // Step 2: Fetch assignee if exists
          let assignee = null;
          const taskAssignedTo = (task as any).assignedTo ?? (task as any).assigned_to;
          if (taskAssignedTo) {
            const { data: assigneeData, error: assigneeError } = await supabase
              .from('employees')
              .select('*')
              .eq('id', taskAssignedTo)
              .single();
            
            if (!assigneeError && assigneeData) {
              assignee = assigneeData;
            }
          }

          // Step 3: Fetch assigner if exists
          let assigner = null;
          const taskAssignedBy = (task as any).assignedBy ?? (task as any).assigned_by;
          if (taskAssignedBy) {
            const { data: assignerData, error: assignerError } = await supabase
              .from('employees')
              .select('*')
              .eq('id', taskAssignedBy)
              .single();
            
            if (!assignerError && assignerData) {
              assigner = assignerData;
            }
          }

          // Step 4: Transform database task to app task and combine with user data
          const appTask = transformTaskToApp(task as DatabaseTask);
          const richTask = {
            ...appTask,
            assignedTo_user: assignee,
            assigned_by_user: assigner
          };

          setTasks(prev => upsertTaskInPlace(prev, richTask as DealershipTask));

        } catch (err) {
          console.error('🚨 Error in realtime UPDATE handler:', err);
          triggerRealtimeTasksRefetch();
        }
      })
      .on('postgres_changes', { event: 'DELETE', ...taskChangeFilter }, (payload) => {
        const deletedTaskId = payload.old.id;
        setTasks(prev => prev.filter(task => task.id !== deletedTaskId));
        triggerRealtimeTasksRefetch();
      })
      .subscribe();

    // Cleanup subscription when component unmounts
    return () => {
      supabase.removeChannel(taskListener);
    };
  }, [currentUser?.id, currentUser?.company_id, currentUser?.role, currentUser?.auth_user_id, employees]);

  const reopenDueRecurringTasks = useCallback(async () => {
    if (!currentUser?.id || recurringReopenInFlightRef.current) {
      return;
    }

    const companyId = String(currentUser.company_id || '').trim();
    const visibleScopeIds = new Set(buildTaskScopeIds(currentUser, employees));
    const nowMs = Date.now();
    const dueTasks = tasksRef.current.filter((task) => {
      if (String(task.status || '').toLowerCase() !== 'completed') {
        return false;
      }

      const recurrence = resolveRecurringFrequencyForTask(task);
      if (!recurrence) {
        return false;
      }

      const nextRaw =
        (task as any).nextRecurrenceNotificationAt ?? (task as any).next_recurrence_notification_at;
      const nextAt = toOptionalTimestampNumber(nextRaw);
      if (!nextAt || nextAt > nowMs) {
        return false;
      }

      if (companyId) {
        const taskCompanyId = String(task.company_id || '').trim();
        if (taskCompanyId && taskCompanyId !== companyId) {
          return false;
        }
      }

      if (visibleScopeIds.size > 0 && currentUser.role !== 'owner' && currentUser.role !== 'super_admin') {
        const assignedTo = String(task.assignedTo || '').trim();
        const assignedBy = String(task.assignedBy || '').trim();
        const visibleToUser = Array.from(visibleScopeIds).some((id) => id === assignedTo || id === assignedBy);
        if (!visibleToUser) {
          return false;
        }
      }

      return true;
    });

    if (!dueTasks.length) {
      return;
    }

    recurringReopenInFlightRef.current = true;
    const reopenedById = new Map<string, number | null>();

    try {
      for (const task of dueTasks) {
        const recurrence = resolveRecurringFrequencyForTask(task);
        if (!recurrence) {
          continue;
        }

        const nextReminderAt = computeNextRecurrenceNotificationAt(nowMs, recurrence);
        const snakePayload: Record<string, unknown> = {
          status: 'pending' as TaskStatus,
          completedAt: null,
          proof: null,
          next_recurrence_notification_at: nextReminderAt,
        };

        let updateQuery = supabase.from('tasks').update(snakePayload).eq('id', task.id);
        if (companyId) {
          updateQuery = updateQuery.eq('company_id', companyId);
        }
        let { error: reopenError } = await updateQuery;

        if (reopenError && isMissingNextRecurrenceNotificationColumnError(reopenError)) {
          const camelPayload: Record<string, unknown> = {
            status: 'pending' as TaskStatus,
            completedAt: null,
            proof: null,
            nextRecurrenceNotificationAt: nextReminderAt,
          };
          let camelQuery = supabase.from('tasks').update(camelPayload).eq('id', task.id);
          if (companyId) {
            camelQuery = camelQuery.eq('company_id', companyId);
          }
          const retryResult = await camelQuery;
          reopenError = retryResult.error;
        }

        if (reopenError) {
          console.warn('Failed to reopen due recurring task:', reopenError);
          continue;
        }

        reopenedById.set(task.id, nextReminderAt);
      }
    } finally {
      recurringReopenInFlightRef.current = false;
    }

    if (!reopenedById.size) {
      return;
    }

    setTasks((prev) =>
      prev.map((task) => {
        if (!reopenedById.has(task.id)) {
          return task;
        }

        return {
          ...task,
          status: 'pending' as TaskStatus,
          completedAt: undefined,
          proof: undefined,
          nextRecurrenceNotificationAt: reopenedById.get(task.id) ?? task.nextRecurrenceNotificationAt ?? null,
        };
      })
    );
  }, [currentUser?.id, currentUser?.company_id, currentUser?.role, employees]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    void reopenDueRecurringTasks();

    const intervalId = window.setInterval(() => {
      void reopenDueRecurringTasks();
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, reopenDueRecurringTasks]);

  // --- APP RESUME LISTENERS FOR TASK SYNC ---
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const triggerForegroundRefresh = (reason: 'focus' | 'visibility') => {
      const now = Date.now();
      // Browsers often fire both visibility + focus together; collapse to one refresh.
      if (now - lastForegroundRefreshAtRef.current < 1200) {
        return;
      }

      lastForegroundRefreshAtRef.current = now;
      // Keep foreground refresh silent so transient focus changes (e.g. file picker) do not
      // remount the app and wipe in-progress form state.
      loadInitialData(true).then(data => {
        if (data) {
          setEmployees(data.employees);
          setStaffManagerLinks(data.staffManagerLinks || []);
          setTasks(data.tasks);
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundRefresh('visibility');
      }
    };

    const handleFocus = () => {
      triggerForegroundRefresh('focus');
    };


    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Cleanup event listeners when component unmounts
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.id, currentUser?.company_id, currentUser?.role]);

  // --- 3. EFFECTS (Notifications & Auto-Save) ---

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setAppReady(true);
  }, []);

  // Auto-Save Tasks
  useEffect(() => {
    if (appReady) {
      localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
    }
  }, [tasks, appReady]);

  useEffect(() => {
    if (appReady) {
      localStorage.setItem(EMPLOYEES_CACHE_KEY, JSON.stringify(employees));
    }
  }, [employees, appReady]);

  useEffect(() => {
    if (appReady) {
      localStorage.setItem(STAFF_MANAGER_LINKS_CACHE_KEY, JSON.stringify(staffManagerLinks));
    }
  }, [staffManagerLinks, appReady]);

  // Notifications Logic
  useEffect(() => {
    if (currentUser && tasks.length > 0) {
      const lastSeen = parseInt(localStorage.getItem(`last_seen_${currentUser.id}`)) || 0;
      const newTasks = tasks.filter(t => t.assignedTo === currentUser.id && t.createdAt > lastSeen && t.status === 'pending');
      
      if (newTasks.length > 0) {
        const lastTask = newTasks[0];
        setNotification({
          title: "New Assignment",
          message: `New task assigned: ${lastTask.description}`
        });
        // Update lastSeen timestamp to prevent duplicate notifications
        localStorage.setItem(`last_seen_${currentUser.id}`, Date.now().toString());
      }
    }
  }, [currentUser, appReady, tasks]);

  useEffect(() => {
    if (!currentUser?.id) {
      setUserNotifications([]);
      setShowNotificationsPanel(false);
      return;
    }

    void loadUserNotifications();

    const channel = supabase
      .channel(`web-notifications-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          void loadUserNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.id, loadUserNotifications]);

  const markAllNotificationsAsRead = useCallback(async () => {
    if (!currentUser?.id) return;

    setUserNotifications((prev) =>
      prev.map((item) => (item.is_read ? item : { ...item, is_read: true }))
    );

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUser.id)
      .eq('is_read', false);

    if (error) {
      console.warn('Failed to mark all notifications as read:', error);
      void loadUserNotifications();
    }
  }, [currentUser?.id, loadUserNotifications]);

  const markNotificationAsRead = async (notificationId: string) => {
    if (!currentUser?.id) return;

    setUserNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId ? { ...item, is_read: true } : item
      )
    );

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', currentUser.id);

    if (error) {
      console.warn('Failed to mark notification as read:', error);
      void loadUserNotifications();
    }
  };

  const clearAllNotifications = useCallback(async () => {
    if (!currentUser?.id || userNotifications.length === 0) return;

    const previousNotifications = userNotifications;
    setUserNotifications([]);

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', currentUser.id);

    if (error) {
      console.warn('Failed to clear notifications:', error);
      setUserNotifications(previousNotifications);
      void loadUserNotifications();
      return;
    }

    toast.success('All notifications cleared');
  }, [currentUser?.id, userNotifications, loadUserNotifications]);

  const toggleNotificationsPanel = () => {
    const isOpening = !showNotificationsPanel;
    setShowNotificationsPanel(isOpening);

    if (isOpening) {
      void markAllNotificationsAsRead();
    }
  };

  const handleTasksTabClick = () => {
    if (activeTab === AppTab.TASKS) {
      setTasksTabReselectSignal((prev) => prev + 1);
      return;
    }

    setActiveTab(AppTab.TASKS);
  };

  // --- 4. CORE ACTIONS (Add, Delete, Complete) ---

  const awardTaskCompletionPoints = async (task: DealershipTask | undefined): Promise<void> => {
    const assigneeId = String(task?.assignedTo || '').trim();
    if (!assigneeId) {
      return;
    }

    const { error: pointsError } = await supabase.rpc('increment_points', {
      user_id: assigneeId,
      amount: 10,
    });

    if (pointsError) {
      console.error('Failed to award task completion points:', pointsError);
    }
  };

  const notifyTaskCreatorOfCompletion = async (task: DealershipTask | undefined, completedByName: string): Promise<void> => {
    const assignedById = String(task?.assignedBy || '').trim();
    if (!task || !assignedById) {
      return;
    }

    await sendTaskCompletionNotification(task.description, completedByName, assignedById);
  };

  const requestHighPriorityTaskClosure = async (
    task: DealershipTask,
    completion: { proof?: { imageUrl: string; timestamp: number } | null }
  ): Promise<boolean> => {
    if (!currentUser) {
      return false;
    }

    const approverId = String(task.assignedBy || '').trim();
    if (!approverId) {
      toast.error('No approver is assigned to this high priority task.');
      return false;
    }

    const approvalTitle = `High Priority Task Completion: ${task.description}`;
    const approvalDescription = `${currentUser.name} completed a high priority task and is requesting closure approval`;

    const { data: existingApproval, error: existingApprovalError } = await supabase
      .from('approvals')
      .select('id')
      .eq('task_id', task.id)
      .in('status', ['PENDING', 'NEEDS_REVIEW'])
      .maybeSingle();

    if (existingApprovalError) {
      console.error('Failed to check for an existing completion approval:', existingApprovalError);
    }

    if (existingApproval?.id) {
      if (task.status !== 'pending_approval') {
        const { error: existingTaskUpdateError } = await supabase
          .from('tasks')
          .update({
            status: 'pending_approval' as TaskStatus,
            completedAt: null,
            proof: completion.proof ?? task.proof ?? null,
          })
          .eq('id', task.id);

        if (existingTaskUpdateError) {
          toast.error(`Failed to submit approval request: ${existingTaskUpdateError.message}`);
          return false;
        }

        setTasks((prev) =>
          prev.map((existingTask) =>
            existingTask.id === task.id
              ? {
                  ...existingTask,
                  status: 'pending_approval' as TaskStatus,
                  completedAt: undefined,
                  proof: completion.proof ?? existingTask.proof,
                }
              : existingTask
          )
        );
      }

      toast.success('Sent for approval');
      return true;
    }

    const { data: createdApproval, error: approvalError } = await supabase
      .from('approvals')
      .insert({
        requester_id: currentUser.id,
        approver_id: approverId,
        title: approvalTitle,
        description: approvalDescription,
        amount: null,
        status: 'PENDING',
        task_id: task.id,
      })
      .select('id')
      .single();

    if (approvalError) {
      console.error('Failed to create high priority completion approval:', approvalError);
      toast.error(`Failed to submit approval request: ${approvalError.message}`);
      return false;
    }

    const taskUpdatePayload: Record<string, unknown> = {
      status: 'pending_approval' as TaskStatus,
      completedAt: null,
      proof: completion.proof ?? task.proof ?? null,
    };

    const { error: taskUpdateError } = await supabase
      .from('tasks')
      .update(taskUpdatePayload)
      .eq('id', task.id);

    if (taskUpdateError) {
      console.error('Failed to mark task as pending approval:', taskUpdateError);
      await supabase.from('approvals').delete().eq('id', createdApproval.id);
      toast.error(`Failed to submit approval request: ${taskUpdateError.message}`);
      return false;
    }

    setTasks((prev) =>
      prev.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              status: 'pending_approval' as TaskStatus,
              completedAt: undefined,
              proof: completion.proof ?? existingTask.proof,
            }
          : existingTask
      )
    );

    toast.success('Sent for approval');
    return true;
  };

  const finalizeTaskCompletion = async (
    task: DealershipTask,
    completion: { proof?: { imageUrl: string; timestamp: number } | null }
  ): Promise<boolean> => {
    const completionTimestamp = completion.proof?.timestamp || Date.now();
    const recurringFrequency = resolveRecurringFrequencyForTask(task);
    const nextRecurrenceNotificationAt = recurringFrequency
      ? computeNextRecurrenceNotificationAt(completionTimestamp, recurringFrequency)
      : null;

    const completionPayload: Record<string, unknown> = {
      status: 'completed' as TaskStatus,
      completedAt: completionTimestamp,
      proof: completion.proof ?? task.proof ?? null,
    };

    if (nextRecurrenceNotificationAt) {
      completionPayload.next_recurrence_notification_at = nextRecurrenceNotificationAt;
    }

    const { error: taskError } = await supabase
      .from('tasks')
      .update(completionPayload)
      .eq('id', task.id);

    if (taskError) {
      console.error('Error completing task:', taskError);
      toast.error(`Failed to complete task: ${taskError.message}`);
      return false;
    }

    const completedTaskPatch: Partial<DealershipTask> = {
      status: 'completed' as TaskStatus,
      completedAt: completionTimestamp,
      proof: completion.proof ?? task.proof ?? undefined,
    };

    if (nextRecurrenceNotificationAt) {
      completedTaskPatch.nextRecurrenceNotificationAt = nextRecurrenceNotificationAt;
    }

    setTasks((prev) =>
      upsertTaskInPlace(prev, {
        ...task,
        ...completedTaskPatch,
      } as DealershipTask)
    );

    await awardTaskCompletionPoints(task);
    if (currentUser) {
      void notifyTaskCreatorOfCompletion(task, currentUser.name);
    }

    return true;
  };

  const addTask = async (
    description: string,
    assignedTo?: string,
    parentTaskId?: string,
    deadline?: number,
    requirePhoto?: boolean,
    taskType: TaskType = 'one_time',
    recurrenceFrequency?: RecurrenceFrequency | null,
    priority: TaskPriority = 'Medium'
  ) => {
    if (!currentUser) return;
    if (!description.trim()) return;

    const normalizedTaskType: TaskType = taskType === 'recurring' ? 'recurring' : 'one_time';
    const normalizedPriority: TaskPriority =
      priority === 'High' || priority === 'Low' ? priority : 'Medium';
    const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
      normalizedTaskType === 'recurring' &&
      (recurrenceFrequency === 'daily' || recurrenceFrequency === 'weekly' || recurrenceFrequency === 'monthly')
        ? recurrenceFrequency
        : null;

    // Enforce recurrence requirements in app layer before DB constraints are evaluated.
    if (normalizedTaskType === 'recurring' && !normalizedRecurrenceFrequency) {
      toast.error('Select a recurrence frequency for recurring tasks.');
      return;
    }

    const now = Date.now();
    const newTask: DealershipTask = {
      id: `task-${now}`,
      description,
      status: 'pending',
      priority: normalizedPriority,
      taskType: normalizedTaskType,
      recurrenceFrequency: normalizedRecurrenceFrequency,
      nextRecurrenceNotificationAt:
        normalizedTaskType === 'recurring'
          ? computeNextRecurrenceNotificationAt(now, normalizedRecurrenceFrequency)
          : null,
      createdAt: now,
      deadline: deadline,
      requirePhoto: requirePhoto || false,
      assignedTo: assignedTo === 'none' ? undefined : assignedTo,
      assignedBy: currentUser.id,
      parentTaskId: parentTaskId,
      company_id: currentUser.company_id || '00000000-0000-0000-0000-000000000001' // Use user's company_id or default
    };

    try {
      // Transform app task to database format before inserting
      const dbTask = transformTaskToDB(newTask);

      const insertTaskPayload = async (payload: Record<string, any>) =>
        supabase
          .from('tasks')
          .insert([payload])
          .select('*')
          .maybeSingle();

      // Insert task with schema-tolerant retry order:
      // 1) snake_case recurrence fields
      // 2) camelCase recurrence fields
      // 3) remove next recurrence field
      // 4) remove recurrence fields entirely (legacy fallback)
      let insertPayload = dbTask as unknown as Record<string, any>;
      let { data, error } = await insertTaskPayload(insertPayload);

      if (error && isMissingTaskRecurrenceColumnError(error)) {
        insertPayload = toCamelTaskRecurrencePayload(insertPayload);
        const camelRetryResult = await insertTaskPayload(insertPayload);
        data = camelRetryResult.data as any;
        error = camelRetryResult.error as any;
      }

      if (error && isMissingNextRecurrenceNotificationColumnError(error)) {
        console.warn('Retrying task insert without next recurrence notification field...');
        insertPayload = stripTaskNextRecurrenceField(insertPayload);
        const nextRetryResult = await insertTaskPayload(insertPayload);
        data = nextRetryResult.data as any;
        error = nextRetryResult.error as any;

        if (!error) {
          toast.warning('Task saved, but recurring reminder scheduling needs DB migration to be fully available.');
        }
      }

      if (error && isMissingTaskRecurrenceColumnError(error)) {
        console.warn('Retrying task insert without recurrence fields...');
        insertPayload = stripTaskRecurrenceFields(insertPayload);
        const legacyResult = await insertTaskPayload(insertPayload);
        data = legacyResult.data as any;
        error = legacyResult.error as any;

        if (!error) {
          toast.warning('Task saved, but recurrence options need DB migration to be fully available.');
        }
      }

      if (error) {
        console.error('Error adding task to database:', error);
        toast.error(`Failed to save task: ${error.message}`);
        return;
      }

      if (!data) {
        // Some RLS setups allow INSERT but block RETURNING rows. Treat as success and sync tasks.
        const refetchTasks = fetchTasksRef.current as null | (() => Promise<void>);
        if (refetchTasks) {
          void refetchTasks();
        }
        return;
      }

      // Transform returned database task back to app format
      const appTask = transformTaskToApp(data as DatabaseTask);
      setTasks(prev => upsertTaskAtTop(prev, appTask));

      // Notification is secondary; we fire it in the background and DON'T await it
      // to ensure the UI remains responsive and the function completes successfully.
      void (async () => {
        try {
          if (appTask.assignedTo) {
            const assignedEmployee = employees.find((employee) => employee.id === appTask.assignedTo);
            
            // Send Push Notification
            await sendTaskAssignmentNotification(
              appTask.description,
              assignedEmployee?.name || 'Team Member',
              currentUser.name,
              appTask.assignedTo,
              appTask.company_id || currentUser.company_id || DEFAULT_COMPANY_ID
            );

          }
        } catch (notiError) {
          console.error('Background notification dispatch failed:', notiError);
        }
      })();
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error(`Failed to save task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const startTask = async (taskId: string) => {
    try {
      // Update task status in Supabase
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'in-progress' as TaskStatus })
        .eq('id', taskId);

      if (error) {
        console.error('Error starting task:', error);
        toast.error(`Failed to update task: ${error.message}`);
        return;
      }

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'in-progress' as TaskStatus }
          : t
      ));
    } catch (error) {
      console.error('Error starting task:', error);
      toast.error(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const reopenTask = async (taskId: string) => {
    try {
      // Update task status in Supabase
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'pending' as TaskStatus,
          completedAt: undefined,
          proof: undefined
        })
        .eq('id', taskId);

      if (error) {
        console.error('Error reopening task:', error);
        toast.error(`Failed to update task: ${error.message}`);
        return;
      }

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'pending' as TaskStatus, completedAt: undefined, proof: undefined }
          : t
      ));
    } catch (error) {
      console.error('Error reopening task:', error);
      toast.error(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const completeTask = async (taskId: string, proofData: { imageUrl: string, timestamp: number }) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        toast.error('Task not found.');
        return;
      }

      if (
        normalizeTaskPriority(task) === 'High' &&
        (currentUser?.role === 'staff' || currentUser?.role === 'manager')
      ) {
        await requestHighPriorityTaskClosure(task, { proof: proofData });
        return;
      }

      await finalizeTaskCompletion(task, { proof: proofData });
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const completeTaskWithoutPhoto = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        toast.error('Task not found.');
        return;
      }

      if (
        normalizeTaskPriority(task) === 'High' &&
        (currentUser?.role === 'staff' || currentUser?.role === 'manager')
      ) {
        await requestHighPriorityTaskClosure(task, { proof: null });
        return;
      }

      await finalizeTaskCompletion(task, { proof: null });
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const reassignTask = async (taskId: string, newAssigneeId: string) => {
    try {
      // Update task assignment in Supabase using camelCase
      const { error } = await supabase
        .from('tasks')
        .update({ assignedTo: newAssigneeId })
        .eq('id', taskId);

      if (error) {
        console.error('Error reassigning task:', error);
        toast.error(`Failed to reassign task: ${error.message}`);
        return;
      }

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, assignedTo: newAssigneeId } : t
      ));
    } catch (error) {
      console.error('Error reassigning task:', error);
      toast.error(`Failed to reassign task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      // Delete task from Supabase
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) {
        console.error('Error deleting task:', error);
        toast.error(`Failed to delete task: ${error.message}`);
        return;
      }

      // Update local state
      const subTasks = tasks.filter(t => t.parentTaskId === taskId);
      setTasks(prev => prev.filter(t =>
        t.id !== taskId && !subTasks.some(st => st.id === t.id)
      ));
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const updateTaskRemarks = (taskId: string, remarks: TaskRemark[]) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? { ...task, remarks }
          : task
      )
    );
  };

  const updateStaffManagers = async (staffId: string, managerIds: string[]): Promise<boolean> => {
    if (!currentUser) {
      return false;
    }

    const companyId = String(currentUser.company_id || DEFAULT_COMPANY_ID).trim();
    const normalizedStaffId = String(staffId || '').trim();
    if (!normalizedStaffId) {
      return false;
    }

    const normalizedManagerIds = Array.from(
      new Set(
        (managerIds || [])
          .map((managerId) => String(managerId || '').trim())
          .filter(Boolean)
      )
    );


    try {
      let staffManagerLinksUnavailable = false;

      // Delete existing links first
      const { error: deleteLinksError } = await supabase
        .from('staff_manager_links')
        .delete()
        .eq('company_id', companyId)
        .eq('staff_id', normalizedStaffId);

      if (deleteLinksError && !isMissingRelationError(deleteLinksError)) {
        console.error('Failed to clear existing staff-manager links:', deleteLinksError);
        toast.error(`Failed to update manager links: ${deleteLinksError.message}`);
        return false;
      }

      if (deleteLinksError && isMissingRelationError(deleteLinksError)) {
        staffManagerLinksUnavailable = true;
        console.warn('staff_manager_links table not available, falling back to employees.manager_id only.');
      }

      // Small delay to ensure delete is committed before insert
      await new Promise(resolve => setTimeout(resolve, 100));

      // Insert all new links
      if (normalizedManagerIds.length > 0 && !staffManagerLinksUnavailable) {
        const rows = normalizedManagerIds.map((managerId) => ({
          company_id: companyId,
          staff_id: normalizedStaffId,
          manager_id: managerId,
        }));


        const { data: insertedData, error: upsertLinksError } = await supabase
          .from('staff_manager_links')
          .upsert(rows, { onConflict: 'company_id,staff_id,manager_id' })
          .select();

        if (upsertLinksError && !isMissingRelationError(upsertLinksError)) {
          console.error('Failed to upsert staff-manager links:', upsertLinksError);
          toast.error(`Failed to update manager links: ${upsertLinksError.message}`);
          return false;
        }

        if (upsertLinksError && isMissingRelationError(upsertLinksError)) {
          staffManagerLinksUnavailable = true;
          console.warn('staff_manager_links table not available during upsert, falling back to employees.manager_id only.');
        }

      }

      // Update primary manager in employees table
      const primaryManagerId = normalizedManagerIds[0] || null;
      const { error: updateEmployeeError } = await supabase
        .from('employees')
        .update({ manager_id: primaryManagerId })
        .eq('id', normalizedStaffId)
        .eq('company_id', companyId);

      if (updateEmployeeError && !isMissingColumnError(updateEmployeeError)) {
        console.warn('Failed to update employee.manager_id after manager-link sync:', updateEmployeeError);
        toast.error(`Failed to update manager assignment: ${updateEmployeeError.message}`);
        return false;
      }

      // Update local state immediately
      const nowIso = new Date().toISOString();
      setStaffManagerLinks((prev) => {
        const remaining = prev.filter(
          (link) =>
            !(
              String(link.company_id || '').trim() === companyId &&
              String(link.staff_id || '').trim() === normalizedStaffId
            )
        );

        const nextLinks = normalizedManagerIds.map((managerId) => ({
          company_id: companyId,
          staff_id: normalizedStaffId,
          manager_id: managerId,
          created_at: nowIso,
          updated_at: nowIso,
        }));

        const newLinks = staffManagerLinksUnavailable ? remaining : [...remaining, ...nextLinks];
        return newLinks;
      });

      // Also update employees state with the new manager_id
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === normalizedStaffId
            ? { ...employee, manager_id: primaryManagerId }
            : employee
        )
      );

      // Force a refresh to ensure all managers see the updated staff list
      if (!staffManagerLinksUnavailable) {
        setTimeout(async () => {
          const { data: refreshedLinks } = await supabase
            .from('staff_manager_links')
            .select('*')
            .eq('company_id', companyId)
            .eq('staff_id', normalizedStaffId);
          
          if (refreshedLinks && refreshedLinks.length > 0) {
            setStaffManagerLinks((prev) => {
              const otherLinks = prev.filter(
                (link) =>
                  !(
                    String(link.company_id || '').trim() === companyId &&
                    String(link.staff_id || '').trim() === normalizedStaffId
                  )
              );
              return [...otherLinks, ...(refreshedLinks as StaffManagerLink[])];
            });
          }
        }, 500);
      }

      if (staffManagerLinksUnavailable) {
        toast.warning('Multi-manager links table not found. Saved primary manager assignment only.');
      } else {
      }

      return true;
    } catch (error) {
      console.error('Unexpected error updating staff-manager links:', error);
      toast.error(`Failed to update manager links: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const toIndianE164 = (rawMobile: string): string => {
    let digits = String(rawMobile || '').replace(/\D/g, '');
    digits = digits.replace(/^0+/, '');
    if (digits.startsWith('91') && digits.length > 10) {
      digits = digits.slice(2);
    }
    if (digits.length > 10) {
      digits = digits.slice(-10);
    }
    return `+91${digits}`;
  };

  const addEmployee = async (
    name: string,
    mobile: string,
    role: UserRole = 'staff',
    managerId?: string | null
  ) => {
    if (!currentUser) return;

    const formattedMobile = toIndianE164(mobile);
    const mobileDigits = formattedMobile.replace(/^\+91/, '');
    if (mobileDigits.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    const newEmployee: Employee = {
      id: `emp-${Date.now()}`,
      name,
      mobile: formattedMobile,
      role,
      email: `${formattedMobile}@taskpro.local`,
      company_id: currentUser.company_id || DEFAULT_COMPANY_ID,
      manager_id:
        role === 'staff'
          ? (managerId || (currentUser.role === 'manager' ? currentUser.id : null))
          : null
    };


    // Add to local state immediately for instant UI feedback
    setEmployees(prev => [...prev, newEmployee]);

    try {
      const { data, error } = await supabase
        .from('employees')
        .insert([newEmployee])
        .select()
        .maybeSingle();

      if (error) {
        console.error('Error adding employee to database:', error);
        toast.error(`Database Error: ${error.message}. Employee added locally.`);
      } else if (data) {
        setEmployees(prev => prev.map(e => e.id === newEmployee.id ? data as Employee : e));
      }
    } catch (error) {
      console.error('Unexpected error adding employee:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Employee added locally.`);
    }
  };

  const removeEmployee = async (id: string) => {
    const normalizedEmployeeId = String(id || '').trim();
    const employeeToDelete = employees.find(
      (employee) => String(employee.id || '').trim() === normalizedEmployeeId
    );
    if (!employeeToDelete) {
      toast.error('Employee not found.');
      return;
    }

    const normalizedCurrentUserId = String(currentUser?.id || '').trim();
    if (String(employeeToDelete.id || '').trim() === normalizedCurrentUserId) {
      toast.error('You cannot delete your own account.');
      return;
    }

    const resolvedCompanyId = String(
      employeeToDelete.company_id || currentUser?.company_id || DEFAULT_COMPANY_ID
    ).trim();

    const isSuperAdminOrOwner =
      currentUser?.role === 'super_admin' || currentUser?.role === 'owner';
    const isManagerLinkedViaJunction =
      currentUser?.role === 'manager' &&
      employeeToDelete.role === 'staff' &&
      staffManagerLinks.some(
        (link) =>
          String(link.staff_id || '').trim() === normalizedEmployeeId &&
          String(link.manager_id || '').trim() === normalizedCurrentUserId &&
          (!String(link.company_id || '').trim() || String(link.company_id || '').trim() === resolvedCompanyId)
      );
    const isManagerDeletingOwnStaff =
      currentUser?.role === 'manager' &&
      employeeToDelete.role === 'staff' &&
      String(employeeToDelete.manager_id || '').trim() === normalizedCurrentUserId;

    if (!isSuperAdminOrOwner && !isManagerDeletingOwnStaff && !isManagerLinkedViaJunction) {
      toast.error('You can only delete staff members from your own team.');
      return;
    }

    try {
      // Delete employee from Supabase
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', normalizedEmployeeId)
        .eq('company_id', resolvedCompanyId);

      if (error) {
        console.error('❌ Error removing employee from database:', error);
        toast.error(`Database Error: ${error.message}`);
      } else {
        setEmployees((prev) =>
          prev.filter((employee) => String(employee.id || '').trim() !== normalizedEmployeeId)
        );
        setStaffManagerLinks((prev) =>
          prev.filter((link) => String(link.staff_id || '').trim() !== normalizedEmployeeId)
        );
        toast.success('Employee deleted successfully');
      }
    } catch (error) {
      console.error('🚨 Unexpected error removing employee:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleLogin = async (user: Employee) => {
    const normalizedInputUser = normalizeEmployeeProfile(user);

    try {
      const rawCachedUser = localStorage.getItem(USER_CACHE_KEY);
      if (rawCachedUser) {
        const previousUser = JSON.parse(rawCachedUser) as Partial<Employee>;
        if (previousUser?.company_id && normalizedInputUser.company_id && previousUser.company_id !== normalizedInputUser.company_id) {
          localStorage.removeItem(EMPLOYEES_CACHE_KEY);
          localStorage.removeItem(TASKS_CACHE_KEY);
          localStorage.removeItem(STAFF_MANAGER_LINKS_CACHE_KEY);
        }
      }
    } catch {
      // Ignore cache parse issues and continue login flow.
    }

    setCurrentUser(normalizedInputUser);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedInputUser));
    setActiveTab(resolveActiveTabForRole(readPersistedActiveTab(normalizedInputUser.id), normalizedInputUser.role));

    try {
      const { data: { session } } = await supabaseAuth.getSession();
      if (!session?.user) {
        return;
      }

      const { data: employeeData, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', session.user.id)
        .eq('company_id', normalizedInputUser.company_id || DEFAULT_COMPANY_ID)
        .maybeSingle();

      if (employeeData) {
        const normalizedEmployeeData = normalizeEmployeeProfile(employeeData as Employee);
        setCurrentUser(normalizedEmployeeData);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedEmployeeData));
        return;
      }

      const syncedUser = await syncEmployeeProfileToDatabase({
        ...normalizedInputUser,
        id: session.user.id,
      }, session.user.id);

      if (syncedUser) {
        setCurrentUser(syncedUser);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(syncedUser));
        return;
      }

      if (error) {
        console.warn('Using provided login profile because employee lookup failed.', error);
      }
    } catch (err) {
      console.warn('Login profile sync skipped due to session/profile fetch error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await supabaseAuth.signOut();
    } catch (error) {
      console.warn('Auth sign-out failed, clearing local session anyway.', error);
    } finally {
      setCurrentUser(null);
      setShowNotificationsPanel(false);
      setUserNotifications([]);
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(EMPLOYEES_CACHE_KEY);
      localStorage.removeItem(TASKS_CACHE_KEY);
      localStorage.removeItem(STAFF_MANAGER_LINKS_CACHE_KEY);
    }
  };

  // --- 5. RENDER UI ---

  if (!appReady) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center text-slate-900 p-8 overflow-x-hidden">
          <Loader2 className="w-12 h-12 text-slate-800 animate-spin mb-4" />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Starting App...</p>
        </div>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <ErrorBoundary>
        <div className="flex flex-col min-h-screen w-full max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto bg-slate-50 items-center justify-center p-8 relative overflow-hidden font-sans">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-slate-800 animate-spin mx-auto mb-4" />
            <p className="text-slate-900 text-lg font-semibold">Loading data...</p>
            <p className="text-slate-500 text-sm mt-2">Please wait while we connect to the database</p>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (loadError) {
    return (
      <ErrorBoundary>
        <div className="flex flex-col min-h-screen w-full max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto bg-red-600 items-center justify-center p-8 relative overflow-hidden font-sans">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-white text-2xl font-bold mb-4">Database Connection Error</h1>
            <div className="bg-red-800 rounded-lg p-4 mb-4 text-left">
              <p className="text-red-100 text-sm font-mono break-all">{loadError}</p>
            </div>
            <p className="text-red-100 text-sm">Please check your internet connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 bg-white text-red-600 px-6 py-3 rounded-lg font-semibold hover:bg-red-50 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (!currentUser) {
    return (
      <ErrorBoundary>
        <LoginScreen employees={employees} onLogin={handleLogin} />
      </ErrorBoundary>
    );
  }

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin' || currentUser.role === 'owner';
  const isSuperAdmin = currentUser.role === 'super_admin';
  const scopedEmployees = scopeEmployeesForCurrentUser(employees, tasks, currentUser, staffManagerLinks);

  return (
    <ErrorBoundary>
      <div className="min-h-screen w-full bg-[var(--surface)] overflow-x-hidden">
        <div className="flex flex-col min-h-screen w-full max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto bg-[var(--surface)] relative overflow-hidden font-sans sm:shadow-2xl sm:rounded-[2rem] sm:border sm:border-[var(--border)] sm:my-8">

      {/* Notification Banner */}
      {notification && (
        <div
          className="fixed left-2 right-2 max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto z-[100] animate-in slide-in-from-top-4 duration-500"
          style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
        >
          <div className="bg-white text-slate-900 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[var(--border)] flex items-center gap-4">
            <div className="bg-[var(--accent)] p-2 rounded-xl">
              <Bell className="w-5 h-5 animate-bounce text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="section-kicker">{notification.title}</p>
              <p className="text-sm font-bold truncate">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/95 backdrop-blur text-slate-900 px-4 py-4 sm:px-6 pt-safe-top sticky top-0 z-30 flex items-center justify-between shadow-sm border-b border-[var(--border)]" style={{ paddingTop: 'max(3rem, 1.25rem)' }}>
        <div className="flex items-center gap-2">
          <div className="bg-[var(--accent)] p-2 rounded-[1rem] shadow-[0_4px_14px_rgba(79,70,229,0.15)]">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter italic leading-none text-slate-900">OpenTask</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="font-ui-mono text-[8px] font-medium uppercase tracking-[0.22em] text-[var(--ink-3)]">
                {isSyncing ? 'Syncing...' : 'Online'}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <button
            onClick={toggleNotificationsPanel}
            className="p-2.5 bg-[var(--surface-2)] hover:bg-slate-200 rounded-2xl text-slate-600 transition-all border border-[var(--border)] relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="font-ui-mono absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[var(--red)] text-white text-[9px] font-medium rounded-full flex items-center justify-center border border-white">
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black leading-none text-slate-900">{currentUser.name}</p>
            <p className="font-ui-mono text-[9px] text-[var(--accent)] uppercase font-medium tracking-[0.22em] mt-0.5">{getRoleLabel(currentUser.role)}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-[var(--surface-2)] hover:bg-slate-200 rounded-2xl text-slate-600 transition-all border border-[var(--border)]"
          >
            <LogOut className="w-4 h-4" />
          </button>
          {showNotificationsPanel && (
            <div className="absolute right-0 top-full mt-2 w-[300px] max-w-[calc(100vw-1rem)] max-h-[360px] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.10)] z-50 p-2">
              <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 mb-1">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Notifications</p>
                <div className="flex items-center gap-2">
                  {userNotifications.length > 0 && (
                    <button
                      onClick={() => void clearAllNotifications()}
                      className="text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:border-slate-300"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotificationsPanel(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {notificationsLoading ? (
                <div className="px-3 py-4 text-xs text-slate-500">Loading...</div>
              ) : userNotifications.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-500">No notifications yet.</div>
              ) : (
                <div className="space-y-1">
                  {userNotifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => void markNotificationAsRead(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                        item.is_read
                          ? 'bg-white border-slate-100'
                          : 'bg-indigo-50 border-indigo-100'
                      }`}
                    >
                      <p className={`text-xs font-bold ${item.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{item.title}</p>
                      <p className={`text-xs mt-0.5 ${item.is_read ? 'text-slate-500' : 'text-slate-700'}`}>{item.body}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatNotificationTimeAgo(item.created_at)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 px-4 sm:px-6 lg:px-8 pt-5 w-full bg-[var(--surface)]">
        {/* Hidden: Business Overview Content */}
        {/* {activeTab === AppTab.DASHBOARD && (
          <StatsScreen
            tasks={tasks}
            currentUser={currentUser}
            employees={employees}
          />
        )} */}

        {activeTab === AppTab.TASKS && (
          <Dashboard
            tasks={tasks}
            employees={scopedEmployees}
            currentUser={currentUser}
            tasksTabReselectSignal={tasksTabReselectSignal}
            onAddTask={addTask}
            onStartTask={startTask}
            onReopenTask={reopenTask}
            onCompleteTask={completeTask}
            onCompleteTaskWithoutPhoto={completeTaskWithoutPhoto}
            onReassignTask={reassignTask}
            onDeleteTask={deleteTask}
            onUpdateTaskRemarks={updateTaskRemarks}
          />
        )}

        {activeTab === AppTab.APPROVALS && (
          <ApprovalsPanel currentUser={currentUser} />
        )}

        {isManager && activeTab === AppTab.TEAM && (
          <TeamManager
            employees={scopedEmployees}
            staffManagerLinks={staffManagerLinks}
            currentUser={currentUser}
            onAddEmployee={addEmployee}
            onRemoveEmployee={removeEmployee}
            onUpdateStaffManagers={updateStaffManagers}
            isSuperAdmin={isSuperAdmin}
            setEmployees={setEmployees}
            onRefreshData={async () => {
              const data = await loadInitialData(false);
              if (data) {
                setEmployees(data.employees);
                setStaffManagerLinks(data.staffManagerLinks || []);
                setTasks(data.tasks);
              }
            }}
          />
        )}
      </main>

      {/* Simplified Bottom Nav (Dashboard, Tasks, Team) */}
      <nav className="bg-white/96 backdrop-blur border-t border-[var(--border)] fixed bottom-0 left-0 right-0 w-full max-w-md sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto z-50 safe-bottom shadow-[0_-2px_10px_rgba(10,10,15,0.06)] rounded-t-[2.5rem]">
        <div className="flex justify-around items-center h-20 px-2">

          {/* Hidden: Business Overview Tab */}
          {/* <NavBtn
            active={activeTab === AppTab.DASHBOARD}
            onClick={() => setActiveTab(AppTab.DASHBOARD)}
            icon={<LayoutDashboard className="w-6 h-6" />}
            label="Dashboard"
          /> */}

          <NavBtn
            active={activeTab === AppTab.TASKS}
            onClick={handleTasksTabClick}
            icon={<ClipboardList className="w-6 h-6" />}
            label="Tasks"
          />

          <NavBtn
            active={activeTab === AppTab.APPROVALS}
            onClick={() => setActiveTab(AppTab.APPROVALS)}
            icon={<CheckCircle2 className="w-6 h-6" />}
            label="Approvals"
          />

          {isManager && (
            <NavBtn
              active={activeTab === AppTab.TEAM}
              onClick={() => setActiveTab(AppTab.TEAM)}
              icon={<Users className="w-6 h-6" />}
              label="Team"
            />
          )}

        </div>
      </nav>
        </div>
        <Toaster />
        <Analytics />
      </div>
    </ErrorBoundary>
  );
};

const NavBtn = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-200 min-w-[70px] ${active ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'}`}>
    <div className={`p-2.5 rounded-[1.2rem] transition-all duration-300 ${active ? 'bg-[var(--accent-light)] text-[var(--accent)] scale-105 shadow-[0_4px_12px_rgba(79,70,229,0.14)]' : 'text-[var(--ink-3)]'}`}>{icon}</div>
    <span className={`font-ui-mono text-[8px] font-medium uppercase tracking-[0.2em] ${active ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
  </button>
);

export default App;


