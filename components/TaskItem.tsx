import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DealershipTask, Employee, TaskRemark, TaskType, RecurrenceFrequency } from '../types';
import { Check, Camera, Maximize2, User, UserCheck, GitFork, ChevronDown, ChevronRight, Layers, Trash2, AlertTriangle, Clock, ArrowRight, Play, RotateCcw, CheckCircle, UserPlus, X, Edit, MessageSquarePlus, Send } from 'lucide-react';
import { supabase } from '../src/lib/supabase';

interface TaskItemProps {
  task: DealershipTask;
  subTasks?: DealershipTask[];
  parentTask?: DealershipTask;
  employees: Employee[];
  currentUser: Employee;
  assigneeName?: string;
  assignerName?: string;
  onMarkComplete?: () => void;
  onCompleteWithPhoto?: (photoUrl: string) => void;
  onStartTask?: () => void;
  onReopenTask?: () => void;
  onCompleteTaskWithoutPhoto?: () => void;
  onDelegate?: () => void;
  onReassign?: () => void;
  onSubTaskComplete?: (id: string) => void;
  onDelete?: () => void;
  onInlineEditSave?: (
    taskId: string,
    updatePayload: {
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

interface NormalizedTaskRemark extends TaskRemark {
  timestamp: number;
  employeeName: string;
}

interface TaskRemarkGroup {
  dateKey: string;
  label: string;
  remarks: NormalizedTaskRemark[];
}

const getRemarkDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const formatRemarkDateHeader = (timestamp: number): string => {
  const remarkDate = new Date(timestamp);

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(remarkDate.getDate()).padStart(2, '0');
  const month = monthLabels[remarkDate.getMonth()];
  const year = remarkDate.getFullYear();
  return `${day} ${month} ${year}`;
};

const formatRemarkTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

const formatRemarkDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthLabels[date.getMonth()];
  const year = date.getFullYear();
  const time = formatRemarkTime(timestamp);

  return `${day} ${month} ${year}, ${time}`;
};

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  subTasks = [], 
  parentTask,
  employees, 
  currentUser, 
  assigneeName, 
  assignerName, 
  onMarkComplete,
  onCompleteWithPhoto,
  onStartTask,
  onReopenTask,
  onCompleteTaskWithoutPhoto,
  onDelegate,
  onReassign,
  onSubTaskComplete,
  onDelete,
  onInlineEditSave,
  onAddRemark
}) => {
  const [showFullImage, setShowFullImage] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [isSavingInlineEdit, setIsSavingInlineEdit] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editAssigneeId, setEditAssigneeId] = useState(task.assignedTo || 'none');
  const [editDeadline, setEditDeadline] = useState('');
  const [editRequirePhoto, setEditRequirePhoto] = useState(Boolean(task.requirePhoto));
  const [editTaskType, setEditTaskType] = useState<TaskType>('one_time');
  const [editRecurrenceFrequency, setEditRecurrenceFrequency] = useState<RecurrenceFrequency | ''>('');
  const remarksScrollRef = useRef<HTMLDivElement | null>(null);

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';
  const canDelete = currentUser.id === task.assignedBy || isManager;
  const canEdit = currentUser.id === task.assignedBy || isManager;
  
  const completedSubTasks = subTasks.filter(st => st.status === 'completed');
  const hasSubTasks = subTasks.length > 0;
  const allSubTasksDone = hasSubTasks && completedSubTasks.length === subTasks.length;
  const isOverdue = task.status === 'pending' && task.deadline && Date.now() > task.deadline;

  // Name lookup logic
  const getEmployeeName = (employeeId: string | null | undefined) => {
    if (!employeeId) return 'Unknown';
    const employee = employees.find(emp => emp.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const assignerNameDisplay = getEmployeeName(task.assignedBy);
  const assigneeNameDisplay = getEmployeeName(task.assignedTo);
  const taskAvatarLabel = (
    task.assignedTo ? assigneeNameDisplay : assignerNameDisplay || task.description || 'Task'
  )
    .trim()
    .charAt(0)
    .toUpperCase();
  const taskStatusLabel =
    task.status === 'in-progress' ? 'In Progress' : task.status === 'completed' ? 'Done' : 'To Do';
  const taskStatusColorClass =
    task.status === 'completed'
      ? 'text-emerald-600'
      : task.status === 'in-progress'
      ? 'text-indigo-700'
      : isOverdue
      ? 'text-red-600'
      : 'text-slate-500';
  const rawTaskType = String((task as any).taskType ?? (task as any).task_type ?? '').toLowerCase();
  const rawRecurrenceFrequency = String(
    (task as any).recurrenceFrequency ?? (task as any).recurrence_frequency ?? ''
  ).toLowerCase();
  const normalizedTaskType: TaskType = rawTaskType === 'recurring' ? 'recurring' : 'one_time';
  const normalizedRecurrenceFrequency =
    rawRecurrenceFrequency === 'daily' || rawRecurrenceFrequency === 'weekly' || rawRecurrenceFrequency === 'monthly'
      ? rawRecurrenceFrequency
      : null;
  const recurrenceBadgeLabel = normalizedRecurrenceFrequency
    ? `Recurring: ${normalizedRecurrenceFrequency.charAt(0).toUpperCase()}${normalizedRecurrenceFrequency.slice(1)}`
    : normalizedTaskType === 'recurring'
    ? 'Recurring'
    : null;

  const normalizedRemarks = useMemo(() => {
    const rawRemarks = Array.isArray(task.remarks) ? task.remarks : [];

    return rawRemarks
      .map((remark, index): NormalizedTaskRemark | null => {
        if (!remark || typeof remark !== 'object') {
          return null;
        }

        const rawTimestamp = (remark as { timestamp?: number | string }).timestamp;
        const numericTimestamp =
          typeof rawTimestamp === 'number'
            ? rawTimestamp
            : typeof rawTimestamp === 'string' && rawTimestamp.trim()
            ? Number.isFinite(Number(rawTimestamp))
              ? Number(rawTimestamp)
              : Date.parse(rawTimestamp)
            : NaN;
        const resolvedTimestamp = Number.isFinite(numericTimestamp) ? numericTimestamp : Date.now();

        const fallbackEmployeeName =
          (remark.employeeId && getEmployeeName(remark.employeeId)) || 'Unknown User';
        const resolvedEmployeeName =
          typeof remark.employeeName === 'string' && remark.employeeName.trim()
            ? remark.employeeName.trim()
            : fallbackEmployeeName;
        const remarkText = typeof remark.remark === 'string' ? remark.remark.trim() : '';

        if (!remarkText) {
          return null;
        }

        return {
          ...remark,
          id: remark.id || `remark_${task.id}_${index}`,
          employeeName: resolvedEmployeeName,
          timestamp: resolvedTimestamp,
          remark: remarkText
        };
      })
      .filter((remark): remark is NormalizedTaskRemark => Boolean(remark))
      .sort((left, right) => left.timestamp - right.timestamp);
  }, [task.remarks, task.id, employees]);

  const groupedRemarks = useMemo<TaskRemarkGroup[]>(() => {
    const groups: TaskRemarkGroup[] = [];
    const groupMap = new Map<string, TaskRemarkGroup>();

    normalizedRemarks.forEach((remark) => {
      const dateKey = getRemarkDateKey(remark.timestamp);
      const existingGroup = groupMap.get(dateKey);

      if (existingGroup) {
        existingGroup.remarks.push(remark);
        return;
      }

      const newGroup: TaskRemarkGroup = {
        dateKey,
        label: formatRemarkDateHeader(remark.timestamp),
        remarks: [remark]
      };

      groupMap.set(dateKey, newGroup);
      groups.push(newGroup);
    });

    return groups;
  }, [normalizedRemarks]);

  const formatDateTimeForInput = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(timestamp - timezoneOffsetMs).toISOString().slice(0, 16);
  };

  const resetInlineEditState = () => {
    setEditDescription(task.description);
    setEditAssigneeId(task.assignedTo || 'none');
    setEditDeadline(formatDateTimeForInput(task.deadline));
    setEditRequirePhoto(Boolean(task.requirePhoto));
    setEditTaskType(normalizedTaskType);
    setEditRecurrenceFrequency(normalizedTaskType === 'recurring' ? (normalizedRecurrenceFrequency || '') : '');
  };

  useEffect(() => {
    resetInlineEditState();
    setIsInlineEditing(false);
  }, [
    task.id,
    task.description,
    task.assignedTo,
    task.deadline,
    task.requirePhoto,
    normalizedTaskType,
    normalizedRecurrenceFrequency
  ]);

  const startInlineEdit = () => {
    resetInlineEditState();
    setShowRemarkInput(false);
    setIsInlineEditing(true);
  };

  const cancelInlineEdit = () => {
    resetInlineEditState();
    setIsInlineEditing(false);
  };

  const handleInlineUpdateSave = async () => {
    if (!onInlineEditSave || isSavingInlineEdit) return;

    const normalizedRecurrence: RecurrenceFrequency | null =
      editTaskType === 'recurring' ? (editRecurrenceFrequency || null) : null;

    if (!editDescription.trim()) {
      alert('Task description is required.');
      return;
    }

    if (editTaskType === 'recurring' && !normalizedRecurrence) {
      alert('Please select recurrence frequency.');
      return;
    }

    setIsSavingInlineEdit(true);
    const success = await onInlineEditSave(task.id, {
      description: editDescription.trim(),
      assignedTo: editAssigneeId === 'none' ? null : editAssigneeId,
      deadline: editDeadline ? new Date(editDeadline).getTime() : undefined,
      requirePhoto: editRequirePhoto,
      taskType: editTaskType,
      recurrenceFrequency: normalizedRecurrence
    });
    setIsSavingInlineEdit(false);

    if (success) {
      setIsInlineEditing(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      console.log('📸 Starting photo upload for task:', task.id);
      
      // Upload to Supabase Storage
      const fileName = `task-proof-${task.id}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('task-proofs')
        .upload(fileName, file, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('❌ Photo upload error:', error);
        alert('Failed to upload photo: ' + error.message);
        return;
      }

      console.log('✅ Photo uploaded successfully:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-proofs')
        .getPublicUrl(fileName);

      console.log('🔗 Public URL:', publicUrl);
      alert('Photo uploaded successfully!');
      onCompleteWithPhoto?.(publicUrl);
      
    } catch (error) {
      console.error('❌ Photo upload error:', error);
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
      if (file) {
        handlePhotoUpload(file);
      }
    };
    input.click();
  };

  const handleAddRemark = () => {
    if (newRemark.trim() && onAddRemark) {
      onAddRemark(task.id, newRemark.trim());
      setNewRemark('');
    }
  };

  useEffect(() => {
    if (!showRemarkInput || !remarksScrollRef.current) {
      return;
    }

    const remarksContainer = remarksScrollRef.current;
    remarksContainer.scrollTop = remarksContainer.scrollHeight;
  }, [groupedRemarks, showRemarkInput]);

  return (
    <div className="space-y-2">
      <div className={`bg-white rounded-xl p-4 shadow-sm border ${isOverdue ? 'border-red-300 bg-red-50' : (task.status === 'completed' ? 'border-emerald-200' : (task.status === 'in-progress' ? 'border-indigo-200' : 'border-slate-200'))} flex flex-wrap items-start justify-between gap-3 transition-all relative overflow-hidden hover:bg-slate-50 hover:shadow-sm`}>
        
        {/* Overdue Warning Stripe */}
        {isOverdue && <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />}

        <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-black shrink-0 mt-0.5">
          {taskAvatarLabel || 'T'}
        </div>

        <div className="flex-1 min-w-0 pl-1">
          {isInlineEditing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                <Edit className="w-3.5 h-3.5" />
                Edit Task
              </div>

              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Task description"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 resize-none min-h-[72px]"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="relative">
                  <select
                    value={editTaskType}
                    onChange={(e) => {
                      const nextType = e.target.value as TaskType;
                      setEditTaskType(nextType);
                      if (nextType === 'one_time') {
                        setEditRecurrenceFrequency('');
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none pr-8"
                  >
                    <option value="one_time">One-time Task</option>
                    <option value="recurring">Recurring Task</option>
                  </select>
                  <Clock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {editTaskType === 'recurring' && (
                  <div className="relative">
                    <select
                      value={editRecurrenceFrequency}
                      onChange={(e) =>
                        setEditRecurrenceFrequency(
                          e.target.value === '' ? '' : (e.target.value as RecurrenceFrequency)
                        )
                      }
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none pr-8"
                    >
                      <option value="">Select Frequency</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="relative">
                  <select
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none pr-8"
                  >
                    <option value="none">Anyone / Unassigned</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role === 'super_admin' ? 'Super Admin' : emp.role === 'manager' ? 'Manager' : 'Staff'})
                      </option>
                    ))}
                  </select>
                  <UserPlus className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <input
                  type="datetime-local"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editRequirePhoto}
                  onChange={(e) => setEditRequirePhoto(e.target.checked)}
                  className="w-4 h-4 text-indigo-900 rounded focus:ring-slate-800 border-slate-300"
                />
                Require photo proof
              </label>
            </div>
          ) : (
            <>
              {/* Context Labels */}
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                 {isOverdue && (
                  <span className="inline-flex items-center gap-1 bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    Overdue
                  </span>
                )}
                {task.status === 'in-progress' && (
                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                    <Play className="w-3 h-3" />
                    In Progress
                  </span>
                )}
                {task.requirePhoto && (
                  <span className="inline-flex items-center gap-1 bg-slate-800 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                    <Camera className="w-3 h-3" />
                    Photo Required
                  </span>
                )}
                {parentTask && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border border-amber-100">
                    <Layers className="w-2.5 h-2.5" />
                    Part of: {parentTask.description}
                  </span>
                )}
                {hasSubTasks && (
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${allSubTasksDone ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {completedSubTasks.length}/{subTasks.length} DONE
                  </span>
                )}
                {recurrenceBadgeLabel && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-indigo-700 border border-slate-200">
                    {recurrenceBadgeLabel}
                  </span>
                )}
                {/* Minimal Assignment Info */}
                <span className="text-[8px] text-slate-500 font-medium">
                  {assignerNameDisplay && assigneeNameDisplay ? 
                    `${assignerNameDisplay} -> ${assigneeNameDisplay}` : 
                    assignerNameDisplay ? `by ${assignerNameDisplay}` : 
                    assigneeNameDisplay ? `to ${assigneeNameDisplay}` : ''
                  }
                </span>
              </div>
              
              <div className="flex items-start gap-2">
                <div className={`flex-1 rounded-2xl px-3 py-2 shadow-sm border ${task.status === 'completed' ? 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className={`text-base font-semibold break-words leading-tight ${task.status === 'completed' ? 'text-slate-400 line-through decoration-slate-300' : (isOverdue ? 'text-red-700' : 'text-slate-900')}`}>
                    {task.description}
                  </p>
                </div>
                {hasSubTasks && (
                  <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                  Created: {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                
                {task.deadline && task.status === 'pending' && (
                   <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                     <Clock className="w-3 h-3" />
                     Due: {new Date(task.deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                   </span>
                )}

                {task.status === 'completed' && task.completedAt && (
                  <div className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] text-emerald-600 font-black uppercase tracking-tighter">
                      VERIFIED
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0 min-w-[86px]">
          <div className="text-right">
            <p className={`text-[10px] font-black uppercase tracking-wide ${taskStatusColorClass}`}>{taskStatusLabel}</p>
            <p className="text-[10px] text-slate-500">
              {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {isInlineEditing && (
            <>
              <button 
                onClick={handleInlineUpdateSave}
                disabled={isSavingInlineEdit}
                className="bg-indigo-900 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px] disabled:opacity-60"
                title="Save task changes"
              >
                <span className="text-[10px] font-black uppercase">
                  {isSavingInlineEdit ? 'Saving...' : 'Update'}
                </span>
              </button>
              <button
                onClick={cancelInlineEdit}
                disabled={isSavingInlineEdit}
                className="bg-slate-100 text-slate-700 px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px] hover:bg-slate-200 disabled:opacity-60"
                title="Cancel editing"
              >
                <span className="text-[10px] font-black uppercase">Cancel</span>
              </button>
            </>
          )}

          {!isInlineEditing && task.status === 'pending' && (
            <>
              <button 
                onClick={onStartTask}
                className="bg-indigo-900 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                title="Accept this task"
              >
                <span className="text-[10px] font-black uppercase">Accept</span>
              </button>
              
              {isManager && (
                <>
                  <button 
                    onClick={onDelegate}
                    className="bg-indigo-800 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                    title="Delegate this task"
                  >
                    <UserPlus className="w-5 h-5 mb-0.5" />
                    <span className="text-[10px] font-black uppercase">Delegate</span>
                  </button>
                  
                  {canDelete && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('🗑️ Delete clicked for:', task.id);
                        console.log('🗑️ onDelete function exists:', typeof onDelete === 'function');
                        onDelete?.(); 
                      }}
                      className="bg-red-50 text-red-400 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-red-100"
                      title="Delete Task"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  )}
                  
                  {canEdit && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        startInlineEdit();
                      }}
                      className="bg-indigo-50 text-indigo-700 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-indigo-100"
                      title="Edit Task"
                     >
                       <Edit className="w-4 h-4" />
                     </button>
                  )}
                </>
              )}
            </>
          )}

          {!isInlineEditing && task.status === 'in-progress' && (
            <>
              {task.requirePhoto ? (
                <button 
                  onClick={triggerPhotoUpload}
                  disabled={isUploading}
                  className="bg-indigo-900 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px] disabled:opacity-50"
                  title="Complete with photo proof"
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 mb-0.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-black uppercase">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[10px] font-black uppercase">Complete</span>
                    </>
                  )}
                </button>
              ) : (
                <button 
                  onClick={() => onCompleteTaskWithoutPhoto?.()}
                  className="bg-indigo-900 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                  title="Mark as completed"
                >
                  <Check className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-black uppercase">Complete</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowRemarkInput(!showRemarkInput)}
                className="bg-indigo-50 text-indigo-700 px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                title="Add progress update"
              >
                <MessageSquarePlus className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-black uppercase">Update</span>
              </button>
            </>
          )}

          {!isInlineEditing && task.status === 'completed' && (
            <>
              {task.proof && (
                <button 
                  onClick={() => setShowFullImage(true)}
                  className="bg-indigo-50 text-indigo-700 px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                  title="View proof"
                >
                  <Camera className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-black uppercase">Proof</span>
                </button>
              )}
              
              {isManager && (
                <>
                  <button 
                    onClick={onReopenTask}
                    className="bg-indigo-800 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                    title="Reopen this task"
                  >
                    <RotateCcw className="w-5 h-5 mb-0.5" />
                    <span className="text-[10px] font-black uppercase">Reopen</span>
                  </button>
                  
                  {canDelete && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('🗑️ Delete clicked for completed task:', task.id);
                        console.log('🗑️ onDelete function exists:', typeof onDelete === 'function');
                        onDelete?.(); 
                      }}
                      className="bg-red-50 text-red-400 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-red-100"
                      title="Delete Task"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* In-Tile Progress Update Chat */}
        {(task.status === 'in-progress' && showRemarkInput) && (
          <div className="w-full pl-14">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="space-y-3">
                <div ref={remarksScrollRef} className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {groupedRemarks.length > 0 ? (
                    groupedRemarks.map((group) => (
                      <div key={group.dateKey} className="space-y-2">
                        <div className="flex justify-center py-1">
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {group.label}
                          </span>
                        </div>

                        {group.remarks.map((remark, remarkIndex) => {
                          const isOwnRemark = remark.employeeId === currentUser.id;

                          return (
                            <div
                              key={`${group.dateKey}_${remark.id}_${remarkIndex}`}
                              className={`flex ${isOwnRemark ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-xl px-3 py-2 border ${
                                  isOwnRemark
                                    ? 'bg-indigo-50 border-indigo-100 text-slate-900'
                                    : 'bg-white border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3 mb-1">
                                  <span className="text-[10px] font-semibold text-slate-700">{remark.employeeName}</span>
                                  <span className="text-[10px] text-slate-500">
                                    {formatRemarkDateTime(remark.timestamp)}
                                  </span>
                                </div>
                                <p className="text-sm leading-snug break-words">{remark.remark}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-2">No updates yet. Start the conversation.</p>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    placeholder="Type an update..."
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 resize-none min-h-[42px] max-h-24"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={handleAddRemark}
                    disabled={!newRemark.trim()}
                    className="bg-indigo-900 text-white px-3 py-2 rounded-xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    title="Send update"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Proof Image Modal */}
      {showFullImage && task.proof && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Task Proof</h3>
              <button 
                onClick={() => setShowFullImage(false)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4">
              <img 
                src={task.proof.imageUrl} 
                alt="Task proof" 
                className="w-full rounded-lg"
              />
              <p className="text-sm text-slate-500 mt-2">
                Completed: {new Date(task.proof.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskItem;


