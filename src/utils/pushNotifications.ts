import { supabase } from '../lib/supabase';

/**
 * Send push notification when a task is assigned to a user
 */
export const sendTaskAssignmentNotification = async (
  taskDescription: string,
  assignedToName: string,
  assignedBy: string,
  assignedToMobile: string
): Promise<void> => {
  try {
    console.log('📱 Sending task assignment notification...', {
      taskDescription,
      assignedToName,
      assignedToMobile
    });

    // Get the user's OneSignal ID
    const { data: employee, error: fetchError } = await supabase
      .from('employees')
      .select('onesignal_id')
      .eq('mobile', assignedToMobile)
      .single();

    if (fetchError || !employee || !employee.onesignal_id) {
      console.log('❌ No OneSignal ID found for user:', assignedToMobile);
      return;
    }

    // Prepare notification content
    const notification = {
      contents: {
        en: {
          title: '🔔 New Task Assigned',
          body: `You have been assigned a new task: ${taskDescription}\nAssigned by: ${assignedBy}`,
          data: {
            type: 'task_assignment',
            taskDescription,
            assignedBy,
            assignedTo: assignedToName
          }
        }
      },
      include_player_ids: [employee.onesignal_id],
      target_channel: 'push'
    };

    // Send to OneSignal
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa('N2MwLkL2MxX7dLtQqHc3aH0vYb9E')}`
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      console.error('❌ Failed to send push notification:', await response.text());
      return;
    }

    const result = await response.json();
    console.log('✅ Push notification sent successfully:', result);

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

    // Get the assigner's OneSignal ID
    const { data: employee, error: fetchError } = await supabase
      .from('employees')
      .select('onesignal_id')
      .eq('mobile', assignedByMobile)
      .single();

    if (fetchError || !employee || !employee.onesignal_id) {
      console.log('❌ No OneSignal ID found for user:', assignedByMobile);
      return;
    }

    // Prepare notification content
    const notification = {
      contents: {
        en: {
          title: '✅ Task Completed',
          body: `Task "${taskDescription}" has been completed by ${completedByName}`,
          data: {
            type: 'task_completion',
            taskDescription,
            completedBy: completedByName
          }
        }
      },
      include_player_ids: [employee.onesignal_id],
      target_channel: 'push'
    };

    // Send to OneSignal
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa('N2MwLkL2MxX7dLtQqHc3aH0vYb9E')}`
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      console.error('❌ Failed to send push notification:', await response.text());
      return;
    }

    const result = await response.json();
    console.log('✅ Push notification sent successfully:', result);

  } catch (error) {
    console.error('❌ Error sending push notification:', error);
  }
};
