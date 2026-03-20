import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeToE164 = (raw: string): string | null => {
  const value = String(raw || "").trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (value.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
};

const sendWhatsAppTemplate = async (
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>,
  accountSid: string,
  authToken: string,
  fromNumber: string
): Promise<boolean> => {
  const params = new URLSearchParams();
  params.append("From", `whatsapp:${fromNumber}`);
  params.append("To", `whatsapp:${to}`);
  params.append("ContentSid", contentSid);
  params.append("ContentVariables", JSON.stringify(contentVariables));

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: params,
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.error("Twilio error:", err?.message, "to:", to);
    return false;
  }
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const CRON_SECRET = Deno.env.get("DIGEST_CRON_SECRET");
    if (CRON_SECRET) {
      const authHeader = req.headers.get("Authorization") || "";
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const FROM_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const MANAGER_TEMPLATE_SID = "HX39419ae1e62d6763fa2921deab3ced55";
    const STAFF_TEMPLATE_SID = "HXbb12f5f7a1737dc297b48583235ef1d1";

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const nowMs = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();
    const yesterdayMs = startOfTodayMs - 86400000;

    const { data: companies, error: companiesError } = await db
      .from("companies")
      .select("id, name")
      .eq("subscription_status", "active");

    if (companiesError) throw companiesError;

    let totalSent = 0;
    let totalFailed = 0;

    for (const company of companies || []) {
      const { data: employees } = await db
        .from("employees")
        .select("id, name, mobile, role")
        .eq("company_id", company.id)
        .in("role", ["super_admin", "owner", "manager", "staff"]);

      if (!employees?.length) continue;

      const { data: allTasks } = await db
        .from("tasks")
        .select("id, description, status, assigned_to, created_at, completed_at, deadline")
        .eq("company_id", company.id);

      if (!allTasks?.length) continue;

      const employeeMap = new Map(employees.map((e) => [e.id, e]));

      for (const employee of employees) {
        const mobile = normalizeToE164(employee.mobile || "");
        if (!mobile) continue;

        const isManager = ["super_admin", "owner", "manager"].includes(employee.role);
        let sent = false;

        if (isManager) {
          const completedYesterday = allTasks.filter(
            (t) => t.status === "completed" && t.completed_at &&
              new Date(t.completed_at).getTime() >= yesterdayMs &&
              new Date(t.completed_at).getTime() < startOfTodayMs
          );
          const pendingTasks = allTasks.filter((t) => t.status === "pending");
          const overdueTasks = allTasks.filter(
            (t) => t.status !== "completed" && t.deadline && new Date(t.deadline).getTime() < nowMs
          );

          const completionCount: Record<string, number> = {};
          for (const t of completedYesterday) {
            if (t.assigned_to) completionCount[t.assigned_to] = (completionCount[t.assigned_to] || 0) + 1;
          }
          const topEntry = Object.entries(completionCount).sort((a, b) => b[1] - a[1])[0];
          const topPerformer = topEntry ? employeeMap.get(topEntry[0])?.name || "N/A" : "N/A";

          sent = await sendWhatsAppTemplate(
            mobile,
            MANAGER_TEMPLATE_SID,
            {
              "1": employee.name.split(" ")[0],
              "2": `${completedYesterday.length} tasks`,
              "3": `${pendingTasks.length} tasks`,
              "4": `${overdueTasks.length} tasks`,
              "5": topPerformer,
            },
            ACCOUNT_SID, AUTH_TOKEN, FROM_NUMBER
          );
        } else {
          const myTasks = allTasks.filter((t) => t.assigned_to === employee.id);
          const myNew = myTasks.filter((t) => t.created_at && new Date(t.created_at).getTime() >= startOfTodayMs);
          const myPending = myTasks.filter((t) => t.status === "pending");
          const myOverdue = myTasks.filter(
            (t) => t.status !== "completed" && t.deadline && new Date(t.deadline).getTime() < nowMs
          );

          sent = await sendWhatsAppTemplate(
            mobile,
            STAFF_TEMPLATE_SID,
            {
              "1": employee.name.split(" ")[0],
              "2": `${myNew.length} tasks`,
              "3": `${myPending.length} tasks`,
              "4": `${myOverdue.length} tasks`,
            },
            ACCOUNT_SID, AUTH_TOKEN, FROM_NUMBER
          );
        }

        if (sent) totalSent++; else totalFailed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-daily-digest fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
