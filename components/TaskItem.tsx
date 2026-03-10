import React from 'react';
import { DealershipTask, Employee, TaskExtensionStatus } from '../types';
import { User, Calendar, ChevronRight, Clock, MessageSquare } from 'lucide-react';

interface TaskItemProps {
  task: DealershipTask;
  employees: Employee[];
  onClick: () => void;
  unreadCount?: number;
}

const formatShortDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};

const TaskItem: React.FC<TaskItemProps> = ({ task, employees, onClick, unreadCount = 0 }) => {
  const getEmployeeName = (id?: string): string | null => {
    if (!id) return null;
    return employees.find(e => e.id === id)?.name || null;
  };

  const isOverdue = task.status !== 'completed' && task.deadline != null && Date.now() > task.deadline;
  const assigneeName = getEmployeeName(task.assignedTo);
  const rawPriority = String((task as any).priority || '').trim().toLowerCase();
  const normalizedPriority = rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
  const priorityCardClass =
    normalizedPriority === 'High'
      ? 'border border-red-500 bg-red-50'
      : 'border border-slate-200 bg-white';

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
      className={`w-full text-left rounded-2xl ${priorityCardClass} shadow-sm px-5 py-4 active:scale-[0.98] transition-all duration-150 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-100`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {/* Task Title */}
          <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">
            {task.description}
          </h3>

          {/* Metadata Row */}
          <div className="flex items-center gap-4 mt-1.5">
            {assigneeName && (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="truncate max-w-[140px]">{assigneeName}</span>
              </span>
            )}
            {task.deadline != null && (
              <span
                className={`flex items-center gap-1.5 text-sm ${
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
              {task.status === 'completed' && (
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

        <div className="flex flex-col items-center gap-2">
          <div className="relative h-8 w-8 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500">
            <MessageSquare className="w-4 h-4" />
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
