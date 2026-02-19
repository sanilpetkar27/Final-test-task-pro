let initialized = false;

export async function initializeOneSignal(): Promise<void> {
  if (initialized) return;

  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return;

  try {
    const module = await import('react-native-onesignal');
    const OneSignal = module.default;
    OneSignal.initialize(appId);
    initialized = true;
  } catch (error) {
    console.warn('OneSignal init skipped:', error);
  }
}
