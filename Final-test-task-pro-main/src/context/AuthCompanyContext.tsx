import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Employee } from '../../types';
import { supabase, supabaseAuth } from '../lib/supabase';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const USER_CACHE_KEY = 'universal_app_user';
const ACTIVE_COMPANY_CACHE_KEY = 'universal_app_active_company';
const EMPLOYEES_CACHE_KEY = 'universalAppEmployees';
const TASKS_CACHE_KEY = 'universalAppTasks';
const STAFF_MANAGER_LINKS_CACHE_KEY = 'universalAppStaffManagerLinks';

export type AvailableCompany = {
  employeeId: string;
  role: Employee['role'];
  companyId: string;
  companyName: string;
  employeeRecord: Employee;
};

type AuthCompanyContextValue = {
  currentUser: Employee | null;
  activeEmployeeRecord: Employee | null;
  availableCompanies: AvailableCompany[];
  activeCompanyId: string | null;
  isSyncing: boolean;
  isCompanySwitching: boolean;
  authLoading: boolean;
  login: (user: Employee) => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (companyId: string) => void;
  finishCompanySwitch: () => void;
};

const AuthCompanyContext = createContext<AuthCompanyContextValue | null>(null);

const normalizeRole = (role: unknown): Employee['role'] => {
  return role === 'owner' || role === 'manager' || role === 'staff' || role === 'super_admin'
    ? role
    : 'staff';
};

const normalizeMobile = (mobile: unknown): string => {
  return String(mobile || '').replace(/\D/g, '');
};

const normalizeEmployeeProfile = (employee: Partial<Employee> & { id: string }): Employee => {
  const safeId = String(employee.id || `temp-${Date.now()}`);
  const safeEmail = String(employee.email || `${safeId}@taskpro.local`).trim();
  const safeName = String(employee.name || safeEmail.split('@')[0] || 'User').trim();
  const safeMobile = String(employee.mobile || '').trim();
  const rawManagerId = (employee as { manager_id?: string | null; managerId?: string | null }).manager_id
    ?? (employee as { manager_id?: string | null; managerId?: string | null }).managerId;
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
    onesignal_id: employee.onesignal_id ? String(employee.onesignal_id) : null,
    auth_user_id: employee.auth_user_id ? String(employee.auth_user_id) : undefined,
    manager_id: safeManagerId,
  };
};

const toFallbackEmployeeFromAuthUser = (authUser: {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  phone?: string;
}): Employee => {
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

const isMissingColumnError = (error: unknown): boolean => {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
};

const isEmployeesPolicyError = (error: unknown): boolean => {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return message.includes('infinite recursion') && message.includes('employees');
};

const readPersistedActiveCompanyId = (mobile?: string | null): string | null => {
  if (typeof window === 'undefined') return null;

  const normalizedMobile = normalizeMobile(mobile);
  const lookupKeys = normalizedMobile
    ? [`${ACTIVE_COMPANY_CACHE_KEY}:${normalizedMobile}`, ACTIVE_COMPANY_CACHE_KEY]
    : [ACTIVE_COMPANY_CACHE_KEY];

  for (const key of lookupKeys) {
    try {
      const value = String(localStorage.getItem(key) || '').trim();
      if (value) return value;
    } catch {
      // Ignore local storage read failures and continue with defaults.
    }
  }

  return null;
};

const persistActiveCompanyId = (mobile: string | null | undefined, companyId: string | null | undefined) => {
  if (typeof window === 'undefined') return;

  const normalizedMobile = normalizeMobile(mobile);
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return;

  try {
    localStorage.setItem(ACTIVE_COMPANY_CACHE_KEY, normalizedCompanyId);
    if (normalizedMobile) {
      localStorage.setItem(`${ACTIVE_COMPANY_CACHE_KEY}:${normalizedMobile}`, normalizedCompanyId);
    }
  } catch {
    // Ignore local storage write failures so company switching remains functional.
  }
};

const clearCompanyScopedCaches = () => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(EMPLOYEES_CACHE_KEY);
    localStorage.removeItem(TASKS_CACHE_KEY);
    localStorage.removeItem(STAFF_MANAGER_LINKS_CACHE_KEY);
  } catch {
    // Ignore local storage clear failures and continue runtime switching.
  }
};

const getFallbackCompanyName = (companyId: string): string => {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return 'Workspace';
  return `Workspace ${normalizedCompanyId.slice(0, 8)}`;
};

const loadAvailableCompaniesForEmployee = async (employee: Employee): Promise<AvailableCompany[]> => {
  const employeeMobile = String(employee.mobile || '').trim();
  if (!employeeMobile) {
    return [];
  }

  const { data: employeeRows, error: employeeRowsError } = await supabase
    .from('employees')
    .select('*')
    .eq('mobile', employeeMobile);

  if (employeeRowsError) {
    console.warn('Workspace lookup by mobile failed:', employeeRowsError);
    return [];
  }

  const normalizedRows = Array.isArray(employeeRows)
    ? employeeRows.map((row) => normalizeEmployeeProfile(row as Employee))
    : [];
  if (normalizedRows.length === 0) {
    return [];
  }

  const uniqueCompanyIds = Array.from(
    new Set(
      normalizedRows
        .map((row) => String(row.company_id || '').trim())
        .filter(Boolean),
    ),
  );

  let companyNameById = new Map<string, string>();
  if (uniqueCompanyIds.length > 0) {
    const { data: companyRows, error: companyRowsError } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', uniqueCompanyIds);

    if (companyRowsError) {
      console.warn('Workspace company lookup failed:', companyRowsError);
    } else {
      companyNameById = new Map(
        (companyRows || []).map((row: { id?: string; name?: string | null }) => [
          String(row?.id || '').trim(),
          String(row?.name || '').trim() || getFallbackCompanyName(String(row?.id || '').trim()),
        ]),
      );
    }
  }

  return normalizedRows
    .map((row) => ({
      employeeId: row.id,
      role: normalizeRole(row.role),
      companyId: String(row.company_id || '').trim() || DEFAULT_COMPANY_ID,
      companyName:
        companyNameById.get(String(row.company_id || '').trim())
        || getFallbackCompanyName(String(row.company_id || '').trim()),
      employeeRecord: row,
    }))
    .sort((left, right) => left.companyName.localeCompare(right.companyName));
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

const resolveEmployeeProfileFromAuthUser = async (authUser: {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  phone?: string;
}): Promise<Employee | null> => {
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
      const matchedByMobile = employeeRows.find(
        (emp: { mobile?: string | null }) => normalizeMobile(emp?.mobile) === authMobile,
      );
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

export const AuthCompanyProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem(USER_CACHE_KEY);
      if (!saved || saved === 'undefined') return null;

      const parsed = JSON.parse(saved) as Partial<Employee>;
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
  const [availableCompanies, setAvailableCompanies] = useState<AvailableCompany[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() =>
    readPersistedActiveCompanyId(
      (() => {
        try {
          const saved = localStorage.getItem(USER_CACHE_KEY);
          if (!saved || saved === 'undefined') return null;
          const parsed = JSON.parse(saved) as Partial<Employee>;
          return parsed?.mobile || null;
        } catch {
          return null;
        }
      })(),
    ),
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCompanySwitching, setIsCompanySwitching] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const activeEmployeeRecord = currentUser;

  const applyActiveWorkspace = useCallback((
    nextEmployee: Employee,
    nextCompanies: AvailableCompany[],
    nextCompanyId?: string | null,
  ) => {
    const normalizedEmployee = normalizeEmployeeProfile({
      ...nextEmployee,
      company_id: String(nextCompanyId || nextEmployee.company_id || DEFAULT_COMPANY_ID).trim() || DEFAULT_COMPANY_ID,
    });

    setCurrentUser(normalizedEmployee);
    setAvailableCompanies(nextCompanies);
    setActiveCompanyId(normalizedEmployee.company_id);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedEmployee));
    persistActiveCompanyId(normalizedEmployee.mobile, normalizedEmployee.company_id);
    return normalizedEmployee;
  }, []);

  const hydrateAvailableCompanies = useCallback(async (
    baseEmployee: Employee,
    preferredCompanyId?: string | null,
  ): Promise<Employee> => {
    const normalizedBaseEmployee = normalizeEmployeeProfile(baseEmployee);
    const memberships = await loadAvailableCompaniesForEmployee(normalizedBaseEmployee);
    const desiredCompanyId =
      String(
        preferredCompanyId
        || readPersistedActiveCompanyId(normalizedBaseEmployee.mobile)
        || normalizedBaseEmployee.company_id
        || DEFAULT_COMPANY_ID,
      ).trim() || DEFAULT_COMPANY_ID;

    const fallbackEntry: AvailableCompany = {
      employeeId: normalizedBaseEmployee.id,
      role: normalizedBaseEmployee.role,
      companyId: String(normalizedBaseEmployee.company_id || DEFAULT_COMPANY_ID).trim() || DEFAULT_COMPANY_ID,
      companyName: getFallbackCompanyName(normalizedBaseEmployee.company_id || DEFAULT_COMPANY_ID),
      employeeRecord: normalizedBaseEmployee,
    };

    const nextCompanies = memberships.length > 0 ? memberships : [fallbackEntry];
    const matchedEntry =
      nextCompanies.find((entry) => entry.companyId === desiredCompanyId)
      || nextCompanies.find((entry) => entry.employeeId === normalizedBaseEmployee.id)
      || nextCompanies[0];

    return applyActiveWorkspace(matchedEntry.employeeRecord, nextCompanies, matchedEntry.companyId);
  }, [applyActiveWorkspace]);

  const login = useCallback(async (user: Employee) => {
    const normalizedInputUser = normalizeEmployeeProfile(user);

    try {
      const rawCachedUser = localStorage.getItem(USER_CACHE_KEY);
      if (rawCachedUser) {
        const previousUser = JSON.parse(rawCachedUser) as Partial<Employee>;
        if (previousUser?.company_id && normalizedInputUser.company_id && previousUser.company_id !== normalizedInputUser.company_id) {
          clearCompanyScopedCaches();
        }
      }
    } catch {
      // Ignore cache parse issues and continue login flow.
    }

    setIsSyncing(true);
    setCurrentUser(normalizedInputUser);
    setActiveCompanyId(String(normalizedInputUser.company_id || DEFAULT_COMPANY_ID).trim() || DEFAULT_COMPANY_ID);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedInputUser));
    persistActiveCompanyId(normalizedInputUser.mobile, normalizedInputUser.company_id);

    try {
      const { data: { session } } = await supabaseAuth.getSession();
      if (!session?.user) {
        await hydrateAvailableCompanies(normalizedInputUser, normalizedInputUser.company_id);
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
        await hydrateAvailableCompanies(normalizedEmployeeData, normalizedEmployeeData.company_id);
        return;
      }

      const syncedUser = await syncEmployeeProfileToDatabase({
        ...normalizedInputUser,
        id: session.user.id,
      }, session.user.id);

      if (syncedUser) {
        await hydrateAvailableCompanies(syncedUser, syncedUser.company_id);
        return;
      }

      if (error) {
        console.warn('Using provided login profile because employee lookup failed.', error);
      }
      await hydrateAvailableCompanies(normalizedInputUser, normalizedInputUser.company_id);
    } catch (err) {
      console.warn('Login profile sync skipped due to session/profile fetch error:', err);
      await hydrateAvailableCompanies(normalizedInputUser, normalizedInputUser.company_id);
    } finally {
      setIsSyncing(false);
      setAuthLoading(false);
    }
  }, [hydrateAvailableCompanies]);

  const logout = useCallback(async () => {
    try {
      await supabaseAuth.signOut();
    } catch (error) {
      console.warn('Auth sign-out failed, clearing local session anyway.', error);
    } finally {
      setCurrentUser(null);
      setAvailableCompanies([]);
      setActiveCompanyId(null);
      setIsCompanySwitching(false);
      setIsSyncing(false);
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(ACTIVE_COMPANY_CACHE_KEY);
      clearCompanyScopedCaches();
    }
  }, []);

  const switchCompany = useCallback((companyId: string) => {
    const nextCompanyId = String(companyId || '').trim();
    if (!nextCompanyId || nextCompanyId === String(activeCompanyId || '').trim()) {
      return;
    }

    const matchedWorkspace = availableCompanies.find((workspace) => workspace.companyId === nextCompanyId);
    if (!matchedWorkspace) {
      return;
    }

    clearCompanyScopedCaches();
    setIsCompanySwitching(true);
    setIsSyncing(true);

    const nextEmployee = normalizeEmployeeProfile({
      ...matchedWorkspace.employeeRecord,
      company_id: nextCompanyId,
    });

    setCurrentUser(nextEmployee);
    setActiveCompanyId(nextCompanyId);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextEmployee));
    persistActiveCompanyId(nextEmployee.mobile, nextCompanyId);
  }, [activeCompanyId, availableCompanies]);

  const finishCompanySwitch = useCallback(() => {
    setIsCompanySwitching(false);
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    const checkAuthSession = async () => {
      try {
        const { data: { session }, error } = await supabaseAuth.getSession();

        if (error) {
          console.error('Error fetching auth session:', error);
          return;
        }

        if (!session?.user) {
          setCurrentUser(null);
          setAvailableCompanies([]);
          setActiveCompanyId(null);
          localStorage.removeItem(USER_CACHE_KEY);
          localStorage.removeItem(ACTIVE_COMPANY_CACHE_KEY);
          clearCompanyScopedCaches();
          return;
        }

        const resolvedProfile = await resolveEmployeeProfileFromAuthUser(session.user);

        if (resolvedProfile) {
          await hydrateAvailableCompanies(resolvedProfile, resolvedProfile.company_id);
          return;
        }

        const fallbackUser = toFallbackEmployeeFromAuthUser(session.user);
        const syncedFallbackUser = await syncEmployeeProfileToDatabase(fallbackUser, session.user.id);
        const nextUser = syncedFallbackUser || fallbackUser;
        await hydrateAvailableCompanies(nextUser, nextUser.company_id);
      } catch (err) {
        console.error('Auth session check error:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    void checkAuthSession();
  }, [hydrateAvailableCompanies]);

  const value = useMemo<AuthCompanyContextValue>(() => ({
    currentUser,
    activeEmployeeRecord,
    availableCompanies,
    activeCompanyId,
    isSyncing,
    isCompanySwitching,
    authLoading,
    login,
    logout,
    switchCompany,
    finishCompanySwitch,
  }), [
    currentUser,
    activeEmployeeRecord,
    availableCompanies,
    activeCompanyId,
    isSyncing,
    isCompanySwitching,
    authLoading,
    login,
    logout,
    switchCompany,
    finishCompanySwitch,
  ]);

  return (
    <AuthCompanyContext.Provider value={value}>
      {children}
    </AuthCompanyContext.Provider>
  );
};

export const useAuthCompany = (): AuthCompanyContextValue => {
  const context = useContext(AuthCompanyContext);
  if (!context) {
    throw new Error('useAuthCompany must be used within AuthCompanyProvider');
  }
  return context;
};
