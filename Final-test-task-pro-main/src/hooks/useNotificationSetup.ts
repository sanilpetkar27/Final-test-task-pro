import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Employee } from '../../types';
import {
  initializeOneSignal,
  getOneSignalSubscriptionId,
  requestNotificationPermission,
  requestPushSubscription,
  setOneSignalExternalUserId,
} from '../utils/notifications';

interface UseNotificationSetupProps {
  currentEmployee: Employee | null;
  userId: string | null;
  userMobile: string | null;
  companyId: string | null;
  isLoggedIn: boolean;
}

/**
 * Hook to set up OneSignal notifications when user logs in.
 * We scope writes by employee id + company id to avoid cross-tenant updates.
 */
export const useNotificationSetup = ({ currentEmployee, userId, userMobile, companyId, isLoggedIn }: UseNotificationSetupProps) => {
  const setupInFlightRef = useRef(false);
  const lastCompletedSetupKeyRef = useRef<string | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  const saveOneSignalIdToDatabase = useCallback(async (oneSignalId: string, employee: Employee) => {
    try {
      const employeeId = String(employee.id || '').trim();
      const tenantCompanyId = String(employee.company_id || '').trim();
      if (!employeeId || !tenantCompanyId) {
        console.warn('Skipping OneSignal save due to missing employee scope', { employeeId, tenantCompanyId });
        return;
      }

      console.log('Saving OneSignal ID to database...', { oneSignalId, employeeId, companyId: tenantCompanyId });

      if (String(employee.onesignal_id || '').trim() === oneSignalId) {
        console.log('OneSignal ID already synced. Skipping update to prevent refresh loop.');
        return;
      }

      const { error: updateError } = await supabase
        .from('employees')
        .update({ onesignal_id: oneSignalId })
        .eq('id', employeeId)
        .eq('company_id', tenantCompanyId);

      if (updateError) {
        console.error('Failed to save OneSignal ID:', updateError);
      } else {
        console.log('OneSignal ID saved to database');
      }

      const { error: dedupeError } = await supabase
        .from('employees')
        .update({ onesignal_id: null })
        .eq('company_id', tenantCompanyId)
        .eq('onesignal_id', oneSignalId)
        .neq('id', employeeId);

      if (dedupeError) {
        console.warn('Failed to clear duplicate OneSignal IDs in company scope:', dedupeError);
      }
    } catch (error) {
      console.error('Error saving OneSignal ID:', error);
    }
  }, []);

  const registerOneSignalDevice = useCallback(async (employee: Employee): Promise<{ didSync: boolean; shouldRetry: boolean }> => {
    const employeeId = String(employee.id || '').trim();
    const tenantCompanyId = String(employee.company_id || '').trim();

    if (!employeeId || !tenantCompanyId) {
      console.log('Skipping notification setup - employee scope is incomplete');
      return { didSync: false, shouldRetry: false };
    }

    if (!isLoggedIn || !userId || !companyId) {
      console.log('Skipping notification setup - user not logged in or missing tenant context');
      return { didSync: false, shouldRetry: false };
    }

    try {
      console.log('Starting notification setup for user:', employeeId);

      await initializeOneSignal();

      if (window.location.hostname === 'localhost') {
        let testId = localStorage.getItem('mock_onesignal_id');

        if (!testId) {
          testId = 'test-localhost-device-id-' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('mock_onesignal_id', testId);
        }

        await saveOneSignalIdToDatabase(testId, employee);
        return { didSync: true, shouldRetry: false };
      }

      const permissionGranted = await requestNotificationPermission();
      if (!permissionGranted) {
        console.warn('OneSignal permission was not granted. Skipping device registration.');
        return { didSync: false, shouldRetry: false };
      }

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
        await setOneSignalExternalUserId(employeeId);
        await saveOneSignalIdToDatabase(subscriptionId, employee);
        return { didSync: true, shouldRetry: false };
      }

      console.warn('OneSignal subscription ID not available yet. Will retry setup.');
      return { didSync: false, shouldRetry: true };
    } catch (error) {
      console.error('Error in notification setup:', error);
      return { didSync: false, shouldRetry: true };
    }
  }, [companyId, isLoggedIn, saveOneSignalIdToDatabase, userId]);

  useEffect(() => {
    if (!isLoggedIn || !userId || !companyId || !currentEmployee) {
      lastCompletedSetupKeyRef.current = null;
      return;
    }

    const setupKey = `${currentEmployee.id}:${currentEmployee.company_id}`;
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
        const { didSync, shouldRetry } = await registerOneSignalDevice(currentEmployee);
        if (!cancelled) {
          if (didSync) {
            lastCompletedSetupKeyRef.current = setupKey;
            clearRetryTimer();
          } else if (shouldRetry) {
            clearRetryTimer();
            retryTimerRef.current = window.setTimeout(() => {
              if (!cancelled) {
                runSetup();
              }
            }, 5000);
          } else {
            clearRetryTimer();
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
  }, [companyId, currentEmployee, isLoggedIn, registerOneSignalDevice, userId, userMobile]);
};

export default useNotificationSetup;
