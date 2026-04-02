import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Calendar, ChevronDown, ClipboardList, RefreshCw, Users } from 'lucide-react';
import { Company, Employee } from '../types';
import { supabase } from '../src/lib/supabase';

type CompanyRow = Company & Record<string, unknown>;
type EmployeeRow = Employee & Record<string, unknown>;
type TaskRow = Record<string, unknown> & {
  id: string;
  description?: string;
  status?: string;
  company_id?: string;
  assignedTo?: string | null;
  assigned_to?: string | null;
  createdAt?: number | string | null;
  created_at?: number | string | null;
  deadline?: number | string | null;
};

interface DevAdminPanelProps {
  currentUser: Employee;
  onBack: () => void;
}

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }

  return null;
};

const formatDateTime = (value: unknown): string => {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDateOnly = (value: unknown): string => {
  const timestamp = parseTimestamp(value) ?? Date.parse(String(value || ''));
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const DevAdminPanel: React.FC<DevAdminPanelProps> = ({ currentUser, onBack }) => {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (showRefreshState: boolean) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [{ data: companiesData, error: companiesError }, { data: employeesData, error: employeesError }, { data: tasksData, error: tasksError }] =
        await Promise.all([
          supabase.from('companies').select('*').order('created_at', { ascending: false }),
          supabase.from('employees').select('*'),
          supabase.from('tasks').select('*'),
        ]);

      if (companiesError) throw companiesError;
      if (employeesError) throw employeesError;
      if (tasksError) throw tasksError;

      setCompanies((companiesData || []) as CompanyRow[]);
      setEmployees((employeesData || []) as EmployeeRow[]);
      setTasks((tasksData || []) as TaskRow[]);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to load developer admin data.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const employeeNameById = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const employee of employees) {
      const employeeId = String(employee.id || '').trim();
      if (employeeId) {
        nameMap.set(employeeId, String(employee.name || 'Unknown'));
      }
    }
    return nameMap;
  }, [employees]);

  const companySummaries = useMemo(() => {
    return companies.map((company) => {
      const companyId = String(company.id || '').trim();
      const companyEmployees = employees.filter((employee) => String(employee.company_id || '').trim() === companyId);
      const companyTasks = tasks
        .filter((task) => String(task.company_id || '').trim() === companyId)
        .sort((left, right) => {
          const leftTs = parseTimestamp(left.createdAt ?? left.created_at) ?? 0;
          const rightTs = parseTimestamp(right.createdAt ?? right.created_at) ?? 0;
          return rightTs - leftTs;
        });

      return {
        company,
        employees: companyEmployees,
        tasks: companyTasks,
        counts: {
          employees: companyEmployees.length,
          totalTasks: companyTasks.length,
          completedTasks: companyTasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length,
          pendingTasks: companyTasks.filter((task) => String(task.status || '').toLowerCase() === 'pending').length,
        },
      };
    });
  }, [companies, employees, tasks]);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Developer Admin</p>
              <h1 className="text-2xl font-black tracking-tight">OpenTask Internal Overview</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-2 text-right shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-semibold text-slate-500">Signed in as</p>
              <p className="text-sm font-bold text-slate-900">{currentUser.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <p className="text-sm text-slate-600">
            Read-only developer view across all companies, employees, and tasks. No write actions are available here.
          </p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[var(--border)] bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <p className="text-sm font-semibold text-slate-600">Loading developer data...</p>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            {error}
          </div>
        ) : companySummaries.length === 0 ? (
          <div className="rounded-3xl border border-[var(--border)] bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <p className="text-sm font-semibold text-slate-600">No companies found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {companySummaries.map(({ company, employees: companyEmployees, tasks: companyTasks, counts }) => {
              const isExpanded = expandedCompanyId === company.id;
              return (
                <section
                  key={company.id}
                  className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedCompanyId(isExpanded ? null : company.id)}
                    className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-[var(--accent)]" />
                        <h2 className="truncate text-lg font-black text-slate-900">{company.name}</h2>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {String(company.subscription_status || 'unknown')}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Created: {formatDateOnly(company.created_at)}</span>
                        <span>Employees: {counts.employees}</span>
                        <span>Total Tasks: {counts.totalTasks}</span>
                        <span>Completed: {counts.completedTasks}</span>
                        <span>Pending: {counts.pendingTasks}</span>
                      </div>
                    </div>
                    <ChevronDown className={`mt-1 h-5 w-5 flex-shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border)] bg-slate-50/50 px-5 py-5">
                      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.35fr]">
                        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-500" />
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Employees</h3>
                          </div>
                          <div className="space-y-3">
                            {companyEmployees.length === 0 ? (
                              <p className="text-sm text-slate-500">No employees in this company.</p>
                            ) : (
                              companyEmployees.map((employee) => (
                                <div key={employee.id} className="rounded-2xl border border-[var(--border)] bg-slate-50 px-4 py-3">
                                  <p className="text-sm font-bold text-slate-900">{employee.name}</p>
                                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{employee.role}</p>
                                  <p className="mt-1 text-sm text-slate-600">{employee.mobile || '-'}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-slate-500" />
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Tasks</h3>
                          </div>
                          <div className="space-y-3">
                            {companyTasks.length === 0 ? (
                              <p className="text-sm text-slate-500">No tasks in this company.</p>
                            ) : (
                              companyTasks.map((task) => {
                                const assignedToId = String(task.assignedTo ?? task.assigned_to ?? '').trim();
                                const assignedToName = assignedToId ? employeeNameById.get(assignedToId) || assignedToId : 'Unassigned';
                                return (
                                  <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-slate-50 px-4 py-3">
                                    <p className="text-sm font-bold text-slate-900">{task.description || 'Untitled task'}</p>
                                    <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                      <p>Status: <span className="font-semibold text-slate-900">{String(task.status || '-')}</span></p>
                                      <p>Assigned To: <span className="font-semibold text-slate-900">{assignedToName}</span></p>
                                      <p>Created: <span className="font-semibold text-slate-900">{formatDateTime(task.createdAt ?? task.created_at)}</span></p>
                                      <p>Deadline: <span className="font-semibold text-slate-900">{formatDateTime(task.deadline)}</span></p>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DevAdminPanel;
