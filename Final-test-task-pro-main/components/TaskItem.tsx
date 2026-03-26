import React from 'react';
import { DealershipTask, Employee, TaskExtensionStatus } from '../types';
import { User, Calendar, ChevronRight, Clock, MessageSquare, Flag, CheckCircle2 } from 'lucide-react';

interface TaskItemProps {
  task: DealershipTask;
  employees: Employee[];
  onClick: () => void;
  unreadCount?: number;
  showCompletedMeta?: boolean;
}

const formatShortDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};

const formatCompletedDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  return `${day} ${month} at ${hours12}:${minutes}${ampm}`;
};

const getInitials = (name?: string | null): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const TaskItem: React.FC<TaskItemProps> = ({ task, employees, onClick, unreadCount = 0, showCompletedMeta = false }) => {
  const getEmployeeName = (id?: string): string | null => {
    if (!id) return null;
    return employees.find(e => e.id === id)?.name || null;
  };

  const isOverdue =
    task.status !== 'completed' &&
    task.status !== 'pending_approval' &&
    task.deadline != null &&
    Date.now() > task.deadline;
  const assigneeName = getEmployeeName(task.assignedTo);
  const rawPriority = String((task as any).priority || '').trim().toLowerCase();
  const normalizedPriority = rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
  const isHighPriority = normalizedPriority === 'High';
  const isCompletedView = showCompletedMeta && task.status === 'completed';
  const cardClass = isCompletedView
    ? 'border border-emerald-200 bg-[var(--green-light)]/90 border-l-[3px] border-l-[var(--green)] opacity-85'
    : isOverdue
    ? 'border border-red-200 bg-[var(--red-light)] border-l-[3px] border-l-[var(--red)]'
    : 'border border-[var(--border)] bg-white border-l-[3px] border-l-[var(--accent)]';
  const completedAtLabel =
    task.completedAt && Number(task.completedAt) > 0
      ? formatCompletedDateTime(Number(task.completedAt))
      : 'recently';

  const rawExtensionStatus = String(
    (task as any).extensionStatus ?? (task as any).extension_status ?? 'NONE'
  ).toUpperCase();
  const extensionStatus: TaskExtensionStatus =
    rawExtensionStatus === 'REQUESTED' ||
    rawExtensionStatus === 'APPROVED' ||
    rawExtensionStatus === 'REJECTED'
      ? (rawExtensionStatus as TaskExtensionStatus)
      : 'NONE';

  const showBadges =
    isOverdue ||
    extensionStatus !== 'NONE' ||
    task.status === 'completed' ||
    task.status === 'pending_approval' ||
    task.status === 'in-progress';

  return (
    <button
      type="button"
      onClick={onClick}
      id={`task-card-${task.id}`}
      className={`w-full text-left rounded-2xl ${cardClass} shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 sm:p-5 min-h-[120px] active:scale-[0.98] transition-all duration-150 hover:shadow-[0_6px_20px_rgba(10,10,15,0.08)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-light)]`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {isCompletedView ? (
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white/70 px-2.5 py-0.5 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-ui-mono text-xs font-medium uppercase tracking-wide">
                  Completed
                </span>
            </div>
          ) : (
            isHighPriority && (
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white/70 px-2.5 py-0.5 text-red-600">
                <Flag className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                <span className="font-ui-mono text-[11px] font-medium uppercase tracking-[0.2em]">
                  High Priority
                </span>
              </div>
            )
          )}

          {/* Task Title */}
          <h3 className={`text-base md:text-lg font-semibold leading-snug line-clamp-2 text-ellipsis overflow-hidden break-words ${isCompletedView ? 'text-slate-600 line-through decoration-slate-400 decoration-2' : 'text-slate-900'}`}>
            {task.description}
          </h3>

          {/* Metadata Row */}
          {isCompletedView ? (
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-base text-emerald-600 font-ui-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Completed {completedAtLabel}</span>
              </span>
              <span className="flex items-center gap-1.5 text-base text-emerald-700">
                <User className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <span className="truncate max-w-[180px]">{assigneeName || 'Unknown'}</span>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {assigneeName && (
                <span className="flex items-center gap-2 text-base text-[var(--ink-2)]">
                  <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold text-[var(--ink-2)]">
                    {getInitials(assigneeName)}
                  </span>
                  <span className="truncate max-w-[140px]">{assigneeName}</span>
                </span>
              )}
              {task.deadline != null && (
                <span
                  className={`flex items-center gap-1.5 text-base font-ui-mono ${
                    isOverdue ? 'text-[var(--red)] font-medium' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {isOverdue ? (
                    <Clock className="w-4 h-4 text-red-400 flex-shrink-0" />
                  ) : (
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                  <span>
                    {formatShortDate(task.deadline)}
                    {isOverdue && ' (Overdue)'}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Status Badges */}
          {showBadges && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {extensionStatus === 'REQUESTED' && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--orange-light)] text-[var(--orange)] border border-amber-200">
                  Extension Requested
                </span>
              )}
              {extensionStatus === 'APPROVED' && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--green-light)] text-[var(--green)] border border-emerald-200">
                  Extended
                </span>
              )}
              {extensionStatus === 'REJECTED' && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--red-light)] text-[var(--red)] border border-red-200">
                  Extension Rejected
                </span>
              )}
              {isOverdue && extensionStatus === 'NONE' && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--red-light)] text-[var(--red)] border border-red-200">
                  Overdue
                </span>
              )}
              {task.status === 'completed' && !isCompletedView && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--green-light)] text-[var(--green)] border border-emerald-200">
                  Completed
                </span>
              )}
              {task.status === 'pending_approval' && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  Pending Approval
                </span>
              )}
              {task.status === 'in-progress' && extensionStatus === 'NONE' && !isOverdue && (
                <span className="font-ui-mono inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-light)] text-[var(--accent)] border border-indigo-200">
                  In Progress
                </span>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto self-end flex items-center justify-end md:flex-col md:items-end gap-2">
          <div className="relative h-10 w-10 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-3)]">
            <MessageSquare className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="font-ui-mono absolute -top-1.5 -right-1.5 bg-[var(--red)] text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-medium leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
        </div>
      </div>
    </button>
  );
};

export default TaskItem;
