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
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );
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
    if (!showCompanySwitcher || isMobile) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!companySwitcherRef.current?.contains(event.target as Node)) {
        setShowCompanySwitcher(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isMobile, showCompanySwitcher]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 768;
      setIsMobile(nextIsMobile);
      setShowCompanySwitcher(false);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const activeWorkspaceName = activeWorkspace?.companyName || 'Workspace';

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-white/95 px-4 py-4 pt-safe-top font-sans text-slate-900 shadow-sm backdrop-blur sm:px-6"
      style={{ paddingTop: 'max(3rem, 1.25rem)' }}
    >
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="rounded-[1rem] border border-[var(--border)] bg-white p-1 shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
          <img src="/icon-192.png" alt="OpenTask logo" className="h-8 w-8 rounded-[0.75rem]" />
        </div>
        <div>
          <h1 className="leading-none text-lg font-black tracking-tight text-slate-900">OpenTask</h1>
          <div className="online-indicator mt-1 flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isSyncing ? 'animate-pulse bg-emerald-400' : 'bg-emerald-400'}`} />
            <span className="font-ui-mono text-[8px] font-medium uppercase tracking-[0.22em] text-[var(--ink-3)]">
              {isSyncing ? 'Syncing...' : 'Online'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-2 sm:gap-4" ref={companySwitcherRef}>
        {availableCompanies.length > 1 ? (
          <div className="relative w-fit shrink-0">
            <button
              type="button"
              onClick={() => setShowCompanySwitcher((prev) => !prev)}
              className="min-h-[44px] bg-transparent p-0 text-left font-sans transition-all"
            >
              <div className="hidden items-center gap-1 sm:flex sm:gap-2">
                <p className="max-w-[110px] truncate text-sm font-bold text-gray-900 sm:max-w-[200px] sm:text-base">
                  {activeWorkspaceName}
                </p>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showCompanySwitcher ? 'rotate-180' : ''}`} />
              </div>
              <div className="flex flex-col sm:hidden">
                <p className="max-w-[110px] truncate text-sm font-bold text-gray-900">{activeWorkspaceName}</p>
                <span className="switch-label mt-0.5 items-center gap-1 text-[10px] font-medium text-[#888]">
                  <span>Switch</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showCompanySwitcher ? 'rotate-180' : ''}`} />
                </span>
              </div>
            </button>
            {showCompanySwitcher && !isMobile && (
              <div className="absolute left-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-100 bg-white shadow-lg sm:left-auto sm:right-0 sm:max-w-[calc(100vw-1rem)] sm:rounded-3xl sm:border-[var(--border)] sm:shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
                <div className="max-h-[60vh] overflow-y-auto p-2 sm:max-h-none">
                  <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Switch Workspace
                  </p>
                  <div className="space-y-1">
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
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all sm:rounded-2xl ${
                            isActiveWorkspace
                              ? 'border-[#4F46E5]/20 bg-[var(--accent-light)] shadow-[0_4px_12px_rgba(79,70,229,0.08)]'
                              : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{workspace.companyName}</p>
                            <span className="mt-1 inline-flex rounded-full bg-[var(--accent-light)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#4F46E5]">
                              {getRoleLabel(workspace.role)}
                            </span>
                          </div>
                          {isActiveWorkspace ? <Check className="h-4 w-4 text-[#4F46E5]" /> : null}
                        </button>
                      );
                    })}
                  </div>
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

      {isMobile && showCompanySwitcher ? (
        <>
          <div
            className="fixed inset-0 z-[999] bg-black/50"
            onClick={() => setShowCompanySwitcher(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[1000] rounded-t-[16px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 shadow-[0_-12px_28px_rgba(15,23,42,0.18)]"
            style={{
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="m-0 text-[18px] font-bold text-slate-900">Switch Workspace</h3>
              <button
                type="button"
                onClick={() => setShowCompanySwitcher(false)}
                className="border-none bg-transparent p-0 text-[20px] text-slate-600"
                aria-label="Close workspace switcher"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {availableCompanies.map((workspace, index) => {
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
                    className="mb-2.5 flex w-full items-center rounded-xl px-4 py-3.5 text-left"
                    style={{
                      border: isActiveWorkspace ? '2px solid #4F46E5' : '1px solid #eee',
                      background: isActiveWorkspace ? '#F0F0FF' : '#fff',
                    }}
                  >
                    <div
                      className="mr-3.5 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{
                        border: '2px solid',
                        borderColor: isActiveWorkspace ? '#4F46E5' : '#ccc',
                      }}
                    >
                      {isActiveWorkspace ? (
                        <div className="h-2.5 w-2.5 rounded-full bg-[#4F46E5]" />
                      ) : null}
                    </div>

                    <span className="flex-1 text-[15px] font-semibold text-slate-900">{workspace.companyName}</span>

                    <span
                      className="rounded-lg px-2.5 py-1 text-sm font-bold"
                      style={{
                        background: isActiveWorkspace ? '#4F46E5' : '#f0f0f0',
                        color: isActiveWorkspace ? '#fff' : '#666',
                      }}
                    >
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
};

export default AppHeader;
