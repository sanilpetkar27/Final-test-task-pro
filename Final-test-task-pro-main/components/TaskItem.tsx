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

const TaskItem: React.FC<TaskItemProps> = ({ task, employees, onClick, unreadCount = 0, showCompletedMeta = false }) => {
  const getEmployeeName = (id?: string): string | null => {
    if (!id) return null;
    return employees.find(e => e.id === id)?.name || null;
  };

  const isOverdue = task.status !== 'completed' && task.deadline != null && Date.now() > task.deadline;
  const assigneeName = getEmployeeName(task.assignedTo);
  const rawPriority = String((task as any).priority || '').trim().toLowerCase();
  const normalizedPriority = rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
  const isHighPriority = normalizedPriority === 'High';
  const isCompletedView = showCompletedMeta && task.status === 'completed';
  const priorityCardClass = isHighPriority
    ? 'border-2 border-red-400 bg-red-50/70'
    : 'border border-slate-200 bg-white';
  const cardClass = isCompletedView
    ? 'border border-emerald-300 bg-emerald-50/60'
    : priorityCardClass;
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
    task.status === 'in-progress';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl ${cardClass} shadow-sm p-4 sm:p-5 min-h-[120px] active:scale-[0.98] transition-all duration-150 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-100`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {isCompletedView ? (
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white/70 px-2.5 py-0.5 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Completed
              </span>
            </div>
          ) : (
            isHighPriority && (
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white/70 px-2.5 py-0.5 text-red-600">
                <Flag className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.2em]">
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
              <span className="flex items-center gap-1.5 text-base text-emerald-600">
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
                <span className="flex items-center gap-1.5 text-base text-slate-500">
                  <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="truncate max-w-[140px]">{assigneeName}</span>
                </span>
              )}
              {task.deadline != null && (
                <span
                  className={`flex items-center gap-1.5 text-base ${
                    isOverdue ? 'text-red-500 font-medium' : 'text-slate-500'
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
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Extension Requested
                </span>
              )}
              {extensionStatus === 'APPROVED' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Extended
                </span>
              )}
              {extensionStatus === 'REJECTED' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                  Extension Rejected
                </span>
              )}
              {isOverdue && extensionStatus === 'NONE' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                  Overdue
                </span>
              )}
              {task.status === 'completed' && !isCompletedView && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Completed
                </span>
              )}
              {task.status === 'in-progress' && extensionStatus === 'NONE' && !isOverdue && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  In Progress
                </span>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto self-end flex items-center justify-end md:flex-col md:items-end gap-2">
          <div className="relative h-10 w-10 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500">
            <MessageSquare className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold leading-none">
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
