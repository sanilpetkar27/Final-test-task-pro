import { useQuery } from '@tanstack/react-query';
import { approvalsRepository } from '../repository/approvalsRepository';

export type ApprovalsView = 'my_requests' | 'needs_my_approval';

export const approvalsKeys = {
  all: ['approvals'] as const,
  byView: (userId: string, view: ApprovalsView) => ['approvals', view, userId] as const,
  detail: (approvalId: string) => ['approvals', 'detail', approvalId] as const,
  threads: (approvalId: string) => ['approvals', 'threads', approvalId] as const,
};

export function useApprovals(userId?: string, view: ApprovalsView = 'my_requests') {
  return useQuery({
    queryKey: userId ? approvalsKeys.byView(userId, view) : approvalsKeys.all,
    queryFn: () =>
      view === 'my_requests'
        ? approvalsRepository.listMyRequests(userId || '')
        : approvalsRepository.listNeedsMyApproval(userId || ''),
    enabled: Boolean(userId),
  });
}

export function useApprovalDetail(approvalId?: string) {
  return useQuery({
    queryKey: approvalId ? approvalsKeys.detail(approvalId) : approvalsKeys.all,
    queryFn: () => approvalsRepository.getById(approvalId || ''),
    enabled: Boolean(approvalId),
  });
}

export function useApprovalThreads(approvalId?: string) {
  return useQuery({
    queryKey: approvalId ? approvalsKeys.threads(approvalId) : approvalsKeys.all,
    queryFn: () => approvalsRepository.listThreads(approvalId || ''),
    enabled: Boolean(approvalId),
  });
}
