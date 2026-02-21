import { supabase } from '../lib/supabase';

// Notification logic updated. Fail-safe mode active.
console.log('🔔 Notification logic updated. Fail-safe mode active.');

type PushRecord = {
  description: string;
  assigned_to: string;
  company_id: string;
};

const invokeSendPushViaFetch = async (record: PushRecord) => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing Supabase environment variables for direct function invoke');
  }

  const authClient = (supabase as any).auth;
  const session = authClient ? (await authClient.getSession())?.data?.session : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ record }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return { data: payload, error: null };
};

const invokeSendPush = async (record: PushRecord) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { record },
    });

    if (error) {
      const rawMessage = String(error.message || '');
      const isUnauthorized = rawMessage.toLowerCase().includes('401') || rawMessage.toLowerCase().includes('unauthorized');

      // Fallback path: call function endpoint directly with explicit headers.
      // This protects against edge verify_jwt configuration drift.
      if (isUnauthorized) {
        try {
          console.warn('send-push via invoke returned 401. Retrying with direct fetch...');
          return await invokeSendPushViaFetch(record);
        } catch (fallbackError: any) {
          console.warn('⚠️ Push notification fallback failed, but task was created:', fallbackError.message);
          return null;
        }
      }

      console.warn('⚠️ Push notification failed, but task was created:', error.message);
      return null;
    }

    return { data, error: null };
  } catch (error: any) {
    const message = String(error?.message || '');
    const isUnauthorized = message.toLowerCase().includes('401') || message.toLowerCase().includes('unauthorized');

    if (isUnauthorized) {
      try {
        console.warn('send-push invoke threw 401. Retrying with direct fetch...');
        return await invokeSendPushViaFetch(record);
      } catch (fallbackError: any) {
        console.warn('⚠️ Push notification fallback failed, but task was created:', fallbackError.message);
        return null;
      }
    }

    console.warn('⚠️ Push notification failed, but task was created:', message);
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
  assignedToId: string,
  companyId?: string
): Promise<void> => {
  try {
    console.log('Sending task assignment notification...', {
      taskDescription,
      assignedToName,
      assignedBy,
      assignedToId,
      companyId,
    });

    const tenantCompanyId = String(companyId || '').trim();
    if (!tenantCompanyId) {
      console.warn('Missing company_id for assignee. Skipping push send:', assignedToId);
      return;
    }

    const record: PushRecord = {
      description: taskDescription,
      assigned_to: assignedToId,
      company_id: tenantCompanyId,
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
      .select('onesignal_id, company_id')
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

    const companyId = String(employee.company_id || '').trim();
    if (!companyId) {
      console.warn('Missing company_id for assigner. Skipping push send:', assignedById);
      return;
    }

    const record: PushRecord = {
      description: `Task completed by ${completedByName}: ${taskDescription}`,
      assigned_to: assignedById,
      company_id: companyId,
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
