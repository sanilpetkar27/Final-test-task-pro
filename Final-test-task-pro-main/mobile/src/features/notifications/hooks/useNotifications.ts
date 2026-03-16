import { useQuery } from '@tanstack/react-query';
import { notificationsRepository } from '../repository/notificationsRepository';

export const notificationsKeys = {
  all: ['notifications'] as const,
  byUser: (userId: string) => ['notifications', userId] as const,
  unreadByUser: (userId: string) => ['notifications', 'unread', userId] as const,
};

export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: userId ? notificationsKeys.byUser(userId) : notificationsKeys.all,
    queryFn: () => notificationsRepository.listByUser(userId || ''),
    enabled: Boolean(userId),
  });
}

export function useUnreadNotificationsCount(userId?: string) {
  return useQuery({
    queryKey: userId ? notificationsKeys.unreadByUser(userId) : notificationsKeys.all,
    queryFn: () => notificationsRepository.getUnreadCount(userId || ''),
    enabled: Boolean(userId),
  });
}

