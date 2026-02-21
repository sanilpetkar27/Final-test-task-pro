import OneSignal from 'react-onesignal';

const ONE_SIGNAL_APP_ID = '531b5106-873b-443a-bcc6-b7074246401f';
let oneSignalInitPromise: Promise<void> | null = null;
let oneSignalInitComplete = false;

// Test mode for localhost
const isLocalhost = window.location.hostname === 'localhost';
const TEST_ONE_SIGNAL_ID = 'test-localhost-device-id-' + Math.random().toString(36).substr(2, 9);

/**
 * Initialize OneSignal for push notifications.
 * This function is idempotent and safe to call multiple times.
 */
export const initializeOneSignal = async (): Promise<void> => {
  if (isLocalhost) {
    console.log('Localhost test mode - using mock OneSignal');
    console.log('Test OneSignal ID:', TEST_ONE_SIGNAL_ID);
    return;
  }

  if (oneSignalInitComplete) {
    return;
  }

  if (oneSignalInitPromise) {
    return oneSignalInitPromise;
  }

  oneSignalInitPromise = (async () => {
    try {
      console.log('Initializing OneSignal...');

      await OneSignal.init({
        appId: ONE_SIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
        subdomainName: 'final-test-task-pro.vercel.app'
      });

      oneSignalInitComplete = true;
      console.log('OneSignal initialized successfully');
    } catch (error) {
      const message = String((error as any)?.message || error || '').toLowerCase();

      // react strict mode and repeated hook mounts can call init more than once.
      if (message.includes('already initialized')) {
        oneSignalInitComplete = true;
        console.log('OneSignal already initialized. Reusing existing instance.');
        return;
      }

      console.error('OneSignal initialization failed:', error);
      throw error;
    } finally {
      if (!oneSignalInitComplete) {
        oneSignalInitPromise = null;
      }
    }
  })();

  return oneSignalInitPromise;
};

/**
 * Check if notifications are enabled.
 */
export const areNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const permission = await OneSignal.Notifications.permission;
    return permission === true;
  } catch (error) {
    console.error('Error checking notification permission:', error);
    return false;
  }
};

/**
 * Show the native browser notification permission prompt.
 */
export const requestBrowserNotificationPermission = async (): Promise<boolean> => {
  try {
    console.log('Requesting browser notification permission...');

    if ('Notification' in window && Notification.permission === 'granted') {
      console.log('Browser notifications already granted');
      return true;
    }

    const permission = await Notification.requestPermission();
    console.log('Browser permission result:', permission);

    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting browser permission:', error);
    return false;
  }
};

/**
 * Request direct push subscription from OneSignal.
 */
export const requestPushSubscription = async (): Promise<void> => {
  try {
    console.log('Requesting push subscription...');

    await OneSignal.User.PushSubscription.optIn();
    console.log('Push subscription requested');

    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (error) {
    console.error('Error requesting push subscription:', error);
  }
};

/**
 * Show the OneSignal slidedown prompt.
 */
export const promptPushNotifications = async (): Promise<void> => {
  try {
    console.log('Showing push notification prompt...');

    const browserPermission = await requestBrowserNotificationPermission();

    if (browserPermission) {
      console.log('Browser permission granted, showing OneSignal prompt...');
      await OneSignal.Slidedown.promptPush();
      console.log('OneSignal slidedown shown');
    } else {
      console.log('Browser permission denied');
    }
  } catch (error) {
    console.error('Error showing push prompt:', error);
  }
};

/**
 * Get the OneSignal Subscription ID (Player ID).
 * This is the device identifier used for targeted notifications.
 */
export const getOneSignalSubscriptionId = async (): Promise<string | null> => {
  try {
    if (isLocalhost) {
      console.log('Returning test OneSignal ID:', TEST_ONE_SIGNAL_ID);
      return TEST_ONE_SIGNAL_ID;
    }

    if (!window.OneSignal) {
      console.error('OneSignal not available on window object');
      return null;
    }

    const subscriptionId = await OneSignal.User.PushSubscription.id;
    console.log('OneSignal Subscription ID:', subscriptionId);
    return subscriptionId || null;
  } catch (error) {
    console.error('Error getting subscription ID:', error);
    return null;
  }
};

/**
 * Check if OneSignal is properly initialized.
 */
export const isOneSignalInitialized = (): boolean => {
  try {
    if (isLocalhost) {
      return true;
    }

    return oneSignalInitComplete || !!(window.OneSignal && window.OneSignal.User);
  } catch (error) {
    console.error('Error checking OneSignal initialization:', error);
    return false;
  }
};

/**
 * Set external user ID for the current subscription.
 * This links the device to a specific user in your system.
 */
export const setOneSignalExternalUserId = async (userId: string): Promise<void> => {
  try {
    // OneSignal reserves `external_id`; use login when available.
    if (typeof (OneSignal as any).login === 'function') {
      await (OneSignal as any).login(userId);
    } else {
      // Fallback alias for older SDK behavior.
      await OneSignal.User.addAlias('employee_id', userId);
    }
    console.log('OneSignal user binding set:', userId);
  } catch (error) {
    console.error('Error setting external user ID:', error);
  }
};

/**
 * Request notification permission explicitly.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const permission = await OneSignal.Notifications.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting permission:', error);
    return false;
  }
};
