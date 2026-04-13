import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, IndianRupee, PlusCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '../../../types';
import { supabase } from '../../lib/supabase';
import {
  ACTIVITY_TYPE_OPTIONS,
  LEAD_STAGE_OPTIONS,
  calculateBalanceDue,
  formatCurrency,
  formatDateTime,
  getLeadStageLabel,
  normalizeLead,
  normalizeLeadActivity,
  resolveEmployeeName,
  toDateInputValue,
  type CRMLead,
  type CRMLeadActivity,
  type CRMLeadStage,
} from './shared';

type LeadDetailScreenProps = {
  lead: CRMLead;
  companyId: string;
  currentUser: Employee;
  employees: Employee[];
  onBack: () => void;
  onLeadUpdated: (lead: CRMLead) => void;
};

const LeadDetailScreen: React.FC<LeadDetailScreenProps> = ({
  lead,
  companyId,
  currentUser,
  employees,
  onBack,
  onLeadUpdated,
}) => {
  const [activities, setActivities] = useState<CRMLeadActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [stageUpdating, setStageUpdating] = useState(false);
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingLostReason, setSavingLostReason] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [activityNote, setActivityNote] = useState('');
  const [activityAmount, setActivityAmount] = useState('');
  const [lostReason, setLostReason] = useState(lead.lost_reason || '');
  const [paymentForm, setPaymentForm] = useState({
    totalAmount: lead.total_amount ? String(lead.total_amount) : '',
    advancePaid: lead.advance_paid ? String(lead.advance_paid) : '',
    paymentStatus: lead.payment_status || 'pending',
    paymentDueDate: toDateInputValue(lead.payment_due_date),
    paymentReminderEnabled: Boolean(lead.payment_reminder_enabled),
  });

  useEffect(() => {
    setLostReason(lead.lost_reason || '');
    setPaymentForm({
      totalAmount: lead.total_amount ? String(lead.total_amount) : '',
      advancePaid: lead.advance_paid ? String(lead.advance_paid) : '',
      paymentStatus: lead.payment_status || 'pending',
      paymentDueDate: toDateInputValue(lead.payment_due_date),
      paymentReminderEnabled: Boolean(lead.payment_reminder_enabled),
    });
  }, [lead]);

  useEffect(() => {
    let cancelled = false;

    const loadActivities = async () => {
      setLoadingActivities(true);
      try {
        const { data, error } = await supabase
          .from('lead_activities')
          .select('*')
          .eq('company_id', companyId)
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load lead activities:', error);
          if (!cancelled) {
            toast.error('Could not load lead activities.');
          }
          return;
        }

        if (!cancelled) {
          setActivities(((data || []) as Record<string, unknown>[]).map(normalizeLeadActivity));
        }
      } catch (error) {
        console.error('Unexpected error loading lead activities:', error);
      } finally {
        if (!cancelled) {
          setLoadingActivities(false);
        }
      }
    };

    void loadActivities();

    return () => {
      cancelled = true;
    };
  }, [companyId, lead.id]);

  const balanceDue = useMemo(
    () =>
      calculateBalanceDue({
        total_amount: paymentForm.totalAmount ? Number(paymentForm.totalAmount) : lead.total_amount,
        advance_paid: paymentForm.advancePaid ? Number(paymentForm.advancePaid) : lead.advance_paid,
        balance_due: lead.balance_due,
      }),
    [lead.advance_paid, lead.balance_due, lead.total_amount, paymentForm.advancePaid, paymentForm.totalAmount],
  );

  const createActivity = async (payload: {
    activity_type: string;
    note?: string | null;
    old_stage?: string | null;
    new_stage?: string | null;
    amount?: number | null;
  }) => {
    const activityPayload = {
      lead_id: lead.id,
      company_id: companyId,
      activity_type: payload.activity_type,
      note: payload.note ?? null,
      old_stage: payload.old_stage ?? null,
      new_stage: payload.new_stage ?? null,
      amount: payload.amount ?? null,
      created_by: currentUser.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('lead_activities')
      .insert(activityPayload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    const nextActivity = normalizeLeadActivity((data || {}) as Record<string, unknown>);
    setActivities((prev) => [nextActivity, ...prev]);
  };

  const handleStageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStage = event.target.value as CRMLeadStage;
    if (nextStage === lead.stage) {
      return;
    }

    setStageUpdating(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          stage: nextStage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to update lead stage:', error);
        toast.error(`Could not update stage: ${error.message}`);
        return;
      }

      const updatedLead = normalizeLead((data || {}) as Record<string, unknown>);
      onLeadUpdated(updatedLead);
      await createActivity({
        activity_type: 'stage_change',
        note: `Stage moved from ${getLeadStageLabel(lead.stage)} to ${getLeadStageLabel(nextStage)}`,
        old_stage: lead.stage,
        new_stage: nextStage,
      });
      toast.success('Stage updated.');
    } catch (error) {
      console.error('Unexpected stage update failure:', error);
      toast.error('Could not update stage.');
    } finally {
      setStageUpdating(false);
    }
  };

  const handleLogActivity = async () => {
    if (!activityNote.trim() && !activityAmount.trim()) {
      toast.error('Add a note or amount before logging activity.');
      return;
    }

    setLoggingActivity(true);
    try {
      await createActivity({
        activity_type: activityType,
        note: activityNote.trim() || null,
        amount: activityAmount.trim() ? Number(activityAmount) : null,
      });
      setActivityNote('');
      setActivityAmount('');
      setActivityType('call');
      toast.success('Activity logged.');
    } catch (error: any) {
      console.error('Failed to log activity:', error);
      toast.error(`Could not log activity: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoggingActivity(false);
    }
  };

  const handleSavePayment = async () => {
    setSavingPayment(true);
    try {
      const payload = {
        total_amount: paymentForm.totalAmount.trim() ? Number(paymentForm.totalAmount) : null,
        advance_paid: paymentForm.advancePaid.trim() ? Number(paymentForm.advancePaid) : null,
        payment_status: paymentForm.paymentStatus || null,
        payment_due_date: paymentForm.paymentDueDate ? new Date(paymentForm.paymentDueDate).toISOString() : null,
        payment_reminder_enabled: paymentForm.paymentReminderEnabled,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to save payment details:', error);
        toast.error(`Could not save payment details: ${error.message}`);
        return;
      }

      const updatedLead = normalizeLead((data || {}) as Record<string, unknown>);
      onLeadUpdated(updatedLead);
      await createActivity({
        activity_type: 'payment',
        note: `Payment status updated to ${payload.payment_status || 'pending'}`,
        amount: payload.advance_paid,
      });
      toast.success('Payment details updated.');
    } catch (error) {
      console.error('Unexpected payment update failure:', error);
      toast.error('Could not save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSaveLostReason = async () => {
    setSavingLostReason(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          lost_reason: lostReason.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to save lost reason:', error);
        toast.error(`Could not save lost reason: ${error.message}`);
        return;
      }

      onLeadUpdated(normalizeLead((data || {}) as Record<string, unknown>));
      toast.success('Lost reason updated.');
    } catch (error) {
      console.error('Unexpected lost reason failure:', error);
      toast.error('Could not save lost reason.');
    } finally {
      setSavingLostReason(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-[var(--surface)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col bg-[var(--surface)]">
        <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-slate-600"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <p className="section-kicker">CRM Lead</p>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">{lead.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{lead.requirement || 'No requirement provided yet.'}</p>
              </div>
            </div>

            <div className="min-w-[180px]">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Stage
              </label>
              <select
                value={lead.stage}
                onChange={handleStageChange}
                disabled={stageUpdating}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
              >
                {LEAD_STAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="space-y-6">
            <section className="surface-card p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoItem label="Mobile" value={lead.mobile || 'Not set'} />
                <InfoItem label="Email" value={lead.email || 'Not set'} />
                <InfoItem label="Source" value={lead.source || 'Not set'} />
                <InfoItem label="Industry" value={lead.industry || 'Not set'} />
                <InfoItem label="Assigned To" value={resolveEmployeeName(lead.assigned_to, employees)} />
                <InfoItem label="Estimated Value" value={formatCurrency(lead.estimated_value)} />
                <InfoItem label="Created At" value={formatDateTime(lead.created_at)} />
                <InfoItem label="Updated At" value={formatDateTime(lead.updated_at)} />
                <InfoItem label="Created By" value={resolveEmployeeName(lead.created_by, employees)} />
                <InfoItem label="Current Stage" value={getLeadStageLabel(lead.stage)} />
              </div>

              <div className="mt-4 grid gap-4">
                <InfoItem label="Requirement" value={lead.requirement || 'Not set'} fullWidth />
                <InfoItem label="Source Notes" value={lead.source_notes || 'Not set'} fullWidth />
              </div>
            </section>

            {lead.stage === 'won' ? (
              <section className="surface-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-[var(--accent)]" />
                  <h3 className="text-lg font-black text-slate-900">Payment Section</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Total Amount</span>
                    <input
                      type="number"
                      min="0"
                      value={paymentForm.totalAmount}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Advance Paid</span>
                    <input
                      type="number"
                      min="0"
                      value={paymentForm.advancePaid}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, advancePaid: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Payment Status</span>
                    <select
                      value={paymentForm.paymentStatus}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentStatus: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    >
                      <option value="pending">Pending</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Payment Due Date</span>
                    <input
                      type="date"
                      value={paymentForm.paymentDueDate}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentDueDate: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Balance Due</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(balanceDue)}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={paymentForm.paymentReminderEnabled}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentReminderEnabled: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[var(--accent)]"
                    />
                    Enable reminder
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSavePayment}
                  disabled={savingPayment}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingPayment ? 'Saving...' : 'Save Payment Details'}
                </button>
              </section>
            ) : null}

            {lead.stage === 'lost' ? (
              <section className="surface-card p-5">
                <h3 className="text-lg font-black text-slate-900">Lost Reason</h3>
                <textarea
                  value={lostReason}
                  onChange={(event) => setLostReason(event.target.value)}
                  rows={4}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                  placeholder="Why was this lead lost?"
                />
                <button
                  type="button"
                  onClick={handleSaveLostReason}
                  disabled={savingLostReason}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingLostReason ? 'Saving...' : 'Save Lost Reason'}
                </button>
              </section>
            ) : null}
          </div>

          <div className="space-y-6">
            <section className="surface-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-[var(--accent)]" />
                <h3 className="text-lg font-black text-slate-900">Log Activity</h3>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Activity Type</span>
                  <select
                    value={activityType}
                    onChange={(event) => setActivityType(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                  >
                    {ACTIVITY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Note</span>
                  <textarea
                    value={activityNote}
                    onChange={(event) => setActivityNote(event.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    placeholder="Add activity notes"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Amount (optional)</span>
                  <input
                    type="number"
                    min="0"
                    value={activityAmount}
                    onChange={(event) => setActivityAmount(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                    placeholder="0"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleLogActivity}
                  disabled={loggingActivity}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PlusCircle className="h-4 w-4" />
                  {loggingActivity ? 'Saving...' : 'Log Activity'}
                </button>
              </div>
            </section>

            <section className="surface-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-[var(--accent)]" />
                <h3 className="text-lg font-black text-slate-900">Activity Timeline</h3>
              </div>

              <div className="space-y-3">
                {loadingActivities ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    Loading activities...
                  </div>
                ) : activities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    No activity logged yet.
                  </div>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold capitalize text-slate-900">
                            {String(activity.activity_type || 'note').replace(/_/g, ' ')}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(activity.created_at)}</p>
                        </div>
                        {typeof activity.amount === 'number' ? (
                          <span className="rounded-full bg-[var(--accent-light)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                            {formatCurrency(activity.amount)}
                          </span>
                        ) : null}
                      </div>

                      {activity.note ? <p className="mt-3 text-sm text-slate-700">{activity.note}</p> : null}

                      {activity.old_stage || activity.new_stage ? (
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {getLeadStageLabel(activity.old_stage)} to {getLeadStageLabel(activity.new_stage)}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoItem = ({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) => (
  <div className={fullWidth ? 'sm:col-span-2' : ''}>
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{value}</p>
  </div>
);

export default LeadDetailScreen;
