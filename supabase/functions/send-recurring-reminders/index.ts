import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;
const MONTHLY_MS = 30 * DAILY_MS;

type Frequency = "daily" | "weekly" | "monthly";

type RecurringTaskRow = {
  id: string;
  description: string;
  assignedTo: string | null;
  company_id: string;
  recurrence_frequency: Frequency | null;
  next_recurrence_notification_at: number | null;
  status: "pending" | "in-progress" | "completed";
};

const getIntervalMs = (frequency: Frequency | null): number => {
  if (frequency === "daily") return DAILY_MS;
  if (frequency === "weekly") return WEEKLY_MS;
  if (frequency === "monthly") return MONTHLY_MS;
  return 0;
};

const getNextReminderTimestamp = (
  currentNext: number | null,
  nowMs: number,
  frequency: Frequency | null
): number | null => {
  const intervalMs = getIntervalMs(frequency);
  if (!intervalMs) return null;

  let nextValue = Number(currentNext || (nowMs + intervalMs));
  while (nextValue <= nowMs) {
    nextValue += intervalMs;
  }
  return nextValue;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "531b5106-873b-443a-bcc6-b7074246401f";
    const API_KEY = Deno.env.get("ONESIGNAL_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CRON_SECRET = Deno.env.get("RECURRING_CRON_SECRET");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !APP_ID || !API_KEY) {
      throw new Error("Missing required secrets in Supabase function environment");
    }

    if (CRON_SECRET) {
      const authHeader = req.headers.get("Authorization") || "";
      const expected = `Bearer ${CRON_SECRET}`;
      if (authHeader !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowMs = Date.now();
    const { data: tasks, error: tasksError } = await adminClient
      .from("tasks")
      .select("id,description,assignedTo,company_id,recurrence_frequency,next_recurrence_notification_at,status")
      .eq("task_type", "recurring")
      .in("status", ["pending", "in-progress"])
      .not("assignedTo", "is", null)
      .or(`next_recurrence_notification_at.lte.${nowMs},next_recurrence_notification_at.is.null`)
      .limit(200);

    if (tasksError) {
      throw tasksError;
    }

    let processed = 0;
    let notified = 0;
    let advancedWithoutDevice = 0;
    let sendFailures = 0;
    let updatedSchedule = 0;

    for (const task of (tasks || []) as RecurringTaskRow[]) {
      processed += 1;
      const frequency = task.recurrence_frequency;
      const intervalMs = getIntervalMs(frequency);
      const assigneeId = String(task.assignedTo || "").trim();

      if (!intervalMs || !assigneeId || !task.company_id) {
        continue;
      }

      const nextReminderAt = getNextReminderTimestamp(task.next_recurrence_notification_at, nowMs, frequency);
      if (!nextReminderAt) {
        continue;
      }

      const { data: employee, error: employeeError } = await adminClient
        .from("employees")
        .select("id,onesignal_id")
        .eq("id", assigneeId)
        .eq("company_id", task.company_id)
        .maybeSingle();

      if (employeeError) {
        sendFailures += 1;
        continue;
      }

      const oneSignalId = String(employee?.onesignal_id || "").trim();
      if (!oneSignalId) {
        const { error: scheduleError } = await adminClient
          .from("tasks")
          .update({ next_recurrence_notification_at: nextReminderAt })
          .eq("id", task.id)
          .eq("company_id", task.company_id);

        if (!scheduleError) {
          advancedWithoutDevice += 1;
          updatedSchedule += 1;
        }
        continue;
      }

      const notificationPayload = {
        app_id: APP_ID,
        include_player_ids: [oneSignalId],
        headings: { en: "Recurring Task Reminder" },
        contents: {
          en: task.description
            ? `Reminder (${frequency}): ${task.description}`
            : `You have a ${frequency} recurring task reminder.`,
        },
        url: "https://final-test-task-pro.vercel.app/",
        data: {
          type: "recurring_reminder",
          task_id: task.id,
          recurrence_frequency: frequency,
        },
      };

      const oneSignalRes = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${API_KEY}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      const oneSignalData = await oneSignalRes.json().catch(() => ({}));
      if (!oneSignalRes.ok) {
        console.error("OneSignal recurring reminder error:", oneSignalRes.status, oneSignalData);
        sendFailures += 1;
        continue;
      }

      notified += 1;

      const { error: scheduleError } = await adminClient
        .from("tasks")
        .update({ next_recurrence_notification_at: nextReminderAt })
        .eq("id", task.id)
        .eq("company_id", task.company_id);

      if (!scheduleError) {
        updatedSchedule += 1;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        notified,
        advancedWithoutDevice,
        sendFailures,
        updatedSchedule,
        nowMs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-recurring-reminders fatal error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
