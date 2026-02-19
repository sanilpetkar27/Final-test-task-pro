import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../services/api/supabase';
import { authRepository } from '../features/auth/repository/authRepository';
import type { UserProfile } from '../types/domain';

type AuthState = {
  bootstrapped: boolean;
  session: Session | null;
  profile: UserProfile | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  bootstrapped: false,
  session: null,
  profile: null,

  bootstrap: async () => {
    try {
      const session = await authRepository.getSession();
      if (!session?.user) {
        set({ bootstrapped: true, session: null, profile: null });
        return;
      }

      const profile = await authRepository.loadProfile(session.user);
      set({ bootstrapped: true, session, profile });
    } catch {
      set({ bootstrapped: true, session: null, profile: null });
    }
  },

  signIn: async (email: string, password: string) => {
    const session = await authRepository.signIn(email, password);
    const profile = await authRepository.loadProfile(session.user);
    set({ session, profile });
  },

  signOut: async () => {
    await authRepository.signOut();
    set({ session: null, profile: null });
  },
}));

// Keep store session aligned with Supabase auth changes.
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (!session?.user) {
    useAuthStore.setState({ session: null, profile: null });
    return;
  }

  try {
    const profile = await authRepository.loadProfile(session.user);
    useAuthStore.setState({ session, profile });
  } catch {
    useAuthStore.setState({ session, profile: null });
  }
});
