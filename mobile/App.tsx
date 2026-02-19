import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from './src/app/providers/AppProviders';
import { RootNavigator } from './src/app/navigation/RootNavigator';
import { lumina } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="dark" backgroundColor={lumina.bg.app} />
        <RootNavigator />
      </AppProviders>
    </SafeAreaProvider>
  );
}
