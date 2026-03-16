import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppCard, AppScreen } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { supabase } from '../../../services/api/supabase';
import { lumina, spacing, typography } from '../../../theme';
import { notificationsKeys, useNotifications } from '../hooks/useNotifications';
import { NotificationItem, notificationsRepository } from '../repository/notificationsRepository';

const formatTimeAgo = (createdAt: string): string => {
  const now = Date.now();
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return createdAt;

  const diffMs = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(createdAt).toLocaleDateString();
};

export function NotificationsScreen() {
  const profile = useAuthStore((state) => state.profile);
  const userId = profile?.id;
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading, isFetching, refetch, error } = useNotifications(userId);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-screen-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: notificationsKeys.byUser(userId) });
          void queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadByUser(userId) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!userId) return;
      await notificationsRepository.markAsRead(notificationId, userId);
    },
    onMutate: async (notificationId) => {
      if (!userId) return;

      await queryClient.cancelQueries({ queryKey: notificationsKeys.byUser(userId) });
      const previous = queryClient.getQueryData<NotificationItem[]>(notificationsKeys.byUser(userId));

      queryClient.setQueryData<NotificationItem[]>(notificationsKeys.byUser(userId), (current) =>
        (current || []).map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item
        )
      );

      queryClient.setQueryData<number>(notificationsKeys.unreadByUser(userId), (current) =>
        Math.max(0, (current || 0) - 1)
      );

      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (!userId) return;
      if (context?.previous) {
        queryClient.setQueryData(notificationsKeys.byUser(userId), context.previous);
      }
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadByUser(userId) });
    },
    onSettled: () => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.byUser(userId) });
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadByUser(userId) });
    },
  });

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  if (!profile) {
    return (
      <AppScreen>
        <AppCard>
          <Text style={styles.title}>Session not ready.</Text>
          <Text style={styles.body}>Please sign in again.</Text>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.counter}>{unreadCount} unread</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : error ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load notifications</Text>
          <Text style={styles.body}>{String((error as Error)?.message || 'Unknown error')}</Text>
        </AppCard>
      ) : notifications.length === 0 ? (
        <AppCard>
          <Text style={styles.title}>No notifications yet</Text>
          <Text style={styles.body}>You are all caught up.</Text>
        </AppCard>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={() => void refetch()}
              tintColor={lumina.action.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (!item.isRead && !markReadMutation.isPending) {
                  markReadMutation.mutate(item.id);
                }
              }}
            >
              {({ pressed }) => (
                <AppCard
                  style={[
                    styles.notificationCard,
                    !item.isRead && styles.unreadCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, !item.isRead && styles.unreadTitle]}>{item.title}</Text>
                    <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
                  </View>
                  <Text style={[styles.cardBody, !item.isRead && styles.unreadBody]}>{item.body}</Text>
                </AppCard>
              )}
            </Pressable>
          )}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  body: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  counter: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: lumina.status.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  notificationCard: {
    gap: spacing.xs,
  },
  unreadCard: {
    borderColor: lumina.action.primary,
    borderWidth: 1.5,
    backgroundColor: 'rgba(13,148,136,0.06)',
  },
  pressed: {
    opacity: 0.86,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  unreadTitle: {
    fontWeight: typography.weight.bold,
  },
  cardBody: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    lineHeight: 20,
  },
  unreadBody: {
    color: lumina.text.primary,
  },
  timeAgo: {
    color: lumina.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});

