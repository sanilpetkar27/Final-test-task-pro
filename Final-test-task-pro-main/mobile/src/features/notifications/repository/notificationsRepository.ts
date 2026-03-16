import { supabase } from '../../../services/api/supabase';

export type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
};

const mapNotification = (row: any): NotificationItem => ({
  id: String(row?.id ?? ''),
  userId: String(row?.user_id ?? ''),
  title: String(row?.title ?? ''),
  body: String(row?.body ?? ''),
  entityType: row?.entity_type ? String(row.entity_type) : null,
  entityId: row?.entity_id ? String(row.entity_id) : null,
  isRead: Boolean(row?.is_read),
  createdAt: String(row?.created_at ?? new Date().toISOString()),
});

export const notificationsRepository = {
  async listByUser(userId: string): Promise<NotificationItem[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, title, body, entity_type, entity_id, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapNotification);
  },

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  },

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;
  },
};

