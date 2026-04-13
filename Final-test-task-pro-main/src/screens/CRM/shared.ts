import type { Employee } from '../../../types';

export type CRMLeadStage =
  | 'new'
  | 'contacted'
  | 'site_visit'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'lost';

export type CRMActivityType =
  | 'call'
  | 'note'
  | 'whatsapp'
  | 'site_visit'
  | 'email'
  | 'stage_change'
  | 'payment'
  | 'follow_up';

export type CRMLead = {
  id: string;
  company_id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  source: string | null;
  source_notes: string | null;
  requirement: string | null;
  estimated_value: number | null;
  industry: string | null;
  stage: CRMLeadStage;
  assigned_to: string | null;
  total_amount: number | null;
  advance_paid: number | null;
  balance_due: number | null;
  payment_status: string | null;
  payment_due_date: string | null;
  payment_reminder_enabled: boolean;
  lost_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type CRMLeadActivity = {
  id: string;
  lead_id: string;
  company_id: string;
  activity_type: CRMActivityType | string;
  note: string | null;
  old_stage: string | null;
  new_stage: string | null;
  amount: number | null;
  created_by: string | null;
  created_at: string;
};

export type LeadUrgency =
  | { kind: 'overdue'; label: string; overdueDays: number; timestamp: number }
  | { kind: 'today'; label: string; overdueDays: 0; timestamp: number }
  | { kind: 'upcoming'; label: string; overdueDays: 0; timestamp: number }
  | { kind: 'none'; label: string; overdueDays: 0; timestamp: null };

export const LEAD_STAGE_OPTIONS: Array<{ value: CRMLeadStage; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export const ACTIVITY_TYPE_OPTIONS: Array<{ value: CRMActivityType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'note', label: 'Note' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'email', label: 'Email' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'payment', label: 'Payment' },
];

export const normalizeLeadStage = (value: unknown): CRMLeadStage => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'contacted') return 'contacted';
  if (normalized === 'site visit' || normalized === 'site_visit') return 'site_visit';
  if (normalized === 'proposal sent' || normalized === 'proposal_sent') return 'proposal_sent';
  if (normalized === 'negotiation') return 'negotiation';
  if (normalized === 'won') return 'won';
  if (normalized === 'lost') return 'lost';
  return 'new';
};

export const getLeadStageLabel = (stage: unknown): string =>
  LEAD_STAGE_OPTIONS.find((option) => option.value === normalizeLeadStage(stage))?.label || 'New';

export const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const normalizeLead = (lead: Record<string, unknown>): CRMLead => ({
  id: String(lead.id || ''),
  company_id: String(lead.company_id || ''),
  name: String(lead.name || 'Untitled Lead').trim(),
  mobile: lead.mobile ? String(lead.mobile) : null,
  email: lead.email ? String(lead.email) : null,
  source: lead.source ? String(lead.source) : null,
  source_notes: lead.source_notes ? String(lead.source_notes) : null,
  requirement: lead.requirement ? String(lead.requirement) : null,
  estimated_value: toOptionalNumber(lead.estimated_value),
  industry: lead.industry ? String(lead.industry) : null,
  stage: normalizeLeadStage(lead.stage),
  assigned_to: lead.assigned_to ? String(lead.assigned_to) : null,
  total_amount: toOptionalNumber(lead.total_amount),
  advance_paid: toOptionalNumber(lead.advance_paid),
  balance_due: toOptionalNumber(lead.balance_due),
  payment_status: lead.payment_status ? String(lead.payment_status) : null,
  payment_due_date: lead.payment_due_date ? String(lead.payment_due_date) : null,
  payment_reminder_enabled: Boolean(lead.payment_reminder_enabled),
  lost_reason: lead.lost_reason ? String(lead.lost_reason) : null,
  created_by: lead.created_by ? String(lead.created_by) : null,
  created_at: String(lead.created_at || new Date().toISOString()),
  updated_at: lead.updated_at ? String(lead.updated_at) : null,
});

export const normalizeLeadActivity = (activity: Record<string, unknown>): CRMLeadActivity => ({
  id: String(activity.id || ''),
  lead_id: String(activity.lead_id || ''),
  company_id: String(activity.company_id || ''),
  activity_type: String(activity.activity_type || 'note'),
  note: activity.note ? String(activity.note) : null,
  old_stage: activity.old_stage ? String(activity.old_stage) : null,
  new_stage: activity.new_stage ? String(activity.new_stage) : null,
  amount: toOptionalNumber(activity.amount),
  created_by: activity.created_by ? String(activity.created_by) : null,
  created_at: String(activity.created_at || new Date().toISOString()),
});

export const calculateBalanceDue = (lead: Pick<CRMLead, 'total_amount' | 'advance_paid' | 'balance_due'>): number => {
  if (typeof lead.balance_due === 'number' && Number.isFinite(lead.balance_due)) {
    return lead.balance_due;
  }

  const total = lead.total_amount || 0;
  const advance = lead.advance_paid || 0;
  return Math.max(0, total - advance);
};

export const formatCurrency = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Not set';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Not set';

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Not set';

  return new Date(parsed).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const formatLongDate = (value: Date | number | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Today';

  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
};

export const formatCompactDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Not scheduled';

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Not scheduled';

  return new Date(parsed).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const toDateTimeLocalValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';

  const date = new Date(parsed);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
};

export const getGreetingLabel = (value: Date = new Date()): string => {
  const hours = value.getHours();
  if (hours < 12) return 'morning';
  if (hours < 17) return 'afternoon';
  return 'evening';
};

export const getFirstName = (name: string | null | undefined): string => {
  const normalized = String(name || '').trim();
  if (!normalized) return 'there';
  return normalized.split(/\s+/)[0] || normalized;
};

export const getDialableMobile = (value: string | null | undefined): string => {
  return String(value || '').replace(/\D/g, '');
};

export const getWhatsAppMobile = (value: string | null | undefined): string => {
  let digits = getDialableMobile(value).replace(/^0+/, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
};

export const buildWhatsAppUrl = (value: string | null | undefined, text?: string): string | null => {
  const digits = getWhatsAppMobile(value);
  if (!digits) return null;

  const baseUrl = `https://wa.me/91${digits}`;
  if (!text) return baseUrl;
  return `${baseUrl}?text=${encodeURIComponent(text)}`;
};

export const buildTelUrl = (value: string | null | undefined): string | null => {
  const digits = getDialableMobile(value);
  return digits ? `tel:${digits}` : null;
};

export const getLeadNextFollowUpTimestamp = (lead: Pick<CRMLead, 'payment_due_date'>): number | null => {
  const parsed = Date.parse(String(lead.payment_due_date || ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getLeadUrgency = (lead: Pick<CRMLead, 'payment_due_date' | 'stage'>, nowValue: number = Date.now()): LeadUrgency => {
  if (lead.stage === 'won' || lead.stage === 'lost') {
    return { kind: 'none', label: 'Closed', overdueDays: 0, timestamp: null };
  }

  const timestamp = getLeadNextFollowUpTimestamp(lead);
  if (!timestamp) {
    return { kind: 'none', label: 'No follow-up set', overdueDays: 0, timestamp: null };
  }

  const now = new Date(nowValue);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;

  if (timestamp < startOfToday) {
    const followUpDate = new Date(timestamp);
    const startOfFollowUpDay = new Date(
      followUpDate.getFullYear(),
      followUpDate.getMonth(),
      followUpDate.getDate(),
    ).getTime();
    const overdueDays = Math.max(1, Math.floor((startOfToday - startOfFollowUpDay) / (24 * 60 * 60 * 1000)));
    return {
      kind: 'overdue',
      label: `OVERDUE ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
      overdueDays,
      timestamp,
    };
  }

  if (timestamp < startOfTomorrow) {
    return {
      kind: 'today',
      label: 'DUE TODAY',
      overdueDays: 0,
      timestamp,
    };
  }

  return {
    kind: 'upcoming',
    label: `UP NEXT ${formatCompactDateTime(new Date(timestamp).toISOString())}`,
    overdueDays: 0,
    timestamp,
  };
};

export const resolveEmployeeName = (employeeId: string | null | undefined, employees: Employee[]): string => {
  const normalizedId = String(employeeId || '').trim();
  if (!normalizedId) return 'Unassigned';

  return employees.find((employee) => employee.id === normalizedId)?.name || 'Unknown Team Member';
};
