import { supabase } from '../lib/supabase';

/**
 * Send push notification when a task is assigned to a user
 */
export const sendTaskAssignmentNotification = async (
  taskDescription: string,
  assignedToName: string,
  assignedBy: string,
  assignedToId: string  // ✅ Changed from mobile to ID
): Promise<void> => {
  try {
    console.log('📱 Sending task assignment notification...', {
      taskDescription,
      assignedToName,
      assignedToId
    });

    // Get the user's OneSignal ID
    let employee;
    try {
      const result = await supabase
        .from('employees')
        .select('onesignal_id')
        .eq('id', assignedToId)  // ✅ Query by ID instead of mobile
        .maybeSingle();
      
      employee = result.data;
      
      if (result.error) {
        console.error('❌ Supabase query error:', result.error);
        return;
      }
    } catch (error) {
      console.error('❌ Database query failed:', error);
      return;
    }

    if (!employee || !employee.onesignal_id) {
      console.log('❌ No OneSignal ID found for user:', assignedToId);
      return;
    }

    // Simple payload - let backend handle the rest
    const payload = {
      body: {
        record: {
          description: taskDescription,
          assigned_to: assignedToId  // ✅ Use ID instead of mobile
        }
      }
    };

    console.log('🔔 Frontend: Sending simple payload:', JSON.stringify(payload));

    // Send to Edge Function
    const { data, error } = await supabase.functions.invoke('send-push', payload);

    if (error) {
      console.error('❌ Failed to send push notification via Edge Function:', error);
      return;
    }

    // Deep inspection of response for OneSignal errors
    console.log('🔍 Deep inspection of Edge Function response:', JSON.stringify(data, null, 2));
    
    if (data && data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      console.error('❌ OneSignal API returned errors:', JSON.stringify(data.errors, null, 2));
      console.error('❌ Error details:', data.errors.map(err => `${err.error}: ${err.message || 'No message'}`).join(', '));
      return;
    }

    console.log('✅ Push notification sent successfully via Edge Function:', data);

  } catch (error) {
    console.error('❌ Error sending push notification:', error);
  }
};

/**
 * Send push notification when a task is completed
 */
export const sendTaskCompletionNotification = async (
  taskDescription: string,
  completedByName: string,
  assignedByMobile: string
): Promise<void> => {
  try {
    console.log('📱 Sending task completion notification...', {
      taskDescription,
      completedByName,
      assignedByMobile
    });

    // Get assigner's OneSignal ID
    let employee;
    try {
      const result = await supabase
        .from('employees')
        .select('onesignal_id')
        .eq('mobile', assignedByMobile)
        .maybeSingle();
      
      employee = result.data;
      
      if (result.error) {
        console.error('❌ Supabase query error:', result.error);
        return;
      }
    } catch (error) {
      console.error('❌ Database query failed:', error);
      return;
    }

    if (!employee || !employee.onesignal_id) {
      console.log('❌ No OneSignal ID found for user:', assignedByMobile);
      return;
    }

    // Simple payload - let backend handle the rest
    const payload = {
      body: {
        record: {
          description: taskDescription,
          assigned_to: assignedByMobile
        }
      }
    };

    console.log('🔔 Frontend: Sending simple payload:', JSON.stringify(payload));

    // Send to Edge Function
    const { data, error } = await supabase.functions.invoke('send-push', payload);

    if (error) {
      console.error('❌ Failed to send push notification via Edge Function:', error);
      return;
    }

    // Deep inspection of response for OneSignal errors
    console.log('🔍 Deep inspection of Edge Function response:', JSON.stringify(data, null, 2));
    
    if (data && data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      console.error('❌ OneSignal API returned errors:', JSON.stringify(data.errors, null, 2));
      console.error('❌ Error details:', data.errors.map(err => `${err.error}: ${err.message || 'No message'}`).join(', '));
      return;
    }

    console.log('✅ Push notification sent successfully via Edge Function:', data);

  } catch (error) {
    console.error('❌ Error sending push notification:', error);
  }
};
