import { useQuery } from '@tanstack/react-query';
import { teamRepository } from '../repository/teamRepository';

export const teamKeys = {
  all: ['team'] as const,
  byCompany: (companyId: string) => ['team', companyId] as const,
};

export function useTeam(companyId?: string) {
  return useQuery({
    queryKey: companyId ? teamKeys.byCompany(companyId) : teamKeys.all,
    queryFn: () => teamRepository.listMembers(companyId || ''),
    enabled: Boolean(companyId),
  });
}

