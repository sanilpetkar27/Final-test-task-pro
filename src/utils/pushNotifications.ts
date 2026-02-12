import { supabase } from '../lib/supabase';

// Notification logic updated. Fail-safe mode active.
console.log('🔔 Notification logic updated. Fail-safe mode active.');

type PushRecord = {
  description: string;
  assigned_to: string;
};

const invokeSendPush = async (record: PushRecord) => {
  console.log('🚨 PROOF: invokeSendPush called!');
  console.log('🚨 PROOF: Record:', record);
  
  try {
    console.log('🔧 invokeSendPush called with record:', record);
    
    const authClient = (supabase as any).auth;
    const session = authClient ? (await authClient.getSession())?.data?.session : null;
    
    console.log('🔧 Session info:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      accessTokenLength: session?.access_token?.length || 0
    });

    const headers = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined;
    
    console.log('🔧 Headers being sent:', headers);

    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { record },
      headers,
    });

    console.log('🔧 Supabase response:', { data, error });

    if (error) {
      console.warn('⚠️ Push notification failed, but task was created:', error.message);
      return null;
    }

    return { data, error: null };
  } catch (error: any) {
    console.warn('⚠️ Push notification failed, but task was created:', error.message);
    return null;
  }
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

    const result = await invokeSendPush(record);
    if (!result) {
      // Error already logged in invokeSendPush
      return;
    }

    console.log('Edge Function response:', JSON.stringify(result.data, null, 2));

    if (result.data?.errors && Array.isArray(result.data.errors) && result.data.errors.length > 0) {
      console.error('OneSignal API returned errors:', JSON.stringify(result.data.errors, null, 2));
      return;
    }

    console.log('Push notification sent successfully via Edge Function:', result.data);
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

    const result = await invokeSendPush(record);
    if (!result) {
      // Error already logged in invokeSendPush
      return;
    }

    console.log('Edge Function response:', JSON.stringify(result.data, null, 2));

    if (result.data?.errors && Array.isArray(result.data.errors) && result.data.errors.length > 0) {
      console.error('OneSignal API returned errors:', JSON.stringify(result.data.errors, null, 2));
      return;
    }

    console.log('Push notification sent successfully via Edge Function:', result.data);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};
