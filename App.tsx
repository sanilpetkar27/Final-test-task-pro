import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppTab, DealershipTask, Employee, UserRole, TaskStatus, RewardConfig, TaskType, RecurrenceFrequency, TaskRemark } from './types';
import Dashboard from './components/Dashboard';
import StatsScreen from './components/StatsScreen';
import TeamManager from './components/TeamManager';
import LoginScreen from './components/LoginScreen';
import { supabase, supabaseAuth } from './src/lib/supabase';
import { useNotificationSetup } from './src/hooks/useNotificationSetup';
import { transformTaskToApp, transformTaskToDB, transformTasksToApp, DatabaseTask } from './src/utils/transformers';
import { Toaster, toast } from 'sonner';
import {
  ClipboardList,
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
const EMPLOYEES_CACHE_KEY = 'universalAppEmployees';
const TASKS_CACHE_KEY = 'universalAppTasks';
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

const normalizeRole = (role: unknown): Employee['role'] => {
  return role === 'owner' || role === 'manager' || role === 'staff' || role === 'super_admin'
    ? role
    : 'staff';
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
    points: 0,
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
    points: Number(employee.points || 0),
    company_id: String(employee.company_id || DEFAULT_COMPANY_ID),
    auth_user_id: employee.auth_user_id ? String(employee.auth_user_id) : undefined,
    manager_id: safeManagerId,
  };
};

const scopeEmployeesForCurrentUser = (
  employeeRows: Employee[],
  taskRows: DealershipTask[],
  currentUser: Employee | null
): Employee[] => {
  const mergedEmployees = mergeCurrentUserIntoEmployees(employeeRows, currentUser);
  if (!currentUser) {
    return mergedEmployees;
  }

  if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
    return mergedEmployees;
  }

  if (currentUser.role === 'manager') {
    const managedByTasks = new Set<string>();
    taskRows.forEach((task) => {
      if (task.assignedBy === currentUser.id && task.assignedTo) {
        managedByTasks.add(task.assignedTo);
      }
    });

    return mergedEmployees.filter((employee) => {
      if (employee.id === currentUser.id) return true;
      if (employee.role !== 'staff') return false;
      const managerId = typeof employee.manager_id === 'string' ? employee.manager_id : null;
      return managerId === currentUser.id || (!managerId && managedByTasks.has(employee.id));
    });
  }

  // Staff: show own profile and direct manager when available.
  const managerIds = new Set<string>();
  const profileManagerId = typeof currentUser.manager_id === 'string' ? currentUser.manager_id : null;
  if (profileManagerId) {
    managerIds.add(profileManagerId);
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
    points: normalizedProfile.points,
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
        points: normalizedProfile.points,
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

      return {
        id: remarkId,
        taskId: remarkTaskId,
        employeeId,
        employeeName,
        remark: remarkText,
        timestamp: toTimestampNumber(remarkRecord.timestamp)
      };
    })
    .filter((remark): remark is TaskRemark => Boolean(remark))
    .sort((left, right) => left.timestamp - right.timestamp);

  return parsedRemarks;
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

  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.TASKS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const hasShownPolicyErrorRef = useRef(false);
  const lastForegroundRefreshAtRef = useRef(0);

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
      name: 'Sanil Petkar', // Updated Name
      email: 'sanil@company.com', // Added email
      mobile: '8668678238',
      role: 'manager',
      points: 0
    },
    { id: 'emp-staff-1', name: 'Staff Member 1', email: 'staff1@company.com', mobile: '8888888888', role: 'staff', points: 0 },
    { id: 'emp-staff-2', name: 'Staff Member 2', email: 'staff2@company.com', mobile: '7777777777', role: 'staff', points: 0 }
  ];

  const DEFAULT_TASKS = [
    {
      id: 'task-demo-1',
      description: 'Welcome to your new TaskPro',
      status: 'pending' as TaskStatus,
      createdAt: Date.now(),
      assignedBy: 'emp-admin',
      assignedTo: 'emp-staff-1'
    }
  ];

  const [employees, setEmployees] = useState<Employee[]>(() => parseCachedArray<Employee>(EMPLOYEES_CACHE_KEY));
  const [rewardConfig, setRewardConfig] = useState<RewardConfig>({
    targetPoints: 100,
    rewardName: 'Bonus Day Off'
  });

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

      // Fetch tasks from Supabase with role + company filtering
      let tasksQuery = supabase.from('tasks').select('*');

      if (activeCompanyId) {
        tasksQuery = tasksQuery.eq('company_id', activeCompanyId);
      }
      
      // Apply role-based filtering using currentUser from state
      if (
        employeesData &&
        employeesData.length > 0 &&
        currentUser &&
        currentUser.role !== 'super_admin' &&
        currentUser.role !== 'owner'
      ) {
        // Filter for managers and staff: only their assigned or created tasks
        // Database uses camelCase: assignedTo, assignedBy
        tasksQuery = tasksQuery.or(`assignedTo.eq.${currentUser.id},assignedBy.eq.${currentUser.id}`);
      }
      // For super_admin, keep fetching all tasks (no filtering)
      
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
      const finalEmployees = mergeCurrentUserIntoEmployees(finalEmployeesBase as Employee[], currentUser);

      // Transform database tasks to app tasks
      const finalTasks = (tasksData && tasksData.length > 0)
        ? transformTasksToApp(tasksData as DatabaseTask[])
        : (cachedTasks.length > 0 ? cachedTasks : []);

      if (employeesError || tasksError) {
        console.warn('using fallback data due to Supabase error');
        if (employeesError) console.warn('Employees error:', employeesError);
        if (tasksError) console.warn('Tasks error:', tasksError);

        const hasPolicyError = isPolicyRecursionError(employeesError) || isPolicyRecursionError(tasksError);
        if (hasPolicyError && !hasShownPolicyErrorRef.current) {
          hasShownPolicyErrorRef.current = true;
          toast.error('Database policy error (RLS recursion). Please run the policy fix SQL in Supabase.');
        }
      }

      localStorage.setItem(EMPLOYEES_CACHE_KEY, JSON.stringify(finalEmployees));
      if (tasksData && tasksData.length > 0) {
        localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(transformTasksToApp(tasksData as DatabaseTask[])));
      }

      return {
        employees: finalEmployees,
        tasks: finalTasks
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
      return {
        employees: mergeCurrentUserIntoEmployees(cachedEmployees, currentUser),
        tasks: cachedTasks
      };
    } finally {
      setLoading(false);
    }
  };

  const [tasks, setTasks] = useState<DealershipTask[]>(() => parseCachedArray<DealershipTask>(TASKS_CACHE_KEY));

  // Ref for fetchTasks to prevent infinite loop
  const fetchTasksRef = useRef(null);

  // Extract fetchTasks logic as useCallback to prevent stale closures
  const fetchTasks = useCallback(async () => {
    try {
      console.log('🔄 Fetching tasks...');
      
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
      
      // Apply role-based filtering using currentUser from state
      if (
        employeesData &&
        employeesData.length > 0 &&
        currentUser &&
        currentUser.role !== 'super_admin' &&
        currentUser.role !== 'owner'
      ) {
        // Filter for managers and staff: only their assigned or created tasks
        // Database uses camelCase: assignedTo, assignedBy
        tasksQuery = tasksQuery.or(`assignedTo.eq.${currentUser.id},assignedBy.eq.${currentUser.id}`);
      }
      // For super_admin, keep fetching all tasks (no filtering)
      
      const { data: tasksData, error: tasksError } = await tasksQuery;
      
      if (tasksError) {
        console.error('❌ Failed to fetch tasks:', tasksError);
      } else {
        console.log('✅ Successfully fetched tasks:', tasksData);
        setTasks(transformTasksToApp((tasksData || []) as DatabaseTask[]));
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
          return;
        }

        const authUserId = session.user.id;
        console.log('Auth session found:', authUserId);

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
      setTasks([]);
      return;
    }

    // Initial Load for the active logged-in user/company
    loadInitialData(false).then(data => {
      if (data) {
        setEmployees(data.employees);
        setTasks(data.tasks);
      }
    });
  }, [currentUser?.id, currentUser?.company_id, currentUser?.role]);

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

    const taskListener = supabase
      .channel(`public:tasks:${currentUser.company_id || 'all'}:${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', ...taskChangeFilter }, async (payload) => {
        console.log('🔔 Realtime INSERT:', payload);
        try {
          const payloadTaskId = String((payload.new as any)?.id || '');
          if (!payloadTaskId) {
            console.warn('Realtime INSERT payload missing task id:', payload);
            return;
          }

          // Step 1: Fetch the raw task
          const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', payloadTaskId)
            .single();
          
          if (taskError || !task) {
            console.error('❌ Failed to fetch task:', taskError);
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

          console.log('✅ Created rich task:', richTask);
          setTasks(prev => upsertTaskAtTop(prev, richTask as DealershipTask));

        } catch (err) {
          console.error('🚨 Error in realtime INSERT handler:', err);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', ...taskChangeFilter }, async (payload) => {
        console.log('🔔 Realtime UPDATE:', payload);
        try {
          const payloadTaskId = String((payload.new as any)?.id || '');
          if (!payloadTaskId) {
            console.warn('Realtime UPDATE payload missing task id:', payload);
            return;
          }

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

          console.log('✅ Updated rich task:', richTask);
          setTasks(prev => upsertTaskInPlace(prev, richTask as DealershipTask));

        } catch (err) {
          console.error('🚨 Error in realtime UPDATE handler:', err);
        }
      })
      .on('postgres_changes', { event: 'DELETE', ...taskChangeFilter }, (payload) => {
        console.log('🔔 Realtime DELETE:', payload);
        const deletedTaskId = payload.old.id;
        setTasks(prev => prev.filter(task => task.id !== deletedTaskId));
      })
      .subscribe();

    // Cleanup subscription when component unmounts
    return () => {
      supabase.removeChannel(taskListener);
    };
  }, [currentUser?.id, currentUser?.company_id]);

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
      console.log(reason === 'focus' ? '🎯 App gained focus, refreshing tasks...' : '📱 App became visible, refreshing tasks...');
      loadInitialData(false).then(data => {
        if (data) {
          setEmployees(data.employees);
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

  // --- 4. CORE ACTIONS (Add, Delete, Complete) ---

  const addTask = async (
    description: string,
    assignedTo?: string,
    parentTaskId?: string,
    deadline?: number,
    requirePhoto?: boolean,
    taskType: TaskType = 'one_time',
    recurrenceFrequency?: RecurrenceFrequency | null
  ) => {
    if (!currentUser) return;
    if (!description.trim()) return;

    const normalizedTaskType: TaskType = taskType === 'recurring' ? 'recurring' : 'one_time';
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

      // Insert task into Supabase (with backward-compatible retry for old schemas).
      let { data, error } = await supabase
        .from('tasks')
        .insert([dbTask])
        .select('*')
        .single();

      if (error && isMissingNextRecurrenceNotificationColumnError(error)) {
        const retryPayload = stripTaskNextRecurrenceField(dbTask as unknown as Record<string, any>);
        const retryResult = await supabase
          .from('tasks')
          .insert([retryPayload])
          .select('*')
          .single();

        data = retryResult.data as any;
        error = retryResult.error as any;

        if (!error) {
          toast.warning('Task saved, but recurring reminder scheduling needs DB migration to be fully available.');
        }
      }

      if (error && isMissingTaskRecurrenceColumnError(error)) {
        const legacyTaskPayload = stripTaskRecurrenceFields(dbTask as unknown as Record<string, any>);
        const legacyResult = await supabase
          .from('tasks')
          .insert([legacyTaskPayload])
          .select('*')
          .single();

        data = legacyResult.data as any;
        error = legacyResult.error as any;

        if (!error) {
          toast.warning('Task saved, but recurrence options need DB migration to be fully available.');
        }
      }

      if (error) {
        console.error('Error adding task:', error);
        toast.error(`Failed to save task: ${error.message}`);
        return;
      }

      // Transform returned database task back to app format
      const appTask = transformTaskToApp(data as DatabaseTask);
      setTasks(prev => upsertTaskAtTop(prev, appTask));
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
      // Update task in Supabase
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status: 'completed' as TaskStatus,
          completedAt: proofData.timestamp,
          proof: proofData
        })
        .eq('id', taskId);

      if (taskError) {
        console.error('Error completing task:', taskError);
        toast.error(`Failed to complete task: ${taskError.message}`);
        return;
      }

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'completed' as TaskStatus, completedAt: proofData.timestamp, proof: proofData }
          : t
      ));

      // Add 10 points to the user who completed the task
      const task = tasks.find(t => t.id === taskId);
      if (task && task.assignedTo) {
        const employee = employees.find(emp => emp.id === task.assignedTo);
        if (employee) {
          const { error: pointsError } = await supabase
            .from('employees')
            .update({ points: employee.points + 10 })
            .eq('id', task.assignedTo);

          if (pointsError) {
            console.error('Error updating points:', pointsError);
            // Fallback to local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          } else {
            // Update local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          }
        }
      }
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const completeTaskWithoutPhoto = async (taskId: string) => {
    try {
      // Update task in Supabase
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ status: 'completed' as TaskStatus, completedAt: Date.now() })
        .eq('id', taskId);

      if (taskError) {
        console.error('Error completing task:', taskError);
        toast.error(`Failed to complete task: ${taskError.message}`);
        return;
      }

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'completed' as TaskStatus, completedAt: Date.now() }
          : t
      ));

      // Add 10 points to the user who completed the task
      const task = tasks.find(t => t.id === taskId);
      if (task && task.assignedTo) {
        const employee = employees.find(emp => emp.id === task.assignedTo);
        if (employee) {
          const { error: pointsError } = await supabase
            .from('employees')
            .update({ points: employee.points + 10 })
            .eq('id', task.assignedTo);

          if (pointsError) {
            console.error('Error updating points:', pointsError);
            // Fallback to local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          } else {
            // Update local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          }
        }
      }
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

  const addEmployee = async (name: string, mobile: string, role: UserRole = 'staff') => {
    if (!currentUser) return;

    const newEmployee: Employee = {
      id: `emp-${Date.now()}`,
      name,
      mobile,
      role,
      points: 0,
      email: `${mobile}@taskpro.local`,
      company_id: currentUser.company_id || DEFAULT_COMPANY_ID
    };

    console.log('Adding employee:', newEmployee);

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
        console.log('Employee synced with database:', data);
        setEmployees(prev => prev.map(e => e.id === newEmployee.id ? data as Employee : e));
      }
    } catch (error) {
      console.error('Unexpected error adding employee:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Employee added locally.`);
    }
  };

  const removeEmployee = async (id: string) => {
    console.log('🗑️ Removing employee:', id);
    
    // Remove from local state IMMEDIATELY for instant UI feedback
    setEmployees(prev => prev.filter(e => e.id !== id));
    console.log('✅ Employee removed from local state immediately');
    
    try {
      // Delete employee from Supabase
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id)
        .eq('company_id', currentUser?.company_id || DEFAULT_COMPANY_ID);

      if (error) {
        console.error('❌ Error removing employee from database:', error);
        toast.error(`Database Error: ${error.message}. Employee removed locally.`);
      } else {
        console.log('✅ Employee removed from database successfully');
        toast.success('Employee deleted successfully');
      }
    } catch (error) {
      console.error('🚨 Unexpected error removing employee:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Employee removed locally.`);
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
        }
      }
    } catch {
      // Ignore cache parse issues and continue login flow.
    }

    setCurrentUser(normalizedInputUser);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedInputUser));
    setActiveTab(AppTab.TASKS);

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
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(EMPLOYEES_CACHE_KEY);
      localStorage.removeItem(TASKS_CACHE_KEY);
    }
  };

  // --- 5. RENDER UI ---

  if (!appReady) {
    return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-900 p-8">
        <Loader2 className="w-12 h-12 text-slate-800 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Starting App...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 items-center justify-center p-8 relative overflow-hidden font-sans">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-slate-800 animate-spin mx-auto mb-4" />
          <p className="text-slate-900 text-lg font-semibold">Loading data...</p>
          <p className="text-slate-500 text-sm mt-2">Please wait while we connect to the database</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-red-600 items-center justify-center p-8 relative overflow-hidden font-sans">
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
    );
  }

  if (!currentUser) {
    return <LoginScreen employees={employees} onLogin={handleLogin} />;
  }

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin' || currentUser.role === 'owner';
  const isSuperAdmin = currentUser.role === 'super_admin';
  const scopedEmployees = scopeEmployeesForCurrentUser(employees, tasks, currentUser);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 relative overflow-hidden font-sans">

      {/* Notification Banner */}
      {notification && (
        <div className="fixed top-2 left-2 right-2 max-w-md mx-auto z-[100] animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white text-slate-900 p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-200 flex items-center gap-4">
            <div className="bg-indigo-900 p-2 rounded-xl">
              <Bell className="w-5 h-5 animate-bounce text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{notification.title}</p>
              <p className="text-sm font-bold truncate">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white text-slate-900 p-5 pt-safe-top sticky top-0 z-30 flex items-center justify-between shadow-sm border-b border-slate-200" style={{ paddingTop: 'max(3rem, 1.25rem)' }}>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-900 p-1.5 rounded-lg shadow-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter italic leading-none text-slate-900">TaskPro</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">
                {isSyncing ? 'Syncing...' : 'Online'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-black leading-none text-slate-900">{currentUser.name}</p>
            <p className="text-[8px] text-indigo-700 uppercase font-black tracking-widest mt-0.5">{currentUser.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all border border-slate-200"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
        {/* Hidden: Business Overview Content */}
        {/* {activeTab === AppTab.DASHBOARD && (
          <StatsScreen
            tasks={tasks}
            currentUser={currentUser}
            employees={employees}
            rewardConfig={rewardConfig}
          />
        )} */}

        {activeTab === AppTab.TASKS && (
          <Dashboard
            tasks={tasks}
            employees={scopedEmployees}
            currentUser={currentUser}
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

        {isManager && activeTab === AppTab.TEAM && (
          <TeamManager
            employees={scopedEmployees}
            currentUser={currentUser}
            onAddEmployee={addEmployee}
            onRemoveEmployee={removeEmployee}
            rewardConfig={rewardConfig}
            onUpdateRewardConfig={setRewardConfig}
            isSuperAdmin={isSuperAdmin}
            setEmployees={setEmployees}
          />
        )}
      </main>

      {/* Simplified Bottom Nav (Dashboard, Tasks, Team) */}
      <nav className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 safe-bottom shadow-[0_-2px_8px_rgba(0,0,0,0.04)] rounded-t-[2.5rem]">
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
            onClick={() => setActiveTab(AppTab.TASKS)}
            icon={<ClipboardList className="w-6 h-6" />}
            label="Tasks"
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
      <Toaster />
    </div>
  );
};

const NavBtn = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-200 min-w-[70px] ${active ? 'text-indigo-700' : 'text-slate-500'}`}>
    <div className={`p-2.5 rounded-[1.2rem] transition-all duration-500 rounded-lg ${active ? 'bg-indigo-50 scale-110 shadow-inner ring-4 ring-slate-200' : ''}`}>{icon}</div>
    <span className={`text-[8px] font-black uppercase tracking-[0.15em] ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
  </button>
);

export default App;


