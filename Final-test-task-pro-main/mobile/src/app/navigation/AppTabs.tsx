import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TasksScreen } from '../../features/tasks/screens/TasksScreen';
import { TeamScreen } from '../../features/teams/screens/TeamScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { NotificationsScreen } from '../../features/notifications/screens/NotificationsScreen';
import { ApprovalsStack } from '../../features/approvals/navigation/ApprovalsStack';
import { useAuthStore } from '../../state/authStore';
import { canManageTeam } from '../../utils/roleGuards';
import { lumina } from '../../theme';

export type AppTabParamList = {
  Tasks: undefined;
  Approvals: undefined;
  Team: undefined;
  Settings: undefined;
  Notifications: undefined;
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
      <Tab.Screen name="Approvals" component={ApprovalsStack} />
      {showTeam && <Tab.Screen name="Team" component={TeamScreen} />}
      <Tab.Screen name="Settings" component={SettingsScreen} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
