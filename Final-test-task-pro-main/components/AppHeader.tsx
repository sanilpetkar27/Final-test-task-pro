import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, LogOut, X } from 'lucide-react';
import { useAuthCompany } from '../src/context/AuthCompanyContext';

type InAppNotification = {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  entity_type?: string | null;
  entity_id?: string | null;
};

type AppHeaderProps = {
  unreadNotificationCount: number;
  showNotificationsPanel: boolean;
  notificationsLoading: boolean;
  userNotifications: InAppNotification[];
  onToggleNotificationsPanel: () => void;
  onCloseNotificationsPanel: () => void;
  onClearAllNotifications: () => void;
  onMarkNotificationAsRead: (notificationId: string) => void;
  onLogout: () => void;
  formatNotificationTimeAgo: (createdAt: string) => string;
};

const getRoleLabel = (role: string): string => {
  if (role === 'super_admin' || role === 'owner') return 'OWNER';
  if (role === 'manager') return 'MANAGER';
  return 'STAFF';
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  unreadNotificationCount,
  showNotificationsPanel,
  notificationsLoading,
  userNotifications,
  onToggleNotificationsPanel,
  onCloseNotificationsPanel,
  onClearAllNotifications,
  onMarkNotificationAsRead,
  onLogout,
  formatNotificationTimeAgo,
}) => {
  const {
    availableCompanies,
    activeCompanyId,
    activeEmployeeRecord,
    isSyncing,
    isCompanySwitching,
    switchCompany,
  } = useAuthCompany();

  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const companySwitcherRef = useRef<HTMLDivElement | null>(null);

  const activeWorkspace = useMemo(() => {
    const resolvedActiveCompanyId = String(activeCompanyId || activeEmployeeRecord?.company_id || '').trim();
    return availableCompanies.find(
      (company) =>
        company.companyId === resolvedActiveCompanyId &&
        company.employeeId === String(activeEmployeeRecord?.id || '').trim(),
    ) || availableCompanies.find(
      (company) => company.companyId === resolvedActiveCompanyId,
    ) || null;
  }, [activeCompanyId, activeEmployeeRecord?.company_id, activeEmployeeRecord?.id, availableCompanies]);

  useEffect(() => {
    if (!showCompanySwitcher) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!companySwitcherRef.current?.contains(event.target as Node)) {
        setShowCompanySwitcher(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showCompanySwitcher]);

  const activeWorkspaceName = activeWorkspace?.companyName || 'Workspace';

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-white/95 px-4 py-4 pt-safe-top font-sans text-slate-900 shadow-sm backdrop-blur sm:px-6"
      style={{ paddingTop: 'max(3rem, 1.25rem)' }}
    >
      {showCompanySwitcher ? (
        <button
          type="button"
          aria-label="Close workspace switcher"
          onClick={() => setShowCompanySwitcher(false)}
          className="fixed inset-0 z-[999] bg-slate-950/28 backdrop-blur-[2px] sm:hidden"
        />
      ) : null}

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="rounded-[1rem] border border-[var(--border)] bg-white p-1 shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
          <img src="/icon-192.png" alt="OpenTask logo" className="h-8 w-8 rounded-[0.75rem]" />
        </div>
        <div>
          <h1 className="leading-none text-lg font-black tracking-tight text-slate-900">OpenTask</h1>
          <div className="mt-1 flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isSyncing ? 'animate-pulse bg-emerald-400' : 'bg-emerald-400'}`} />
            <span className="font-ui-mono text-[8px] font-medium uppercase tracking-[0.22em] text-[var(--ink-3)]">
              {isSyncing ? 'Syncing...' : 'Online'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-2 sm:gap-4" ref={companySwitcherRef}>
        {availableCompanies.length > 1 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCompanySwitcher((prev) => !prev)}
              className="min-h-[44px] bg-transparent p-0 text-left font-sans transition-all"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <p className="max-w-[110px] truncate text-sm font-bold text-gray-900 sm:max-w-[200px] sm:text-base">
                  {activeWorkspaceName}
                </p>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showCompanySwitcher ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {showCompanySwitcher && (
              <div className="fixed left-1/2 top-[max(5.5rem,50%)] z-[1000] max-h-[min(56vh,18rem)] w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.5rem] border border-slate-200/90 bg-white/98 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:z-50 sm:mt-2 sm:max-h-none sm:w-[300px] sm:max-w-[calc(100vw-1rem)] sm:translate-x-0 sm:translate-y-0 sm:rounded-3xl sm:border-[var(--border)] sm:bg-white sm:p-2 sm:shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
                <p className="px-2 pb-2 pt-0.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 sm:px-3 sm:pt-1">
                  Switch Workspace
                </p>
                <div className="space-y-2 sm:space-y-1">
                  {availableCompanies.map((workspace) => {
                    const isActiveWorkspace =
                      workspace.companyId === String(activeCompanyId || '').trim() &&
                      workspace.employeeId === String(activeEmployeeRecord?.id || '').trim();

                    return (
                      <button
                        key={`${workspace.companyId}:${workspace.employeeId}`}
                        type="button"
                        onClick={() => {
                          setShowCompanySwitcher(false);
                          switchCompany(workspace.companyId);
                        }}
                        className={`flex w-full items-center gap-3 rounded-[1.25rem] border px-3 py-2.5 text-left transition-all sm:rounded-2xl sm:py-3 ${
                          isActiveWorkspace
                            ? 'border-[#4F46E5]/20 bg-[var(--accent-light)] shadow-[0_4px_12px_rgba(79,70,229,0.08)]'
                            : 'border-slate-200/70 bg-white hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{workspace.companyName}</p>
                          <span className="mt-1 inline-flex rounded-full bg-[var(--accent-light)] px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-[#4F46E5] sm:px-2.5 sm:text-[10px]">
                            {getRoleLabel(workspace.role)}
                          </span>
                        </div>
                        {isActiveWorkspace ? <Check className="h-4 w-4 text-[#4F46E5]" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-transparent p-0 font-sans">
            <p className="max-w-[110px] truncate text-sm font-bold text-gray-900 sm:max-w-[200px] sm:text-base">{activeWorkspaceName}</p>
          </div>
        )}

        <button
          onClick={onToggleNotificationsPanel}
          className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-slate-600 transition-all hover:bg-slate-200"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadNotificationCount > 0 ? (
            <span className="font-ui-mono absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-white bg-[var(--red)] px-1 text-[9px] font-medium text-white">
              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
            </span>
          ) : null}
        </button>

        <div className="text-right font-sans">
          <p className="text-[10px] font-black leading-none text-slate-900">{activeEmployeeRecord?.name || 'User'}</p>
          <p className="mt-0.5 font-ui-mono text-[9px] font-medium uppercase tracking-[0.22em] text-[#4F46E5]">
            {isCompanySwitching ? 'SWITCHING...' : getRoleLabel(activeEmployeeRecord?.role || 'staff')}
          </p>
        </div>

        <button
          onClick={onLogout}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-slate-600 transition-all hover:bg-slate-200"
        >
          <LogOut className="h-4 w-4" />
        </button>

        {showNotificationsPanel ? (
          <div className="absolute right-0 top-full z-50 mt-2 max-h-[360px] w-[300px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.10)]">
            <div className="mb-1 flex items-center justify-between border-b border-slate-100 px-2 py-1">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Notifications</p>
              <div className="flex items-center gap-2">
                {userNotifications.length > 0 ? (
                  <button
                    onClick={onClearAllNotifications}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  >
                    Clear all
                  </button>
                ) : null}
                <button onClick={onCloseNotificationsPanel} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
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
                    onClick={() => onMarkNotificationAsRead(item.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      item.is_read ? 'border-slate-100 bg-white' : 'border-indigo-100 bg-indigo-50'
                    }`}
                  >
                    <p className={`text-xs font-bold ${item.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{item.title}</p>
                    <p className={`mt-0.5 text-xs ${item.is_read ? 'text-slate-500' : 'text-slate-700'}`}>{item.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{formatNotificationTimeAgo(item.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default AppHeader;
