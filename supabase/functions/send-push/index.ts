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

    if (!record.include_player_ids || record.include_player_ids.length === 0) {
      console.error('❌ Edge Function: Missing include_player_ids in record');
      return new Response(
        JSON.stringify({ error: 'Missing include_player_ids in record' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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
