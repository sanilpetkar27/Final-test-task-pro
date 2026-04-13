import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '../../../types';
import { supabase } from '../../lib/supabase';
import { normalizeLead, type CRMLead } from './shared';

type AddLeadModalProps = {
  isOpen: boolean;
  companyId: string;
  currentUser: Employee;
  employees: Employee[];
  onClose: () => void;
  onLeadCreated: (lead: CRMLead) => void;
};

const emptyForm = {
  name: '',
  mobile: '',
  email: '',
  source: '',
  sourceNotes: '',
  requirement: '',
  estimatedValue: '',
  industry: '',
  assignedTo: '',
};

const AddLeadModal: React.FC<AddLeadModalProps> = ({
  isOpen,
  companyId,
  currentUser,
  employees,
  onClose,
  onLeadCreated,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isOpen) {
      setForm(emptyForm);
      setSubmitting(false);
    }
  }, [isOpen]);

  const assignableEmployees = useMemo(
    () => employees.filter((employee) => String(employee.company_id || '').trim() === companyId),
    [companyId, employees],
  );

  if (!isOpen) {
    return null;
  }

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const leadName = form.name.trim();
    if (!leadName) {
      toast.error('Lead name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        company_id: companyId,
        name: leadName,
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        source: form.source.trim() || null,
        source_notes: form.sourceNotes.trim() || null,
        requirement: form.requirement.trim() || null,
        estimated_value: form.estimatedValue.trim() ? Number(form.estimatedValue) : null,
        industry: form.industry.trim() || null,
        stage: 'new',
        assigned_to: form.assignedTo.trim() || null,
        total_amount: null,
        advance_paid: null,
        payment_status: null,
        payment_due_date: null,
        payment_reminder_enabled: false,
        lost_reason: null,
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('leads')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to create lead:', error);
        toast.error(`Could not create lead: ${error.message}`);
        return;
      }

      onLeadCreated(normalizeLead((data || {}) as Record<string, unknown>));
      toast.success('Lead created.');
      onClose();
    } catch (error) {
      console.error('Unexpected lead creation failure:', error);
      toast.error('Could not create lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 px-4 py-6 sm:items-center">
      <div className="w-full max-w-2xl rounded-[2rem] border border-[var(--border)] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="section-kicker">CRM</p>
            <h2 className="text-xl font-black tracking-tight text-slate-900">Add Lead</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2 text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Lead Name</span>
              <input
                value={form.name}
                onChange={(event) => handleChange('name', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Enter lead name"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Mobile</span>
              <input
                value={form.mobile}
                onChange={(event) => handleChange('mobile', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Enter mobile number"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => handleChange('email', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Enter email"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Source</span>
              <input
                value={form.source}
                onChange={(event) => handleChange('source', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Referral, website, walk-in..."
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Requirement</span>
              <textarea
                value={form.requirement}
                onChange={(event) => handleChange('requirement', event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="What does the lead need?"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Estimated Value</span>
              <input
                type="number"
                min="0"
                value={form.estimatedValue}
                onChange={(event) => handleChange('estimatedValue', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="0"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Industry</span>
              <input
                value={form.industry}
                onChange={(event) => handleChange('industry', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Automotive, retail..."
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Assign To</span>
              <select
                value={form.assignedTo}
                onChange={(event) => handleChange('assignedTo', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
              >
                <option value="">Unassigned</option>
                {assignableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Source Notes</span>
              <textarea
                value={form.sourceNotes}
                onChange={(event) => handleChange('sourceNotes', event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
                placeholder="Any context on the lead source"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLeadModal;
