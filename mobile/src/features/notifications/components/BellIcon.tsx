import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../services/api/supabase';
import { lumina, radii, spacing, typography } from '../../../theme';
import { notificationsKeys, useUnreadNotificationsCount } from '../hooks/useNotifications';

type BellIconProps = {
  userId?: string;
  onPress: () => void;
  style?: ViewStyle;
};

export function BellIcon({ userId, onPress, style }: BellIconProps) {
  const queryClient = useQueryClient();
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(userId);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-bell-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadByUser(userId) });
          void queryClient.invalidateQueries({ queryKey: notificationsKeys.byUser(userId) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}>
      <Ionicons
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={22}
        color={lumina.text.primary}
      />

      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: lumina.bg.surface,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: lumina.status.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: lumina.bg.surface,
  },
  badgeText: {
    color: lumina.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
});

