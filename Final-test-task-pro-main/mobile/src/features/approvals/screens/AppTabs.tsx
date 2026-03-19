import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TasksScreen } from '../../tasks/screens/TasksScreen';
import { TaskDetailsScreen } from '../../tasks/screens/TaskDetailsScreen';
import { Ionicons } from '@expo/vector-icons';
import { ApprovalsListScreen } from './ApprovalsListScreen';
import { ApprovalDetailsScreen } from './ApprovalDetailsScreen';

// Assuming you have a screen for Team
// import { TeamScreen } from '../../features/team/screens/TeamScreen';

const TasksStack = createNativeStackNavigator();

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={{ headerShown: false }}>
      <TasksStack.Screen name="TaskList" component={TasksScreen} />
      <TasksStack.Screen name="TaskDetails" component={TaskDetailsScreen} />
    </TasksStack.Navigator>
  );
}

const ApprovalsStack = createNativeStackNavigator();

function ApprovalsNavigator() {
  return (
    <ApprovalsStack.Navigator screenOptions={{ headerShown: false }}>
      <ApprovalsStack.Screen name="ApprovalList" component={ApprovalsListScreen} />
      <ApprovalsStack.Screen name="ApprovalDetails" component={ApprovalDetailsScreen} />
    </ApprovalsStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();

export function AppTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="TasksTab"
        component={TasksNavigator}
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            // This ensures pressing the tab always returns to the task list
            navigation.navigate('TasksTab', { screen: 'TaskList' });
          },
        })}
      />
      <Tab.Screen
        name="ApprovalsTab"
        component={ApprovalsNavigator}
        options={{
          title: 'Approvals',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" color={color} size={size} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            // This ensures pressing the tab always returns to the approval list
            navigation.navigate('ApprovalsTab', { screen: 'ApprovalList' });
          },
        })}
      />
      {/* Add Team tab here if needed, following the same pattern */}
      {/*
      <Tab.Screen name="Team" component={TeamScreen} ... />
      */}
    </Tab.Navigator>
  );
}