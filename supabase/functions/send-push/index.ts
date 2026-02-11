import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

type PushRecord = {
  description?: string;
  assigned_to?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record: PushRecord = payload?.record ?? payload ?? {};
    console.log("Payload received:", JSON.stringify(record));

    const APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "531b5106-873b-443a-bcc6-b7074246401f";
    const API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!APP_ID || !API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing required secrets in Supabase function environment");
    }

    if (!record.assigned_to) {
      return new Response(JSON.stringify({ error: "Missing assigned_to field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient by id first, then by mobile to support legacy callers.
    const searchValue = encodeURIComponent(record.assigned_to);
    const employeeUrl =
      `${SUPABASE_URL}/rest/v1/employees` +
      `?or=(id.eq.${searchValue},mobile.eq.${searchValue})&select=id,onesignal_id`;

    const employeeRes = await fetch(employeeUrl, {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });

    if (!employeeRes.ok) {
      const errText = await employeeRes.text();
      console.error("Employee lookup failed:", employeeRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Employee lookup failed", details: errText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const employees = await employeeRes.json();
    const targetPlayerId = employees?.[0]?.onesignal_id;

    if (!targetPlayerId) {
      return new Response(
        JSON.stringify({
          message: "No OneSignal device registered for this user",
          assigned_to: record.assigned_to,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const notification = {
      app_id: APP_ID,
      include_player_ids: [targetPlayerId],
      headings: { en: "Task Update" },
      contents: { en: record.description || "You have a new task update" },
      url: "https://final-test-task-pro.vercel.app/",
      data: {
        launch_url: "https://final-test-task-pro.vercel.app/?utm_source=pwa",
      },
    };

    const oneSignalRes = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${API_KEY}`,
      },
      body: JSON.stringify(notification),
    });

    const oneSignalData = await oneSignalRes.json();
    if (!oneSignalRes.ok) {
      console.error("OneSignal API error:", oneSignalRes.status, JSON.stringify(oneSignalData));
      return new Response(
        JSON.stringify({
          error: "Failed to send push notification",
          status: oneSignalRes.status,
          details: oneSignalData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(oneSignalData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-push fatal error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
