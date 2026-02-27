import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, Send, XCircle } from 'lucide-react';
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
  amount: number;
  status: ApprovalStatus;
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

const LOCKED_STATUSES: ApprovalStatus[] = ['APPROVED', 'REJECTED'];

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

const formatAmount = (value: number): string => {
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

interface ApprovalsPanelProps {
  currentUser: Employee;
}

const ApprovalsPanel: React.FC<ApprovalsPanelProps> = ({ currentUser }) => {
  const [view, setView] = useState<ApprovalView>('my_requests');
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ApprovalThreadView[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedApproval = useMemo(
    () => approvals.find((item) => item.id === selectedApprovalId) || null,
    [approvals, selectedApprovalId]
  );

  const canTakeAction = useMemo(() => {
    if (!selectedApproval) return false;
    return (
      selectedApproval.approver_id === currentUser.id &&
      !LOCKED_STATUSES.includes(selectedApproval.status)
    );
  }, [selectedApproval, currentUser.id]);

  const loadApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    setError(null);
    try {
      let query = supabase
        .from('approvals')
        .select('id, requester_id, approver_id, title, description, amount, status');

      if (view === 'my_requests') {
        query = query.eq('requester_id', currentUser.id);
      } else {
        query = query.eq('approver_id', currentUser.id).in('status', ['PENDING', 'NEEDS_REVIEW']);
      }

      const { data, error: loadError } = await query.order('id', { ascending: false });
      if (loadError) throw loadError;

      const mapped = (data || []).map((row: any) => ({
        id: String(row.id),
        requester_id: String(row.requester_id || ''),
        approver_id: String(row.approver_id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
        amount: Number(row.amount || 0),
        status: normalizeStatus(row.status),
      }));

      setApprovals(mapped);
      if (!mapped.length) {
        setSelectedApprovalId(null);
        setThreads([]);
        return;
      }

      setSelectedApprovalId((prev) => (prev && mapped.some((a) => a.id === prev) ? prev : mapped[0].id));
    } catch (loadErr: any) {
      setError(loadErr?.message || 'Failed to load approvals.');
    } finally {
      setLoadingApprovals(false);
    }
  }, [currentUser.id, view]);

  const loadThreads = useCallback(async (approvalId: string) => {
    setLoadingThreads(true);
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

      setThreads(
        rows.map((row) => ({
          ...row,
          sender_name: senderMap[row.sender_id] || 'Unknown',
        }))
      );
    } catch (threadErr: any) {
      setError(threadErr?.message || 'Failed to load discussion thread.');
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  useEffect(() => {
    if (!selectedApprovalId) return;
    void loadThreads(selectedApprovalId);
  }, [selectedApprovalId, loadThreads]);

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
        prev.map((item) => (item.id === selectedApproval.id ? { ...item, status } : item))
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
        prev.map((item) =>
          item.id === selectedApproval.id ? { ...item, status: 'NEEDS_REVIEW' } : item
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
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{approval.description || 'No description'}</p>
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
          <p className="text-xs text-slate-500 mt-2">{selectedApproval.description || 'No description'}</p>

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
