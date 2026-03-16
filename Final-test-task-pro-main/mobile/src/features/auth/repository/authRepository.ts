import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../../services/api/supabase';
import type { UserProfile, UserRole } from '../../../types/domain';

const normalizeRole = (role: unknown): UserRole => {
  return role === 'super_admin' || role === 'owner' || role === 'manager' || role === 'staff' ? role : 'staff';
};

const mapProfile = (row: any, authUser: User): UserProfile => {
  const metadata = authUser.user_metadata || {};
  return {
    id: String(row?.id || authUser.id),
    companyId: String(row?.company_id || metadata?.company_id || ''),
    email: String(row?.email || authUser.email || ''),
    name: String(row?.name || metadata?.name || authUser.email || 'User'),
    mobile: String(row?.mobile || metadata?.mobile || ''),
    role: normalizeRole(row?.role || metadata?.role),
  };
};

export const authRepository = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      throw error || new Error('Sign in failed.');
    }
    return data.session;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async loadProfile(authUser: User): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) {
      // Keep auth usable even if profile row is delayed or blocked by transient RLS issues.
      return mapProfile(null, authUser);
    }

    if (data) {
      return mapProfile(data, authUser);
    }

    return mapProfile(null, authUser);
  },
};
