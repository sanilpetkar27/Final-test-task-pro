import OneSignal from 'react-onesignal';

const ONE_SIGNAL_APP_ID = '531b5106-873b-443a-bcc6-b7074246401f';

// Test mode for localhost
const isLocalhost = window.location.hostname === 'localhost';
const TEST_ONE_SIGNAL_ID = 'test-localhost-device-id-' + Math.random().toString(36).substr(2, 9);

/**
 * Initialize OneSignal for push notifications
 * This should be called once when the app starts
 */
export const initializeOneSignal = async (): Promise<void> => {
  try {
    console.log('🔔 Initializing OneSignal...');
    
    if (isLocalhost) {
      console.log('🧪 Localhost test mode - using mock OneSignal');
      console.log('🧪 Test OneSignal ID:', TEST_ONE_SIGNAL_ID);
      return;
    }
    
    await OneSignal.init({
      appId: ONE_SIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: '/OneSignalSDKWorker.js',
      serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
      subdomainName: 'final-test-task-pro.vercel.app'
    });
    
    console.log('✅ OneSignal initialized successfully');
  } catch (error) {
    console.error('❌ OneSignal initialization failed:', error);
  }
};

/**
 * Check if notifications are enabled
 */
export const areNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const permission = await OneSignal.Notifications.permission;
    return permission === true;
  } catch (error) {
    console.error('❌ Error checking notification permission:', error);
    return false;
  }
};

/**
 * Show the native browser notification permission prompt
 */
export const requestBrowserNotificationPermission = async (): Promise<boolean> => {
  try {
    console.log('🔔 Requesting browser notification permission...');
    
    // First check if notifications are already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      console.log('✅ Browser notifications already granted');
      return true;
    }
    
    // Request permission from browser
    const permission = await Notification.requestPermission();
    console.log('🔔 Browser permission result:', permission);
    
    return permission === 'granted';
  } catch (error) {
    console.error('❌ Error requesting browser permission:', error);
    return false;
  }
};

/**
 * Request direct push subscription from OneSignal
 */
export const requestPushSubscription = async (): Promise<void> => {
  try {
    console.log('🔔 Requesting push subscription...');
    
    // Directly request push subscription
    await OneSignal.User.PushSubscription.optIn();
    console.log('✅ Push subscription requested');
    
    // Wait a moment for subscription to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error('❌ Error requesting push subscription:', error);
  }
};

/**
 * Show the OneSignal slidedown prompt
 */
export const promptPushNotifications = async (): Promise<void> => {
  try {
    console.log('🔔 Showing push notification prompt...');
    
    // First try browser notification permission
    const browserPermission = await requestBrowserNotificationPermission();
    
    if (browserPermission) {
      console.log('✅ Browser permission granted, showing OneSignal prompt...');
      
      // Show OneSignal slidedown
      await OneSignal.Slidedown.promptPush();
      console.log('✅ OneSignal slidedown shown');
    } else {
      console.log('❌ Browser permission denied');
    }
  } catch (error) {
    console.error('❌ Error showing push prompt:', error);
  }
};

/**
 * Get the OneSignal Subscription ID (Player ID)
 * This is the device identifier used for targeted notifications
 */
export const getOneSignalSubscriptionId = async (): Promise<string | null> => {
  try {
    // Return test ID for localhost
    if (isLocalhost) {
      console.log('🧪 Returning test OneSignal ID:', TEST_ONE_SIGNAL_ID);
      return TEST_ONE_SIGNAL_ID;
    }
    
    // Check if OneSignal is available
    if (!window.OneSignal) {
      console.error('❌ OneSignal not available on window object');
      return null;
    }
    
    const subscriptionId = await OneSignal.User.PushSubscription.id;
    console.log('🔔 OneSignal Subscription ID:', subscriptionId);
    return subscriptionId || null;
  } catch (error) {
    console.error('❌ Error getting subscription ID:', error);
    return null;
  }
};

/**
 * Check if OneSignal is properly initialized
 */
export const isOneSignalInitialized = (): boolean => {
  try {
    // Return true for localhost test mode
    if (isLocalhost) {
      console.log('🧪 Localhost test mode - OneSignal considered initialized');
      return true;
    }
    
    return !!(window.OneSignal && window.OneSignal.User);
  } catch (error) {
    console.error('❌ Error checking OneSignal initialization:', error);
    return false;
  }
};

/**
 * Set external user ID for the current subscription
 * This links the device to a specific user in your system
 */
export const setOneSignalExternalUserId = async (userId: string): Promise<void> => {
  try {
    await OneSignal.User.addAlias('external_id', userId);
    console.log('✅ External user ID set:', userId);
  } catch (error) {
    console.error('❌ Error setting external user ID:', error);
  }
};

/**
 * Request notification permission explicitly
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const permission = await OneSignal.Notifications.requestPermission();
    return permission;
  } catch (error) {
    console.error('❌ Error requesting permission:', error);
    return false;
  }
};
