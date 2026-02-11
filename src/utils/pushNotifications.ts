import { supabase } from '../lib/supabase';

type PushRecord = {
  description: string;
  assigned_to: string;
};

const invokeSendPush = async (record: PushRecord) => {
  const authClient = (supabase as any).auth;
  const session = authClient ? (await authClient.getSession())?.data?.session : null;

  return supabase.functions.invoke('send-push', {
    body: { record },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });
};

/**
 * Send push notification when a task is assigned to a user
 */
export const sendTaskAssignmentNotification = async (
  taskDescription: string,
  assignedToName: string,
  assignedBy: string,
  assignedToId: string
): Promise<void> => {
  try {
    console.log('Sending task assignment notification...', {
      taskDescription,
      assignedToName,
      assignedBy,
      assignedToId,
    });

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('onesignal_id')
      .eq('id', assignedToId)
      .maybeSingle();

    if (employeeError) {
      console.error('Supabase query error:', employeeError);
      return;
    }

    if (!employee?.onesignal_id) {
      console.log('No OneSignal ID found for user:', assignedToId);
      return;
    }

    const record: PushRecord = {
      description: taskDescription,
      assigned_to: assignedToId,
    };

    console.log('Frontend payload:', JSON.stringify({ record }));

    const { data, error } = await invokeSendPush(record);
    if (error) {
      console.error('Failed to send push notification via Edge Function:', error);
      return;
    }

    console.log('Edge Function response:', JSON.stringify(data, null, 2));

    if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      console.error('OneSignal API returned errors:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('Push notification sent successfully via Edge Function:', data);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

/**
 * Send push notification when a task is completed
 */
export const sendTaskCompletionNotification = async (
  taskDescription: string,
  completedByName: string,
  assignedById: string
): Promise<void> => {
  try {
    console.log('Sending task completion notification...', {
      taskDescription,
      completedByName,
      assignedById,
    });

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('onesignal_id')
      .eq('id', assignedById)
      .maybeSingle();

    if (employeeError) {
      console.error('Supabase query error:', employeeError);
      return;
    }

    if (!employee?.onesignal_id) {
      console.log('No OneSignal ID found for user:', assignedById);
      return;
    }

    const record: PushRecord = {
      description: `Task completed by ${completedByName}: ${taskDescription}`,
      assigned_to: assignedById,
    };

    console.log('Frontend payload:', JSON.stringify({ record }));

    const { data, error } = await invokeSendPush(record);
    if (error) {
      console.error('Failed to send push notification via Edge Function:', error);
      return;
    }

    console.log('Edge Function response:', JSON.stringify(data, null, 2));

    if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      console.error('OneSignal API returned errors:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('Push notification sent successfully via Edge Function:', data);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};
