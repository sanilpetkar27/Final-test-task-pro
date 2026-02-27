import { supabase } from '../../../services/api/supabase';

export type ApprovalStatus = 'PENDING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export type ApprovalItem = {
  id: string;
  requesterId: string;
  approverId: string;
  title: string;
  description: string;
  amount: number;
  status: ApprovalStatus;
};

export type ApprovalThreadMessage = {
  id: string;
  approvalId: string;
  senderId: string;
  senderName: string;
  messageText: string;
  createdAt: string;
  optimistic?: boolean;
};

type RequestReviewInput = {
  approvalId: string;
  senderId: string;
  messageText: string;
};

const normalizeStatus = (status: unknown): ApprovalStatus => {
  if (status === 'PENDING' || status === 'NEEDS_REVIEW' || status === 'APPROVED' || status === 'REJECTED') {
    return status;
  }
  return 'PENDING';
};

const mapApproval = (row: any): ApprovalItem => ({
  id: String(row?.id ?? ''),
  requesterId: String(row?.requester_id ?? ''),
  approverId: String(row?.approver_id ?? ''),
  title: String(row?.title ?? ''),
  description: String(row?.description ?? ''),
  amount: Number(row?.amount ?? 0),
  status: normalizeStatus(row?.status),
});

const mapThread = (row: any, senderName: string): ApprovalThreadMessage => ({
  id: String(row?.id ?? ''),
  approvalId: String(row?.approval_id ?? ''),
  senderId: String(row?.sender_id ?? ''),
  senderName,
  messageText: String(row?.message_text ?? ''),
  createdAt: String(row?.created_at ?? new Date().toISOString()),
});

export const approvalsRepository = {
  async listMyRequests(userId: string): Promise<ApprovalItem[]> {
    const { data, error } = await supabase
      .from('approvals')
      .select('id, requester_id, approver_id, title, description, amount, status')
      .eq('requester_id', userId)
      .order('id', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapApproval);
  },

  async listNeedsMyApproval(userId: string): Promise<ApprovalItem[]> {
    const { data, error } = await supabase
      .from('approvals')
      .select('id, requester_id, approver_id, title, description, amount, status')
      .eq('approver_id', userId)
      .in('status', ['PENDING', 'NEEDS_REVIEW'])
      .order('id', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapApproval);
  },

  async getById(approvalId: string): Promise<ApprovalItem | null> {
    const { data, error } = await supabase
      .from('approvals')
      .select('id, requester_id, approver_id, title, description, amount, status')
      .eq('id', approvalId)
      .maybeSingle();

    if (error) throw error;
    return data ? mapApproval(data) : null;
  },

  async updateStatus(approvalId: string, status: ApprovalStatus): Promise<void> {
    const { error } = await supabase
      .from('approvals')
      .update({ status })
      .eq('id', approvalId);

    if (error) throw error;
  },

  async listThreads(approvalId: string): Promise<ApprovalThreadMessage[]> {
    const { data, error } = await supabase
      .from('approval_threads')
      .select('id, approval_id, sender_id, message_text, created_at')
      .eq('approval_id', approvalId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return [];

    const senderIds = Array.from(
      new Set(rows.map((row) => String(row?.sender_id ?? '')).filter(Boolean))
    );

    let senderMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: senders, error: sendersError } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', senderIds);

      if (sendersError) throw sendersError;

      senderMap = (senders || []).reduce<Record<string, string>>((acc, sender) => {
        const id = String(sender?.id ?? '');
        if (!id) return acc;
        acc[id] = String(sender?.name ?? 'Unknown');
        return acc;
      }, {});
    }

    return rows.map((row) => {
      const senderId = String(row?.sender_id ?? '');
      return mapThread(row, senderMap[senderId] || 'Unknown');
    });
  },

  async insertThreadMessage(
    approvalId: string,
    senderId: string,
    messageText: string
  ): Promise<ApprovalThreadMessage> {
    const trimmed = messageText.trim();
    const { data, error } = await supabase
      .from('approval_threads')
      .insert({
        approval_id: approvalId,
        sender_id: senderId,
        message_text: trimmed,
      })
      .select('id, approval_id, sender_id, message_text, created_at')
      .single();

    if (error) throw error;

    const { data: sender, error: senderError } = await supabase
      .from('employees')
      .select('name')
      .eq('id', senderId)
      .maybeSingle();

    if (senderError) throw senderError;
    return mapThread(data, String(sender?.name ?? 'Unknown'));
  },

  async requestReviewWithMessage(input: RequestReviewInput): Promise<void> {
    const trimmed = input.messageText.trim();
    if (!trimmed) {
      throw new Error('Review note is required.');
    }

    const { error: messageError } = await supabase
      .from('approval_threads')
      .insert({
        approval_id: input.approvalId,
        sender_id: input.senderId,
        message_text: trimmed,
      });
    if (messageError) throw messageError;

    const { error: statusError } = await supabase
      .from('approvals')
      .update({ status: 'NEEDS_REVIEW' })
      .eq('id', input.approvalId);
    if (statusError) throw statusError;
  },
};
