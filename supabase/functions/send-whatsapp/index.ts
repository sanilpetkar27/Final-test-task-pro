import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeToE164 = (raw: string): string | null => {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.startsWith("whatsapp:")) {
    const nested = value.replace(/^whatsapp:/i, "");
    return normalizeToE164(nested);
  }

  const cleaned = value.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  // Keep already-valid international style.
  if (cleaned.startsWith("+") && cleaned.length >= 8) {
    return cleaned;
  }

  // India local mobile (10 digits) -> +91XXXXXXXXXX
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // India with leading country code but missing plus.
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }

  return null;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const hasOldRecord = Boolean(payload?.old_record ?? payload?.old);
    if (hasOldRecord) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "update_event_ignored_for_assignment_notification",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const record = payload?.record ?? payload?.new ?? null;
    const assignedEmployeeId =
      String(
        record?.assigned_to ||
          record?.assignedTo ||
          record?.assignee_id ||
          record?.assigneeId ||
          ""
      ).trim() || undefined;
    if (!assignedEmployeeId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing assigned employee id in webhook payload record." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskDescription =
      String(
        record?.description ||
          record?.task_title ||
          record?.taskTitle ||
          record?.title ||
          ""
      ).trim() || "New task assigned";

    const taskStatus = String(record?.status || "").trim().toLowerCase();
    if (taskStatus !== "pending") {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "non_pending_or_missing_status_ignored_for_assignment_notification",
          status: taskStatus || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    }

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Missing Twilio environment variables.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: employee, error: employeeError } = await adminClient
      .from("employees")
      .select("id, name, mobile")
      .eq("id", assignedEmployeeId)
      .maybeSingle();

    if (employeeError) {
      throw new Error(`Failed to fetch employee mobile: ${employeeError.message}`);
    }

    const assigneeName = employee?.name || "Team Member";
    const destinationMobile = String(employee?.mobile || "").trim();
    if (!destinationMobile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Assigned employee has no mobile number.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedTo = normalizeToE164(destinationMobile);
    if (!normalizedTo) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid employee mobile format. Expected E.164 or India 10-digit number.",
          mobile: destinationMobile,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construct the WhatsApp message
    const messageBody = `Hello ${assigneeName}, you have a new task: ${taskDescription}`;

    // Twilio WhatsApp API requires the 'whatsapp:' prefix
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    const to = `whatsapp:${normalizedTo}`;
    console.log("send-whatsapp attempt", JSON.stringify({
      mode: "webhook",
      employee_id: assignedEmployeeId,
      to,
      from,
    }));

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", from);
    formData.append("Body", messageBody);

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
      console.error("Twilio send failed", JSON.stringify({
        status: twilioResponse.status,
        code: result?.code ?? null,
        message: result?.message ?? "Failed to send WhatsApp message",
        more_info: result?.more_info ?? null,
        to,
      }));
      return new Response(
        JSON.stringify({ success: false, error: result.message || "Failed to send WhatsApp message", twilio: result }),
        { status: twilioResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("Twilio send success", JSON.stringify({ sid: result?.sid ?? null, to }));

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.sid,
        employeeId: assignedEmployeeId,
        payload_mode: "webhook",
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
