import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TasksScreen } from '../../features/tasks/screens/TasksScreen';
import { TeamScreen } from '../../features/teams/screens/TeamScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { useAuthStore } from '../../state/authStore';
import { canManageTeam } from '../../utils/roleGuards';
import { lumina } from '../../theme';

export type AppTabParamList = {
  Tasks: undefined;
  Team: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppTabs() {
  const profile = useAuthStore((state) => state.profile);
  const showTeam = profile ? canManageTeam(profile.role) : false;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lumina.action.primary,
        tabBarInactiveTintColor: lumina.text.secondary,
        tabBarStyle: {
          backgroundColor: lumina.bg.surface,
          borderTopColor: lumina.border.subtle,
        },
      }}
    >
      <Tab.Screen name="Tasks" component={TasksScreen} />
      {showTeam && <Tab.Screen name="Team" component={TeamScreen} />}
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
