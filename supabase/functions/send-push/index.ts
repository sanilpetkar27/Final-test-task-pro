import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('🔔 Edge Function: Received payload:', JSON.stringify(payload));
    
    // Log environment variables
    console.log('🔔 Edge Function: ONESIGNAL_APP_ID:', Deno.env.get('ONESIGNAL_APP_ID'));
    console.log('🔔 Edge Function: ONESIGNAL_API_KEY:', Deno.env.get('ONESIGNAL_API_KEY') ? 'SET' : 'MISSING');
    
    // Handle both direct calls and webhooks
    const record = payload.record || payload;
    console.log('🔔 Edge Function: Extracted record:', JSON.stringify(record));
    
    if (!record) {
      console.error('❌ Edge Function: No record found in payload');
      return new Response(
        JSON.stringify({ error: 'No record found in payload' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // For simplified payload, we need to build the OneSignal notification here
    if (!record.description || !record.assigned_to) {
      console.error('❌ Edge Function: Missing required fields in record');
      return new Response(
        JSON.stringify({ error: 'Missing description or assigned_to in record' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get OneSignal ID for the assigned user
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('onesignal_id')
      .eq('mobile', record.assigned_to)
      .maybeSingle();

    if (employeeError || !employeeData || !employeeData.onesignal_id) {
      console.error('❌ Edge Function: No OneSignal ID found for user:', record.assigned_to);
      return new Response(
        JSON.stringify({ error: 'No OneSignal ID found for assigned user' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Build OneSignal notification
    const notification = {
      contents: {
        en: {
          title: '🔔 New Task Assigned',
          body: `You have been assigned a new task: ${record.description}`,
          data: {
            type: 'task_assignment',
            taskDescription: record.description,
            assignedTo: record.assigned_to
          }
        }
      },
      include_player_ids: [employeeData.onesignal_id],
      target_channel: 'push'
    };

    console.log('🔔 Edge Function: Sending push notification to OneSignal...');

    // Send to OneSignal from server-side (no CORS issues)
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Deno.env.get('ONESIGNAL_API_KEY')}`
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Edge Function: Failed to send push notification:', errorText);
      return new Response(
        JSON.stringify({ error: errorText }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await response.json();
    console.log('✅ Edge Function: Push notification sent successfully:', result);

    return new Response(
      JSON.stringify(result), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
