import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TasksStack } from '../../features/tasks/navigation/TasksStack';
import { TeamScreen } from '../../features/teams/screens/TeamScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { NotificationsScreen } from '../../features/notifications/screens/NotificationsScreen';
import { ApprovalsStack } from '../../features/approvals/navigation/ApprovalsStack';
import { TaskDetailsScreen } from '../../features/tasks/screens/TaskDetailsScreen';
import { useAuthStore } from '../../state/authStore';
import { canManageTeam } from '../../utils/roleGuards';
import { lumina } from '../../theme';

export type AppTabParamList = {
  Tasks: undefined;
  Approvals: undefined;
  Team: undefined;
  Settings: undefined;
  Notifications: undefined;
  TaskDetails: { taskId: string };
};

const TabIcon = ({ name, color, size }: { name: string; color: string; size: number }) => (
  <Ionicons name={name as any} size={size} color={color} />
);

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
          paddingBottom: 8,
          height: 80,
        },
        tabBarItemStyle: {
          paddingVertical: 8,
        },
      }}
    >
      <Tab.Screen 
        name="Tasks" 
        component={TasksStack} 
        options={{
          tabBarLabel: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen 
        name="Approvals" 
        component={ApprovalsStack}
        options={{
          tabBarLabel: 'Approvals',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="checkmark-circle-outline" color={color} size={size} />
          ),
        }}
      />
      {showTeam && (
        <Tab.Screen 
          name="Team" 
          component={TeamScreen}
          options={{
            tabBarLabel: 'Team',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="people-outline" color={color} size={size} />
            ),
          }}
        />
      )}
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="settings-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="TaskDetails" 
        component={TaskDetailsScreen}
        options={{
          tabBarButton: () => null,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tab.Navigator>
  );
}
