import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Filter, Link2, MessageSquare, Paperclip, Plus, Send, X, XCircle, Calendar } from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import { Employee } from '../types';

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
  isEscalated: boolean;
  adminEscalationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
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
  return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
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

const parseDateTimeMs = (value?: string | null): number => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
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
      a.created_at !== b.created_at ||
      a.updated_at !== b.updated_at
    ) {
      return false;
    }
  }
  return true;
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
  const [view, setView] = useState<ApprovalView>(currentUser.role === 'owner' || currentUser.role === 'super_admin' ? 'needs_my_approval' : 'my_requests');
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFilesRef = useRef<Record<string, File>>({});

  const selectedApproval = useMemo(
    () => approvals.find((item) => item.id === selectedApprovalId) || null,
    [approvals, selectedApprovalId]
  );

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

      setApprovers(candidates);
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
        .select('id, requester_id, approver_id, title, description, amount, status, isEscalated, adminEscalationStatus, created_at, updated_at');

      if (view === 'my_requests') {
        query = query.eq('requester_id', currentUser.id);
      } else {
        if (currentUser.role === 'super_admin') {
          // Super Admins see their own direct approvals OR any escalated requests
          query = query.or(`and(approver_id.eq.${currentUser.id},status.in.(PENDING,NEEDS_REVIEW)),and(isEscalated.eq.true,adminEscalationStatus.eq.PENDING)`);
        } else {
          // Regular Managers only see requests directly assigned to them
          query = query.eq('approver_id', currentUser.id).in('status', ['PENDING', 'NEEDS_REVIEW']);
        }
      }

      const { data, error: loadError } = await query.order('id', { ascending: false });
      if (loadError) throw loadError;

      const mapped = sortApprovalsByRecency((data || []).map((row: any) => ({
        id: String(row.id),
        requester_id: String(row.requester_id || ''),
        approver_id: String(row.approver_id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
        amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
        status: normalizeStatus(row.status),
        created_at: row.created_at ? String(row.created_at) : null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
        isEscalated: Boolean(row.isEscalated || false),
        adminEscalationStatus: String(row.adminEscalationStatus || 'NONE'),
      })));

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
  }, [currentUser.id, view]);

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
    if (!selectedApprovalId) return;
    void loadThreads(selectedApprovalId);
  }, [selectedApprovalId, loadThreads]);

  useEffect(() => {
    const isRowRelevantToCurrentUser = (row: any): boolean => {
      const requesterId = String(row?.requester_id || '');
      const approverId = String(row?.approver_id || '');
      return requesterId === currentUser.id || approverId === currentUser.id;
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
          if (!selectedApprovalId) return;
          const newApprovalId = String(payload?.new?.approval_id || '');
          const oldApprovalId = String(payload?.old?.approval_id || '');
          if (newApprovalId === selectedApprovalId || oldApprovalId === selectedApprovalId) {
            void loadThreads(selectedApprovalId, { silent: true });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, selectedApprovalId, loadApprovals, loadThreads]);

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
      const { data: created, error: createError } = await supabase
        .from('approvals')
        .insert({
          requester_id: currentUser.id,
          approver_id: approverId,
          title,
          description: descriptionWithAttachments,
          amount: amountValue,
          status: 'PENDING',
        })
        .select('id, requester_id, approver_id, title, description, amount, status, created_at, updated_at')
        .single();
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
      setError(createErr?.message || 'Failed to create approval request.');
    } finally {
      setCreatingApproval(false);
    }
  };

  const updateStatus = async (status: ApprovalStatus): Promise<void> => {
    if (!selectedApproval) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('approvals')
        .update({ status })
        .eq('id', selectedApproval.id);
      if (updateError) throw updateError;

      setApprovals((prev) =>
        sortApprovalsByRecency(
          prev.map((item) =>
            item.id === selectedApproval.id
              ? { ...item, status, updated_at: new Date().toISOString() }
              : item
          )
        )
      );
    } catch (updateErr: any) {
      setError(updateErr?.message || 'Failed to update approval status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleApprove = async (approvalId: string): Promise<void> => {
    await updateStatus('APPROVED');
  };

  const handleReject = async (approvalId: string): Promise<void> => {
    await updateStatus('REJECTED');
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
  };

  const handleEscalateToAdmin = async (approvalId: string) => {
  try {
    const { error: updateError } = await supabase
      .from('approvals')
      .update({
        isEscalated: true,
        adminEscalationStatus: 'PENDING'
      })
      .eq('id', approvalId);

    if (updateError) throw updateError;

    setApprovals(approvals.map(app =>
      app.id === approvalId
        ? { ...app, isEscalated: true, adminEscalationStatus: 'PENDING' }
        : app
    ));
    
    alert("Successfully escalated to Super Admin!");

  } catch (error: any) {
    console.error("Escalation error:", error);
    alert("Failed to escalate: " + error.message);
  }
};

  const handleAdminEscalationDecision = async (decision: 'APPROVED' | 'REJECTED'): Promise<void> => {
    if (!selectedApproval) return;
    
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
  };

  const handleFinalApproval = async (): Promise<void> => {
    if (!selectedApproval) return;
    
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
  };

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Approvals</p>
          <h2 className="text-lg font-black text-slate-900 mt-1">Requests & Decisions</h2>
        </div>
        {currentUser.role !== 'owner' && currentUser.role !== 'super_admin' && (
          <button
            onClick={() => setIsApprovalModalOpen(true)}
            className="bg-indigo-900 hover:bg-indigo-800 text-white rounded-full px-4 py-2.5 shadow-md shadow-indigo-900/20 flex items-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-semibold">Approval</span>
          </button>
        )}
      </div>

      <div className={`mt-4 gap-2 ${currentUser.role === 'owner' || currentUser.role === 'super_admin' ? '' : 'grid grid-cols-2'}`}>
        {currentUser.role !== 'owner' && currentUser.role !== 'super_admin' && (
          <button
            onClick={() => setView('my_requests')}
            className={`px-3 py-2 rounded-xl text-xs font-bold border ${
              view === 'my_requests'
                ? 'bg-indigo-900 text-white border-indigo-900'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            My Requests
          </button>
        )}
        <button
          onClick={() => setView('needs_my_approval')}
          className={`px-3 py-2 rounded-xl text-xs font-bold border ${
            view === 'needs_my_approval'
              ? 'bg-indigo-900 text-white border-indigo-900'
              : 'bg-white text-slate-700 border-slate-200'
          }`}
        >
          Needs My Approval
        </button>
      </div>

      {/* Status Filter Pills - Only show for My Requests */}
      {view === 'my_requests' && (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            {[
              { key: 'all' as const, label: 'All' },
              { key: 'pending' as const, label: 'Pending' },
              { key: 'completed' as const, label: 'Completed' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-indigo-900 text-white'
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
                      monthFilter === 'all' && dateRangeFilter === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
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
                        monthFilter === month && dateRangeFilter === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
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
                      dateRangeFilter === 'custom' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
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
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
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
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
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
                      className="flex-1 px-4 py-2 bg-indigo-900 text-white rounded-lg text-sm hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => !creatingApproval && setIsApprovalModalOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-900" />
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
            <div className="p-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Create Request</p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={requestTitle}
                  onChange={(event) => setRequestTitle(event.target.value)}
                  placeholder="Request title"
                  className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  autoFocus
                />
                <div className="relative">
                  <textarea
                    value={requestDescription}
                    onChange={(event) => setRequestDescription(event.target.value)}
                    placeholder="Description"
                    className="min-h-[70px] w-full px-3 py-2 pb-10 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 resize-none"
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
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={requestAmount}
                    onChange={(event) => setRequestAmount(event.target.value)}
                    placeholder="Amount (INR)"
                    type="number"
                    min="0"
                    className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  />
                  <select
                    value={requestApproverId}
                    onChange={(event) => setRequestApproverId(event.target.value)}
                    className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
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
                    className="flex-1 h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateRequest()}
                    disabled={creatingApproval}
                    className="flex-1 h-11 rounded-xl bg-indigo-900 text-white text-sm font-bold disabled:opacity-60"
                  >
                    {creatingApproval ? 'Creating...' : 'Create & Tag Approver'}
                  </button>
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

      <div className="mt-4 space-y-3">
        {loadingApprovals ? (
          <div className="text-sm text-slate-500">Loading approvals...</div>
        ) : (
          (() => {
            // Filter approvals based on status filter (only for My Requests)
            let filteredApprovals = view === 'my_requests' 
              ? filterApprovalsByStatus(approvals, statusFilter)
              : approvals;

            // Apply month filter for My Requests view
            if (view === 'my_requests') {
              if (dateRangeFilter === 'custom') {
                filteredApprovals = filterApprovalsByDateRange(filteredApprovals, startDate, endDate);
              } else {
                filteredApprovals = filterApprovalsByMonth(filteredApprovals, monthFilter);
              }
            }

            if (filteredApprovals.length === 0) {
              return (
                <div className="text-sm text-slate-500">
                  {view === 'my_requests' 
                    ? statusFilter === 'pending' 
                      ? 'No pending requests found.'
                      : statusFilter === 'completed'
                      ? 'No completed requests found.'
                      : dateRangeFilter === 'custom'
                      ? `No requests found in selected date range.`
                      : monthFilter !== 'all'
                      ? `No requests found for ${monthFilter}.`
                      : 'No requests found.'
                    : 'No approvals found for this view.'
                  }
                </div>
              );
            }

            // Group approvals by month (only for My Requests)
            if (view === 'my_requests') {
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
                      const parsedApproval = extractApprovalAttachments(approval.description);
                      const canTakeActionOnApproval =
                        isSelected &&
                        approval.approver_id === currentUser.id &&
                        !LOCKED_STATUSES.includes(approval.status);

                      return (
                        <div
                          key={approval.id}
                          className={`w-full rounded-2xl border p-3 transition-all ${
                            isSelected
                              ? 'border-indigo-300 bg-indigo-50'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedApprovalId((prev) => (prev === approval.id ? null : approval.id))}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900 truncate">{approval.title || 'Untitled'}</p>
                              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getStatusClasses(approval.status)}`}>
                                {approval.status}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-indigo-700 mt-1">{formatAmount(approval.amount)}</p>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {parsedApproval.description || 'No description'}
                            </p>
                            
                            {/* Date Information */}
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                              <div className="flex items-center gap-1">
                                <span className="font-medium">Created:</span>
                                <span>{approval.created_at ? formatDateTime(approval.created_at).split(',')[0] : 'N/A'}</span>
                              </div>
                              {(approval.status === 'APPROVED' || approval.status === 'REJECTED') && approval.updated_at && (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved:' : 'Rejected:'}</span>
                                    <span>{formatDateTime(approval.updated_at).split(',')[0]}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">by:</span>
                                    <span>{getApproverName(approval.approver_id, approvers)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
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
                                  <div className="max-h-32 overflow-y-auto space-y-2">
                                    {threads.map((thread) => {
                                      const mine = thread.sender_id === currentUser.id;
                                      return (
                                        <div key={thread.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                          <div className={`max-w-[80%] rounded-lg px-2 py-1.5 ${
                                            mine
                                              ? 'bg-indigo-900 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}>
                                            <p className="text-xs font-medium">{thread.sender_name}</p>
                                            <p className="text-xs mt-0.5">{thread.message_text}</p>
                                            <p className="text-[9px] mt-1 opacity-70">
                                              {formatDateTime(thread.created_at)}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {canTakeActionOnApproval && (
                                <div className="mt-3 flex gap-2">
                                  {/* Manager Escalation Button */}
                                  {currentUser.role === 'manager' && !approval.isEscalated && (
                                    <button
                                      type="button"
                                      onClick={() => void handleEscalateToAdmin(approval.id)}
                                      disabled={updatingStatus}
                                      className="flex-1 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
                                    >
                                      <Send className="w-3 h-3 inline mr-1" />
                                      Escalate to Admin
                                    </button>
                                  )}
                                  
                                  {/* Admin Escalation Decision Buttons */}
                                  {currentUser.role === 'super_admin' && approval.isEscalated && approval.adminEscalationStatus === 'PENDING' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void handleAdminEscalationDecision('APPROVED')}
                                        disabled={updatingStatus}
                                        className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                        Approve Escalation
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleAdminEscalationDecision('REJECTED')}
                                        disabled={updatingStatus}
                                        className="flex-1 h-8 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                                      >
                                        <XCircle className="w-3 h-3 inline mr-1" />
                                        Reject Escalation
                                      </button>
                                    </>
                                  )}

                                  {/* Regular Approve/Reject for Admin after escalation approval */}
                                  {currentUser.role === 'manager' && approval.adminEscalationStatus === 'APPROVED' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleFinalApproval()}
                                      disabled={updatingStatus}
                                      className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                      Approve
                                    </button>
                                  )}

                                  {/* Regular Approve/Reject for non-escalated requests */}
                                  {!approval.isEscalated && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void handleApprove(approval.id)}
                                        disabled={updatingStatus}
                                        className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleReject(approval.id)}
                                        disabled={updatingStatus}
                                        className="flex-1 h-8 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                                      >
                                        <XCircle className="w-3 h-3 inline mr-1" />
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                              {approval.status === 'PENDING' && (
                                <div className="mt-3 flex gap-2">
                                  <input
                                    type="text"
                                    value={draftMessage}
                                    onChange={(e) => setDraftMessage(e.target.value)}
                                    placeholder="Add a note..."
                                    className="flex-1 h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleSendMessage()}
                                    disabled={updatingStatus || !draftMessage.trim()}
                                    className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                                  >
                                    <Send className="w-3 h-3 inline mr-1" />
                                    Send
                                  </button>
                                  {approval.requester_id === currentUser.id && (
                                    <button
                                      type="button"
                                      onClick={() => void handleAskForReview()}
                                      disabled={updatingStatus || !draftMessage.trim()}
                                      className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all disabled:opacity-50"
                                    >
                                      <Send className="w-3 h-3 inline mr-1" />
                                      Request Review
                                    </button>
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
                const parsedApproval = extractApprovalAttachments(approval.description);
                const canTakeActionOnApproval =
                  isSelected &&
                  approval.approver_id === currentUser.id &&
                  !LOCKED_STATUSES.includes(approval.status);

                return (
                  <div
                    key={approval.id}
                    className={`w-full rounded-2xl border p-3 transition-all ${
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedApprovalId((prev) => (prev === approval.id ? null : approval.id))}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900 truncate">{approval.title || 'Untitled'}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getStatusClasses(approval.status)}`}>
                          {approval.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-indigo-700 mt-1">{formatAmount(approval.amount)}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {parsedApproval.description || 'No description'}
                      </p>
                      
                      {/* Date Information */}
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Created:</span>
                          <span>{approval.created_at ? formatDateTime(approval.created_at).split(',')[0] : 'N/A'}</span>
                        </div>
                        {(approval.status === 'APPROVED' || approval.status === 'REJECTED') && approval.updated_at && (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{approval.status === 'APPROVED' ? 'Approved:' : 'Rejected:'}</span>
                              <span>{formatDateTime(approval.updated_at).split(',')[0]}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">by:</span>
                              <span>{getApproverName(approval.approver_id, approvers)}</span>
                            </div>
                          </div>
                        )}
                      </div>
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
                            <div className="max-h-32 overflow-y-auto space-y-2">
                              {threads.map((thread) => {
                                const mine = thread.sender_id === currentUser.id;
                                return (
                                  <div key={thread.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg px-2 py-1.5 ${
                                      mine
                                        ? 'bg-indigo-900 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      <p className="text-xs font-medium">{thread.sender_name}</p>
                                      <p className="text-xs mt-0.5">{thread.message_text}</p>
                                      <p className="text-[9px] mt-1 opacity-70">
                                        {formatDateTime(thread.created_at)}
                                      </p>
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
                        {approval.isEscalated && currentUser.role === 'super_admin' && (
                          <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                            <p className="text-xs font-medium text-indigo-800">
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
                          <div className="mt-3 flex gap-2">
                            {/* Manager Escalation Button */}
                            {currentUser.role === 'manager' && !approval.isEscalated && (
                              <button
                                type="button"
                                onClick={() => void handleEscalateToAdmin(approval.id)}
                                disabled={updatingStatus}
                                className="flex-1 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
                              >
                                <Send className="w-3 h-3 inline mr-1" />
                                Escalate to Admin
                              </button>
                            )}
                            
                            {/* Admin Escalation Decision Buttons */}
                            {currentUser.role === 'super_admin' && approval.isEscalated && approval.adminEscalationStatus === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleAdminEscalationDecision('APPROVED')}
                                  disabled={updatingStatus}
                                  className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                  Approve Escalation
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleAdminEscalationDecision('REJECTED')}
                                  disabled={updatingStatus}
                                  className="flex-1 h-8 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3 inline mr-1" />
                                  Reject Escalation
                                </button>
                              </>
                            )}

                            {/* Regular Approve/Reject for Admin after escalation approval */}
                            {currentUser.role === 'manager' && approval.adminEscalationStatus === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => void handleFinalApproval()}
                                disabled={updatingStatus}
                                className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                Approve
                              </button>
                            )}

                            {/* Regular Approve/Reject for non-escalated requests */}
                            {!approval.isEscalated && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleApprove(approval.id)}
                                  disabled={updatingStatus}
                                  className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleReject(approval.id)}
                                  disabled={updatingStatus}
                                  className="flex-1 h-8 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3 inline mr-1" />
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {approval.status === 'PENDING' && (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="text"
                              value={draftMessage}
                              onChange={(e) => setDraftMessage(e.target.value)}
                              placeholder="Add a note..."
                              className="flex-1 h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-900"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendMessage()}
                              disabled={updatingStatus || !draftMessage.trim()}
                              className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                              <Send className="w-3 h-3 inline mr-1" />
                              Send
                            </button>
                            {approval.requester_id === currentUser.id && (
                              <button
                                type="button"
                                onClick={() => void handleAskForReview()}
                                disabled={updatingStatus || !draftMessage.trim()}
                                className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all disabled:opacity-50"
                              >
                                <Send className="w-3 h-3 inline mr-1" />
                                Request Review
                              </button>
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
