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
    // 1. Parse incoming request
    const payload = await req.json()
    console.log('� Payload Received:', JSON.stringify(payload))
    
    // 2. Load API Keys
    const APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
    const API_KEY = Deno.env.get('ONESIGNAL_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!APP_ID || !API_KEY || !SERVICE_ROLE_KEY) {
      throw new Error('❌ Missing Secrets in Supabase Dashboard!')
    }

    // 3. Handle simple payload structure (what frontend actually sends)
    const record = payload.record || payload
    
    if (!record.assigned_to) {
      console.error('❌ Missing assigned_to in payload')
      return new Response(JSON.stringify({ error: 'Missing assigned_to field' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log('🔍 Looking up User ID:', record.assigned_to)

    // 4. Get user data using Service Role Key (bypasses RLS)
    console.log('🔑 Using Service Role Key for authentication')
    const userQuery = await fetch(
      `${SUPABASE_URL}/rest/v1/employees?id=eq.${record.assigned_to}&select=onesignal_id`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    )
    
    let userData;
    let authError = null;
    
    try {
      userData = await userQuery.json();
      console.log('👤 User Data Found:', JSON.stringify(userData))
      
      if (!userData || userData.length === 0) {
        authError = 'User not found in database';
        console.error('❌ User not found for ID:', record.assigned_to);
      }
    } catch (fetchError) {
      authError = `Database query failed: ${fetchError.message}`;
      console.error('❌ Database query error:', fetchError);
    }
    
    if (authError) {
      return new Response(JSON.stringify({ 
        error: authError,
        details: 'Failed to authenticate with database',
        assigned_to: record.assigned_to
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const targetPlayerId = userData[0]?.onesignal_id

    if (!targetPlayerId) {
      console.log('⚠️ User has no device registered')
      return new Response(JSON.stringify({ message: 'User has no device registered' }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 5. Build OneSignal notification (simple structure)
    const notification = {
      app_id: APP_ID,
      include_player_ids: [targetPlayerId],
      headings: { en: 'New Task Assigned' },
      contents: { en: `Task: ${record.description || 'New task'}` },
      url: 'https://final-test-task-pro.vercel.app/', // Keep this for iOS
      data: {
        // Try using relative path if full URL opens Chrome
        launch_url: 'https://final-test-task-pro.vercel.app/?utm_source=pwa' 
      }
    }

    console.log('� Sending to OneSignal:', JSON.stringify(notification))

    // 6. Send to OneSignal
    console.log('📡 Sending to OneSignal API:', 'https://onesignal.com/api/v1/notifications')
    console.log('🔑 Using App ID:', APP_ID)
    
    let osResponse;
    let osError = null;
    
    try {
      osResponse = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${API_KEY}`,
        },
        body: JSON.stringify(notification),
      })
      
      if (!osResponse.ok) {
        osError = `HTTP ${osResponse.status}: ${osResponse.statusText}`;
        console.error('❌ OneSignal API HTTP Error:', osResponse.status, osResponse.statusText);
      }
    } catch (fetchError) {
      osError = `Network error: ${fetchError.message}`;
      console.error('❌ OneSignal API Network Error:', fetchError);
    }
    
    if (osError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to send push notification',
        details: osError,
        oneSignal_status: 'API call failed'
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 7. Return success response
    const osData = await osResponse.json()
    console.log('✅ OneSignal Success:', JSON.stringify(osData))
    
    return new Response(JSON.stringify(osData), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('🔥 Critical Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
