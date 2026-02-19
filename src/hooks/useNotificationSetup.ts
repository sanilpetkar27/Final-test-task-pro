import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  initializeOneSignal,
  areNotificationsEnabled,
  promptPushNotifications,
  getOneSignalSubscriptionId,
} from '../utils/notifications';

interface UseNotificationSetupProps {
  userId: string | null;
  userMobile: string | null;
  companyId: string | null;
  isLoggedIn: boolean;
}

/**
 * Hook to set up OneSignal notifications when user logs in.
 * We scope writes by employee id + company id to avoid cross-tenant updates.
 */
export const useNotificationSetup = ({ userId, userMobile, companyId, isLoggedIn }: UseNotificationSetupProps) => {
  const setupInFlightRef = useRef(false);
  const lastCompletedSetupKeyRef = useRef<string | null>(null);

  const saveOneSignalIdToDatabase = useCallback(async (oneSignalId: string, employeeId: string, tenantCompanyId: string) => {
    try {
      console.log('Saving OneSignal ID to database...', { oneSignalId, employeeId, companyId: tenantCompanyId });

      const { data: currentEmployee, error: fetchError } = await supabase
        .from('employees')
        .select('onesignal_id')
        .eq('id', employeeId)
        .eq('company_id', tenantCompanyId)
        .maybeSingle();

      if (fetchError) {
        console.error('Failed to fetch current OneSignal ID:', fetchError);
      } else if (currentEmployee && currentEmployee.onesignal_id === oneSignalId) {
        console.log('OneSignal ID already synced. Skipping update to prevent refresh loop.');
        return;
      }

      const { error } = await supabase
        .from('employees')
        .update({ onesignal_id: oneSignalId })
        .eq('id', employeeId)
        .eq('company_id', tenantCompanyId);

      if (error) {
        console.error('Failed to save OneSignal ID:', error);
      } else {
        console.log('OneSignal ID saved to database');
      }
    } catch (error) {
      console.error('Error saving OneSignal ID:', error);
    }
  }, []);

  const setupNotifications = useCallback(async () => {
    if (!isLoggedIn || !userId || !companyId) {
      console.log('Skipping notification setup - user not logged in or missing tenant context');
      return;
    }

    try {
      console.log('Starting notification setup for user:', userId);

      if (window.location.hostname === 'localhost') {
        let testId = localStorage.getItem('mock_onesignal_id');

        if (!testId) {
          testId = 'test-localhost-device-id-' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('mock_onesignal_id', testId);
        }

        await saveOneSignalIdToDatabase(testId, userId, companyId);
        return;
      }

      const isEnabled = await areNotificationsEnabled();
      if (!isEnabled) {
        await promptPushNotifications();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const subscriptionId = await getOneSignalSubscriptionId();
      if (subscriptionId) {
        await saveOneSignalIdToDatabase(subscriptionId, userId, companyId);
      }
    } catch (error) {
      console.error('Error in notification setup:', error);
    }
  }, [isLoggedIn, userId, companyId, saveOneSignalIdToDatabase]);

  useEffect(() => {
    if (!isLoggedIn || !userId || !companyId) {
      lastCompletedSetupKeyRef.current = null;
      return;
    }

    const setupKey = `${userId}:${companyId}`;
    if (lastCompletedSetupKeyRef.current === setupKey) {
      return;
    }

    let cancelled = false;

    const runSetup = async () => {
      if (setupInFlightRef.current) {
        return;
      }

      setupInFlightRef.current = true;
      try {
        await initializeOneSignal();
        if (cancelled) return;

        await setupNotifications();
        if (!cancelled) {
          lastCompletedSetupKeyRef.current = setupKey;
        }
      } catch (err) {
        console.error('OneSignal init failed:', err);
      } finally {
        setupInFlightRef.current = false;
      }
    };

    runSetup();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, userId, companyId, setupNotifications]);
};

export default useNotificationSetup;
