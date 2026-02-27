import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeToE164 = (raw: string): string | null => {
  const value = String(raw || "").trim();
  if (!value) return null;

  const cleaned = value.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+") && cleaned.length >= 8) {
    return cleaned;
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload?.record ?? payload?.new ?? null;
    const oldRecord = payload?.old_record ?? payload?.old ?? null;

    const newStatus = String(record?.status || "").trim().toLowerCase();
    const oldStatus = String(oldRecord?.status || "").trim().toLowerCase();

    // Guardrail: only notify on transition to completed.
    if (!(newStatus === "completed" && oldStatus !== "completed")) {
      console.log("notify-task-completed skipped", JSON.stringify({
        reason: "status_transition_not_completed",
        new_status: newStatus || null,
        old_status: oldStatus || null,
        task_id: record?.id ?? null,
      }));
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "status_transition_not_completed",
          new_status: newStatus || null,
          old_status: oldStatus || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const managerId = String(
      record?.created_by ??
      record?.createdBy ??
      record?.assigned_by ??
      record?.assignedBy ??
      ""
    ).trim();
    const workerId = String(record?.assigned_to ?? record?.assignedTo ?? "").trim();
    const taskTitle = String(
      record?.description ??
      record?.task_title ??
      record?.taskTitle ??
      "Task"
    ).trim();

    if (!managerId || !workerId) {
      console.log("notify-task-completed skipped", JSON.stringify({
        reason: "missing_manager_or_worker_id",
        manager_id: managerId || null,
        worker_id: workerId || null,
        task_id: record?.id ?? null,
      }));
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "missing_manager_or_worker_id",
          manager_id: managerId || null,
          worker_id: workerId || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Missing Twilio environment variables.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const [{ data: manager, error: managerError }, { data: worker, error: workerError }] = await Promise.all([
      adminClient
        .from("employees")
        .select("id, name, mobile")
        .eq("id", managerId)
        .maybeSingle(),
      adminClient
        .from("employees")
        .select("id, name")
        .eq("id", workerId)
        .maybeSingle(),
    ]);

    if (managerError) {
      throw new Error(`Failed to fetch manager: ${managerError.message}`);
    }
    if (workerError) {
      throw new Error(`Failed to fetch worker: ${workerError.message}`);
    }

    const managerMobile = normalizeToE164(String(manager?.mobile || ""));
    const workerName = String(worker?.name || "Worker").trim();

    if (!managerMobile) {
      console.log("notify-task-completed skipped", JSON.stringify({
        reason: "manager_mobile_missing_or_invalid",
        manager_id: managerId,
        manager_mobile: manager?.mobile ?? null,
        task_id: record?.id ?? null,
      }));
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "manager_mobile_missing_or_invalid",
          manager_id: managerId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const to = `whatsapp:${managerMobile}`;
    const body = `✅ Task Completed: ${workerName} just finished the task: '${taskTitle}'.`;
    console.log("notify-task-completed attempt", JSON.stringify({
      manager_id: managerId,
      worker_id: workerId,
      to,
      task_id: record?.id ?? null,
    }));

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", from);
    formData.append("Body", body);

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: formData.toString(),
      }
    );

    const result = await twilioResponse.json();
    if (!twilioResponse.ok) {
      console.error("notify-task-completed Twilio send failed", JSON.stringify({
        status: twilioResponse.status,
        code: result?.code ?? null,
        message: result?.message ?? "Failed to send WhatsApp message",
        more_info: result?.more_info ?? null,
        to,
      }));
      return new Response(
        JSON.stringify({ success: false, error: result?.message || "Twilio send failed", twilio: result }),
        { status: twilioResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("notify-task-completed Twilio send success", JSON.stringify({
      sid: result?.sid ?? null,
      to,
      task_id: record?.id ?? null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result?.sid ?? null,
        manager_id: managerId,
        worker_id: workerId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
