import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksRepository } from '../repository/tasksRepository';
import { subscribeToCompanyTasks } from '../../../services/sync/taskRealtime';

export const tasksKeys = {
  all: ['tasks'] as const,
  byCompany: (companyId: string) => ['tasks', companyId] as const,
};

export function useTasks(companyId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: companyId ? tasksKeys.byCompany(companyId) : tasksKeys.all,
    queryFn: () => tasksRepository.listTasks(companyId || ''),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (!companyId) return;

    const unsubscribe = subscribeToCompanyTasks(companyId, () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(companyId) });
    });

    return unsubscribe;
  }, [companyId, queryClient]);

  return query;
}

