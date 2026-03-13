import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { AppProviders } from './src/app/providers/AppProviders';
import { RootNavigator } from './src/app/navigation/RootNavigator';
import { lumina } from './src/theme';

// Initialize Sentry
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 1.0,
});

function App() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="dark" backgroundColor={lumina.bg.app} />
        <RootNavigator />
      </AppProviders>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
