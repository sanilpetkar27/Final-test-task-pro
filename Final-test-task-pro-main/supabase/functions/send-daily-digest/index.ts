import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const MANAGER_TEMPLATE_SID = "HX39419ae1e62d6763fa2921deab3ced55";
const STAFF_TEMPLATE_SID = "HXbb12f5f7a1737dc297b48583235ef1d1";
const TWILIO_FROM = "whatsapp:+917721909606";

type EmployeeRow = {
  id: string;
  name: string | null;
  mobile: string | null;
  role: string | null;
  company_id: string | null;
};

type TaskRow = {
  id: string;
  status: string | null;
  assignedTo?: string | null;
  assignedBy?: string | null;
  assigned_to?: string | null;
  assigned_by?: string | null;
  deadline?: number | string | null;
  completedAt?: number | string | null;
  completed_at?: number | string | null;
  createdAt?: number | string | null;
  created_at?: number | string | null;
  company_id?: string | null;
};

const normalizeToE164 = (raw: string): string | null => {
  const value = String(raw || "").trim();
  if (!value) return null;
  const cleaned = value.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+") && cleaned.length >= 8) return cleaned;
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 10) return `+91${digitsOnly}`;
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) return `+${digitsOnly}`;
  return null;
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const formatCount = (count: number): string => `${count} task${count === 1 ? "" : "s"}`;

const sendTemplate = async (params: URLSearchParams, accountSid: string, authToken: string) => {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required environment variables." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: employees, error: employeeError } = await adminClient
      .from("employees")
      .select("id,name,mobile,role,company_id");

    if (employeeError) {
      throw employeeError;
    }

    const { data: tasks, error: taskError } = await adminClient
      .from("tasks")
      .select("id,status,assignedTo,assignedBy,assigned_to,assigned_by,deadline,completedAt,completed_at,createdAt,created_at,company_id");

    if (taskError) {
      throw taskError;
    }

    const nowMs = Date.now();
    const sinceMs = nowMs - 24 * 60 * 60 * 1000;
    const tasksByCompany = new Map<string, TaskRow[]>();
    const employeeNameById = new Map<string, string>();

    (employees || []).forEach((emp) => {
      employeeNameById.set(emp.id, String(emp.name || "Team Member").trim() || "Team Member");
    });

    (tasks || []).forEach((row) => {
      const companyId = String(row.company_id || "").trim();
      if (!companyId) return;
      const bucket = tasksByCompany.get(companyId) || [];
      bucket.push(row as TaskRow);
      tasksByCompany.set(companyId, bucket);
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const toRole = (role: string | null): string => String(role || "").toLowerCase();

    for (const employee of (employees || []) as EmployeeRow[]) {
      const role = toRole(employee.role);
      const isManagerDigest = role === "manager" || role === "owner" || role === "super_admin";
      const isStaffDigest = role === "staff";
      if (!isManagerDigest && !isStaffDigest) {
        skipped += 1;
        continue;
      }

      const mobileRaw = String(employee.mobile || "").trim();
      const toE164 = normalizeToE164(mobileRaw || "");
      if (!toE164) {
        skipped += 1;
        continue;
      }

      const companyId = String(employee.company_id || "").trim();
      if (!companyId) {
        skipped += 1;
        continue;
      }

      const companyTasks = tasksByCompany.get(companyId) || [];
      const taskStatus = (value: unknown) => String(value || "").trim().toLowerCase();
      const taskAssignedTo = (row: TaskRow) => String(row.assignedTo ?? row.assigned_to ?? "").trim();
      const taskAssignedBy = (row: TaskRow) => String(row.assignedBy ?? row.assigned_by ?? "").trim();
      const deadlineMs = (row: TaskRow) => parseTimestamp(row.deadline) ?? null;
      const completedAtMs = (row: TaskRow) => parseTimestamp(row.completedAt ?? row.completed_at) ?? null;
      const createdAtMs = (row: TaskRow) => parseTimestamp(row.createdAt ?? row.created_at) ?? null;

      try {
        if (isManagerDigest) {
          const managerTasks = companyTasks.filter((task) => taskAssignedBy(task) === employee.id);
          const completedCount = managerTasks.filter((task) => {
            const completedAt = completedAtMs(task);
            return taskStatus(task.status) === "completed" && completedAt !== null && completedAt >= sinceMs;
          }).length;
          const pendingCount = managerTasks.filter((task) => {
            const status = taskStatus(task.status);
            return status === "pending" || status === "in-progress";
          }).length;
          const overdueCount = managerTasks.filter((task) => {
            const status = taskStatus(task.status);
            const deadline = deadlineMs(task);
            return status !== "completed" && deadline !== null && deadline < nowMs;
          }).length;

          const performerCounts = new Map<string, number>();
          managerTasks.forEach((task) => {
            const completedAt = completedAtMs(task);
            if (taskStatus(task.status) !== "completed" || completedAt === null || completedAt < sinceMs) return;
            const assigneeId = taskAssignedTo(task);
            if (!assigneeId) return;
            performerCounts.set(assigneeId, (performerCounts.get(assigneeId) || 0) + 1);
          });
          let topPerformerName = "No activity";
          let topCount = 0;
          for (const [assigneeId, count] of performerCounts.entries()) {
            if (count > topCount) {
              topCount = count;
              topPerformerName = employeeNameById.get(assigneeId) || "Team Member";
            }
          }

          const params = new URLSearchParams();
          params.append("From", TWILIO_FROM);
          params.append("To", `whatsapp:${toE164}`);
          params.append("ContentSid", MANAGER_TEMPLATE_SID);
          params.append(
            "ContentVariables",
            JSON.stringify({
              "1": employeeNameById.get(employee.id) || "Manager",
              "2": formatCount(completedCount),
              "3": formatCount(pendingCount),
              "4": formatCount(overdueCount),
              "5": topPerformerName,
            })
          );

          const { response, payload } = await sendTemplate(params, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
          if (!response.ok) {
            console.error("Twilio manager digest failed", response.status, payload);
            failed += 1;
          } else {
            sent += 1;
          }
          continue;
        }

        if (isStaffDigest) {
          const staffTasks = companyTasks.filter((task) => taskAssignedTo(task) === employee.id);
          const newAssignmentsCount = staffTasks.filter((task) => {
            const createdAt = createdAtMs(task);
            return createdAt !== null && createdAt >= sinceMs;
          }).length;
          const pendingCount = staffTasks.filter((task) => {
            const status = taskStatus(task.status);
            return status === "pending" || status === "in-progress";
          }).length;
          const overdueCount = staffTasks.filter((task) => {
            const status = taskStatus(task.status);
            const deadline = deadlineMs(task);
            return status !== "completed" && deadline !== null && deadline < nowMs;
          }).length;

          const params = new URLSearchParams();
          params.append("From", TWILIO_FROM);
          params.append("To", `whatsapp:${toE164}`);
          params.append("ContentSid", STAFF_TEMPLATE_SID);
          params.append(
            "ContentVariables",
            JSON.stringify({
              "1": employeeNameById.get(employee.id) || "Team Member",
              "2": formatCount(newAssignmentsCount),
              "3": formatCount(pendingCount),
              "4": formatCount(overdueCount),
            })
          );

          const { response, payload } = await sendTemplate(params, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
          if (!response.ok) {
            console.error("Twilio staff digest failed", response.status, payload);
            failed += 1;
          } else {
            sent += 1;
          }
        }
      } catch (err) {
        console.error("Digest send failed", err);
        failed += 1;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped, failed, nowMs }),
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
