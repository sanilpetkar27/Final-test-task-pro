import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Link2, MessageSquare, Paperclip, Send, X, XCircle } from 'lucide-react';
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

const formatAttachmentSize = (size: number): string => {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

interface ApprovalsPanelProps {
  currentUser: Employee;
}

const ApprovalsPanel: React.FC<ApprovalsPanelProps> = ({ currentUser }) => {
  const [view, setView] = useState<ApprovalView>('my_requests');
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [creatingApproval, setCreatingApproval] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestApproverId, setRequestApproverId] = useState('');
  const [requestInitialNote, setRequestInitialNote] = useState('');
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
  const selectedApprovalParsed = useMemo(() => {
    if (!selectedApproval) {
      return { description: '', attachments: [] as ApprovalAttachment[] };
    }
    return extractApprovalAttachments(selectedApproval.description);
  }, [selectedApproval]);

  const canTakeAction = useMemo(() => {
    if (!selectedApproval) return false;
    return (
      selectedApproval.approver_id === currentUser.id &&
      !LOCKED_STATUSES.includes(selectedApproval.status)
    );
  }, [selectedApproval, currentUser.id]);

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
        .select('id, requester_id, approver_id, title, description, amount, status, created_at, updated_at');

      if (view === 'my_requests') {
        query = query.eq('requester_id', currentUser.id);
      } else {
        query = query.eq('approver_id', currentUser.id).in('status', ['PENDING', 'NEEDS_REVIEW']);
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
      })));

      setApprovals((prev) => (approvalsAreEqual(prev, mapped) ? prev : mapped));
      if (!mapped.length) {
        setSelectedApprovalId(null);
        setThreads([]);
        return;
      }

      setSelectedApprovalId((prev) => (prev && mapped.some((a) => a.id === prev) ? prev : mapped[0].id));
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
    const initialNote = requestInitialNote.trim();

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
      };

      if (initialNote) {
        const { error: initialMessageError } = await supabase
          .from('approval_threads')
          .insert({
            approval_id: createdApproval.id,
            sender_id: currentUser.id,
            message_text: initialNote,
          });
        if (initialMessageError) throw initialMessageError;
      }

      setApprovals((prev) => sortApprovalsByRecency([createdApproval, ...prev]));
      setSelectedApprovalId(createdApproval.id);
      setRequestTitle('');
      setRequestDescription('');
      setRequestAmount('');
      setRequestInitialNote('');
      setRequestAttachments([]);
      attachmentFilesRef.current = {};
      setView('my_requests');
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

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Approvals</p>
          <h2 className="text-lg font-black text-slate-900 mt-1">Requests & Decisions</h2>
        </div>
        <button
          onClick={() => void loadApprovals()}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
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

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Create Request</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <input
            value={requestTitle}
            onChange={(event) => setRequestTitle(event.target.value)}
            placeholder="Request title"
            className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
          />
          <textarea
            value={requestDescription}
            onChange={(event) => setRequestDescription(event.target.value)}
            placeholder="Description"
            className="min-h-[70px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 resize-none"
          />
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">Attachments (PDF, Excel, Images)</p>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  attachmentsInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100"
                title="Attach files"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Attach
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
          </div>
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
          <input
            value={requestInitialNote}
            onChange={(event) => setRequestInitialNote(event.target.value)}
            placeholder="Optional note to tagged approver"
            className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
          />
          <button
            type="button"
            onClick={() => void handleCreateRequest()}
            disabled={creatingApproval}
            className="h-11 rounded-xl bg-indigo-900 text-white text-sm font-bold disabled:opacity-60"
          >
            {creatingApproval ? 'Creating...' : 'Create & Tag Approver'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loadingApprovals ? (
          <div className="text-sm text-slate-500">Loading approvals...</div>
        ) : approvals.length === 0 ? (
          <div className="text-sm text-slate-500">No approvals found for this view.</div>
        ) : (
          approvals.map((approval) => (
            <button
              key={approval.id}
              onClick={() => setSelectedApprovalId(approval.id)}
              className={`w-full text-left rounded-2xl border p-3 transition-all ${
                selectedApprovalId === approval.id
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900 truncate">{approval.title || 'Untitled'}</p>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getStatusClasses(approval.status)}`}>
                  {approval.status}
                </span>
              </div>
              <p className="text-sm font-bold text-indigo-700 mt-1">{formatAmount(approval.amount)}</p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {extractApprovalAttachments(approval.description).description || 'No description'}
              </p>
            </button>
          ))
        )}
      </div>

      {selectedApproval && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-slate-900">Memo</h3>
            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getStatusClasses(selectedApproval.status)}`}>
              {selectedApproval.status}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-900 mt-2">{selectedApproval.title || 'Untitled'}</p>
          <p className="text-sm font-bold text-indigo-700 mt-1">{formatAmount(selectedApproval.amount)}</p>
          <p className="text-xs text-slate-500 mt-2">{selectedApprovalParsed.description || 'No description'}</p>
          {selectedApprovalParsed.attachments.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Attached Documents</p>
              <div className="mt-2 space-y-1.5">
                {selectedApprovalParsed.attachments.map((attachment, index) => (
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
                        {attachment.size ? ` • ${formatAttachmentSize(attachment.size)}` : ''}
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

          {canTakeAction && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => void updateStatus('APPROVED')}
                disabled={updatingStatus}
                className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => void updateStatus('REJECTED')}
                disabled={updatingStatus}
                className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-60"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
              <button
                onClick={() => void handleAskForReview()}
                disabled={updatingStatus}
                className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold disabled:opacity-60"
              >
                <MessageSquare className="w-4 h-4" />
                Review
              </button>
            </div>
          )}

          <div className="mt-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Discussion</h4>
            <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-1">
              {loadingThreads ? (
                <p className="text-xs text-slate-500">Loading messages...</p>
              ) : threads.length === 0 ? (
                <p className="text-xs text-slate-500">No messages yet.</p>
              ) : (
                threads.map((thread) => {
                  const mine = thread.sender_id === currentUser.id;
                  return (
                    <div key={thread.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 border ${
                          mine
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <p className="text-[10px] font-bold text-slate-500">{thread.sender_name}</p>
                        <p className="text-xs text-slate-900 mt-1">{thread.message_text}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formatDateTime(thread.created_at)}
                          {thread.optimistic ? ' (sending...)' : ''}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder="Type a message..."
                className="flex-1 h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
              />
              <button
                onClick={() => void handleSendMessage()}
                className="h-11 w-11 rounded-xl bg-indigo-900 text-white flex items-center justify-center"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ApprovalsPanel;
