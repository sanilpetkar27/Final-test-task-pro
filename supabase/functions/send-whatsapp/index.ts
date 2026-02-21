import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WhatsAppRecord = {
  description?: string;
  assigned_to?: string;
  company_id?: string;
  message?: string;
  to_mobile?: string;
};

const normalizeCountryCode = (value: string): string => {
  const trimmed = String(value || "").trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "+91";
};

const toE164 = (value: string, defaultCountryCode: string): string | null => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const withoutPrefix = raw.replace(/^whatsapp:/i, "").trim();
  const cleaned = withoutPrefix.replace(/[^\d+]/g, "");

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith("+")) {
    return `+${cleaned.replace(/[^\d]/g, "")}`;
  }

  let digits = cleaned.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) {
    return null;
  }

  const normalizedCode = normalizeCountryCode(defaultCountryCode);
  const codeDigits = normalizedCode.slice(1);

  if (digits.startsWith(codeDigits)) {
    return `+${digits}`;
  }

  return `${normalizedCode}${digits}`;
};

const ensureWhatsAppPrefix = (value: string): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return /^whatsapp:/i.test(trimmed) ? trimmed : `whatsapp:${trimmed}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const record: WhatsAppRecord = payload?.record ?? payload ?? {};
    console.log("send-whatsapp payload:", JSON.stringify(record));

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromRaw = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const defaultCountryCode = Deno.env.get("TWILIO_DEFAULT_COUNTRY_CODE") || "+91";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!accountSid || !authToken || !fromRaw) {
      throw new Error("Missing required Twilio secrets");
    }

    const from = ensureWhatsAppPrefix(fromRaw);
    if (!from) {
      throw new Error("Invalid TWILIO_WHATSAPP_FROM secret");
    }

    if (!record.to_mobile && (!record.assigned_to || !record.company_id)) {
      return new Response(
        JSON.stringify({
          error: "Missing recipient information. Provide to_mobile or both assigned_to and company_id.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let recipientMobile = String(record.to_mobile || "").trim();

    if (!recipientMobile) {
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      }

      const encodedAssigneeId = encodeURIComponent(String(record.assigned_to || "").trim());
      const encodedCompanyId = encodeURIComponent(String(record.company_id || "").trim());
      const employeeUrl =
        `${supabaseUrl}/rest/v1/employees` +
        `?id=eq.${encodedAssigneeId}&company_id=eq.${encodedCompanyId}&select=id,name,mobile&limit=1`;

      const employeeRes = await fetch(employeeUrl, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      });

      if (!employeeRes.ok) {
        const details = await employeeRes.text().catch(() => "");
        console.error("send-whatsapp employee lookup failed:", details);
        throw new Error("Failed to fetch employee mobile");
      }

      const employees = await employeeRes.json();
      if (!Array.isArray(employees) || employees.length === 0) {
        return new Response(JSON.stringify({ error: "Employee not found for WhatsApp" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipientMobile = String(employees[0]?.mobile || "").trim();
    }

    const recipientE164 = toE164(recipientMobile, defaultCountryCode);
    if (!recipientE164) {
      return new Response(JSON.stringify({ error: "Recipient mobile is empty or invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = ensureWhatsAppPrefix(recipientE164);
    const body = String(record.message || record.description || "Task update").trim();
    if (!body) {
      return new Response(JSON.stringify({ error: "Message body is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = new URLSearchParams();
    formData.set("From", from);
    formData.set("To", to);
    formData.set("Body", body);

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      }
    );

    const twilioData = await twilioRes.json().catch(() => ({}));
    if (!twilioRes.ok) {
      console.error("Twilio API error:", twilioRes.status, twilioData);
      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message",
          status: twilioRes.status,
          details: twilioData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        to,
        from,
        sid: twilioData?.sid ?? null,
        status: twilioData?.status ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-whatsapp fatal error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
