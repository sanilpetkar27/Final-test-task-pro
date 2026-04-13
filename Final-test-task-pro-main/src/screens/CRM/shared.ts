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

export const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
};

export const resolveEmployeeName = (employeeId: string | null | undefined, employees: Employee[]): string => {
  const normalizedId = String(employeeId || '').trim();
  if (!normalizedId) return 'Unassigned';

  return employees.find((employee) => employee.id === normalizedId)?.name || 'Unknown Team Member';
};
