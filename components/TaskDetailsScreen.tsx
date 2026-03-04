import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DealershipTask, Employee, TaskRemark, TaskType, RecurrenceFrequency, TaskExtensionStatus } from '../types';
import {
  ArrowLeft, User, Calendar, Clock, Check, Camera,
  Edit, Trash2, UserPlus, Play, RotateCcw,
  Send, X, ChevronDown, CalendarClock, Layers, CheckCircle, Phone,
  Eye, GitFork
} from 'lucide-react';
import { supabase } from '../src/lib/supabase';

interface TaskDetailsScreenProps {
  task: DealershipTask;
  subTasks: DealershipTask[];
  parentTask?: DealershipTask;
  employees: Employee[];
  currentUser: Employee;
  onBack: () => void;
  onStartTask: () => void;
  onReopenTask: () => void;
  onCompleteTask: (proof: { imageUrl: string; timestamp: number }) => void;
  onCompleteTaskWithoutPhoto: () => void;
  onReassign: () => void;
  onDelegate: () => void;
  onDelete: () => void;
  onInlineEditSave?: (
    taskId: string,
    payload: {
      description: string;
      assignedTo: string | null;
      deadline?: number;
      requirePhoto: boolean;
      taskType: TaskType;
      recurrenceFrequency: RecurrenceFrequency | null;
    }
  ) => Promise<boolean>;
  onAddRemark?: (taskId: string, remark: string) => void;
}

// --- Helpers ---

interface NormalizedTaskRemark extends TaskRemark {
  timestamp: number;
  employeeName: string;
}

interface TaskRemarkGroup {
  dateKey: string;
  label: string;
  remarks: NormalizedTaskRemark[];
}

const formatFullDate = (timestamp: number | undefined | null): string => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const formatRemarkDateHeader = (timestamp: number): string => {
  const d = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatRemarkTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

const getRemarkDateKey = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const p = Date.parse(value);
    if (Number.isFinite(p)) return p;
  }
  return null;
};

const formatDateTimeForInput = (timestamp?: number | null): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
};

const getRoleBadge = (role?: string): { label: string; className: string } => {
  if (role === 'owner' || role === 'super_admin') return { label: 'OWNER', className: 'bg-purple-100 text-purple-700' };
  if (role === 'manager') return { label: 'MANAGER', className: 'bg-slate-200 text-slate-700' };
  return { label: 'FIELD STAFF', className: 'bg-amber-100 text-amber-700' };
};

// --- Component ---

const TaskDetailsScreen: React.FC<TaskDetailsScreenProps> = ({
  task, subTasks, parentTask, employees, currentUser, onBack,
  onStartTask, onReopenTask, onCompleteTask, onCompleteTaskWithoutPhoto,
  onReassign, onDelegate, onDelete, onInlineEditSave, onAddRemark
}) => {
  const [newRemark, setNewRemark] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [showExtensionInput, setShowExtensionInput] = useState(false);
  const [extensionDate, setExtensionDate] = useState('');
  const [isExtensionUpdating, setIsExtensionUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editAssigneeId, setEditAssigneeId] = useState(task.assignedTo || 'none');
  const [editDeadline, setEditDeadline] = useState('');
  const [editRequirePhoto, setEditRequirePhoto] = useState(Boolean(task.requirePhoto));
  const [editTaskType, setEditTaskType] = useState<TaskType>('one_time');
  const [editRecurrenceFrequency, setEditRecurrenceFrequency] = useState<RecurrenceFrequency | ''>('');
  const remarksScrollRef = useRef<HTMLDivElement | null>(null);

  // --- Derived values ---
  const getEmployeeName = (id?: string | null): string => {
    if (!id) return 'Unassigned';
    return employees.find(e => e.id === id)?.name || 'Unknown';
  };

  const getEmployeeRole = (id?: string | null): string | undefined => {
    if (!id) return undefined;
    return employees.find(e => e.id === id)?.role;
  };

  const getEmployeeMobile = (id?: string | null): string => {
    if (!id) return '';
    return String(employees.find(e => e.id === id)?.mobile || '');
  };

  const getTelHref = (mobile: string): string | null => {
    const trimmed = String(mobile || '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('+')) {
      const digits = trimmed.slice(1).replace(/\D/g, '');
      return digits ? `tel:+${digits}` : null;
    }
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `tel:${digits}` : null;
  };

  const isOverdue = task.status !== 'completed' && task.deadline != null && Date.now() > task.deadline;
  const assigneeName = getEmployeeName(task.assignedTo);
  const assignerName = getEmployeeName(task.assignedBy);
  const assigneeTelHref = getTelHref(getEmployeeMobile(task.assignedTo));
  const assignerTelHref = getTelHref(getEmployeeMobile(task.assignedBy));

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin' || currentUser.role === 'owner';

  const rawTaskType = String((task as any).taskType ?? (task as any).task_type ?? '').toLowerCase();
  const rawRecurrence = String((task as any).recurrenceFrequency ?? (task as any).recurrence_frequency ?? '').toLowerCase();
  const normalizedTaskType: TaskType = rawTaskType === 'recurring' ? 'recurring' : 'one_time';
  const normalizedRecurrence = (rawRecurrence === 'daily' || rawRecurrence === 'weekly' || rawRecurrence === 'monthly') ? rawRecurrence : null;

  const rawExtensionStatus = String((task as any).extensionStatus ?? (task as any).extension_status ?? 'NONE').toUpperCase();
  const extensionStatus: TaskExtensionStatus =
    rawExtensionStatus === 'REQUESTED' || rawExtensionStatus === 'APPROVED' || rawExtensionStatus === 'REJECTED'
      ? (rawExtensionStatus as TaskExtensionStatus) : 'NONE';
  const requestedDueDate = parseTimestamp((task as any).requestedDueDate) ?? parseTimestamp((task as any).requested_due_date);

  const assignedEmployee = task.assignedTo ? employees.find(e => e.id === task.assignedTo) : undefined;
  const assignerEmployee = task.assignedBy ? employees.find(e => e.id === task.assignedBy) : undefined;
  const normalizedCurrentEmail = String(currentUser.email || '').trim().toLowerCase();
  const normalizedAssignedEmail = String(assignedEmployee?.email || '').trim().toLowerCase();
  const normalizedAssignerEmail = String(assignerEmployee?.email || '').trim().toLowerCase();

  const isAssignedWorker =
    task.assignedTo === currentUser.id ||
    (typeof currentUser.auth_user_id === 'string' && task.assignedTo === currentUser.auth_user_id) ||
    (typeof assignedEmployee?.auth_user_id === 'string' && assignedEmployee.auth_user_id === currentUser.id) ||
    (typeof assignedEmployee?.auth_user_id === 'string' && typeof currentUser.auth_user_id === 'string' && assignedEmployee.auth_user_id === currentUser.auth_user_id) ||
    Boolean(normalizedCurrentEmail && normalizedAssignedEmail && normalizedCurrentEmail === normalizedAssignedEmail);

  const isTaskAssigner =
    task.assignedBy === currentUser.id ||
    (typeof currentUser.auth_user_id === 'string' && task.assignedBy === currentUser.auth_user_id) ||
    (typeof assignerEmployee?.auth_user_id === 'string' && assignerEmployee.auth_user_id === currentUser.id) ||
    (typeof assignerEmployee?.auth_user_id === 'string' && typeof currentUser.auth_user_id === 'string' && assignerEmployee.auth_user_id === currentUser.auth_user_id) ||
    Boolean(normalizedCurrentEmail && normalizedAssignerEmail && normalizedCurrentEmail === normalizedAssignerEmail);

  // Only the task assigner can edit or delete the task
  const canDelete = isTaskAssigner;
  const canEdit = isTaskAssigner;

  const canApproveExtension = currentUser.role === 'owner' || currentUser.role === 'super_admin' || isTaskAssigner;
  const canRequestExtension = isAssignedWorker && task.status === 'in-progress' && extensionStatus !== 'REQUESTED';
  const canReviewExtensionRequest = canApproveExtension && !isAssignedWorker && task.status === 'in-progress' && extensionStatus === 'REQUESTED' && Boolean(requestedDueDate);

  // --- Remarks ---
  const normalizedRemarks = useMemo(() => {
    const raw = Array.isArray(task.remarks) ? task.remarks : [];
    return raw
      .map((remark, index): NormalizedTaskRemark | null => {
        if (!remark || typeof remark !== 'object') return null;
        const rawTs = (remark as { timestamp?: number | string }).timestamp;
        const numTs = typeof rawTs === 'number' ? rawTs : typeof rawTs === 'string' && rawTs.trim() ? (Number.isFinite(Number(rawTs)) ? Number(rawTs) : Date.parse(rawTs)) : NaN;
        const resolvedTs = Number.isFinite(numTs) ? numTs : Date.now();
        const fallbackName = (remark.employeeId && getEmployeeName(remark.employeeId)) || 'Unknown User';
        const resolvedName = typeof remark.employeeName === 'string' && remark.employeeName.trim() ? remark.employeeName.trim() : fallbackName;
        const remarkText = typeof remark.remark === 'string' ? remark.remark.trim() : '';
        if (!remarkText) return null;
        return { ...remark, id: remark.id || `remark_${task.id}_${index}`, employeeName: resolvedName, timestamp: resolvedTs, remark: remarkText };
      })
      .filter((r): r is NormalizedTaskRemark => Boolean(r))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [task.remarks, task.id, employees]);

  const groupedRemarks = useMemo<TaskRemarkGroup[]>(() => {
    const groups: TaskRemarkGroup[] = [];
    const map = new Map<string, TaskRemarkGroup>();
    normalizedRemarks.forEach(remark => {
      const key = getRemarkDateKey(remark.timestamp);
      const existing = map.get(key);
      if (existing) { existing.remarks.push(remark); return; }
      const group: TaskRemarkGroup = { dateKey: key, label: formatRemarkDateHeader(remark.timestamp), remarks: [remark] };
      map.set(key, group);
      groups.push(group);
    });
    return groups;
  }, [normalizedRemarks]);

  // --- Effects ---
  useEffect(() => {
    setEditDescription(task.description);
    setEditAssigneeId(task.assignedTo || 'none');
    setEditDeadline(formatDateTimeForInput(task.deadline));
    setEditRequirePhoto(Boolean(task.requirePhoto));
    setEditTaskType(normalizedTaskType);
    setEditRecurrenceFrequency(normalizedTaskType === 'recurring' ? (normalizedRecurrence || '') : '');
    setIsEditing(false);
  }, [task.id, task.description, task.assignedTo, task.deadline, task.requirePhoto, normalizedTaskType, normalizedRecurrence]);

  useEffect(() => {
    if (remarksScrollRef.current) {
      remarksScrollRef.current.scrollTop = remarksScrollRef.current.scrollHeight;
    }
  }, [groupedRemarks]);

  useEffect(() => {
    setShowExtensionInput(false);
    setExtensionDate(formatDateTimeForInput(requestedDueDate ?? task.deadline));
  }, [task.id, requestedDueDate, task.deadline]);

  // --- Handlers ---
  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const fileName = `task-proof-${task.id}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('task-proofs').upload(fileName, file, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (error) { alert('Failed to upload photo: ' + error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('task-proofs').getPublicUrl(fileName);
      onCompleteTask({ imageUrl: publicUrl, timestamp: Date.now() });
    } catch (error) {
      alert('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerPhotoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handlePhotoUpload(file);
    };
    input.click();
  };

  const handleAddRemark = () => {
    if (newRemark.trim() && onAddRemark) {
      onAddRemark(task.id, newRemark.trim());
      setNewRemark('');
    }
  };

  const updateTaskExtensionFields = async (snakePayload: Record<string, unknown>, camelPayload?: Record<string, unknown>) => {
    let { error } = await supabase.from('tasks').update(snakePayload).eq('id', task.id);
    if (!error) return null;
    const msg = String(error?.message || '').toLowerCase();
    if ((msg.includes('column') && msg.includes('does not exist')) && camelPayload) {
      const retry = await supabase.from('tasks').update(camelPayload).eq('id', task.id);
      error = retry.error;
    }
    return error || null;
  };

  const handleRequestExtension = async () => {
    if (!extensionDate || isExtensionUpdating) return;
    const requestedTs = new Date(extensionDate).getTime();
    if (!Number.isFinite(requestedTs)) { alert('Please select a valid date.'); return; }
    setIsExtensionUpdating(true);
    const error = await updateTaskExtensionFields(
      { extension_status: 'REQUESTED', requested_due_date: new Date(requestedTs).toISOString() },
      { extensionStatus: 'REQUESTED', requestedDueDate: new Date(requestedTs).toISOString() }
    );
    setIsExtensionUpdating(false);
    if (error) { alert(`Failed: ${error.message}`); return; }
    setShowExtensionInput(false);
  };

  const handleExtensionDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (isExtensionUpdating || !requestedDueDate) return;
    setIsExtensionUpdating(true);
    const snake: Record<string, unknown> = { extension_status: decision };
    const camel: Record<string, unknown> = { extensionStatus: decision };
    if (decision === 'APPROVED') { snake.deadline = requestedDueDate; camel.deadline = requestedDueDate; }
    const error = await updateTaskExtensionFields(snake, camel);
    setIsExtensionUpdating(false);
    if (error) alert(`Failed: ${error.message}`);
  };

  const handleEditSave = async () => {
    if (!onInlineEditSave || isSavingEdit) return;
    const rec: RecurrenceFrequency | null = editTaskType === 'recurring' ? (editRecurrenceFrequency || null) : null;
    if (!editDescription.trim()) { alert('Description required.'); return; }
    if (editTaskType === 'recurring' && !rec) { alert('Select recurrence frequency.'); return; }
    setIsSavingEdit(true);
    const ok = await onInlineEditSave(task.id, {
      description: editDescription.trim(),
      assignedTo: editAssigneeId === 'none' ? null : editAssigneeId,
      deadline: editDeadline ? new Date(editDeadline).getTime() : undefined,
      requirePhoto: editRequirePhoto,
      taskType: editTaskType,
      recurrenceFrequency: rec,
    });
    setIsSavingEdit(false);
    if (ok) setIsEditing(false);
  };

  const handleDeleteAndGoBack = () => {
    onDelete();
    onBack();
  };

  // Auto-start task when opened and status is pending
  useEffect(() => {
    if (task.status === 'pending' && onStartTask) {
      onStartTask();
    }
  }, [task.id]); // Only run when task ID changes (component mounts with new task)

  // --- Build Quick Actions ---
  type QuickAction = { label: string; icon: React.ReactNode; onClick: () => void; className: string };
  const actions: QuickAction[] = [];

  if (task.status === 'pending') {
    // Start Task button removed - task auto-starts when opened
    if (isManager) {
      actions.push({
        label: 'Delegate', icon: <GitFork className="w-5 h-5" />, onClick: onDelegate,
        className: 'bg-indigo-700 text-white hover:bg-indigo-600'
      });
    }
    if (canEdit) {
      actions.push({
        label: 'Edit', icon: <Edit className="w-5 h-5" />, onClick: () => setIsEditing(true),
        className: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', icon: <Trash2 className="w-5 h-5" />, onClick: handleDeleteAndGoBack,
        className: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
      });
    }
  }

  if (task.status === 'in-progress') {
    if (isManager) {
      actions.push({
        label: 'Delegate', icon: <GitFork className="w-5 h-5" />, onClick: onDelegate,
        className: 'bg-indigo-700 text-white hover:bg-indigo-600'
      });
    }
    if (task.requirePhoto) {
      actions.push({
        label: isUploading ? 'Uploading...' : 'Complete', icon: isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-5 h-5" />,
        onClick: triggerPhotoUpload,
        className: 'bg-emerald-600 text-white hover:bg-emerald-700'
      });
    } else {
      actions.push({
        label: 'Complete', icon: <Check className="w-5 h-5" />, onClick: () => onCompleteTaskWithoutPhoto(),
        className: 'bg-emerald-600 text-white hover:bg-emerald-700'
      });
    }
    if (canRequestExtension) {
      actions.push({
        label: 'Extension', icon: <Clock className="w-5 h-5" />, onClick: () => setShowExtensionInput(prev => !prev),
        className: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
      });
    }
    if (canEdit) {
      actions.push({
        label: 'Edit', icon: <Edit className="w-5 h-5" />, onClick: () => setIsEditing(true),
        className: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', icon: <Trash2 className="w-5 h-5" />, onClick: handleDeleteAndGoBack,
        className: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
      });
    }
  }

  if (task.status === 'completed') {
    if (task.proof) {
      actions.push({
        label: 'View Proof', icon: <Eye className="w-5 h-5" />, onClick: () => setShowFullImage(true),
        className: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
      });
    }
    if (isManager) {
      actions.push({
        label: 'Reopen', icon: <RotateCcw className="w-5 h-5" />, onClick: onReopenTask,
        className: 'bg-indigo-700 text-white hover:bg-indigo-600'
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', icon: <Trash2 className="w-5 h-5" />, onClick: handleDeleteAndGoBack,
        className: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
      });
    }
  }

  // --- Status label ---
  const statusLabel = task.status === 'completed' ? 'Completed' : task.status === 'in-progress' ? 'In Progress' : 'Pending';
  const statusColor = task.status === 'completed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : task.status === 'in-progress' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : isOverdue ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-100 border-slate-200';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ─── Header ─── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
          style={{ minHeight: 48, minWidth: 48 }}
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <h1 className="text-lg font-bold text-slate-900">Task Details</h1>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Section: Task Info ── */}
        <div className="bg-white px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 leading-snug">
            {task.description}
          </h2>

          <div className="mt-4 space-y-3">
            {/* Assigned to */}
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-500">Assigned to</span>
              <span className="text-sm font-semibold text-slate-900 ml-1 inline-flex items-center gap-2">
                <span>{assigneeName}</span>
                {assigneeTelHref && (
                  <a
                    href={assigneeTelHref}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                    title={`Call ${assigneeName}`}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
              </span>
            </div>

            {/* Assigned by */}
            {task.assignedBy && (
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-500">Assigned by</span>
                <span className="text-sm font-semibold text-slate-900 ml-1 inline-flex items-center gap-2">
                  <span>{assignerName}</span>
                  {assignerTelHref && (
                    <a
                      href={assignerTelHref}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                      title={`Call ${assignerName}`}
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </span>
              </div>
            )}

            {/* Due date */}
            <div className="flex items-center gap-3">
              <Calendar className={`w-5 h-5 flex-shrink-0 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`} />
              <span className="text-sm text-slate-500">Due date</span>
              <span className={`text-sm font-semibold ml-1 ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                {task.deadline ? formatFullDate(task.deadline) : 'No deadline'}
              </span>
            </div>

            {/* Requested date (extension) */}
            {extensionStatus === 'REQUESTED' && requestedDueDate && (
              <div className="flex items-center gap-3">
                <CalendarClock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-500">Requested date</span>
                <span className="text-sm font-semibold text-amber-600 ml-1">{formatFullDate(requestedDueDate)}</span>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-3">
              <CheckCircle className={`w-5 h-5 flex-shrink-0 ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span className="text-sm text-slate-500">Status</span>
              <span className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-full border ml-1 ${statusColor}`}>{statusLabel}</span>
            </div>

            {/* Recurrence badge */}
            {normalizedTaskType === 'recurring' && (
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <span className="text-sm text-slate-500">Recurrence</span>
                <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 ml-1">
                  {normalizedRecurrence ? normalizedRecurrence.charAt(0).toUpperCase() + normalizedRecurrence.slice(1) : 'Recurring'}
                </span>
              </div>
            )}

            {/* Parent task */}
            {parentTask && (
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span className="text-sm text-slate-500">Part of</span>
                <span className="text-sm font-semibold text-amber-700 ml-1">{parentTask.description}</span>
              </div>
            )}

            {/* Photo required */}
            {task.requirePhoto && (
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-800 text-white">Photo Required</span>
              </div>
            )}

            {/* Completed timestamp */}
            {task.status === 'completed' && task.completedAt && (
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-500">Completed</span>
                <span className="text-sm font-semibold text-emerald-600 ml-1">{formatFullDate(task.completedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Section: Quick Actions Grid ── */}
        {actions.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Quick Actions</h3>
            <div className={`grid gap-3 ${actions.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={isUploading && action.label === 'Uploading...'}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 px-2 font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${action.className}`}
                  style={{ minHeight: 64 }}
                >
                  {action.icon}
                  <span className="text-xs font-bold uppercase tracking-wide">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Section: Extension Request Input ── */}
        {canRequestExtension && showExtensionInput && (
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-700">Request Deadline Extension</p>
              <input
                type="datetime-local"
                value={extensionDate}
                onChange={(e) => setExtensionDate(e.target.value)}
                className="w-full border border-amber-200 rounded-xl px-4 py-3 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                type="button"
                onClick={handleRequestExtension}
                disabled={!extensionDate || isExtensionUpdating}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 transition-colors"
                style={{ minHeight: 48 }}
              >
                {isExtensionUpdating ? 'Sending...' : 'Send Extension Request'}
              </button>
            </div>
          </div>
        )}

        {/* Staff extension pending indicator */}
        {isAssignedWorker && extensionStatus === 'REQUESTED' && !canReviewExtensionRequest && (
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm font-bold text-amber-700">Extension Requested</p>
              <p className="text-xs text-amber-600 mt-1">Waiting for manager approval</p>
            </div>
          </div>
        )}

        {/* ── Section: Manager Approval ── */}
        {canReviewExtensionRequest && (
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-3">
              <p className="text-base font-bold text-amber-700">Extension Requested</p>
              <p className="text-sm text-slate-600 mt-1">
                New deadline: {requestedDueDate ? formatFullDate(requestedDueDate) : 'selected date'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleExtensionDecision('APPROVED')}
                disabled={isExtensionUpdating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-50 transition-colors active:scale-95"
                style={{ minHeight: 52 }}
              >
                {isExtensionUpdating ? 'Updating...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => handleExtensionDecision('REJECTED')}
                disabled={isExtensionUpdating}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-50 transition-colors active:scale-95"
                style={{ minHeight: 52 }}
              >
                {isExtensionUpdating ? 'Updating...' : 'Reject'}
              </button>
            </div>
          </div>
        )}

        {/* ── Section: Discussion ── */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-slate-200" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2">Discussion</h3>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div ref={remarksScrollRef} className="space-y-4 pb-4">
            {groupedRemarks.length > 0 ? (
              groupedRemarks.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <div className="flex justify-center py-1">
                    <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {group.label}
                    </span>
                  </div>
                  {group.remarks.map((remark, i) => {
                    const isOwn = remark.employeeId === currentUser.id;
                    const remarkRole = getEmployeeRole(remark.employeeId);
                    const badge = getRoleBadge(remarkRole);
                    return (
                      <div key={`${group.dateKey}_${remark.id}_${i}`} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[85%]">
                          {/* Name + role badge */}
                          <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-xs font-bold text-slate-700">{remark.employeeName}</span>
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
                          </div>
                          {/* Message bubble */}
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            isOwn
                              ? 'bg-indigo-900 text-white rounded-br-md'
                              : 'bg-slate-100 text-slate-800 rounded-bl-md'
                          }`}>
                            <p className="text-sm leading-relaxed break-words">{remark.remark}</p>
                          </div>
                          {/* Timestamp */}
                          <p className={`text-[10px] text-slate-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                            {formatRemarkTime(remark.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">No discussion yet. Start the conversation below.</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Chat Input Bar (sticky bottom) ─── */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={newRemark}
            onChange={(e) => setNewRemark(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none min-h-[48px] max-h-28"
            rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddRemark(); } }}
          />
          <button
            type="button"
            onClick={handleAddRemark}
            disabled={!newRemark.trim()}
            className="bg-indigo-900 text-white p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 hover:bg-indigo-800"
            style={{ minHeight: 48, minWidth: 48 }}
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── Edit Task Modal ─── */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSavingEdit && setIsEditing(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-700" />
                Edit Task
              </h2>
              {!isSavingEdit && (
                <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="p-4 space-y-4">
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Task description"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none min-h-[80px]"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <select value={editTaskType} onChange={(e) => { setEditTaskType(e.target.value as TaskType); if (e.target.value === 'one_time') setEditRecurrenceFrequency(''); }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none pr-10">
                    <option value="one_time">One-time Task</option>
                    <option value="recurring">Recurring Task</option>
                  </select>
                  <Clock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {editTaskType === 'recurring' && (
                  <div className="relative">
                    <select value={editRecurrenceFrequency} onChange={(e) => setEditRecurrenceFrequency(e.target.value === '' ? '' : (e.target.value as RecurrenceFrequency))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none pr-10">
                      <option value="">Select Frequency</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <select value={editAssigneeId} onChange={(e) => setEditAssigneeId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none pr-10">
                    <option value="none">Anyone / Unassigned</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === 'super_admin' || emp.role === 'owner' ? 'Owner' : emp.role === 'manager' ? 'Manager' : 'Staff'})</option>
                    ))}
                  </select>
                  <UserPlus className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <input type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editRequirePhoto} onChange={(e) => setEditRequirePhoto(e.target.checked)}
                  className="w-4 h-4 text-indigo-900 rounded focus:ring-indigo-200 border-slate-300" />
                Require photo proof
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} disabled={isSavingEdit}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-semibold transition-all disabled:opacity-50" style={{ minHeight: 48 }}>
                  Cancel
                </button>
                <button type="button" onClick={handleEditSave} disabled={isSavingEdit}
                  className="flex-1 bg-indigo-900 hover:bg-indigo-800 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-60 active:scale-95" style={{ minHeight: 48 }}>
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Proof Image Modal ─── */}
      {showFullImage && task.proof && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Task Proof</h3>
              <button onClick={() => setShowFullImage(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-4">
              <img src={task.proof.imageUrl} alt="Task proof" className="w-full rounded-lg" />
              <p className="text-sm text-slate-500 mt-2">Completed: {new Date(task.proof.timestamp).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetailsScreen;
