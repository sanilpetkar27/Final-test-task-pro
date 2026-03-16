import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  initializeOneSignal,
  areNotificationsEnabled,
  promptPushNotifications,
  getOneSignalSubscriptionId,
  requestPushSubscription,
  setOneSignalExternalUserId,
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
  const retryTimerRef = useRef<number | null>(null);

  const saveOneSignalIdToDatabase = useCallback(async (oneSignalId: string, employeeId: string, tenantCompanyId: string) => {
    try {
      console.log('Saving OneSignal ID to database...', { oneSignalId, employeeId, companyId: tenantCompanyId });

      // Ensure a device subscription id is bound to only one employee inside a tenant.
      // This avoids cross-user push leakage when stale rows still hold the same OneSignal id.
      const { error: dedupeError } = await supabase
        .from('employees')
        .update({ onesignal_id: null })
        .eq('company_id', tenantCompanyId)
        .eq('onesignal_id', oneSignalId)
        .neq('id', employeeId);

      if (dedupeError) {
        console.warn('Failed to clear duplicate OneSignal IDs in company scope:', dedupeError);
      }

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

  const setupNotifications = useCallback(async (): Promise<boolean> => {
    if (!isLoggedIn || !userId || !companyId) {
      console.log('Skipping notification setup - user not logged in or missing tenant context');
      return false;
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
        return true;
      }

      const isEnabled = await areNotificationsEnabled();
      if (!isEnabled) {
        await promptPushNotifications();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Request push subscription explicitly, then retry to fetch id because iOS/PWA
      // often delays subscription creation on fresh app launch.
      await requestPushSubscription();

      let subscriptionId: string | null = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        subscriptionId = await getOneSignalSubscriptionId();
        if (subscriptionId) {
          break;
        }

        if (attempt < 5) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      if (subscriptionId) {
        await setOneSignalExternalUserId(userId);
        await saveOneSignalIdToDatabase(subscriptionId, userId, companyId);
        return true;
      }

      console.warn('OneSignal subscription ID not available yet. Will retry setup.');
      return false;
    } catch (error) {
      console.error('Error in notification setup:', error);
      return false;
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

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const runSetup = async () => {
      if (setupInFlightRef.current) {
        return;
      }

      setupInFlightRef.current = true;
      try {
        await initializeOneSignal();
        if (cancelled) return;

        const didSync = await setupNotifications();
        if (!cancelled) {
          if (didSync) {
            lastCompletedSetupKeyRef.current = setupKey;
            clearRetryTimer();
          } else {
            clearRetryTimer();
            retryTimerRef.current = window.setTimeout(() => {
              if (!cancelled) {
                runSetup();
              }
            }, 5000);
          }
        }
      } catch (err) {
        console.error('OneSignal init failed:', err);
        if (!cancelled) {
          clearRetryTimer();
          retryTimerRef.current = window.setTimeout(() => {
            if (!cancelled) {
              runSetup();
            }
          }, 5000);
        }
      } finally {
        setupInFlightRef.current = false;
      }
    };

    runSetup();

    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [isLoggedIn, userId, companyId, setupNotifications]);
};

export default useNotificationSetup;
