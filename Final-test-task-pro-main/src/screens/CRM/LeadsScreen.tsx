import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '../../../types';
import { supabase } from '../../lib/supabase';
import AddLeadModal from './AddLeadModal';
import LeadDetailScreen from './LeadDetailScreen';
import {
  LEAD_STAGE_OPTIONS,
  formatCurrency,
  normalizeLead,
  resolveEmployeeName,
  type CRMLead,
} from './shared';

type LeadsScreenProps = {
  companyId: string;
  currentUser: Employee;
  employees: Employee[];
};

const LeadsScreen: React.FC<LeadsScreenProps> = ({ companyId, currentUser, employees }) => {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load leads:', error);
        toast.error(`Could not load leads: ${error.message}`);
        return;
      }

      setLeads(((data || []) as Record<string, unknown>[]).map(normalizeLead));
    } catch (error) {
      console.error('Unexpected lead load failure:', error);
      toast.error('Could not load leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setLeads([]);
      setLoading(false);
      return;
    }

    void loadLeads();
  }, [companyId]);

  const groupedLeads = useMemo(
    () =>
      LEAD_STAGE_OPTIONS.map((stage) => ({
        ...stage,
        leads: leads.filter((lead) => lead.stage === stage.value),
      })),
    [leads],
  );

  const handleLeadCreated = (lead: CRMLead) => {
    setLeads((prev) => [lead, ...prev]);
  };

  const handleLeadUpdated = (nextLead: CRMLead) => {
    setLeads((prev) => prev.map((lead) => (lead.id === nextLead.id ? nextLead : lead)));
    setSelectedLead((prev) => (prev?.id === nextLead.id ? nextLead : prev));
  };

  return (
    <>
      <section className="space-y-5">
        <div className="surface-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">CRM</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Lead Pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">
                Company-scoped pipeline for {currentUser.name}. Drag-and-drop is not required; use detail view to move stages.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadLeads()}
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="surface-card min-h-[240px] animate-pulse p-4" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-4">
            {groupedLeads.map((column) => (
              <div key={column.value} className="surface-card flex min-h-[240px] flex-col p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">{column.label}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                      {column.leads.length} lead{column.leads.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {column.leads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                      No leads in this stage
                    </div>
                  ) : (
                    column.leads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]/20 hover:shadow-[0_10px_24px_rgba(79,70,229,0.08)]"
                      >
                        <p className="text-sm font-black text-slate-900">{lead.name}</p>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {lead.requirement || 'Requirement not added yet.'}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="rounded-full bg-[var(--accent-light)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                            {formatCurrency(lead.estimated_value)}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {resolveEmployeeName(lead.assigned_to, employees)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setIsAddLeadOpen(true)}
        className="fixed bottom-28 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_18px_35px_rgba(79,70,229,0.28)] transition hover:scale-[1.03] sm:right-8"
        aria-label="Add lead"
      >
        <Plus className="h-6 w-6" />
      </button>

      <AddLeadModal
        isOpen={isAddLeadOpen}
        companyId={companyId}
        currentUser={currentUser}
        employees={employees}
        onClose={() => setIsAddLeadOpen(false)}
        onLeadCreated={handleLeadCreated}
      />

      {selectedLead ? (
        <LeadDetailScreen
          lead={selectedLead}
          companyId={companyId}
          currentUser={currentUser}
          employees={employees}
          onBack={() => setSelectedLead(null)}
          onLeadUpdated={handleLeadUpdated}
        />
      ) : null}
    </>
  );
};

export default LeadsScreen;
