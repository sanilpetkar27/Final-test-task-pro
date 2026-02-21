import { supabase } from '../lib/supabase';

console.log('Notification logic updated. Fail-safe mode active.');

type NotificationRecord = {
  description: string;
  assigned_to: string;
  company_id: string;
  message?: string;
  trace_id?: string;
};

const buildTraceId = (prefix: 'asg' | 'cmp'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const resolveCompanyIdForEmployee = async (employeeId: string): Promise<string | null> => {
  const normalizedEmployeeId = String(employeeId || '').trim();
  if (!normalizedEmployeeId) {
    return null;
  }

  const { data, error } = await supabase
    .from('employees')
    .select('company_id')
    .eq('id', normalizedEmployeeId)
    .maybeSingle();

  if (error) {
    console.warn('Company lookup failed for employee:', normalizedEmployeeId, error.message);
    return null;
  }

  const resolved = String((data as any)?.company_id || '').trim();
  return resolved || null;
};

const getSupabaseFunctionUrl = (functionName: string): string => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL');
  }

  return `${supabaseUrl}/functions/v1/${functionName}`;
};

const getFunctionHeaders = async (): Promise<Record<string, string>> => {
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  }

  const authClient = (supabase as any).auth;
  const session = authClient ? (await authClient.getSession())?.data?.session : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
};

const invokeFunctionViaFetch = async (functionName: string, record: NotificationRecord) => {
  const response = await fetch(getSupabaseFunctionUrl(functionName), {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ record }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return { data: payload, error: null };
};

const isUnauthorizedError = (message: string): boolean => {
  const lower = String(message || '').toLowerCase();
  return lower.includes('401') || lower.includes('unauthorized');
};

const invokeEdgeFunction = async (functionName: string, record: NotificationRecord) => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { record },
    });

    if (error) {
      if (isUnauthorizedError(String(error.message || ''))) {
        try {
          console.warn(`${functionName} invoke returned 401. Retrying via direct fetch.`);
          return await invokeFunctionViaFetch(functionName, record);
        } catch (fallbackError: any) {
          console.warn(`${functionName} fallback failed:`, fallbackError?.message || fallbackError);
          return null;
        }
      }

      console.warn(`${functionName} invoke failed:`, error.message);
      return null;
    }

    return { data, error: null };
  } catch (error: any) {
    const message = String(error?.message || error || '');

    if (isUnauthorizedError(message)) {
      try {
        console.warn(`${functionName} invoke threw 401. Retrying via direct fetch.`);
        return await invokeFunctionViaFetch(functionName, record);
      } catch (fallbackError: any) {
        console.warn(`${functionName} fallback failed:`, fallbackError?.message || fallbackError);
        return null;
      }
    }

    console.warn(`${functionName} invoke failed:`, message);
    return null;
  }
};

const invokeSendPush = async (record: NotificationRecord) => invokeEdgeFunction('send-push', record);
const invokeSendWhatsApp = async (record: NotificationRecord) => invokeEdgeFunction('send-whatsapp', record);

export const sendTaskAssignmentNotification = async (
  taskDescription: string,
  assignedToName: string,
  assignedBy: string,
  assignedToId: string,
  companyId?: string
): Promise<void> => {
  try {
    const traceId = buildTraceId('asg');
    console.log('Sending task assignment notification...', {
      traceId,
      taskDescription,
      assignedToName,
      assignedBy,
      assignedToId,
      companyId,
    });

    let tenantCompanyId = String(companyId || '').trim();
    if (!tenantCompanyId) {
      tenantCompanyId = (await resolveCompanyIdForEmployee(assignedToId)) || '';
      if (tenantCompanyId) {
        console.log(`[WA-TRACE ${traceId}] Resolved company_id from assignee row:`, tenantCompanyId);
      }
    }

    if (!tenantCompanyId) {
      console.warn(`[WA-TRACE ${traceId}] Missing company_id for assignee. Skipping notifications:`, assignedToId);
      return;
    }

    const record: NotificationRecord = {
      description: taskDescription,
      assigned_to: assignedToId,
      company_id: tenantCompanyId,
      message: `Task assigned by ${assignedBy}: ${taskDescription}`,
      trace_id: traceId,
    };

    console.log(`[WA-TRACE ${traceId}] Assignment payload:`, JSON.stringify({ record }));

    const [pushResult, whatsappResult] = await Promise.all([
      invokeSendPush(record),
      invokeSendWhatsApp(record),
    ]);

    if (pushResult) {
      console.log(`[WA-TRACE ${traceId}] Push response:`, JSON.stringify(pushResult.data, null, 2));
    }

    if (whatsappResult) {
      console.log(`[WA-TRACE ${traceId}] WhatsApp response:`, JSON.stringify(whatsappResult.data, null, 2));
    }

    if (!pushResult && !whatsappResult) {
      console.warn(`[WA-TRACE ${traceId}] Assignment notifications failed on all channels. Task is still created.`);
    }
  } catch (error) {
    console.error('Error sending task assignment notifications:', error);
  }
};

export const sendTaskCompletionNotification = async (
  taskDescription: string,
  completedByName: string,
  assignedById: string
): Promise<void> => {
  try {
    const traceId = buildTraceId('cmp');
    console.log('Sending task completion notification...', {
      traceId,
      taskDescription,
      completedByName,
      assignedById,
    });

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('company_id')
      .eq('id', assignedById)
      .maybeSingle();

    if (employeeError) {
      console.error('Supabase query error:', employeeError);
      return;
    }

    const companyId = String((employee as any)?.company_id || '').trim();
    if (!companyId) {
      console.warn('Missing company_id for assigner. Skipping notifications:', assignedById);
      return;
    }

    const record: NotificationRecord = {
      description: `Task completed by ${completedByName}: ${taskDescription}`,
      assigned_to: assignedById,
      company_id: companyId,
      message: `Task completed by ${completedByName}: ${taskDescription}`,
      trace_id: traceId,
    };

    console.log(`[WA-TRACE ${traceId}] Completion payload:`, JSON.stringify({ record }));

    const [pushResult, whatsappResult] = await Promise.all([
      invokeSendPush(record),
      invokeSendWhatsApp(record),
    ]);

    if (pushResult) {
      console.log(`[WA-TRACE ${traceId}] Push response:`, JSON.stringify(pushResult.data, null, 2));
    }

    if (whatsappResult) {
      console.log(`[WA-TRACE ${traceId}] WhatsApp response:`, JSON.stringify(whatsappResult.data, null, 2));
    }

    if (!pushResult && !whatsappResult) {
      console.warn(`[WA-TRACE ${traceId}] Completion notifications failed on all channels. Task update still succeeded.`);
    }
  } catch (error) {
    console.error('Error sending task completion notifications:', error);
  }
};
