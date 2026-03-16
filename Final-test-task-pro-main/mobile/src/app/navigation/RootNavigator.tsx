import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { useAuthStore } from '../../state/authStore';
import { lumina } from '../../theme';

export function RootNavigator() {
  const bootstrapped = useAuthStore((state) => state.bootstrapped);
  const session = useAuthStore((state) => state.session);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    if (!bootstrapped) {
      bootstrap().catch((error) => {
        console.error('Auth bootstrap failed:', error);
      });
    }
  }, [bootstrapped, bootstrap]);

  if (!bootstrapped) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: lumina.bg.app,
        }}
      >
        <ActivityIndicator size="large" color={lumina.action.primary} />
      </View>
    );
  }

  return <NavigationContainer>{session ? <AppTabs /> : <AuthStack />}</NavigationContainer>;
}
