import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  initializeOneSignal,
  areNotificationsEnabled,
  promptPushNotifications,
  getOneSignalSubscriptionId,
} from '../utils/notifications';

interface UseNotificationSetupProps {
  userMobile: string | null;
  isLoggedIn: boolean;
}

/**
 * Hook to set up OneSignal notifications when user logs in
 * 
 * Step A: Check if notifications are enabled. If not, show the native prompt.
 * Step B: Once user accepts, get the Subscription ID (Player ID).
 * Step C: Save this ID to the employees table for the current logged-in user.
 */
export const useNotificationSetup = ({ userMobile, isLoggedIn }: UseNotificationSetupProps) => {
  
  const saveOneSignalIdToDatabase = useCallback(async (oneSignalId: string, mobile: string) => {
    try {
      console.log('💾 Saving OneSignal ID to database...', { oneSignalId, mobile });
      
      const { error } = await supabase
        .from('employees')
        .update({ onesignal_id: oneSignalId })
        .eq('mobile', mobile);
      
      if (error) {
        console.error('❌ Failed to save OneSignal ID:', error);
      } else {
        console.log('✅ OneSignal ID saved to database');
      }
    } catch (error) {
      console.error('❌ Error saving OneSignal ID:', error);
    }
  }, []);

  const setupNotifications = useCallback(async () => {
    if (!isLoggedIn || !userMobile) {
      console.log('🔔 Skipping notification setup - user not logged in or no mobile');
      return;
    }

    try {
      console.log('🔔 Starting notification setup for user:', userMobile);
      
      // For localhost test mode, skip the permission flow and directly get/save ID
      if (window.location.hostname === 'localhost') {
        console.log('🧪 Localhost test mode - using mock OneSignal');
        
        // Check if we already have a mock ID in localStorage
        let testId = localStorage.getItem('mock_onesignal_id');
        
        if (!testId) {
          // Only generate a new ID if one doesn't exist
          testId = 'test-localhost-device-id-' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('mock_onesignal_id', testId);
          console.log('🧪 Generated new mock OneSignal ID:', testId);
        } else {
          console.log('🧪 Using existing mock OneSignal ID:', testId);
        }
        
        await saveOneSignalIdToDatabase(testId, userMobile);
        return;
      }
      
      // Step A: Check if notifications are enabled
      const isEnabled = await areNotificationsEnabled();
      console.log('🔔 Notifications enabled:', isEnabled);
      
      if (!isEnabled) {
        console.log('🔔 Showing push notification prompt...');
        await promptPushNotifications();
        
        // Wait a moment for the user to respond to the prompt
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Step B: Get the OneSignal Subscription ID
      const subscriptionId = await getOneSignalSubscriptionId();
      
      if (subscriptionId) {
        console.log('🔔 Got subscription ID:', subscriptionId);
        
        // Step C: Save to database
        await saveOneSignalIdToDatabase(subscriptionId, userMobile);
      } else {
        console.log('🔔 No subscription ID available - user may have declined notifications');
      }
    } catch (error) {
      console.error('❌ Error in notification setup:', error);
    }
  }, [isLoggedIn, userMobile, saveOneSignalIdToDatabase]);

  useEffect(() => {
    console.log('🔔 useNotificationSetup effect triggered:', { isLoggedIn, userMobile });
    
    // Initialize OneSignal when the hook is first used
    initializeOneSignal().then(() => {
      console.log('🔔 OneSignal init complete, checking if should setup:', { isLoggedIn, userMobile });
      // After initialization, set up notifications if user is logged in
      if (isLoggedIn && userMobile) {
        setupNotifications();
      } else {
        console.log('🔔 Skipping setup - not logged in or no mobile');
      }
    }).catch((err) => {
      console.error('❌ OneSignal init failed:', err);
    });
  }, [isLoggedIn, userMobile, setupNotifications]);
};

export default useNotificationSetup;
