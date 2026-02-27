import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ApprovalsListScreen } from '../screens/ApprovalsListScreen';
import { ApprovalDetailsScreen } from '../screens/ApprovalDetailsScreen';

export type ApprovalsStackParamList = {
  ApprovalsList: undefined;
  ApprovalDetails: { approvalId: string };
};

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ApprovalsList" component={ApprovalsListScreen} />
      <Stack.Screen name="ApprovalDetails" component={ApprovalDetailsScreen} />
    </Stack.Navigator>
  );
}
