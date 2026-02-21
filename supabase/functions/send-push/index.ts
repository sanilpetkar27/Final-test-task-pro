import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

type PushRecord = {
  description?: string;
  assigned_to?: string;
  company_id?: string;
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

    if (!record.company_id) {
      return new Response(JSON.stringify({ error: "Missing company_id field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient by employee id only.
    // Mobile fallback can accidentally target the wrong row in mixed legacy data.
    const encodedAssigneeId = encodeURIComponent(record.assigned_to);
    const encodedCompanyId = encodeURIComponent(record.company_id);
    const employeeUrl =
      `${SUPABASE_URL}/rest/v1/employees` +
      `?id=eq.${encodedAssigneeId}&company_id=eq.${encodedCompanyId}&select=id,onesignal_id,company_id`;

    const employeeRes = await fetch(employeeUrl, {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });

    if (!employeeRes.ok) {
      console.error('Failed to fetch employee:', await employeeRes.text());
      throw new Error('Failed to fetch employee data');
    }

    const employees = await employeeRes.json();
    if (!employees || employees.length === 0) {
      console.log('No employee found for ID:', record.assigned_to);
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = employees[0];
    if (!employee.onesignal_id) {
      console.log('No OneSignal ID for employee:', employee.id);
      return new Response(JSON.stringify({ error: "No OneSignal ID for employee" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety check: if the same OneSignal id is attached to multiple users in this company,
    // skip sending to avoid wrong-recipient notifications.
    const encodedOneSignalId = encodeURIComponent(employee.onesignal_id);
    const duplicateUrl =
      `${SUPABASE_URL}/rest/v1/employees` +
      `?company_id=eq.${encodedCompanyId}&onesignal_id=eq.${encodedOneSignalId}&select=id&limit=3`;

    const duplicateRes = await fetch(duplicateUrl, {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    });

    if (!duplicateRes.ok) {
      console.error('Failed duplicate-check query:', await duplicateRes.text());
      throw new Error('Failed to validate OneSignal recipient mapping');
    }

    const duplicateRows = await duplicateRes.json();
    if (Array.isArray(duplicateRows) && duplicateRows.length > 1) {
      console.warn('Ambiguous onesignal_id mapping. Skipping push to avoid wrong recipient.', {
        assigned_to: record.assigned_to,
        company_id: record.company_id,
        duplicate_user_ids: duplicateRows.map((row: any) => row.id),
      });
      return new Response(
        JSON.stringify({
          error: "Ambiguous OneSignal mapping for recipient. Ask users to re-login to rebind device.",
          duplicate_user_ids: duplicateRows.map((row: any) => row.id),
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const notification = {
      app_id: APP_ID,
      include_player_ids: [employee.onesignal_id],
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
