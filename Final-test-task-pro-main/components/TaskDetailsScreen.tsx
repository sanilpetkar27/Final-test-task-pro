import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DealershipTask, Employee, TaskRemark, TaskType, RecurrenceFrequency, TaskExtensionStatus } from '../types';
import {
  ArrowLeft, User, Calendar, Clock, Check, Camera,
  Edit, Trash2, UserPlus, Play, RotateCcw,
  Send, X, ChevronDown, CalendarClock, Layers, CheckCircle, Phone,
  Eye, GitFork, Flag
} from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import LoadingButton from '../src/components/ui/LoadingButton';

interface TaskDetailsScreenProps {
  task: DealershipTask;
  subTasks: DealershipTask[];
  parentTask?: DealershipTask;
  employees: Employee[];
  currentUser: Employee;
  readOnly?: boolean;
  onBack: () => void;
  onStartTask: () => Promise<void> | void;
  onReopenTask: () => Promise<void> | void;
  onCompleteTask: (proof: { imageUrl: string; timestamp: number }) => Promise<void> | void;
  onCompleteTaskWithoutPhoto: () => Promise<void> | void;
  onReassign: () => void;
  onDelegate: () => void;
  onDelete: () => Promise<void> | void;
  onInlineEditSave?: (
    taskId: string,
    payload: {
      description: string;
      assignedTo: string | null;
      deadline?: number;
      requirePhoto: boolean;
      taskType: TaskType;
      recurrenceFrequency: RecurrenceFrequency | null;
      priority: 'High' | 'Medium';
    }
  ) => Promise<boolean>;
  onAddRemark?: (
    taskId: string,
    remark:
      | string
      | {
          text: string;
          mentionedUserIds?: string[];
          mentionedDisplayNames?: string[];
        }
  ) => void;
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

interface MentionCandidate {
  id: string;
  name: string;
  email?: string;
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

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractMentionContext = (text: string, caretPosition: number): { start: number; query: string } | null => {
  const safeCaret = Math.max(0, Math.min(caretPosition, text.length));
  const textBeforeCaret = text.slice(0, safeCaret);
  const atIndex = textBeforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;

  const beforeAt = textBeforeCaret.slice(0, atIndex);
  const charBeforeAt = beforeAt.slice(-1);
  if (charBeforeAt && !/\s|[([{]/.test(charBeforeAt)) return null;

  const mentionQuery = textBeforeCaret.slice(atIndex + 1);
  if (!/^[\w.\- ]{0,40}$/.test(mentionQuery)) return null;
  if (mentionQuery.includes('\n')) return null;

  return { start: atIndex, query: mentionQuery.trimStart() };
};

const formatDateTimeForInput = (timestamp?: number | null): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
};

const formatDateTimeLabel = (value: string): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.replace('T', ' ');
  }
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getRoleBadge = (role?: string): { label: string; className: string } => {
  if (role === 'owner' || role === 'super_admin') return { label: 'OWNER', className: 'bg-[var(--accent-light)] text-[var(--accent)]' };
  if (role === 'manager') return { label: 'MANAGER', className: 'bg-slate-200 text-slate-700' };
  return { label: 'FIELD STAFF', className: 'bg-amber-100 text-amber-700' };
};

// --- Component ---

const TaskDetailsScreen: React.FC<TaskDetailsScreenProps> = ({
  task, subTasks, parentTask, employees, currentUser, onBack,
  onStartTask, onReopenTask, onCompleteTask, onCompleteTaskWithoutPhoto,
  onReassign, onDelegate, onDelete, onInlineEditSave, onAddRemark, readOnly = false
}) => {
  const [newRemark, setNewRemark] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [showExtensionInput, setShowExtensionInput] = useState(false);
  const [extensionDate, setExtensionDate] = useState('');
  const [isExtensionUpdating, setIsExtensionUpdating] = useState(false);
  const [extensionApproverId, setExtensionApproverId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editAssigneeId, setEditAssigneeId] = useState(task.assignedTo || 'none');
  const [editDeadline, setEditDeadline] = useState('');
  const [editRequirePhoto, setEditRequirePhoto] = useState(Boolean(task.requirePhoto));
  const [editIsHighPriority, setEditIsHighPriority] = useState(false);
  const [editTaskType, setEditTaskType] = useState<TaskType>('one_time');
  const [editRecurrenceFrequency, setEditRecurrenceFrequency] = useState<RecurrenceFrequency | ''>('');
  const [editModalKeyboardInset, setEditModalKeyboardInset] = useState(0);
  const [editModalVisibleHeight, setEditModalVisibleHeight] = useState<number | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>([]);
  const remarksScrollRef = useRef<HTMLDivElement | null>(null);
  const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editModalScrollRef = useRef<HTMLDivElement | null>(null);
  const extensionInputRef = useRef<HTMLInputElement | null>(null);

  const syncInputOnPickerClose = (input: HTMLInputElement | null, setter: (value: string) => void) => {
    if (!input) return;
    const tick = () => {
      if (document.activeElement === input) {
        requestAnimationFrame(tick);
      } else {
        setter(input.value);
      }
    };
    requestAnimationFrame(tick);
  };

  const openExtensionPicker = () => {
    const input = extensionInputRef.current;
    if (!input) return;
    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
      (input as HTMLInputElement & { showPicker: () => void }).showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const withTimeout = useMemo(
    () =>
      <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), ms)
          ),
        ]),
    []
  );

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

  const isOverdue =
    task.status !== 'completed' &&
    task.status !== 'pending_approval' &&
    task.deadline != null &&
    Date.now() > task.deadline;
  const assigneeName = getEmployeeName(task.assignedTo);
  const assignerName = getEmployeeName(task.assignedBy);
  const rawPriority = String((task as any).priority || '').trim().toLowerCase();
  const normalizedPriority = rawPriority === 'high' ? 'High' : rawPriority === 'low' ? 'Low' : 'Medium';
  const isPendingApproval = task.status === 'pending_approval';
  const overdueDays = isOverdue && task.deadline ? Math.max(1, Math.ceil((Date.now() - task.deadline) / 86400000)) : 0;
  const progressValue =
    task.status === 'completed'
      ? 100
      : task.status === 'pending_approval'
      ? 82
      : task.status === 'in-progress'
      ? 62
      : 24;
  const assigneeTelHref = getTelHref(getEmployeeMobile(task.assignedTo));
  const assignerTelHref = getTelHref(getEmployeeMobile(task.assignedBy));

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin' || currentUser.role === 'owner';
  const mentionableMembers = useMemo<MentionCandidate[]>(
    () =>
      (employees || [])
        .filter((employee) => employee?.id && employee.id !== currentUser.id)
        .map((employee) => ({
          id: employee.id,
          name: String(employee.name || '').trim() || String(employee.email || '').trim() || 'User',
          email: String(employee.email || '').trim() || undefined,
        })),
    [employees, currentUser.id]
  );

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

  const canApproveExtension = Boolean(extensionApproverId) && currentUser.id === extensionApproverId;
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

  const isHighPriorityTask = normalizedPriority === 'High';
  const hasCompletionRemark = useMemo(
    () =>
      normalizedRemarks.some((remark) => {
        if (!remark.remark.trim()) return false;
        return remark.employeeId === currentUser.id ||
          (typeof currentUser.auth_user_id === 'string' && remark.employeeId === currentUser.auth_user_id);
      }),
    [normalizedRemarks, currentUser.id, currentUser.auth_user_id]
  );

  // --- Effects ---
  useEffect(() => {
    setEditDescription(task.description);
    setEditAssigneeId(task.assignedTo || 'none');
    setEditDeadline(formatDateTimeForInput(task.deadline));
    setEditRequirePhoto(Boolean(task.requirePhoto));
    setEditIsHighPriority(normalizedPriority === 'High');
    setEditTaskType(normalizedTaskType);
    setEditRecurrenceFrequency(normalizedTaskType === 'recurring' ? (normalizedRecurrence || '') : '');
    setIsEditing(false);
  }, [task.id, task.description, task.assignedTo, task.deadline, task.requirePhoto, normalizedPriority, normalizedTaskType, normalizedRecurrence]);

  useEffect(() => {
    if (remarksScrollRef.current) {
      remarksScrollRef.current.scrollTop = remarksScrollRef.current.scrollHeight;
    }
  }, [groupedRemarks]);

  useEffect(() => {
    if (!mentionMenuOpen) return;

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setMentionLoading(true);
      const companyId = String(currentUser.company_id || '').trim();
      const queryText = mentionQuery.trim();

      try {
        let supabaseCandidates: MentionCandidate[] = [];
        if (companyId) {
          let dbQuery = supabase
            .from('employees')
            .select('id, name, email')
            .eq('company_id', companyId)
            .neq('id', currentUser.id)
            .order('name', { ascending: true })
            .limit(8);

          if (queryText) {
            dbQuery = dbQuery.or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%`);
          }

          const { data, error } = await dbQuery;
          if (!error && Array.isArray(data)) {
            supabaseCandidates = data.map((row: any) => ({
              id: String(row.id || ''),
              name: String(row.name || row.email || 'User').trim(),
              email: typeof row.email === 'string' ? row.email.trim() : undefined,
            }));
          }
        }

        const localFallback = mentionableMembers.filter((member) => {
          if (!queryText) return true;
          const nameMatch = member.name.toLowerCase().includes(queryText.toLowerCase());
          const emailMatch = String(member.email || '').toLowerCase().includes(queryText.toLowerCase());
          return nameMatch || emailMatch;
        });

        const merged = [...supabaseCandidates, ...localFallback]
          .filter((item) => item.id && item.name)
          .reduce<MentionCandidate[]>((acc, candidate) => {
            if (acc.some((existing) => existing.id === candidate.id)) return acc;
            acc.push(candidate);
            return acc;
          }, [])
          .slice(0, 8);

        if (!isCancelled) {
          setMentionCandidates(merged);
          setActiveMentionIndex(0);
        }
      } finally {
        if (!isCancelled) {
          setMentionLoading(false);
        }
      }
    }, 120);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionMenuOpen, mentionQuery, mentionableMembers, currentUser.company_id, currentUser.id]);

  useEffect(() => {
    setShowExtensionInput(false);
    setExtensionDate(formatDateTimeForInput(requestedDueDate ?? task.deadline));
  }, [task.id, requestedDueDate, task.deadline]);

  useEffect(() => {
    if (!showExtensionInput || readOnly || !canRequestExtension) return;

    const input = extensionInputRef.current;
    if (!input) return;

    let lastValue = input.value;
    let interval: ReturnType<typeof window.setInterval> | null = null;

    const checkValue = () => {
      const currentValue = input.value;
      if (currentValue !== lastValue) {
        lastValue = currentValue;
        setExtensionDate(currentValue || '');
      }
    };

    const observer = new MutationObserver(checkValue);
    observer.observe(input, {
      attributes: true,
      attributeFilter: ['value']
    });

    const onFocus = () => {
      lastValue = input.value;
      if (interval) window.clearInterval(interval);
      interval = window.setInterval(checkValue, 300);
    };

    const onFocusOut = () => {
      if (interval) {
        window.clearInterval(interval);
        interval = null;
      }
      window.setTimeout(checkValue, 100);
    };

    input.addEventListener('focus', onFocus);
    input.addEventListener('focusout', onFocusOut);

    return () => {
      if (interval) window.clearInterval(interval);
      observer.disconnect();
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('focusout', onFocusOut);
    };
  }, [showExtensionInput, readOnly, canRequestExtension]);

  useEffect(() => {
    let isCancelled = false;

    const resolveExtensionApproverId = async () => {
      const companyId = String(currentUser.company_id || task.company_id || '').trim();
      const staffId = String(task.assignedTo || '').trim();

      if (!companyId || !staffId) {
        if (!isCancelled) {
          setExtensionApproverId(null);
        }
        return;
      }

      let managerId = '';

      const selectFallbackOwner = async (): Promise<string> => {
        const localOwner =
          employees.find((employee) => employee.role === 'owner') ||
          employees.find((employee) => employee.role === 'super_admin');
        if (localOwner?.id) {
          return localOwner.id;
        }

        const { data: ownerRows, error: ownerError } = await supabase
          .from('employees')
          .select('id, role')
          .eq('company_id', companyId);

        if (ownerError) {
          console.warn('Failed to resolve extension fallback approver:', ownerError);
          return '';
        }

        const owner =
          (ownerRows || []).find((row: any) => row?.role === 'owner') ||
          (ownerRows || []).find((row: any) => row?.role === 'super_admin');
        return String(owner?.id || '').trim();
      };

      const resolveViaLinks = async (): Promise<string> => {
        const linkColumns: Array<'staff_id' | 'employee_id'> = ['staff_id', 'employee_id'];

        for (const linkColumn of linkColumns) {
          const linkQuery = await supabase
            .from('staff_manager_links')
            .select('manager_id')
            .eq('company_id', companyId)
            .eq(linkColumn, staffId)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (linkQuery.error) {
            const message = String(linkQuery.error?.message || '').toLowerCase();
            const isMissingColumn = message.includes(`column ${linkColumn}`) || message.includes('schema cache');
            if (!isMissingColumn) {
              console.warn(`Failed to resolve extension manager via ${linkColumn}:`, linkQuery.error);
            }
            continue;
          }

          const managerIdFromLink = String((linkQuery.data || [])[0]?.manager_id || '').trim();
          if (managerIdFromLink) {
            return managerIdFromLink;
          }
        }

        return '';
      };

      managerId = await resolveViaLinks();
      if (!managerId) {
        managerId = String((assignedEmployee as any)?.manager_id || '').trim();
      }
      if (!managerId) {
        managerId = await selectFallbackOwner();
      }

      if (!isCancelled) {
        setExtensionApproverId(managerId || null);
      }
    };

    void resolveExtensionApproverId();

    return () => {
      isCancelled = true;
    };
  }, [assignedEmployee, currentUser.company_id, employees, task.assignedTo]);

  useEffect(() => {
    setMentionMenuOpen(false);
    setMentionCandidates([]);
    setMentionQuery('');
    setMentionStartIndex(null);
    setActiveMentionIndex(0);
    setSelectedMentions([]);
  }, [task.id]);

  useEffect(() => {
    if (!isEditing || typeof window === 'undefined') {
      setEditModalKeyboardInset(0);
      setEditModalVisibleHeight(null);
      return;
    }

    const isMobileViewport = () => window.innerWidth < 640;
    const viewport = window.visualViewport;

    const syncViewportInsets = () => {
      if (!isMobileViewport() || !viewport) {
        setEditModalKeyboardInset(0);
        setEditModalVisibleHeight(null);
        return;
      }

      const keyboardInset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );

      setEditModalKeyboardInset(keyboardInset);
      setEditModalVisibleHeight(Math.round(viewport.height + viewport.offsetTop));
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!editModalScrollRef.current?.contains(target)) return;

      window.setTimeout(() => {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 80);
    };

    syncViewportInsets();
    viewport?.addEventListener('resize', syncViewportInsets);
    viewport?.addEventListener('scroll', syncViewportInsets);
    window.addEventListener('resize', syncViewportInsets);
    window.addEventListener('focusin', handleFocusIn);

    return () => {
      viewport?.removeEventListener('resize', syncViewportInsets);
      viewport?.removeEventListener('scroll', syncViewportInsets);
      window.removeEventListener('resize', syncViewportInsets);
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, [isEditing]);

  // --- Handlers ---
  const handlePhotoUpload = async (file: File) => {
    if (!isHighPriorityTask && !hasCompletionRemark) {
      alert('Add a remark before completing this task.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    try {
      const fileName = `task-proof-${task.id}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('task-proofs').upload(fileName, file, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
      if (error) { alert('Failed to upload photo: ' + error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('task-proofs').getPublicUrl(fileName);
      await withTimeout(
        Promise.resolve(onCompleteTask({ imageUrl: publicUrl, timestamp: Date.now() })),
        30000
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerPhotoUpload = () => {
    if (!isHighPriorityTask && !hasCompletionRemark) {
      alert('Add a remark before completing this task.');
      return;
    }
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

  const syncMentionMenuFromInput = (value: string, caretPosition: number) => {
    const mentionContext = extractMentionContext(value, caretPosition);
    if (!mentionContext) {
      setMentionMenuOpen(false);
      setMentionStartIndex(null);
      setMentionQuery('');
      setMentionCandidates([]);
      return;
    }
    setMentionStartIndex(mentionContext.start);
    setMentionQuery(mentionContext.query);
    setMentionMenuOpen(true);
  };

  const applyMentionCandidate = (candidate: MentionCandidate) => {
    const textarea = remarkInputRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? newRemark.length;
    const mentionStart = mentionStartIndex ?? Math.max(0, newRemark.slice(0, cursorPos).lastIndexOf('@'));
    if (mentionStart < 0) return;

    const before = newRemark.slice(0, mentionStart);
    const after = newRemark.slice(cursorPos);
    const mentionText = `@${candidate.name}`;
    const nextValue = `${before}${mentionText} ${after}`;
    const nextCaret = (before + mentionText + ' ').length;

    setNewRemark(nextValue);
    setSelectedMentions((prev) => {
      if (prev.some((entry) => entry.id === candidate.id)) return prev;
      return [...prev, candidate];
    });
    setMentionMenuOpen(false);
    setMentionCandidates([]);
    setMentionStartIndex(null);
    setMentionQuery('');
    setActiveMentionIndex(0);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const extractMentionPayload = (text: string): { mentionedUserIds: string[]; mentionedDisplayNames: string[] } => {
    const normalizedText = text.toLowerCase();
    const mentioned = selectedMentions.filter((candidate) =>
      normalizedText.includes(`@${candidate.name.toLowerCase()}`)
    );
    return {
      mentionedUserIds: Array.from(new Set(mentioned.map((candidate) => candidate.id))),
      mentionedDisplayNames: Array.from(new Set(mentioned.map((candidate) => candidate.name))),
    };
  };

  const renderRemarkContent = (text: string, mentionNames?: string[]) => {
    const normalizedMentionNames = Array.isArray(mentionNames)
      ? mentionNames.map((name) => String(name || '').trim()).filter(Boolean)
      : [];

    if (normalizedMentionNames.length === 0) {
      return text;
    }

    const pattern = normalizedMentionNames
      .map((name) => `@${escapeRegex(name)}`)
      .sort((a, b) => b.length - a.length)
      .join('|');

    if (!pattern) {
      return text;
    }

    const mentionRegex = new RegExp(`(${pattern})`, 'gi');
    return text.split(mentionRegex).map((part, index) => {
      if (!part) return null;
      if (part.startsWith('@')) {
        return (
          <span key={`${part}_${index}`} className="font-semibold text-[var(--accent)]">
            {part}
          </span>
        );
      }
      return <React.Fragment key={`txt_${index}`}>{part}</React.Fragment>;
    });
  };

  const handleAddRemark = () => {
    const text = newRemark.trim();
    if (!text || !onAddRemark) return;

    const payload = extractMentionPayload(text);
    onAddRemark(task.id, {
      text,
      mentionedUserIds: payload.mentionedUserIds,
      mentionedDisplayNames: payload.mentionedDisplayNames,
    });

    setNewRemark('');
    setMentionMenuOpen(false);
    setMentionCandidates([]);
    setMentionStartIndex(null);
    setMentionQuery('');
    setActiveMentionIndex(0);
    setSelectedMentions([]);
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
    const approverId = String(extensionApproverId || '').trim();
    if (!approverId) { alert('No manager is linked to review this extension request.'); return; }
    setIsExtensionUpdating(true);
    const error = await updateTaskExtensionFields(
      { extension_status: 'REQUESTED', requested_due_date: new Date(requestedTs).toISOString() },
      { extensionStatus: 'REQUESTED', requestedDueDate: new Date(requestedTs).toISOString() }
    );
    if (error) {
      setIsExtensionUpdating(false);
      alert(`Failed: ${error.message}`);
      return;
    }

    const { error: approvalError } = await supabase
      .from('approvals')
      .insert({
        requester_id: currentUser.id,
        approver_id: approverId,
        title: `Deadline Extension Request: ${task.description}`,
        description: `Requested new deadline: ${new Date(requestedTs).toLocaleString()}`,
        amount: null,
        status: 'PENDING',
        task_id: task.id,
      });

    setIsExtensionUpdating(false);
    if (approvalError) {
      console.warn('Failed to create extension approval request:', approvalError);
    }
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

  const handleCompleteWithoutPhoto = async () => {
    if (!isHighPriorityTask && !hasCompletionRemark) {
      alert('Add a remark before completing this task.');
      return;
    }
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      await withTimeout(Promise.resolve(onCompleteTaskWithoutPhoto()), 30000);
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleReopenTask = async () => {
    if (isReopening) return;
    setIsReopening(true);
    try {
      await withTimeout(Promise.resolve(onReopenTask()), 30000);
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert(`Failed to reopen task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsReopening(false);
    }
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
      priority: editIsHighPriority ? 'High' : 'Medium',
    });
    setIsSavingEdit(false);
    if (ok) setIsEditing(false);
  };

  const handleDeleteAndGoBack = async () => {
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await withTimeout(Promise.resolve(onDelete()), 30000);
      onBack();
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Auto-start task when opened and status is pending
  useEffect(() => {
    if (!readOnly && task.status === 'pending' && onStartTask) {
      onStartTask();
    }
  }, [task.id, task.status, onStartTask, readOnly]); // Only run when task ID changes (component mounts with new task)

  // --- Build Quick Actions ---
  type QuickAction = {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    className: string;
    useLoadingButton?: boolean;
    isLoading?: boolean;
    loadingText?: string;
    disabled?: boolean;
  };
	  const actions: QuickAction[] = [];
	  const quickActionButtonClass = '!h-20 !w-full !rounded-2xl border border-transparent !px-2 !py-3 !text-sm !font-bold shadow-[0_8px_20px_rgba(15,23,42,0.08)]';

  if (task.status === 'pending') {
    // Start Task button removed - task auto-starts when opened
    if (isManager) {
      actions.push({
        key: 'delegate',
        label: 'Delegate',
        icon: <GitFork className="w-5 h-5" />,
        onClick: onDelegate,
        className: '!bg-[var(--accent)] !text-white hover:!bg-[#4338CA]'
      });
    }
    if (canEdit) {
      actions.push({
        key: 'edit',
        label: 'Edit',
        icon: <Edit className="w-5 h-5" />,
        onClick: () => setIsEditing(true),
        className: '!bg-[var(--accent-light)] !text-[var(--accent)] hover:!bg-[var(--accent-light)] border border-[var(--accent)]/20'
      });
    }
    if (canDelete) {
      actions.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-5 h-5" />,
        onClick: handleDeleteAndGoBack,
        useLoadingButton: true,
        isLoading: isDeleting,
        loadingText: 'Deleting...',
        disabled: isDeleting,
        className: '!bg-[#EF4444] !text-white hover:!bg-[#DC2626]'
      });
    }
  }

  if (task.status === 'in-progress') {
    if (isManager) {
      actions.push({
        key: 'delegate',
        label: 'Delegate',
        icon: <GitFork className="w-5 h-5" />,
        onClick: onDelegate,
        className: '!bg-[var(--accent)] !text-white hover:!bg-[#4338CA]'
      });
    }
    if (task.requirePhoto) {
      actions.push({
        key: 'complete-photo',
        label: 'Complete',
        icon: <Camera className="w-5 h-5" />,
        onClick: triggerPhotoUpload,
        useLoadingButton: true,
        isLoading: isUploading,
        loadingText: 'Uploading...',
        disabled: isUploading,
        className: '!bg-[#10B981] !text-white hover:!bg-[#059669]'
      });
    } else {
      actions.push({
        key: 'complete',
        label: 'Complete',
        icon: <Check className="w-5 h-5" />,
        onClick: handleCompleteWithoutPhoto,
        useLoadingButton: true,
        isLoading: isCompleting,
        loadingText: 'Completing...',
        disabled: isCompleting,
        className: '!bg-[#10B981] !text-white hover:!bg-[#059669]'
      });
    }
    if (canRequestExtension) {
      actions.push({
        key: 'extension',
        label: 'Extension',
        icon: <Clock className="w-5 h-5" />,
        onClick: () => setShowExtensionInput(prev => !prev),
        className: '!bg-[var(--orange-light)] !text-[var(--orange)] hover:!bg-amber-100 border border-amber-200'
      });
    }
    if (canEdit) {
      actions.push({
        key: 'edit',
        label: 'Edit',
        icon: <Edit className="w-5 h-5" />,
        onClick: () => setIsEditing(true),
        className: '!bg-[var(--accent-light)] !text-[var(--accent)] hover:!bg-[var(--accent-light)] border border-[var(--accent)]/20'
      });
    }
    if (canDelete) {
      actions.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-5 h-5" />,
        onClick: handleDeleteAndGoBack,
        useLoadingButton: true,
        isLoading: isDeleting,
        loadingText: 'Deleting...',
        disabled: isDeleting,
        className: '!bg-[#EF4444] !text-white hover:!bg-[#DC2626]'
      });
    }
  }

  if (task.status === 'completed') {
    if (task.proof) {
      actions.push({
        key: 'view-proof',
        label: 'View Proof',
        icon: <Eye className="w-5 h-5" />,
        onClick: () => setShowFullImage(true),
        className: '!bg-[var(--accent-light)] !text-[var(--accent)] hover:!bg-[var(--accent-light)] border border-[var(--accent)]/20'
      });
    }
    if (isManager) {
      actions.push({
        key: 'reopen',
        label: 'Reopen',
        icon: <RotateCcw className="w-5 h-5" />,
        onClick: handleReopenTask,
        useLoadingButton: true,
        isLoading: isReopening,
        loadingText: 'Reopening...',
        disabled: isReopening,
        className: '!bg-[var(--accent)] !text-white hover:!bg-[#4338CA]'
      });
    }
    if (canDelete) {
      actions.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-5 h-5" />,
        onClick: handleDeleteAndGoBack,
        useLoadingButton: true,
        isLoading: isDeleting,
        loadingText: 'Deleting...',
        disabled: isDeleting,
        className: '!bg-[#EF4444] !text-white hover:!bg-[#DC2626]'
      });
    }
  }

  if (task.status === 'pending_approval' && task.proof) {
    actions.push({
      key: 'view-proof',
      label: 'View Proof',
      icon: <Eye className="w-5 h-5" />,
      onClick: () => setShowFullImage(true),
      className: '!bg-[var(--accent-light)] !text-[var(--accent)] hover:!bg-[var(--accent-light)] border border-[var(--accent)]/20'
    });
  }

  // --- Status label ---
  const statusLabel =
    task.status === 'completed'
      ? 'Completed'
      : task.status === 'pending_approval'
      ? 'Pending Approval'
      : task.status === 'in-progress'
      ? 'In Progress'
      : 'Pending';
  const statusColor =
    task.status === 'completed'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : task.status === 'pending_approval'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : task.status === 'in-progress'
      ? 'text-[var(--accent)] bg-[var(--accent-light)] border-[var(--accent)]/20'
      : isOverdue
      ? 'text-red-600 bg-red-50 border-red-200'
      : 'text-slate-600 bg-slate-100 border-slate-200';
  const heroAccentClass =
    task.status === 'completed'
      ? 'border-l-[var(--green)] bg-[var(--green-light)]/55'
      : task.status === 'pending_approval'
      ? 'border-l-[var(--orange)] bg-[var(--orange-light)]/60'
      : isOverdue
      ? 'border-l-[var(--red)] bg-[var(--red-light)]/60'
      : 'border-l-[var(--accent)] bg-white';
  const mobileEditOverlayStyle =
    editModalVisibleHeight && typeof window !== 'undefined' && window.innerWidth < 640
      ? {
          paddingTop: '16px',
          paddingBottom: `${editModalKeyboardInset + 16}px`,
        }
      : undefined;
  const mobileEditModalStyle =
    editModalVisibleHeight && typeof window !== 'undefined' && window.innerWidth < 640
      ? {
          maxHeight: `${Math.max(editModalVisibleHeight - 32, 320)}px`,
        }
      : undefined;
  const mobileEditModalBodyStyle =
    editModalKeyboardInset > 0
      ? {
          paddingBottom: `${editModalKeyboardInset + 24}px`,
          scrollPaddingBottom: `${editModalKeyboardInset + 120}px`,
          overscrollBehavior: 'contain' as const,
        }
      : undefined;

  return (
    <div className="fixed inset-x-0 top-0 bottom-24 z-30 flex items-end justify-center bg-slate-900/40 md:inset-0 md:z-[80] md:items-center md:p-4">
      <div className="flex flex-col h-full min-h-0 w-full bg-[var(--surface)] pt-[env(safe-area-inset-top)] md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-2xl md:shadow-xl md:pt-0 overflow-hidden">
        {/* ─── Header ─── */}
        <div className="sticky top-0 z-10 bg-white border-b border-[var(--border)] px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors hover:bg-slate-100 active:scale-95"
            aria-label="Back to tasks"
          >
            <ArrowLeft className="w-6 h-6 text-slate-700" />
            <span className="text-sm font-semibold text-slate-700">Back</span>
          </button>
          <h1 className="text-lg font-bold text-slate-900">Task Details</h1>
        </div>

        {/* ─── Scrollable Content ─── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* ── Section: Task Info ── */}
        <div className="bg-white px-4 md:px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div className={`rounded-2xl border border-[var(--border)] border-l-4 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${heroAccentClass}`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`font-ui-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
                normalizedPriority === 'High' ? 'border-red-200 bg-white text-[var(--red)]' : 'border-[var(--accent)]/20 bg-white text-[var(--accent)]'
              }`}>
                {normalizedPriority === 'High' && <Flag className="w-3.5 h-3.5 fill-current" />}
                {normalizedPriority} Priority
              </span>
              {isOverdue && (
                <span className="font-ui-mono rounded-full border border-red-200 bg-[var(--red-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--red)]">
                  {overdueDays} day{overdueDays === 1 ? '' : 's'} overdue
                </span>
              )}
            </div>
            <h2 className="mt-3 text-[23px] font-extrabold text-[var(--ink)] leading-snug break-words">
              {task.description}
            </h2>
          </div>

          <div className="mt-4 space-y-0">
            {/* Assigned to */}
            <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)] text-[var(--ink-3)]"><User className="w-4 h-4 flex-shrink-0" /></span>
              <span className="w-[90px] text-sm text-[var(--ink-3)]">Assigned to</span>
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
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)] text-[var(--ink-3)]"><UserPlus className="w-4 h-4 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Assigned by</span>
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
            <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><Calendar className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`} /></span>
              <span className="w-[90px] text-sm text-[var(--ink-3)]">Due date</span>
              <span className={`font-ui-mono text-sm font-medium ml-1 ${isOverdue ? 'text-red-600' : 'text-emerald-600'}`}>
                {task.deadline ? formatFullDate(task.deadline) : 'No deadline'}
              </span>
            </div>

            {/* Requested date (extension) */}
            {extensionStatus === 'REQUESTED' && requestedDueDate && (
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><CalendarClock className="w-4 h-4 text-amber-500 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Requested</span>
                <span className="font-ui-mono text-sm font-medium text-amber-600 ml-1">{formatFullDate(requestedDueDate)}</span>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><CheckCircle className={`w-4 h-4 flex-shrink-0 ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-400'}`} /></span>
              <span className="w-[90px] text-sm text-[var(--ink-3)]">Status</span>
              <span className={`font-ui-mono text-xs font-medium uppercase px-2.5 py-0.5 rounded-full border ml-1 ${statusColor}`}>{statusLabel}</span>
            </div>

            {isPendingApproval && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Task completion is waiting for manager approval. It will move to completed only after the linked approval request is approved.
              </div>
            )}

            {/* Recurrence badge */}
            {normalizedTaskType === 'recurring' && (
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Recurrence</span>
                <span className="font-ui-mono text-xs font-medium uppercase px-2.5 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/20 ml-1">
                  {normalizedRecurrence ? normalizedRecurrence.charAt(0).toUpperCase() + normalizedRecurrence.slice(1) : 'Recurring'}
                </span>
              </div>
            )}

            {/* Parent task */}
            {parentTask && (
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><Layers className="w-4 h-4 text-amber-400 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Part of</span>
                <span className="text-sm font-semibold text-amber-700 ml-1">{parentTask.description}</span>
              </div>
            )}

            {/* Photo required */}
            {task.requirePhoto && (
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><Camera className="w-4 h-4 text-slate-400 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Proof</span>
                <span className="font-ui-mono text-xs font-medium uppercase px-2.5 py-0.5 rounded-full bg-slate-800 text-white">Photo Required</span>
              </div>
            )}

            {/* Completed timestamp */}
            {task.status === 'completed' && task.completedAt && (
              <div className="flex items-center gap-3 py-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--surface-2)]"><Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /></span>
                <span className="w-[90px] text-sm text-[var(--ink-3)]">Completed</span>
                <span className="font-ui-mono text-sm font-medium text-emerald-600 ml-1">{formatFullDate(task.completedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Section: Quick Actions Grid ── */}
        {!readOnly && actions.length > 0 && (
          <div className="px-4 md:px-6 py-4 border-b border-[var(--border)]">
            <h3 className="section-kicker mb-3">Quick Actions</h3>
	            <div className={`grid gap-3 ${actions.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
	              {actions.map((action) =>
	                action.useLoadingButton ? (
		                  <LoadingButton
	                    key={action.key}
	                    type="button"
                    onClick={action.onClick}
                    isLoading={Boolean(action.isLoading)}
                    loadingText={action.loadingText}
                    disabled={action.disabled}
                    variant="primary"
		                    className={`flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${quickActionButtonClass} ${action.className}`}
		                  >
	                    {action.icon}
	                    <span className="text-sm font-bold">{action.label}</span>
	                  </LoadingButton>
	                ) : (
		                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
		                    className={`flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 ${quickActionButtonClass} ${action.className}`}
		                  >
	                    {action.icon}
	                    <span className="text-sm font-bold">{action.label}</span>
	                  </button>
	                )
	              )}
            </div>
          </div>
        )}

        {/* ── Section: Extension Request Input ── */}
        {!readOnly && canRequestExtension && showExtensionInput && (
          <div className="px-4 md:px-6 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-700">Request Deadline Extension</p>
              <div
                className="relative w-full min-h-[52px] border border-amber-200 rounded-xl px-4 py-3.5 bg-white text-base text-slate-900 focus-within:ring-2 focus-within:ring-amber-300 cursor-pointer"
                onClick={openExtensionPicker}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openExtensionPicker();
                  }
                }}
              >
                <span className="block pr-10">
                  {extensionDate ? formatDateTimeLabel(extensionDate) : ''}
                </span>
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-600 pointer-events-none" />
                <input
                  ref={extensionInputRef}
                  type="datetime-local"
                  value={extensionDate || ''}
                  onChange={(e) => setExtensionDate(e.target.value || '')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <LoadingButton
                type="button"
                onClick={handleRequestExtension}
                isLoading={isExtensionUpdating}
                loadingText="Sending..."
                variant="secondary"
                disabled={!extensionDate || isExtensionUpdating}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 transition-colors"
                style={{ minHeight: 48 }}
              >
                Send Extension Request
              </LoadingButton>
            </div>
          </div>
        )}

        {/* Staff extension pending indicator */}
        {isAssignedWorker && extensionStatus === 'REQUESTED' && !canReviewExtensionRequest && (
          <div className="px-4 md:px-6 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm font-bold text-amber-700">Extension Requested</p>
              <p className="text-xs text-amber-600 mt-1">Waiting for manager approval</p>
            </div>
          </div>
        )}

        {/* ── Section: Manager Approval ── */}
        {!readOnly && canReviewExtensionRequest && (
          <div className="px-4 md:px-6 py-4 border-b border-slate-100">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-3">
              <p className="text-base font-bold text-amber-700">Extension Requested</p>
              <p className="text-sm text-slate-600 mt-1">
                New deadline: {requestedDueDate ? formatFullDate(requestedDueDate) : 'selected date'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LoadingButton
                type="button"
                onClick={() => handleExtensionDecision('APPROVED')}
                isLoading={isExtensionUpdating}
                loadingText="Updating..."
                variant="success"
                disabled={isExtensionUpdating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-50 transition-colors active:scale-95"
                style={{ minHeight: 52 }}
              >
                Approve
              </LoadingButton>
              <LoadingButton
                type="button"
                onClick={() => handleExtensionDecision('REJECTED')}
                isLoading={isExtensionUpdating}
                loadingText="Updating..."
                variant="danger"
                disabled={isExtensionUpdating}
                className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-50 transition-colors active:scale-95"
                style={{ minHeight: 52 }}
              >
                Reject
              </LoadingButton>
            </div>
          </div>
        )}

        {/* ── Section: Discussion ── */}
        <div className="px-4 md:px-6 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-slate-200" />
            <h3 className="section-kicker px-2">Discussion</h3>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div ref={remarksScrollRef} className="space-y-4 pb-4 md:h-[320px] md:overflow-y-auto md:overflow-x-hidden md:pr-1">
            {groupedRemarks.length > 0 ? (
              groupedRemarks.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <div className="flex justify-center py-1">
                    <span className="font-ui-mono rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
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
                              ? 'bg-[var(--accent)] text-white rounded-br-md'
                              : 'bg-slate-100 text-slate-800 rounded-bl-md'
                          }`}>
                            <p className="text-sm leading-relaxed break-words">
                              {renderRemarkContent(remark.remark, (remark as any).mentionedDisplayNames)}
                            </p>
                          </div>
                          {/* Timestamp */}
                          <p className={`font-ui-mono text-[10px] text-slate-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
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
      {!readOnly && (
      <div className="bg-white border-t border-slate-200 px-4 md:px-6 py-3 pb-safe flex-shrink-0">
        <div className="relative">
          {mentionMenuOpen && (
            <div className="absolute left-0 right-0 bottom-[calc(100%+8px)] z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {mentionLoading ? (
                <div className="px-3 py-2 text-xs text-slate-500">Loading team members…</div>
              ) : mentionCandidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">No team members found</div>
              ) : (
                <ul className="max-h-56 overflow-y-auto py-1">
                  {mentionCandidates.map((candidate, index) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => applyMentionCandidate(candidate)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          index === activeMentionIndex
                            ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-semibold">{candidate.name}</span>
                        {candidate.email && (
                          <span className="ml-2 text-xs text-slate-400">{candidate.email}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={remarkInputRef}
              value={newRemark}
              onChange={(e) => {
                const nextValue = e.target.value;
                setNewRemark(nextValue);
                const caret = e.target.selectionStart ?? nextValue.length;
                syncMentionMenuFromInput(nextValue, caret);
              }}
              placeholder="Type a message... Use @ to mention"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 resize-none min-h-[48px] max-h-28"
              rows={1}
              onKeyDown={(e) => {
                if (mentionMenuOpen && mentionCandidates.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const selected = mentionCandidates[activeMentionIndex];
                    if (selected) {
                      applyMentionCandidate(selected);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionMenuOpen(false);
                    return;
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddRemark();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddRemark}
              disabled={!newRemark.trim()}
              className="bg-[var(--accent)] text-white p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 hover:bg-[#4338CA]"
              style={{ minHeight: 48, minWidth: 48 }}
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ─── Edit Task Modal ─── */}
      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={mobileEditOverlayStyle}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSavingEdit && setIsEditing(false)} />
          <div
            className="relative bg-white w-full max-w-lg sm:max-w-xl max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95"
            style={mobileEditModalStyle}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 sm:p-5 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-[var(--accent)]" />
                Edit Task
              </h2>
              {!isSavingEdit && (
                <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div
              ref={editModalScrollRef}
              className="p-4 sm:p-6 space-y-4 overflow-y-auto"
              style={mobileEditModalBodyStyle}
            >
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Task description"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 resize-none min-h-[80px]"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <select value={editTaskType} onChange={(e) => { setEditTaskType(e.target.value as TaskType); if (e.target.value === 'one_time') setEditRecurrenceFrequency(''); }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 appearance-none pr-10">
                    <option value="one_time">One-time Task</option>
                    <option value="recurring">Recurring Task</option>
                  </select>
                  <Clock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {editTaskType === 'recurring' && (
                  <div className="relative">
                    <select value={editRecurrenceFrequency} onChange={(e) => setEditRecurrenceFrequency(e.target.value === '' ? '' : (e.target.value as RecurrenceFrequency))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 appearance-none pr-10">
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
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 appearance-none pr-10">
                    <option value="none">Anyone / Unassigned</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === 'super_admin' || emp.role === 'owner' ? 'Owner' : emp.role === 'manager' ? 'Manager' : 'Staff'})</option>
                    ))}
                  </select>
                  <UserPlus className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <input type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} onInput={(e) => setEditDeadline(e.currentTarget.value)} onBlur={(e) => setEditDeadline(e.currentTarget.value)} onFocus={(e) => syncInputOnPickerClose(e.currentTarget, setEditDeadline)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editHighPriority"
                  checked={editIsHighPriority}
                  onChange={(e) => setEditIsHighPriority(e.target.checked)}
                  className="w-5 h-5 text-red-500 rounded focus:ring-red-300 border-slate-300"
                />
                <label htmlFor="editHighPriority" className="text-sm text-slate-700">
                  Mark as High Priority
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editRequirePhoto} onChange={(e) => setEditRequirePhoto(e.target.checked)}
                  className="w-5 h-5 text-[var(--accent)] rounded focus:ring-[var(--accent)]/20 border-slate-300" />
                Require photo proof
              </label>
              <div className="sticky bottom-0 z-10 bg-white pt-2 pb-1 flex gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsEditing(false)} disabled={isSavingEdit}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-semibold transition-all disabled:opacity-50" style={{ minHeight: 48 }}>
                  Cancel
                </button>
                <LoadingButton
                  type="button"
                  onClick={handleEditSave}
                  isLoading={isSavingEdit}
                  loadingText="Saving..."
                  variant="primary"
                  disabled={isSavingEdit}
                  className="flex-1 bg-[var(--accent)] hover:bg-[#4338CA] text-white py-3 rounded-xl font-bold transition-all disabled:opacity-60 active:scale-95"
                  style={{ minHeight: 48 }}
                >
                  Save Changes
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Proof Image Modal ─── */}
      {showFullImage && task.proof && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Task Proof</h3>
              <button onClick={() => setShowFullImage(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-4">
              <div className="max-h-[65vh] overflow-y-auto rounded-lg">
                <img src={task.proof.imageUrl} alt="Task proof" className="w-full h-auto object-contain rounded-lg" />
              </div>
              <p className="text-sm text-slate-500 mt-2">Completed: {new Date(task.proof.timestamp).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default TaskDetailsScreen;







