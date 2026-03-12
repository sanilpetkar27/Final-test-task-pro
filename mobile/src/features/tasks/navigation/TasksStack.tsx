import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TasksScreen } from '../screens/TasksScreen';
import { TaskDetailsScreen } from '../screens/TaskDetailsScreen';

export type TasksStackParamList = {
  TasksList: undefined;
  TaskDetails: { taskId: string };
};

const Stack = createNativeStackNavigator<TasksStackParamList>();

export function TasksStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TasksList" component={TasksScreen} />
      <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} />
    </Stack.Navigator>
  );
}
