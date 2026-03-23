import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Filter, Link2, MessageSquare, Paperclip, Plus, Send, X, XCircle, Calendar } from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import { Employee } from '../types';
import LoadingButton from '../src/components/ui/LoadingButton';

type ApprovalStatus = 'PENDING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';
type ApprovalView = 'my_requests' | 'needs_my_approval';

type ApprovalItem = {
  id: string;
  requester_id: string;
  approver_id: string;
  title: string;
  description: string;
  amount: number | null;
  status: ApprovalStatus;
  created_at?: string | null;
  updated_at?: string | null;
  company_id?: string | null;
  task_id?: string | null;
  isEscalated: boolean;
  adminEscalationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  escalated_to?: string | null;
};

type ApprovalThread = {
  id: string;
  approval_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
};

type ApprovalThreadView = ApprovalThread & {
  sender_name: string;
  optimistic?: boolean;
};

type ApproverOption = {
  id: string;
  name: string;
  role: string;
};

type ApprovalAttachment = {
  name: string;
  url: string;
  contentType: string;
  size: number;
};

type PendingAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

const LOCKED_STATUSES: ApprovalStatus[] = ['APPROVED', 'REJECTED'];
const ATTACHMENT_LINE_PREFIX = '__ATTACHMENT__|';
const APPROVAL_ATTACHMENT_BUCKET = 'task-proofs';

const normalizeStatus = (value: unknown): ApprovalStatus => {
  if (value === 'PENDING' || value === 'NEEDS_REVIEW' || value === 'APPROVED' || value === 'REJECTED') {
    return value;
  }
  return 'PENDING';
};

const getStatusClasses = (status: ApprovalStatus): string => {
  if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 border border-rose-200';
  if (status === 'NEEDS_REVIEW') return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/20';
};

const formatAmount = (value: number | null): string => {
  if (value === null || value === undefined) {
    return 'Non-monetary';
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `INR ${value || 0}`;
  }
};

const formatDateTime = (value: string): string => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

const extractApprovalAttachments = (rawDescription: string): { description: string; attachments: ApprovalAttachment[] } => {
  const lines = String(rawDescription || '').split('\n');
  const attachments: ApprovalAttachment[] = [];
  const textLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith(ATTACHMENT_LINE_PREFIX)) {
      textLines.push(line);
      continue;
    }

    const payload = line.slice(ATTACHMENT_LINE_PREFIX.length);
    const [encodedName, encodedUrl, encodedType, rawSize] = payload.split('|');
    const safeDecode = (value: string): string => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const name = safeDecode(encodedName || '').trim();
    const url = safeDecode(encodedUrl || '').trim();
    const contentType = safeDecode(encodedType || '').trim();
    const size = Number(rawSize || 0);

    if (!name || !url) continue;
    attachments.push({
      name,
      url,
      contentType,
      size: Number.isFinite(size) ? size : 0,
    });
  }

  return {
    description: textLines.join('\n').trim(),
    attachments,
  };
};

const appendAttachmentsToDescription = (description: string, attachments: ApprovalAttachment[]): string => {
  if (!attachments.length) return description;

  const attachmentLines = attachments.map((item) => {
    const encodedName = encodeURIComponent(item.name);
    const encodedUrl = encodeURIComponent(item.url);
    const encodedType = encodeURIComponent(item.contentType || '');
    const encodedSize = String(Number.isFinite(item.size) ? item.size : 0);
    return `${ATTACHMENT_LINE_PREFIX}${encodedName}|${encodedUrl}|${encodedType}|${encodedSize}`;
  });

  return [description, ...attachmentLines].filter(Boolean).join('\n');
};

const formatAttachmentSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const sanitizeFileName = (name: string): string => String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');

const parseDateTimeMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const approvalActivityMs = (item: ApprovalItem): number =>
  Math.max(parseDateTimeMs(item.updated_at), parseDateTimeMs(item.created_at));

const sortApprovalsByRecency = (items: ApprovalItem[]): ApprovalItem[] =>
  [...items].sort((a, b) => {
    const diff = approvalActivityMs(b) - approvalActivityMs(a);
    if (diff !== 0) return diff;
    return String(b.id).localeCompare(String(a.id));
  });

const approvalsAreEqual = (left: ApprovalItem[], right: ApprovalItem[]): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (
      a.id !== b.id ||
      a.requester_id !== b.requester_id ||
      a.approver_id !== b.approver_id ||
      a.title !== b.title ||
      a.description !== b.description ||
      a.status !== b.status ||
      a.amount !== b.amount ||
      a.company_id !== b.company_id ||
      a.task_id !== b.task_id ||
      a.created_at !== b.created_at ||
      a.updated_at !== b.updated_at
    ) {
      return false;
    }
  }
  return true;
};

const getActionErrorMessage = (error: unknown, fallback = 'Operation failed.'): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) {
      return message;
    }
  }
  return fallback;
};

const threadsAreEqual = (left: ApprovalThreadView[], right: ApprovalThreadView[]): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (
      a.id !== b.id ||
      a.approval_id !== b.approval_id ||
      a.sender_id !== b.sender_id ||
      a.sender_name !== b.sender_name ||
      a.message_text !== b.message_text ||
      a.created_at !== b.created_at
    ) {
      return false;
    }
  }
  return true;
};

// Helper function to filter approvals by status
const filterApprovalsByStatus = (approvals: ApprovalItem[], filter: 'all' | 'pending' | 'completed'): ApprovalItem[] => {
  if (filter === 'all') return approvals;
  if (filter === 'pending') {
    return approvals.filter(approval => 
      approval.status === 'PENDING' || approval.status === 'NEEDS_REVIEW'
    );
  }
  if (filter === 'completed') {
    return approvals.filter(approval => 
      approval.status === 'APPROVED' || approval.status === 'REJECTED'
    );
  }
  return approvals;
};

const normalizeApprovalStatusKey = (status: unknown): string => String(status || '').toUpperCase();

const isPendingApprovalStatus = (status: unknown): boolean => {
  const key = normalizeApprovalStatusKey(status);
  return key === 'PENDING' || key === 'NEEDS_REVIEW' || key === 'IN_PROGRESS' || key === 'IN-PROGRESS';
};

const isApprovedApprovalStatus = (status: unknown): boolean => {
  const key = normalizeApprovalStatusKey(status);
  return key === 'APPROVED' || key === 'REJECTED';
};

const getApprovalUpdatedAtValue = (approval: ApprovalItem): string | null => {
  const camel = (approval as any).updatedAt;
  if (typeof camel === 'string' && camel) return camel;
  return approval.updated_at || null;
};

// Helper function to group approvals by month and year
const groupApprovalsByMonth = (approvals: ApprovalItem[]): Record<string, ApprovalItem[]> => {
  return approvals.reduce((groups, approval) => {
    const date = new Date(approval.created_at || '');
    const monthYear = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
    
    if (!groups[monthYear]) {
      groups[monthYear] = [];
    }
    groups[monthYear].push(approval);
    return groups;
  }, {} as Record<string, ApprovalItem[]>);
};

// Helper function to get available months from approvals
const getAvailableMonths = (approvals: ApprovalItem[]): string[] => {
  const months = new Set<string>();
  approvals.forEach(approval => {
    if (approval.created_at) {
      const date = new Date(approval.created_at);
      const monthYear = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
      months.add(monthYear);
    }
  });
  return Array.from(months).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// Helper function to filter approvals by month
const filterApprovalsByMonth = (approvals: ApprovalItem[], monthFilter: string): ApprovalItem[] => {
  if (monthFilter === 'all') return approvals;
  
  return approvals.filter(approval => {
    if (!approval.created_at) return false;
    const date = new Date(approval.created_at);
    const monthYear = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
    return monthYear === monthFilter;
  });
};

// Helper function to filter approvals by date range
const filterApprovalsByDateRange = (approvals: ApprovalItem[], startDate: string, endDate: string): ApprovalItem[] => {
  if (!startDate && !endDate) return approvals;
  
  return approvals.filter(approval => {
    if (!approval.created_at) return false;
    const approvalDate = new Date(approval.created_at);
    const start = startDate ? new Date(startDate) : new Date('1970-01-01');
    const end = endDate ? new Date(endDate + 'T23:59:59') : new Date();
    
    return approvalDate >= start && approvalDate <= end;
  });
};

// Helper function to get approver name by ID
const getApproverName = (approverId: string, approvers: ApproverOption[]): string => {
  const approver = approvers.find(a => a.id === approverId);
  return approver ? approver.name : 'Unknown';
};

interface ApprovalsPanelProps {
  currentUser: Employee;
}

const ApprovalsPanel: React.FC<ApprovalsPanelProps> = ({ currentUser }) => {
  type ApprovedDateFilter = 'today' | 'yesterday' | 'last7' | 'custom';
  const isAdminApprover = currentUser.role === 'owner' || currentUser.role === 'super_admin';
  const canUsePendingApprovedTabs =
    currentUser.role === 'super_admin' || currentUser.role === 'owner' || currentUser.role === 'manager';
  const isStaffOnly = currentUser.role === 'staff';
  const [view, setView] = useState<ApprovalView>(currentUser.role === 'owner' || currentUser.role === 'super_admin' ? 'needs_my_approval' : 'my_requests');
  const [approvalTab, setApprovalTab] = useState<'pending' | 'approved'>('pending');
  const [approvedDateFilter, setApprovedDateFilter] = useState<ApprovedDateFilter>('today');
  const [approvedFromDate, setApprovedFromDate] = useState('');
  const [approvedToDate, setApprovedToDate] = useState('');
  const [showApprovedDateFilterMenu, setShowApprovedDateFilterMenu] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  // Set default month filter to current month
  const getCurrentMonth = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
  };
  const [monthFilter, setMonthFilter] = useState<string>(getCurrentMonth());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  // Date range filter state
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [selectedEscalationAdminByApproval, setSelectedEscalationAdminByApproval] = useState<Record<string, string>>({});
  const superAdmins = approvers.filter(a => a.role === 'super_admin' || a.role === 'owner');
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [creatingApproval, setCreatingApproval] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [requestDescription, setRequestDescription] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestApproverId, setRequestApproverId] = useState('');
  const [requestAttachments, setRequestAttachments] = useState<PendingAttachment[]>([]);
  const [threads, setThreads] = useState<ApprovalThreadView[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [approvalReadAtById, setApprovalReadAtById] = useState<Record<string, number>>({});
  const [approvalUnreadCountById, setApprovalUnreadCountById] = useState<Record<string, number>>({});
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);
  const [processingApprovalAction, setProcessingApprovalAction] = useState<
    | 'approve'
    | 'reject'
    | 'escalate'
    | 'admin_approve'
    | 'admin_reject'
    | 'final_approve'
    | 'review'
    | null
  >(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const approvedDateFilterRef = useRef<HTMLDivElement | null>(null);
  const attachmentFilesRef = useRef<Record<string, File>>({});
  const approvalChatReadsTableMissingRef = useRef(false);
  const approvalReadStorageKey = useMemo(() => `approval-chat-read:${currentUser.id}`, [currentUser.id]);
  const [employeeNamesById, setEmployeeNamesById] = useState<Record<string, string>>({});

  const selectedApproval = useMemo(
    () => approvals.find((item) => item.id === selectedApprovalId) || null,
    [approvals, selectedApprovalId]
  );

  const dayStartMs = useCallback((date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), []);
  const nowMs = Date.now();
  const todayStartMs = dayStartMs(new Date(nowMs));
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000;
  const last7StartMs = todayStartMs - 6 * 24 * 60 * 60 * 1000;
  const approvedFromStartMs = approvedFromDate
    ? dayStartMs(new Date(`${approvedFromDate}T00:00:00`))
    : null;
  const approvedToEndMs = approvedToDate
    ? dayStartMs(new Date(`${approvedToDate}T00:00:00`)) + (24 * 60 * 60 * 1000) - 1
    : null;

  const scopedApprovalsForTabs = useMemo(() => {
    const base = view === 'my_requests'
      ? approvals
      : approvals.filter((approval) => {
          const directApproval = approval.approver_id === currentUser.id;
          const escalatedApproval =
            isAdminApprover && approval.isEscalated && approval.escalated_to === currentUser.id;
          return directApproval || escalatedApproval;
        });
    return sortApprovalsByRecency(base);
  }, [approvals, currentUser.id, isAdminApprover, view]);

  const pendingApprovalCount = useMemo(
    () => scopedApprovalsForTabs.filter((item) => isPendingApprovalStatus(item.status)).length,
    [scopedApprovalsForTabs]
  );

  const approvedTodayCount = useMemo(
    () =>
      scopedApprovalsForTabs.filter((item) => {
        if (!isApprovedApprovalStatus(item.status)) return false;
        const updatedMs = parseDateTimeMs(getApprovalUpdatedAtValue(item));
        return updatedMs >= todayStartMs && updatedMs <= nowMs;
      }).length,
    [scopedApprovalsForTabs, todayStartMs, nowMs]
  );

  const handleOpenPendingTab = () => {
    setApprovalTab('pending');
    setShowApprovedDateFilterMenu(false);
  };

  const handleOpenApprovedTab = () => {
    setApprovalTab('approved');
    setApprovedDateFilter('today');
    setApprovedFromDate('');
    setApprovedToDate('');
    setShowApprovedDateFilterMenu(false);
  };

  const approvedFilterLabel =
    approvedDateFilter === 'today'
      ? 'Today'
      : approvedDateFilter === 'yesterday'
      ? 'Yesterday'
      : approvedDateFilter === 'last7'
      ? 'Last 7 days'
      : 'Custom range';

  const isDecisionWithinApprovedFilter = useCallback(
    (approval: ApprovalItem): boolean => {
      const updatedMs = parseDateTimeMs(getApprovalUpdatedAtValue(approval));
      if (!updatedMs) return false;
      if (approvedDateFilter === 'today') {
        return updatedMs >= todayStartMs && updatedMs <= nowMs;
      }
      if (approvedDateFilter === 'yesterday') {
        return updatedMs >= yesterdayStartMs && updatedMs < todayStartMs;
      }
      if (approvedDateFilter === 'last7') {
        return updatedMs >= last7StartMs && updatedMs <= nowMs;
      }
      if (approvedDateFilter === 'custom') {
        const from = approvedFromStartMs ?? Number.MIN_SAFE_INTEGER;
        const to = approvedToEndMs ?? Number.MAX_SAFE_INTEGER;
        return updatedMs >= from && updatedMs <= to;
      }
      return true;
    },
    [
      approvedDateFilter,
      approvedFromStartMs,
      approvedToEndMs,
      last7StartMs,
      nowMs,
      todayStartMs,
      yesterdayStartMs,
    ]
  );

  const filterNeedsMyApprovalQueue = useCallback(
    (items: ApprovalItem[]): ApprovalItem[] =>
      items.filter((approval) => {
        const directApproval = approval.approver_id === currentUser.id;

        const escalatedApproval =
          isAdminApprover &&
          approval.isEscalated &&
          approval.escalated_to === currentUser.id;

        return directApproval || escalatedApproval;
      }),
    [currentUser.id, isAdminApprover]
  );

  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      ),
    ]);
  }, []);

  const runApprovalAction = useCallback(
    async (approvalId: string, action: NonNullable<typeof processingApprovalAction>, fn: () => Promise<void>) => {
      if (!approvalId || processingApprovalId) return;
      setProcessingApprovalId(approvalId);
      setProcessingApprovalAction(action);
      try {
        await withTimeout(fn(), 30000);
      } catch (err) {
        const message = getActionErrorMessage(err);
        setError(message);
      } finally {
        setProcessingApprovalId(null);
        setProcessingApprovalAction(null);
      }
    },
    [processingApprovalId, withTimeout]
  );

  const getLocalApprovalReadMap = useCallback((): Record<string, number> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(approvalReadStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const map: Record<string, number> = {};
      Object.entries(parsed).forEach(([approvalId, value]) => {
        const ts = parseDateTimeMs(value);
        if (approvalId && ts > 0) {
          map[approvalId] = ts;
        }
      });
      return map;
    } catch {
      return {};
    }
  }, [approvalReadStorageKey]);

  const saveLocalApprovalReadMap = useCallback((next: Record<string, number>) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(approvalReadStorageKey, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, [approvalReadStorageKey]);

  useEffect(() => {
    setApprovalReadAtById(getLocalApprovalReadMap());
  }, [getLocalApprovalReadMap]);

  const loadApprovalReadReceipts = useCallback(async (approvalIds: string[]) => {
    if (!approvalIds.length || approvalChatReadsTableMissingRef.current) {
      return;
    }

    const { data, error: readError } = await supabase
      .from('approval_chat_reads')
      .select('approval_id, last_read_at')
      .eq('user_id', currentUser.id)
      .in('approval_id', approvalIds);

    if (readError) {
      const msg = String(readError.message || '').toLowerCase();
      const missingTable =
        (msg.includes('relation') && msg.includes('approval_chat_reads')) ||
        (msg.includes('does not exist') && msg.includes('approval_chat_reads'));
      if (missingTable) {
        approvalChatReadsTableMissingRef.current = true;
        console.warn('approval_chat_reads table is missing; unread approval badges are disabled until migration is run.');
        return;
      }
      console.warn('Failed to load approval chat read state:', readError);
      return;
    }

    const localMap = getLocalApprovalReadMap();
    const next: Record<string, number> = { ...localMap };
    for (const row of data || []) {
      const approvalId = String((row as any).approval_id || '');
      if (!approvalId) continue;
      next[approvalId] = Math.max(next[approvalId] || 0, parseDateTimeMs((row as any).last_read_at));
    }
    setApprovalReadAtById((prev) => ({ ...prev, ...next }));
    saveLocalApprovalReadMap(next);
  }, [currentUser.id, getLocalApprovalReadMap, saveLocalApprovalReadMap]);

  const recomputeApprovalUnreadCounts = useCallback(async (
    approvalIds: string[],
    readMapOverride?: Record<string, number>
  ) => {
    if (!approvalIds.length) {
      setApprovalUnreadCountById({});
      return;
    }

    const { data, error: threadsError } = await supabase
      .from('approval_threads')
      .select('approval_id, sender_id, created_at')
      .in('approval_id', approvalIds);

    if (threadsError) {
      console.warn('Failed to compute approval unread counts:', threadsError);
      return;
    }

    const readMap = readMapOverride ?? approvalReadAtById;
    const counts: Record<string, number> = {};
    for (const approvalId of approvalIds) {
      counts[approvalId] = 0;
    }

    for (const row of data || []) {
      const approvalId = String((row as any).approval_id || '');
      if (!approvalId || !(approvalId in counts)) continue;
      const senderId = String((row as any).sender_id || '');
      if (senderId === currentUser.id) continue;
      const createdAtMs = parseDateTimeMs((row as any).created_at);
      const lastReadAtMs = readMap[approvalId] || 0;
      if (createdAtMs > lastReadAtMs) {
        counts[approvalId] += 1;
      }
    }

    setApprovalUnreadCountById(counts);
  }, [approvalReadAtById, currentUser.id]);

  const markApprovalThreadRead = useCallback(async (approvalId: string, readAtMs?: number) => {
    if (!approvalId || approvalChatReadsTableMissingRef.current) return;

    let resolvedReadAtMs = readAtMs || 0;
    if (!resolvedReadAtMs) {
      const { data: latestRow, error: latestError } = await supabase
        .from('approval_threads')
        .select('created_at')
        .eq('approval_id', approvalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.warn('Failed to resolve latest approval thread timestamp:', latestError);
      } else if (latestRow?.created_at) {
        const latestTs = parseDateTimeMs(latestRow.created_at);
        if (latestTs > 0) {
          resolvedReadAtMs = latestTs + 1;
        }
      }
    }

    const effectiveReadAtMs = Math.max(resolvedReadAtMs, Date.now());
    const readAtIso = new Date(effectiveReadAtMs).toISOString();
    setApprovalReadAtById((prev) => {
      const merged = { ...prev, [approvalId]: Math.max(prev[approvalId] || 0, effectiveReadAtMs) };
      saveLocalApprovalReadMap(merged);
      return merged;
    });
    setApprovalUnreadCountById((prev) => ({ ...prev, [approvalId]: 0 }));

    const { error: upsertError } = await supabase
      .from('approval_chat_reads')
      .upsert(
        {
          approval_id: approvalId,
          user_id: currentUser.id,
          last_read_at: readAtIso,
        },
        { onConflict: 'approval_id,user_id' }
      );

    if (upsertError) {
      const msg = String(upsertError.message || '').toLowerCase();
      const missingTable =
        (msg.includes('relation') && msg.includes('approval_chat_reads')) ||
        (msg.includes('does not exist') && msg.includes('approval_chat_reads'));
      if (missingTable) {
        approvalChatReadsTableMissingRef.current = true;
        console.warn('approval_chat_reads table is missing; unread approval badges are disabled until migration is run.');
        return;
      }
      console.warn('Failed to mark approval chat as read:', upsertError);
    }
  }, [currentUser.id, saveLocalApprovalReadMap]);

  const toggleApprovalSelection = useCallback((approvalId: string) => {
    setSelectedApprovalId((prev) => {
      const next = prev === approvalId ? null : approvalId;
      if (next) {
        void markApprovalThreadRead(next);
      }
      return next;
    });
  }, [markApprovalThreadRead]);

  const loadApprovers = useCallback(async () => {
    setLoadingApprovers(true);
    try {
      const { data, error: approverError } = await supabase
        .from('employees')
        .select('id, name, role')
        .eq('company_id', currentUser.company_id);
      if (approverError) throw approverError;

      const candidates = (data || [])
        .map((row: any) => ({
          id: String(row.id || ''),
          name: String(row.name || 'Unknown'),
          role: String(row.role || 'staff'),
        }))
        .filter((item) => item.id && item.role !== 'staff')
        .sort((a, b) => a.name.localeCompare(b.name));

      const names = (data || []).reduce<Record<string, string>>((acc, row: any) => {
        const id = String(row.id || '');
        if (!id) return acc;
        acc[id] = String(row.name || 'Unknown');
        return acc;
      }, {});

      setApprovers(candidates);
      setEmployeeNamesById(names);
      if (!requestApproverId && candidates.length) {
        setRequestApproverId(candidates[0].id);
      }
    } catch (loadApproverErr: any) {
      setError(loadApproverErr?.message || 'Failed to load approvers.');
    } finally {
      setLoadingApprovers(false);
    }
  }, [currentUser.company_id, requestApproverId]);

  const loadApprovals = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingApprovals(true);
      setError(null);
    }
    try {
      let query = supabase
        .from('approvals')
        .select('id, requester_id, approver_id, title, description, amount, status, task_id, isEscalated, adminEscalationStatus, escalated_to, created_at, updated_at');

      let rows: any[] = [];

      if (view === 'my_requests') {
        const { data: requesterData, error: requesterError } = await query
          .eq('requester_id', currentUser.id)
          .order('id', { ascending: false });
        if (requesterError) throw requesterError;
        rows = requesterData || [];
      } else {
        if (isAdminApprover) {
          query = query.or(`approver_id.eq.${currentUser.id},escalated_to.eq.${currentUser.id}`);
        } else {
          // Regular Managers only see requests directly assigned to them
          query = query.eq('approver_id', currentUser.id);
        }

        const { data: approverData, error: approverError } = await query.order('id', { ascending: false });
        if (approverError) throw approverError;
        rows = approverData || [];
      }

      const mappedRows = (rows || []).map((row: any) => ({
        id: String(row.id),
        requester_id: String(row.requester_id || ''),
        approver_id: String(row.approver_id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
        amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
        status: normalizeStatus(row.status),
        company_id: row.company_id ? String(row.company_id) : null,
        task_id: row.task_id ? String(row.task_id) : null,
        created_at: row.created_at ? String(row.created_at) : null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
        isEscalated: Boolean(row.isEscalated || false),
        adminEscalationStatus: String(row.adminEscalationStatus || 'NONE'),
        escalated_to: row.escalated_to ? String(row.escalated_to) : null,
      }));

      const mapped = sortApprovalsByRecency(
        view === 'needs_my_approval'
          ? filterNeedsMyApprovalQueue(mappedRows)
          : mappedRows
      );

      setApprovals((prev) => (approvalsAreEqual(prev, mapped) ? prev : mapped));

      if (!mapped.length) {
        setSelectedApprovalId(null);
        setThreads([]);
        return;
      }

      setSelectedApprovalId((prev) => {
        // Keep manual collapse state (null) across refresh/realtime updates.
        if (!prev) {
          return null;
        }
        return mapped.some((a) => a.id === prev) ? prev : null;
      });
    } catch (loadErr: any) {
      if (!silent) {
        setError(loadErr?.message || 'Failed to load approvals.');
      }
    } finally {
      if (!silent) {
        setLoadingApprovals(false);
      }
    }
  }, [currentUser.id, currentUser.role, filterNeedsMyApprovalQueue, isAdminApprover, view]);

  const loadThreads = useCallback(async (approvalId: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingThreads(true);
    }
    try {
      const { data, error: threadError } = await supabase
        .from('approval_threads')
        .select('id, approval_id, sender_id, message_text, created_at')
        .eq('approval_id', approvalId)
        .order('created_at', { ascending: true });
      if (threadError) throw threadError;

      const rows: ApprovalThread[] = (data || []).map((row: any) => ({
        id: String(row.id),
        approval_id: String(row.approval_id || approvalId),
        sender_id: String(row.sender_id || ''),
        message_text: String(row.message_text || ''),
        created_at: String(row.created_at || new Date().toISOString()),
      }));

      const senderIds = Array.from(new Set(rows.map((row) => row.sender_id).filter(Boolean)));
      let senderMap: Record<string, string> = {};

      if (senderIds.length) {
        const { data: senders, error: senderError } = await supabase
          .from('employees')
          .select('id, name')
          .in('id', senderIds);
        if (senderError) throw senderError;

        senderMap = (senders || []).reduce<Record<string, string>>((acc, sender: any) => {
          acc[String(sender.id)] = String(sender.name || 'Unknown');
          return acc;
        }, {});
      }

      const normalized = rows.map((row) => ({
        ...row,
        sender_name: senderMap[row.sender_id] || 'Unknown',
      }));

      setThreads((prev) => (threadsAreEqual(prev, normalized) ? prev : normalized));
    } catch (threadErr: any) {
      if (!silent) {
        setError(threadErr?.message || 'Failed to load discussion thread.');
      }
    } finally {
      if (!silent) {
        setLoadingThreads(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  useEffect(() => {
    void loadApprovers();
  }, [loadApprovers]);

  useEffect(() => {
    if (!isStaffOnly) return;
    setView('my_requests');
  }, [isStaffOnly]);

  useEffect(() => {
    if (!showApprovedDateFilterMenu) return;
    const handleOutside = (event: MouseEvent) => {
      if (!approvedDateFilterRef.current) return;
      const target = event.target as Node;
      if (!approvedDateFilterRef.current.contains(target)) {
        setShowApprovedDateFilterMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [showApprovedDateFilterMenu]);

  useEffect(() => {
    if (!selectedApprovalId) return;
    void loadThreads(selectedApprovalId);
  }, [selectedApprovalId, loadThreads]);

  useEffect(() => {
    if (!selectedApprovalId) return;
    void markApprovalThreadRead(selectedApprovalId);
  }, [selectedApprovalId, markApprovalThreadRead]);

  useEffect(() => {
    const approvalIds = approvals.map((item) => item.id);
    if (!approvalIds.length) {
      setApprovalUnreadCountById({});
      return;
    }
    void loadApprovalReadReceipts(approvalIds);
  }, [approvals, loadApprovalReadReceipts]);

  useEffect(() => {
    const approvalIds = approvals.map((item) => item.id);
    if (!approvalIds.length) {
      setApprovalUnreadCountById({});
      return;
    }
    void recomputeApprovalUnreadCounts(approvalIds);
  }, [approvals, approvalReadAtById, recomputeApprovalUnreadCounts]);

  useEffect(() => {
    const isRowRelevantToCurrentUser = (row: any): boolean => {
      const requesterId = String(row?.requester_id || '');
      const approverId = String(row?.approver_id || '');
      const isEscalated = Boolean(row?.isEscalated);
      return requesterId === currentUser.id || approverId === currentUser.id ||
        (isAdminApprover && isEscalated && String(row?.escalated_to || '') === currentUser.id);
    };
    const refreshUnreadCounts = () => {
      const approvalIds = approvals.map((item) => item.id);
      if (!approvalIds.length) return;
      void recomputeApprovalUnreadCounts(approvalIds);
    };

    const channel = supabase
      .channel(`approvals-live-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals' },
        (payload: any) => {
          const newRow = payload?.new || {};
          const oldRow = payload?.old || {};
          const newId = String(newRow?.id || '');
          const oldId = String(oldRow?.id || '');
          const selectedChanged =
            !!selectedApprovalId &&
            (selectedApprovalId === newId || selectedApprovalId === oldId);
          const userRelated =
            isRowRelevantToCurrentUser(newRow) || isRowRelevantToCurrentUser(oldRow);

          if (selectedChanged || userRelated) {
            void loadApprovals({ silent: true });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_threads' },
        (payload: any) => {
          const newApprovalId = String(payload?.new?.approval_id || '');
          const oldApprovalId = String(payload?.old?.approval_id || '');
          const changedApprovalId = newApprovalId || oldApprovalId;
          if (!changedApprovalId) return;

          refreshUnreadCounts();

          const threadForSelectedApproval =
            !!selectedApprovalId &&
            (newApprovalId === selectedApprovalId || oldApprovalId === selectedApprovalId);

          if (!threadForSelectedApproval) return;

          void loadThreads(selectedApprovalId, { silent: true });

          const senderId = String(payload?.new?.sender_id || '');
          if (senderId && senderId !== currentUser.id) {
            const incomingMessageMs = parseDateTimeMs(payload?.new?.created_at);
            void markApprovalThreadRead(selectedApprovalId, incomingMessageMs > 0 ? incomingMessageMs + 1 : undefined);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_chat_reads',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload: any) => {
          const approvalId = String(payload?.new?.approval_id || payload?.old?.approval_id || '');
          if (!approvalId) return;
          const readAtMs = parseDateTimeMs(payload?.new?.last_read_at);
          setApprovalReadAtById((prev) => {
            const merged = { ...prev, [approvalId]: readAtMs || Date.now() };
            saveLocalApprovalReadMap(merged);
            return merged;
          });
          if (approvalId === selectedApprovalId) {
            setApprovalUnreadCountById((prev) => ({ ...prev, [approvalId]: 0 }));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    approvals,
    currentUser.id,
    currentUser.role,
    selectedApprovalId,
    loadApprovals,
    loadThreads,
    recomputeApprovalUnreadCounts,
    markApprovalThreadRead,
    saveLocalApprovalReadMap,
  ]);

  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void loadApprovals({ silent: true });
      if (selectedApprovalId) {
        void loadThreads(selectedApprovalId, { silent: true });
      }
    };

    const intervalId = window.setInterval(refresh, 4000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadApprovals, loadThreads, selectedApprovalId]);

  const handleCreateRequest = async (): Promise<void> => {
    const title = requestTitle.trim();
    const description = requestDescription.trim();
    const rawAmount = requestAmount.trim();
    const amountValue =
      rawAmount === ''
        ? null
        : Number(rawAmount);
    const approverId = requestApproverId.trim();
    if (creatingApproval) {
      return;
    }

    if (!title) {
      setError('Approval title is required.');
      return;
    }
    if (!approverId) {
      setError('Please choose an approver to tag.');
      return;
    }
    if (amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0)) {
      setError('Amount must be a valid non-negative number when provided.');
      return;
    }

    setCreatingApproval(true);
    setError(null);

    try {
      let uploadedAttachments: ApprovalAttachment[] = [];
      if (requestAttachments.length > 0) {
        const uploadResults = await Promise.all(
          requestAttachments.map(async (attachment) => {
            const file = attachmentFilesRef.current[attachment.id];
            if (!file) {
              throw new Error(`Attachment "${attachment.name}" is missing. Please re-attach and try again.`);
            }

            const safeName = sanitizeFileName(attachment.name);
            const storagePath = `approval-attachments/${currentUser.company_id}/${currentUser.id}/${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 9)}-${safeName}`;

            const { error: uploadError } = await supabase.storage
              .from(APPROVAL_ATTACHMENT_BUCKET)
              .upload(storagePath, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
              });

            if (uploadError) {
              throw new Error(
                `Failed to upload "${file.name}". Ensure Storage bucket "${APPROVAL_ATTACHMENT_BUCKET}" allows uploads.`
              );
            }

            const { data: publicData } = supabase.storage
              .from(APPROVAL_ATTACHMENT_BUCKET)
              .getPublicUrl(storagePath);

            return {
              name: attachment.name,
              url: String(publicData?.publicUrl || '').trim(),
              contentType: file.type || attachment.contentType || '',
              size: file.size || attachment.size || 0,
            } as ApprovalAttachment;
          })
        );

        uploadedAttachments = uploadResults.filter((item) => Boolean(item.url));
      }

      const descriptionWithAttachments = appendAttachmentsToDescription(description, uploadedAttachments);
      const { data: created, error: createError } = await withTimeout(
        supabase
          .from('approvals')
          .insert({
            requester_id: currentUser.id,
            approver_id: approverId,
            title,
            description: descriptionWithAttachments,
            amount: amountValue,
            status: 'PENDING',
          })
          .select('id, requester_id, approver_id, title, description, amount, status, task_id, created_at, updated_at')
          .single(),
        30000
      );
      if (createError) throw createError;

      const createdApproval: ApprovalItem = {
        id: String(created.id),
        requester_id: String(created.requester_id || currentUser.id),
        approver_id: String(created.approver_id || approverId),
        title: String(created.title || title),
        description: String(created.description || descriptionWithAttachments),
        amount: created.amount === null || created.amount === undefined
          ? amountValue
          : Number(created.amount),
        status: normalizeStatus(created.status),
        company_id: created.company_id ? String(created.company_id) : null,
        task_id: created.task_id ? String(created.task_id) : null,
        created_at: created.created_at ? String(created.created_at) : new Date().toISOString(),
        updated_at: created.updated_at ? String(created.updated_at) : null,
        isEscalated: false,
        adminEscalationStatus: 'NONE',
      };


      setApprovals((prev) => sortApprovalsByRecency([createdApproval, ...prev]));
      setSelectedApprovalId(createdApproval.id);
      setRequestTitle('');
      setRequestDescription('');
      setRequestAmount('');
      setRequestAttachments([]);
      attachmentFilesRef.current = {};
      setView('my_requests');
      setIsApprovalModalOpen(false); // Close modal after creation
      await loadThreads(createdApproval.id);
    } catch (createErr: any) {
      if (createErr instanceof Error && createErr.message === 'Operation timed out') {
        setError('Request timed out. Please check your connection.');
        return;
      }
      setError(createErr?.message || 'Failed to create approval request.');
    } finally {
      setCreatingApproval(false);
    }
  };

  const updateStatus = async (approvalId: string, status: ApprovalStatus): Promise<void> => {
    if (!approvalId) return;
    const targetApproval = approvals.find((item) => item.id === approvalId) || selectedApproval;
    if (!targetApproval) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      console.log('[Approvals] Updating approval status', { approvalId, status });
      const { error: updateError } = await supabase
        .from('approvals')
        .update({ status })
        .eq('id', approvalId);
      if (updateError) {
        console.error(`Failed to update approval ${approvalId} status to ${status}:`, updateError);
        throw new Error(getActionErrorMessage(updateError, 'Failed to update approval status.'));
      }
      console.log('[Approvals] Approval status updated', { approvalId, status });

      setApprovals((prev) =>
        sortApprovalsByRecency(
          prev.map((item) =>
            item.id === approvalId
              ? { ...item, status, updated_at: new Date().toISOString() }
              : item
          )
        )
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updateLinkedTaskDecision = async (
    approval: ApprovalItem,
    decision: 'APPROVED' | 'REJECTED'
  ): Promise<void> => {
    if (!approval.task_id) {
      return;
    }
    const updatePayload: Record<string, unknown> =
      decision === 'APPROVED'
        ? {
            status: 'completed',
            completedAt: new Date().toISOString(),
          }
        : {
            status: 'in-progress',
            completedAt: null,
          };

    console.log('[Approvals] Updating linked task after approval decision', {
      approvalId: approval.id,
      taskId: approval.task_id,
      decision,
      updatePayload,
    });
    const { error: taskUpdateError } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', approval.task_id);

    if (taskUpdateError) {
      console.error(
        `Failed to update linked task ${approval.task_id} after approval ${approval.id} was ${decision}:`,
        taskUpdateError
      );
      throw new Error(getActionErrorMessage(taskUpdateError, 'Failed to update linked task.'));
    }
    console.log('[Approvals] Linked task updated after approval decision', {
      approvalId: approval.id,
      taskId: approval.task_id,
      decision,
    });
  };

  const handleApprove = async (approvalId: string): Promise<void> => {
    await runApprovalAction(approvalId, 'approve', async () => {
      const approval = approvals.find((item) => item.id === approvalId) || selectedApproval;
      if (!approval) return;
      console.log('[Approvals] Starting approve flow', {
        approvalId,
        taskId: approval.task_id,
      });
      await updateStatus(approvalId, 'APPROVED');
      if (approval.task_id) {
        try {
          await updateLinkedTaskDecision(approval, 'APPROVED');
        } catch (taskSyncError) {
          console.error('[Approvals] Secondary linked-task update failed after approval succeeded:', taskSyncError);
        }
      }
      console.log('[Approvals] Approve flow completed', {
        approvalId,
        taskId: approval.task_id,
      });
      alert('Approval approved successfully.');
    });
  };

  const handleReject = async (approvalId: string): Promise<void> => {
    await runApprovalAction(approvalId, 'reject', async () => {
      const approval = approvals.find((item) => item.id === approvalId) || selectedApproval;
      if (!approval) return;
      await updateStatus(approvalId, 'REJECTED');
      if (approval.task_id) {
        await updateLinkedTaskDecision(approval, 'REJECTED');
      }
      alert('Approval rejected successfully.');
    });
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!selectedApproval) return;
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      setError('Message cannot be empty.');
      return;
    }

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: ApprovalThreadView = {
      id: optimisticId,
      approval_id: selectedApproval.id,
      sender_id: currentUser.id,
      message_text: trimmed,
      created_at: new Date().toISOString(),
      sender_name: currentUser.name || 'You',
      optimistic: true,
    };

    setThreads((prev) => [...prev, optimisticMessage]);
    setDraftMessage('');
    setError(null);

    const { data, error: insertError } = await supabase
      .from('approval_threads')
      .insert({
        approval_id: selectedApproval.id,
        sender_id: currentUser.id,
        message_text: trimmed,
      })
      .select('id, approval_id, sender_id, message_text, created_at')
      .single();

    if (insertError) {
      setThreads((prev) => prev.filter((message) => message.id !== optimisticId));
      setError(insertError.message || 'Failed to send message.');
      return;
    }

    setThreads((prev) =>
      prev.map((message) =>
        message.id === optimisticId
          ? {
              id: String(data.id),
              approval_id: String(data.approval_id || selectedApproval.id),
              sender_id: String(data.sender_id || currentUser.id),
              message_text: String(data.message_text || trimmed),
              created_at: String(data.created_at || new Date().toISOString()),
              sender_name: currentUser.name || 'You',
            }
          : message
      )
    );
  };

  const handleAskForReview = async (): Promise<void> => {
    if (!selectedApproval) return;
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      setError('Please type a review note before marking NEEDS_REVIEW.');
      return;
    }

    await runApprovalAction(selectedApproval.id, 'review', async () => {
      setUpdatingStatus(true);
      setError(null);
      try {
        const { error: messageError } = await supabase
          .from('approval_threads')
          .insert({
            approval_id: selectedApproval.id,
            sender_id: currentUser.id,
            message_text: trimmed,
          });
        if (messageError) throw messageError;

        const { error: statusError } = await supabase
          .from('approvals')
          .update({ status: 'NEEDS_REVIEW' })
          .eq('id', selectedApproval.id);
        if (statusError) throw statusError;

        setApprovals((prev) =>
          sortApprovalsByRecency(
            prev.map((item) =>
              item.id === selectedApproval.id
                ? { ...item, status: 'NEEDS_REVIEW', updated_at: new Date().toISOString() }
                : item
            )
          )
        );
        setDraftMessage('');
        await loadThreads(selectedApproval.id);
      } catch (reviewErr: any) {
        setError(reviewErr?.message || 'Failed to request review.');
      } finally {
        setUpdatingStatus(false);
      }
    });
  };

  const handleEscalateToAdmin = async (approvalId: string) => {
    const selectedEscalationAdmin = selectedEscalationAdminByApproval[approvalId] || '';
    if (!selectedEscalationAdmin) {
      alert('Please select a Super Admin to escalate to.');
      return;
    }

    await runApprovalAction(approvalId, 'escalate', async () => {
      try {
        const { error: updateError } = await supabase
          .from('approvals')
          .update({
            isEscalated: true,
            adminEscalationStatus: 'PENDING',
            escalated_to: selectedEscalationAdmin,
          })
          .eq('id', approvalId);

        if (updateError) throw updateError;

        setApprovals((prev) =>
          sortApprovalsByRecency(
            prev.map((app) =>
              app.id === approvalId
                ? {
                    ...app,
                    isEscalated: true,
                    adminEscalationStatus: 'PENDING',
                    escalated_to: selectedEscalationAdmin,
                    updated_at: new Date().toISOString(),
                  }
                : app
            )
          )
        );

        alert('Successfully escalated to Super Admin!');
        setSelectedEscalationAdminByApproval((prev) => {
          const next = { ...prev };
          delete next[approvalId];
          return next;
        });
      } catch (error: any) {
        console.error('Escalation error:', error);
        alert('Failed to escalate: ' + error.message);
      }
    });
  };

  const handleAdminEscalationDecision = async (decision: 'APPROVED' | 'REJECTED'): Promise<void> => {
    if (!selectedApproval) return;

    await runApprovalAction(
      selectedApproval.id,
      decision === 'APPROVED' ? 'admin_approve' : 'admin_reject',
      async () => {
        setUpdatingStatus(true);
        setError(null);
        try {
          const { error: decisionError } = await supabase
            .from('approvals')
            .update({ adminEscalationStatus: decision })
            .eq('id', selectedApproval.id);
          if (decisionError) throw decisionError;

          setApprovals((prev) =>
            sortApprovalsByRecency(
              prev.map((item) =>
                item.id === selectedApproval.id
                  ? { ...item, adminEscalationStatus: decision }
                  : item
              )
            )
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to update escalation decision.');
        } finally {
          setUpdatingStatus(false);
        }
      }
    );
  };

  const handleFinalApproval = async (): Promise<void> => {
    if (!selectedApproval) return;

    await runApprovalAction(selectedApproval.id, 'final_approve', async () => {
      setUpdatingStatus(true);
      setError(null);
      try {
        const { error: approveError } = await supabase
          .from('approvals')
          .update({ status: 'APPROVED' })
          .eq('id', selectedApproval.id);
        if (approveError) throw approveError;

        setApprovals((prev) =>
          sortApprovalsByRecency(
            prev.map((item) =>
              item.id === selectedApproval.id
                ? { ...item, status: 'APPROVED' }
                : item
            )
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve request.');
      } finally {
        setUpdatingStatus(false);
      }
    });
  };

  const renderUnreadIndicator = (count: number) => (
    <div className="relative h-7 w-7 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 shrink-0">
      <MessageSquare className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  );

  return (
    <section className="w-full bg-white border border-[var(--border)] rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="section-kicker">Approvals</p>
          <h2 className="text-lg font-black text-[var(--ink)] mt-1">Requests & Decisions</h2>
        </div>
        {currentUser.role !== 'owner' && currentUser.role !== 'super_admin' && (
          <button
            onClick={() => setIsApprovalModalOpen(true)}
            className="w-full sm:w-auto min-h-[44px] bg-[var(--accent)] hover:bg-[#4338CA] text-white rounded-2xl px-4 py-3 sm:py-2.5 shadow-[0_4px_14px_rgba(79,70,229,0.15)] flex items-center justify-center gap-2 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-semibold">Approval</span>
          </button>
        )}
      </div>

      <div className={`mt-4 flex flex-col sm:flex-row gap-2 ${currentUser.role === 'owner' || currentUser.role === 'super_admin' ? '' : ''}`}>
        {currentUser.role !== 'owner' && currentUser.role !== 'super_admin' && (
          <button
            onClick={() => setView('my_requests')}
            className={`w-full sm:w-auto min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border ${
              view === 'my_requests'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            My Requests
          </button>
        )}
        {!isStaffOnly && (
          <button
            onClick={() => setView('needs_my_approval')}
            className={`w-full sm:w-auto min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border ${
              view === 'needs_my_approval'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            Needs My Approval
          </button>
        )}
      </div>

      {canUsePendingApprovedTabs && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 pill-shell p-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenPendingTab}
              className={`flex-1 sm:flex-none min-h-[40px] rounded-xl px-4 py-1.5 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                approvalTab === 'pending'
                  ? 'pill-active text-[var(--orange)]'
                  : 'text-[var(--ink-3)] hover:bg-white/60'
              }`}
            >
              <span>Pending</span>
              <span className="font-ui-mono inline-flex min-w-[22px] h-[22px] px-1.5 items-center justify-center rounded-full bg-[var(--orange)] text-white text-[11px] font-medium leading-none">
                {pendingApprovalCount}
              </span>
            </button>
            <button
              type="button"
              onClick={handleOpenApprovedTab}
              className={`flex-1 sm:flex-none min-h-[40px] rounded-xl px-4 py-1.5 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                approvalTab === 'approved'
                  ? 'pill-active text-[var(--green)]'
                  : 'text-[var(--ink-3)] hover:bg-white/60'
              }`}
            >
              <span>Approved</span>
              <span className="font-ui-mono inline-flex min-w-[22px] h-[22px] px-1.5 items-center justify-center rounded-full bg-[var(--green)] text-white text-[11px] font-medium leading-none">
                {approvedTodayCount}
              </span>
            </button>
          </div>

          {approvalTab === 'approved' && (
            <div className="relative self-end sm:self-auto" ref={approvedDateFilterRef}>
              <button
                type="button"
                onClick={() => setShowApprovedDateFilterMenu((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink-2)] hover:bg-slate-50 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                title="Filter approved decisions by date"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{approvedFilterLabel}</span>
              </button>

              {showApprovedDateFilterMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-20 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setApprovedDateFilter('today');
                      setShowApprovedDateFilterMenu(false);
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      approvedDateFilter === 'today' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApprovedDateFilter('yesterday');
                      setShowApprovedDateFilterMenu(false);
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      approvedDateFilter === 'yesterday' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApprovedDateFilter('last7');
                      setShowApprovedDateFilterMenu(false);
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      approvedDateFilter === 'last7' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Last 7 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovedDateFilter('custom')}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      approvedDateFilter === 'custom' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Custom range
                  </button>

                  {approvedDateFilter === 'custom' && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From</label>
                        <input
                          type="date"
                          value={approvedFromDate}
                          onChange={(event) => setApprovedFromDate(event.target.value)}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-900"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</label>
                        <input
                          type="date"
                          value={approvedToDate}
                          onChange={(event) => setApprovedToDate(event.target.value)}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status Filter Pills - Only show for My Requests */}
      {view === 'my_requests' && !canUsePendingApprovedTabs && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all' as const, label: 'All' },
              { key: 'pending' as const, label: 'Pending' },
              { key: 'completed' as const, label: 'Completed' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`min-h-[36px] px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          
          {/* Month Filter Icon */}
          <div className="relative">
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
              title="Filter by month or date range"
            >
              <Filter className="w-4 h-4" />
            </button>
            
            {/* Month Dropdown */}
            {showMonthDropdown && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                <div className="max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      setMonthFilter('all');
                      setDateRangeFilter('all');
                      setStartDate('');
                      setEndDate('');
                      setShowMonthDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${
                      monthFilter === 'all' && dateRangeFilter === 'all' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-700'
                    }`}
                  >
                    All Time
                  </button>
                  {getAvailableMonths(approvals).map(month => (
                    <button
                      key={month}
                      onClick={() => {
                        setMonthFilter(month);
                        setDateRangeFilter('all');
                        setStartDate('');
                        setEndDate('');
                        setShowMonthDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${
                        monthFilter === month && dateRangeFilter === 'all' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-700'
                      }`}
                    >
                      {month}
                    </button>
                  ))}
                  
                  {/* Divider */}
                  <div className="border-t border-slate-200 my-1"></div>
                  
                  {/* Calendar Option */}
                  <button
                    onClick={() => {
                      setShowDatePicker(true);
                      setShowMonthDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                      dateRangeFilter === 'custom' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-slate-700'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Custom Date Range
                  </button>
                </div>
              </div>
            )}
            
            {/* Date Range Picker Modal */}
            {showDatePicker && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Select Date Range</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full min-h-[48px] px-3 py-2 border border-slate-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-6">
                      <button
                        onClick={() => {
                          setShowDatePicker(false);
                          setStartDate('');
                          setEndDate('');
                          setDateRangeFilter('all');
                          setMonthFilter(getCurrentMonth());
                        }}
                        className="flex-1 min-h-[44px] px-4 py-2 border border-slate-200 rounded-lg text-base text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    <button
                      onClick={() => {
                        if (startDate || endDate) {
                          setDateRangeFilter('custom');
                          setMonthFilter('all');
                          setShowDatePicker(false);
                        }
                      }}
                      disabled={!startDate && !endDate}
                      className="flex-1 min-h-[44px] px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-base hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Creation Modal */}
      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => !creatingApproval && setIsApprovalModalOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white w-full max-w-lg sm:max-w-xl h-[90vh] sm:h-auto rounded-t-3xl sm:rounded-2xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 sm:p-5 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
                Create Approval Request
              </h2>
              {!creatingApproval && (
                <button
                  onClick={() => setIsApprovalModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Form */}
            <div className="p-4 sm:p-6 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Create Request</p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={requestTitle}
                  onChange={(event) => setRequestTitle(event.target.value)}
                  placeholder="Request title"
                  className="min-h-[48px] px-3 rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  autoFocus
                />
                <div className="relative">
                  <textarea
                    value={requestDescription}
                    onChange={(event) => setRequestDescription(event.target.value)}
                    placeholder="Description"
                    className="min-h-[90px] w-full px-3 py-2 pb-10 rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 resize-none"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      attachmentsInputRef.current?.click();
                    }}
                    className="absolute bottom-2 right-2 p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                    title="Attach files"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input
                    ref={attachmentsInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.xls,.xlsx,.csv,image/*"
                    className="hidden"
                    onChange={(event) => {
                      try {
                        const files = Array.from(event.target.files || []);
                        if (!files.length) return;

                        setRequestAttachments((prev) => {
                          const existing = new Set(prev.map((item) => `${item.name}_${item.size}`));
                          const next = [...prev];

                          for (const file of files) {
                            const key = `${file.name}_${file.size}`;
                            if (existing.has(key)) continue;

                            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                            attachmentFilesRef.current[id] = file;
                            next.push({
                              id,
                              name: file.name,
                              contentType: file.type || '',
                              size: file.size || 0,
                            });
                            existing.add(key);
                          }

                          return next;
                        });
                      } catch (attachError: any) {
                        setError(attachError?.message || 'Failed to attach selected files.');
                      } finally {
                        event.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
                {requestAttachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {requestAttachments.map((file, index) => (
                      <div key={`${file.name}_${file.size}_${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-xs text-slate-700 truncate">
                          {file.name}
                          {file.size ? ` (${formatAttachmentSize(file.size)})` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setRequestAttachments((prev) => {
                              const toRemove = prev[index];
                              if (toRemove?.id) {
                                delete attachmentFilesRef.current[toRemove.id];
                              }
                              return prev.filter((_, i) => i !== index);
                            })
                          }
                          className="p-1 rounded-md text-slate-500 hover:bg-slate-200"
                          title="Remove attachment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={requestAmount}
                    onChange={(event) => setRequestAmount(event.target.value)}
                    placeholder="Amount (INR)"
                    type="number"
                    min="0"
                    className="min-h-[48px] px-3 rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  />
                  <select
                    value={requestApproverId}
                    onChange={(event) => setRequestApproverId(event.target.value)}
                    className="min-h-[48px] px-3 rounded-xl border border-slate-200 bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  >
                    {loadingApprovers ? (
                      <option value="">Loading approvers...</option>
                    ) : approvers.length === 0 ? (
                      <option value="">No approver available</option>
                    ) : (
                      approvers.map((approver) => (
                        <option key={approver.id} value={approver.id}>
                          {approver.name} ({approver.role})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsApprovalModalOpen(false)}
                    disabled={creatingApproval}
                    className="flex-1 min-h-[48px] rounded-xl bg-slate-100 text-slate-700 text-base font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <LoadingButton
                    type="button"
                    onClick={() => void handleCreateRequest()}
                    isLoading={creatingApproval}
                    loadingText="Creating..."
                    variant="primary"
                    className="flex-1 min-h-[48px] rounded-xl bg-[var(--accent)] hover:bg-[#4338CA] text-white text-base font-bold disabled:opacity-60"
                  >
                    Create & Tag Approver
                  </LoadingButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loadingApprovals ? (
          <div className="text-sm text-slate-500">Loading approvals...</div>
        ) : (
          (() => {
            // Filter approvals based on active view
            let filteredApprovals = view === 'my_requests'
              ? filterApprovalsByStatus(approvals, statusFilter)
              : filterNeedsMyApprovalQueue(approvals);

            // Apply existing month/date filters for staff-only My Requests view
            if (view === 'my_requests' && !canUsePendingApprovedTabs) {
              if (dateRangeFilter === 'custom') {
                filteredApprovals = filterApprovalsByDateRange(filteredApprovals, startDate, endDate);
              } else {
                filteredApprovals = filterApprovalsByMonth(filteredApprovals, monthFilter);
              }
            }

            if (canUsePendingApprovedTabs) {
              if (approvalTab === 'pending') {
                filteredApprovals = filteredApprovals
                  .filter((approval) => isPendingApprovalStatus(approval.status))
                  .sort((a, b) => {
                    const aMs = parseDateTimeMs(a.created_at) || approvalActivityMs(a);
                    const bMs = parseDateTimeMs(b.created_at) || approvalActivityMs(b);
                    return bMs - aMs;
                  });
              } else {
                const approvedItems = filteredApprovals
                  .filter((approval) => isApprovedApprovalStatus(approval.status))
                  .sort((a, b) => {
                    const aMs = parseDateTimeMs(getApprovalUpdatedAtValue(a)) || approvalActivityMs(a);
                    const bMs = parseDateTimeMs(getApprovalUpdatedAtValue(b)) || approvalActivityMs(b);
                    return bMs - aMs;
                  });
                filteredApprovals = approvedItems.filter(isDecisionWithinApprovedFilter);
              }
            }

            if (filteredApprovals.length === 0) {
              return (
                <div className="text-sm text-slate-500">
                  {canUsePendingApprovedTabs
                    ? approvalTab === 'pending'
                      ? 'No pending approvals found.'
                      : approvedDateFilter === 'today'
                      ? 'No approved/rejected items found for today.'
                      : approvedDateFilter === 'yesterday'
                      ? 'No approved/rejected items found for yesterday.'
                      : approvedDateFilter === 'last7'
                      ? 'No approved/rejected items found in last 7 days.'
                      : 'No approved/rejected items found in selected date range.'
                    : view === 'my_requests'
                    ? statusFilter === 'pending'
                      ? 'No pending requests found.'
                      : statusFilter === 'completed'
                      ? 'No completed requests found.'
                      : dateRangeFilter === 'custom'
                      ? `No requests found in selected date range.`
                      : monthFilter !== 'all'
                      ? `No requests found for ${monthFilter}.`
                      : 'No requests found.'
                    : 'No approvals found for this view.'}
                </div>
              );
            }

            // Group approvals by month (only for My Requests)
            if (view === 'my_requests' && !canUsePendingApprovedTabs) {
              const groupedApprovals = groupApprovalsByMonth(filteredApprovals);
              const sortedMonths = Object.keys(groupedApprovals).sort((a, b) => {
                // Sort months chronologically (most recent first)
                return new Date(b).getTime() - new Date(a).getTime();
              });

              return sortedMonths.map((monthYear) => (
                <div key={monthYear} className="space-y-3">
                  {/* Month Header */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-slate-700">{monthYear}</p>
                  </div>
                  
                  {/* Approvals for this month */}
                  <div className="space-y-3">
                    {groupedApprovals[monthYear].map((approval) => {
                      const isSelected = selectedApprovalId === approval.id;
                      const unreadCount = approvalUnreadCountById[approval.id] || 0;
                      const parsedApproval = extractApprovalAttachments(approval.description);
                      const canTakeActionOnApproval =
                        isSelected &&
                        !LOCKED_STATUSES.includes(approval.status) &&
                        (
                          approval.approver_id === currentUser.id ||
                          (isAdminApprover && approval.isEscalated && approval.adminEscalationStatus === 'PENDING')
                        );
                      const isProcessing = processingApprovalId === approval.id;
                      const isApproving = isProcessing && processingApprovalAction === 'approve';
                      const isRejecting = isProcessing && processingApprovalAction === 'reject';
                      const isEscalating = isProcessing && processingApprovalAction === 'escalate';
                      const isAdminApproving = isProcessing && processingApprovalAction === 'admin_approve';
                      const isAdminRejecting = isProcessing && processingApprovalAction === 'admin_reject';
                      const isFinalApproving = isProcessing && processingApprovalAction === 'final_approve';
                      const isReviewing = isProcessing && processingApprovalAction === 'review';

                      return (
                        <div
                          key={approval.id}
                          className={`w-full rounded-2xl border p-4 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
                            canUsePendingApprovedTabs && approvalTab === 'approved' && isApprovedApprovalStatus(approval.status)
                              ? 'border-emerald-200 bg-[var(--green-light)]/55 border-l-[3px] border-l-[var(--green)]'
                              : isSelected
                              ? 'border-amber-300 bg-[var(--orange-light)]/70 border-l-[3px] border-l-[var(--orange)]'
                              : 'border-[var(--border)] bg-white border-l-[3px] border-l-[var(--orange)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleApprovalSelection(approval.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-[var(--ink)] truncate">{approval.title || 'Untitled'}</p>
                              <div className="flex items-center gap-2">
                                {renderUnreadIndicator(unreadCount)}
                                  <span className={`font-ui-mono text-[10px] font-medium uppercase px-2 py-1 rounded-full ${getStatusClasses(approval.status)}`}>
                                    {approval.status}
                                  </span>
                                </div>
                              </div>
                            <p className="text-sm font-bold text-[var(--accent)] mt-1">{formatAmount(approval.amount)}</p>
                            <p className="text-xs text-[var(--ink-3)] mt-1 line-clamp-2">
                              {parsedApproval.description || 'No description'}
                            </p>
                            
                            {/* Date Information */}
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                              <div className="flex items-center gap-1">
                                <span className="font-medium">Created:</span>
                                <span>{approval.created_at ? formatDateTime(approval.created_at).split(',')[0] : 'N/A'}</span>
                              </div>
                              {(approval.status === 'APPROVED' || approval.status === 'REJECTED') && getApprovalUpdatedAtValue(approval) && (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved:' : 'Rejected:'}</span>
                                    <span>{formatDateTime(String(getApprovalUpdatedAtValue(approval))).split(',')[0]}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">by:</span>
                                    <span>{employeeNamesById[approval.approver_id] || getApproverName(approval.approver_id, approvers)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            {canUsePendingApprovedTabs && approvalTab === 'approved' && isApprovedApprovalStatus(approval.status) && (
                              <div className="mt-2 space-y-1 text-xs text-slate-600">
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Requester:</span>
                                  <span>{employeeNamesById[approval.requester_id] || getApproverName(approval.requester_id, approvers)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved at:' : 'Rejected at:'}</span>
                                  <span>{getApprovalUpdatedAtValue(approval) ? formatDateTime(String(getApprovalUpdatedAtValue(approval))) : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Decision by:</span>
                                  <span>{employeeNamesById[approval.approver_id] || getApproverName(approval.approver_id, approvers)}</span>
                                </div>
                              </div>
                            )}
                          </button>

                          {isSelected && (
                            <div className="mt-4 border-t border-slate-200 pt-4">
                              <p className="text-xs text-slate-500">{parsedApproval.description || 'No description'}</p>

                              {parsedApproval.attachments.length > 0 && (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Attached Documents</p>
                                  <div className="mt-2 space-y-1.5">
                                    {parsedApproval.attachments.map((attachment, index) => (
                                      <a
                                        key={`${attachment.url}_${index}`}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-700 truncate">{attachment.name}</p>
                                          <p className="text-[10px] text-slate-500">
                                            {attachment.contentType || 'File'}
                                            {attachment.size ? ` - ${formatAttachmentSize(attachment.size)}` : ''}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-500 shrink-0">
                                          <Link2 className="w-3.5 h-3.5" />
                                          <Download className="w-3.5 h-3.5" />
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {threads.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Messages</p>
                                  <div className="max-h-44 overflow-y-auto space-y-3 pr-1">
                                    {threads.map((thread) => {
                                      const mine = thread.sender_id === currentUser.id;
                                      return (
                                        <div key={thread.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                          <div className="max-w-[85%]">
                                            <div
                                              className={`rounded-2xl px-4 py-2.5 ${
                                                mine
                                                  ? 'bg-[var(--accent)] text-white rounded-br-md'
                                                  : 'bg-slate-100 text-slate-800 rounded-bl-md'
                                              }`}
                                            >
                                              <p className="text-sm leading-relaxed break-words">{thread.message_text}</p>
                                            </div>
                                            <div className={`flex items-center gap-2 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                                              <p className="text-[10px] font-bold text-slate-500">{thread.sender_name}</p>
                                              <p className="text-[10px] text-slate-400">{formatDateTime(thread.created_at)}</p>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {canTakeActionOnApproval && (
                                <div className="mt-3 space-y-2">
                                  {/* Manager Escalation with Admin Selection */}
                                  {currentUser.role === 'manager' && !approval.isEscalated && (
                                    <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-2">
                                      <select
                                        value={selectedEscalationAdminByApproval[approval.id] || ''}
                                        onChange={(e) =>
                                          setSelectedEscalationAdminByApproval((prev) => ({
                                            ...prev,
                                            [approval.id]: e.target.value,
                                          }))
                                        }
                                        className="min-h-[44px] w-full px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-base font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
                                      >
                                        <option value="">Select Super Admin...</option>
                                        {superAdmins.map(admin => (
                                          <option key={admin.id} value={admin.id}>
                                            {admin.name}
                                          </option>
                                        ))}
                                      </select>
                                      <LoadingButton
                                        type="button"
                                        onClick={() => void handleEscalateToAdmin(approval.id)}
                                        isLoading={isEscalating}
                                        loadingText="Escalating..."
                                        variant="success"
                                        disabled={updatingStatus || isProcessing || !(selectedEscalationAdminByApproval[approval.id] || '')}
                                        className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        <Send className="w-3 h-3 inline mr-1" />
                                        Confirm Escalation
                                      </LoadingButton>
                                    </div>
                                  )}
                                  
                                  {/* Admin Escalation Decision Buttons */}
                                  {isAdminApprover && approval.isEscalated && approval.adminEscalationStatus === 'PENDING' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <LoadingButton
                                        type="button"
                                        onClick={() => void handleAdminEscalationDecision('APPROVED')}
                                        isLoading={isAdminApproving}
                                        loadingText="Approving..."
                                        variant="success"
                                        disabled={updatingStatus || isProcessing}
                                        className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                        Approve Escalation
                                      </LoadingButton>
                                      <LoadingButton
                                        type="button"
                                        onClick={() => void handleAdminEscalationDecision('REJECTED')}
                                        isLoading={isAdminRejecting}
                                        loadingText="Rejecting..."
                                        variant="danger"
                                        disabled={updatingStatus || isProcessing}
                                        className="min-h-[44px] w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        <XCircle className="w-3 h-3 inline mr-1" />
                                        Reject Escalation
                                      </LoadingButton>
                                    </div>
                                  )}

                                  {/* Regular Approve/Reject for Admin after escalation approval */}
                                  {currentUser.role === 'manager' && approval.adminEscalationStatus === 'APPROVED' && (
                                    <LoadingButton
                                      type="button"
                                      onClick={() => void handleFinalApproval()}
                                      isLoading={isFinalApproving}
                                      loadingText="Approving..."
                                      variant="success"
                                      disabled={updatingStatus || isProcessing}
                                      className="min-h-[44px] w-full sm:w-auto px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                      Approve
                                    </LoadingButton>
                                  )}

                                  {/* Regular Approve/Reject for non-escalated requests */}
                                  {!approval.isEscalated && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <LoadingButton
                                        type="button"
                                        onClick={() => void handleApprove(approval.id)}
                                        isLoading={isApproving}
                                        loadingText="Approving..."
                                        variant="success"
                                        disabled={updatingStatus || isProcessing}
                                        className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                        Approve
                                      </LoadingButton>
                                      <LoadingButton
                                        type="button"
                                        onClick={() => void handleReject(approval.id)}
                                        isLoading={isRejecting}
                                        loadingText="Rejecting..."
                                        variant="danger"
                                        disabled={updatingStatus || isProcessing}
                                        className="min-h-[44px] w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                      >
                                        <XCircle className="w-3 h-3 inline mr-1" />
                                        Reject
                                      </LoadingButton>
                                    </div>
                                  )}
                                </div>
                              )}

                              {approval.status === 'PENDING' && (
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-end gap-2">
                                    <textarea
                                      value={draftMessage}
                                      onChange={(e) => setDraftMessage(e.target.value)}
                                      placeholder="Type a message..."
                                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none min-h-[48px] max-h-28"
                                      rows={1}
                                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendMessage(); } }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleSendMessage()}
                                      disabled={updatingStatus || !draftMessage.trim()}
                                      className="bg-[var(--accent)] text-white p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 hover:bg-[#4338CA]"
                                      style={{ minHeight: 48, minWidth: 48 }}
                                      title="Send message"
                                    >
                                      <Send className="w-5 h-5" />
                                    </button>
                                  </div>
                                  {approval.requester_id === currentUser.id && (
                                    <LoadingButton
                                      type="button"
                                      onClick={() => void handleAskForReview()}
                                      isLoading={isReviewing}
                                      loadingText="Requesting..."
                                      variant="secondary"
                                      disabled={updatingStatus || isProcessing || !draftMessage.trim()}
                                      className="min-h-[44px] px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                      Request Review
                                    </LoadingButton>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            } else {
              // Original rendering for "Needs My Approval" view
              return filteredApprovals.map((approval) => {
                const isSelected = selectedApprovalId === approval.id;
                const unreadCount = approvalUnreadCountById[approval.id] || 0;
                const parsedApproval = extractApprovalAttachments(approval.description);
                const canTakeActionOnApproval =
                  isSelected &&
                  !LOCKED_STATUSES.includes(approval.status) &&
                  (
                    approval.approver_id === currentUser.id ||
                    (isAdminApprover && approval.isEscalated && approval.adminEscalationStatus === 'PENDING')
                  );
                const isProcessing = processingApprovalId === approval.id;
                const isApproving = isProcessing && processingApprovalAction === 'approve';
                const isRejecting = isProcessing && processingApprovalAction === 'reject';
                const isEscalating = isProcessing && processingApprovalAction === 'escalate';
                const isAdminApproving = isProcessing && processingApprovalAction === 'admin_approve';
                const isAdminRejecting = isProcessing && processingApprovalAction === 'admin_reject';
                const isFinalApproving = isProcessing && processingApprovalAction === 'final_approve';
                const isReviewing = isProcessing && processingApprovalAction === 'review';

                return (
                  <div
                    key={approval.id}
                    className={`w-full rounded-2xl border p-4 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
                      canUsePendingApprovedTabs && approvalTab === 'approved' && isApprovedApprovalStatus(approval.status)
                        ? 'border-emerald-200 bg-[var(--green-light)]/55 border-l-[3px] border-l-[var(--green)]'
                        : isSelected
                        ? 'border-amber-300 bg-[var(--orange-light)]/70 border-l-[3px] border-l-[var(--orange)]'
                        : 'border-[var(--border)] bg-white border-l-[3px] border-l-[var(--orange)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleApprovalSelection(approval.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-[var(--ink)] truncate">{approval.title || 'Untitled'}</p>
                        <div className="flex items-center gap-2">
                          {renderUnreadIndicator(unreadCount)}
                          <span className={`font-ui-mono text-[10px] font-medium uppercase px-2 py-1 rounded-full ${getStatusClasses(approval.status)}`}>
                            {approval.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[var(--accent)] mt-1">{formatAmount(approval.amount)}</p>
                      <p className="text-xs text-[var(--ink-3)] mt-1 line-clamp-2">
                        {parsedApproval.description || 'No description'}
                      </p>
                      
                      {/* Date Information */}
                      <div className="mt-2 flex items-center justify-between text-xs text-[var(--ink-3)]">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Created:</span>
                          <span>{approval.created_at ? formatDateTime(approval.created_at).split(',')[0] : 'N/A'}</span>
                        </div>
                        {(approval.status === 'APPROVED' || approval.status === 'REJECTED') && getApprovalUpdatedAtValue(approval) && (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved:' : 'Rejected:'}</span>
                              <span>{formatDateTime(String(getApprovalUpdatedAtValue(approval))).split(',')[0]}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">by:</span>
                              <span>{employeeNamesById[approval.approver_id] || getApproverName(approval.approver_id, approvers)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {canUsePendingApprovedTabs && approvalTab === 'approved' && isApprovedApprovalStatus(approval.status) && (
                        <div className="mt-2 space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Requester:</span>
                            <span>{employeeNamesById[approval.requester_id] || getApproverName(approval.requester_id, approvers)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved at:' : 'Rejected at:'}</span>
                            <span>{getApprovalUpdatedAtValue(approval) ? formatDateTime(String(getApprovalUpdatedAtValue(approval))) : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Decision by:</span>
                            <span>{employeeNamesById[approval.approver_id] || getApproverName(approval.approver_id, approvers)}</span>
                          </div>
                        </div>
                      )}
                    </button>

                    {isSelected && (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="text-xs text-slate-500">{parsedApproval.description || 'No description'}</p>

                        {parsedApproval.attachments.length > 0 && (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Attached Documents</p>
                            <div className="mt-2 space-y-1.5">
                              {parsedApproval.attachments.map((attachment, index) => (
                                <a
                                  key={`${attachment.url}_${index}`}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-700 truncate">{attachment.name}</p>
                                    <p className="text-[10px] text-slate-500">
                                      {attachment.contentType || 'File'}
                                      {attachment.size ? ` - ${formatAttachmentSize(attachment.size)}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 text-slate-500 shrink-0">
                                    <Link2 className="w-3.5 h-3.5" />
                                    <Download className="w-3.5 h-3.5" />
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {threads.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Messages</p>
                            <div className="max-h-44 overflow-y-auto space-y-3 pr-1">
                              {threads.map((thread) => {
                                const mine = thread.sender_id === currentUser.id;
                                return (
                                  <div key={thread.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className="max-w-[85%]">
                                      <div
                                        className={`rounded-2xl px-4 py-2.5 ${
                                          mine
                                            ? 'bg-[var(--accent)] text-white rounded-br-md'
                                            : 'bg-slate-100 text-slate-800 rounded-bl-md'
                                        }`}
                                      >
                                        <p className="text-sm leading-relaxed break-words">{thread.message_text}</p>
                                      </div>
                                      <div className={`flex items-center gap-2 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                                        <p className="text-[10px] font-bold text-slate-500">{thread.sender_name}</p>
                                        <p className="text-[10px] text-slate-400">{formatDateTime(thread.created_at)}</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Manager Escalation Banner */}
                        {approval.isEscalated && approval.adminEscalationStatus === 'PENDING' && currentUser.role === 'manager' && (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs font-medium text-amber-800">
                              ⚠️ Escalated to Admin. Waiting for their review.
                            </p>
                          </div>
                        )}

                        {/* Admin Escalation Banner */}
                        {approval.isEscalated && isAdminApprover && (
                          <div className="mt-3 p-3 bg-[var(--accent-light)] border border-indigo-200 rounded-lg">
                            <p className="text-xs font-medium text-[var(--accent)]">
                              Escalated by {getApproverName(approval.approver_id, approvers)}
                            </p>
                          </div>
                        )}

                        {/* Admin Escalation Decision Banner */}
                        {approval.adminEscalationStatus === 'APPROVED' && currentUser.role === 'manager' && (
                          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <p className="text-xs font-medium text-emerald-800">
                              ✅ Admin Approved Escalation
                            </p>
                          </div>
                        )}

                        {canTakeActionOnApproval && (
                          <div className="mt-3 space-y-2">
                            {/* Manager Escalation with Admin Selection */}
                            {currentUser.role === 'manager' && !approval.isEscalated && (
                              <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-2">
                                <select
                                  value={selectedEscalationAdminByApproval[approval.id] || ''}
                                  onChange={(e) =>
                                    setSelectedEscalationAdminByApproval((prev) => ({
                                      ...prev,
                                      [approval.id]: e.target.value,
                                    }))
                                  }
                                  className="min-h-[44px] w-full px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-base font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
                                >
                                  <option value="">Select Super Admin...</option>
                                  {superAdmins.map((admin) => (
                                    <option key={admin.id} value={admin.id}>
                                      {admin.name}
                                    </option>
                                  ))}
                                </select>
                                <LoadingButton
                                  type="button"
                                  onClick={() => void handleEscalateToAdmin(approval.id)}
                                  isLoading={isEscalating}
                                  loadingText="Escalating..."
                                  variant="success"
                                  disabled={updatingStatus || isProcessing || !(selectedEscalationAdminByApproval[approval.id] || '')}
                                  className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                >
                                  <Send className="w-3 h-3 inline mr-1" />
                                  Confirm Escalation
                                </LoadingButton>
                              </div>
                            )}
                            
                            {/* Admin Escalation Decision Buttons */}
                            {isAdminApprover && approval.isEscalated && approval.adminEscalationStatus === 'PENDING' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <LoadingButton
                                  type="button"
                                  onClick={() => void handleAdminEscalationDecision('APPROVED')}
                                  isLoading={isAdminApproving}
                                  loadingText="Approving..."
                                  variant="success"
                                  disabled={updatingStatus || isProcessing}
                                  className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                  Approve Escalation
                                </LoadingButton>
                                <LoadingButton
                                  type="button"
                                  onClick={() => void handleAdminEscalationDecision('REJECTED')}
                                  isLoading={isAdminRejecting}
                                  loadingText="Rejecting..."
                                  variant="danger"
                                  disabled={updatingStatus || isProcessing}
                                  className="min-h-[44px] w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3 inline mr-1" />
                                  Reject Escalation
                                </LoadingButton>
                              </div>
                            )}

                            {/* Regular Approve/Reject for Admin after escalation approval */}
                            {currentUser.role === 'manager' && approval.adminEscalationStatus === 'APPROVED' && (
                              <LoadingButton
                                type="button"
                                onClick={() => void handleFinalApproval()}
                                isLoading={isFinalApproving}
                                loadingText="Approving..."
                                variant="success"
                                disabled={updatingStatus || isProcessing}
                                className="min-h-[44px] w-full sm:w-auto px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                Approve
                              </LoadingButton>
                            )}

                            {/* Regular Approve/Reject for non-escalated requests */}
                            {!approval.isEscalated && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <LoadingButton
                                  type="button"
                                  onClick={() => void handleApprove(approval.id)}
                                  isLoading={isApproving}
                                  loadingText="Approving..."
                                  variant="success"
                                  disabled={updatingStatus || isProcessing}
                                  className="min-h-[44px] w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                  Approve
                                </LoadingButton>
                                <LoadingButton
                                  type="button"
                                  onClick={() => void handleReject(approval.id)}
                                  isLoading={isRejecting}
                                  loadingText="Rejecting..."
                                  variant="danger"
                                  disabled={updatingStatus || isProcessing}
                                  className="min-h-[44px] w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3 inline mr-1" />
                                  Reject
                                </LoadingButton>
                              </div>
                            )}
                          </div>
                        )}

                        {approval.status === 'PENDING' && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-end gap-2">
                              <textarea
                                value={draftMessage}
                                onChange={(e) => setDraftMessage(e.target.value)}
                                placeholder="Type a message..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none min-h-[48px] max-h-28"
                                rows={1}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendMessage(); } }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleSendMessage()}
                                disabled={updatingStatus || !draftMessage.trim()}
                                className="bg-[var(--accent)] text-white p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 hover:bg-[#4338CA]"
                                style={{ minHeight: 48, minWidth: 48 }}
                                title="Send message"
                              >
                                <Send className="w-5 h-5" />
                              </button>
                            </div>
                            {approval.requester_id === currentUser.id && (
                              <LoadingButton
                                type="button"
                                onClick={() => void handleAskForReview()}
                                isLoading={isReviewing}
                                loadingText="Requesting..."
                                variant="secondary"
                                disabled={updatingStatus || isProcessing || !draftMessage.trim()}
                                className="min-h-[44px] px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                              >
                                Request Review
                              </LoadingButton>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            }
          })()
        )}
      </div>

    </section>
  );
};

export default ApprovalsPanel;



