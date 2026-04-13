import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareMore, Phone, Plus, RefreshCcw, SquarePen } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '../../../types';
import { supabase } from '../../lib/supabase';
import AddLeadModal from './AddLeadModal';
import LeadDetailScreen from './LeadDetailScreen';
import {
  buildTelUrl,
  buildWhatsAppUrl,
  formatCompactDateTime,
  formatLongDate,
  getFirstName,
  getGreetingLabel,
  getLeadUrgency,
  getLeadNextFollowUpTimestamp,
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

  const actNowLeads = useMemo(() => {
    return [...leads]
      .filter((lead) => {
        const urgency = getLeadUrgency(lead);
        return urgency.kind === 'overdue' || urgency.kind === 'today';
      })
      .sort((left, right) => {
        const leftTs = getLeadNextFollowUpTimestamp(left) || Number.MAX_SAFE_INTEGER;
        const rightTs = getLeadNextFollowUpTimestamp(right) || Number.MAX_SAFE_INTEGER;
        return leftTs - rightTs;
      });
  }, [leads]);

  const remainingLeads = useMemo(() => {
    const selectedIds = new Set(actNowLeads.map((lead) => lead.id));
    return [...leads]
      .filter((lead) => !selectedIds.has(lead.id))
      .sort((left, right) => {
        const leftTs = getLeadNextFollowUpTimestamp(left);
        const rightTs = getLeadNextFollowUpTimestamp(right);

        if (leftTs && rightTs) {
          return leftTs - rightTs;
        }
        if (leftTs) return -1;
        if (rightTs) return 1;

        return Date.parse(right.updated_at || right.created_at) - Date.parse(left.updated_at || left.created_at);
      });
  }, [actNowLeads, leads]);

  const handleLeadCreated = (lead: CRMLead) => {
    setLeads((prev) => [lead, ...prev]);
  };

  const handleLeadUpdated = (nextLead: CRMLead) => {
    setLeads((prev) => prev.map((lead) => (lead.id === nextLead.id ? nextLead : lead)));
    setSelectedLead((prev) => (prev?.id === nextLead.id ? nextLead : prev));
  };

  const openLead = (lead: CRMLead) => {
    setSelectedLead(lead);
  };

  const greeting = getGreetingLabel();
  const firstName = getFirstName(currentUser.name);

  return (
    <>
      <section className="space-y-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">CRM Dashboard</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Good {greeting}, {firstName}.
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{formatLongDate(new Date())}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast('Open a lead to draft or send messages.')}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent)]/20 hover:text-[var(--accent)]"
              aria-label="Messages"
            >
              <MessageSquareMore className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsAddLeadOpen(true)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_16px_32px_rgba(79,70,229,0.24)] transition hover:scale-[1.02]"
              aria-label="Add lead"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Act Now</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Due follow-ups needing attention</h3>
              <p className="mt-1 text-sm text-slate-500">
                Overdue and due-today leads are surfaced first.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadLeads()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
              aria-label="Refresh leads"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-[1.6rem] border border-slate-100 bg-slate-100/70" />
              ))
            ) : actNowLeads.length === 0 ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                <p className="text-base font-bold text-slate-900">Nothing urgent right now.</p>
                <p className="mt-2 text-sm text-slate-500">Set a next follow-up inside lead details to populate this queue.</p>
              </div>
            ) : (
              actNowLeads.map((lead) => (
                <LeadActionCard
                  key={lead.id}
                  lead={lead}
                  employees={employees}
                  onOpen={() => openLead(lead)}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Remaining Leads</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Pipeline</h3>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-[1.5rem] border border-slate-100 bg-slate-100/70" />
              ))}
            </div>
          ) : remainingLeads.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
              <p className="text-base font-bold text-slate-900">No remaining leads.</p>
              <p className="mt-2 text-sm text-slate-500">Add a lead to start tracking follow-ups here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {remainingLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => openLead(lead)}
                  className="w-full rounded-[1.6rem] border border-slate-200/80 bg-white px-4 py-4 text-left shadow-[0_14px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-950">{lead.name}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                        {lead.requirement || 'Requirement not added yet.'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                      {resolveEmployeeName(lead.assigned_to, employees)}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Next Follow-Up</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatCompactDateTime(lead.payment_due_date)}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                      <SquarePen className="h-4 w-4" />
                      Update
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

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

const LeadActionCard = ({
  lead,
  employees,
  onOpen,
}: {
  lead: CRMLead;
  employees: Employee[];
  onOpen: () => void;
}) => {
  const urgency = getLeadUrgency(lead);
  const telUrl = buildTelUrl(lead.mobile);
  const whatsAppUrl = buildWhatsAppUrl(
    lead.mobile,
    `Hi ${lead.name}, following up regarding ${lead.requirement || 'your requirement'}.`,
  );

  const urgencyClassName =
    urgency.kind === 'overdue'
      ? 'bg-rose-50 text-rose-600'
      : 'bg-amber-50 text-amber-700';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.8rem] border border-slate-200/80 bg-white px-5 py-5 text-left shadow-[0_16px_34px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[1.35rem] font-black tracking-tight text-slate-950">{lead.name}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">
            {lead.requirement || 'Requirement not added yet.'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${urgencyClassName}`}>
          {urgency.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
        <span>{resolveEmployeeName(lead.assigned_to, employees)}</span>
        <span className="text-slate-300">/</span>
        <span>{formatCompactDateTime(lead.payment_due_date)}</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <ActionChip
          label="Call"
          icon={<Phone className="h-4 w-4" />}
          onClick={(event) => {
            event.stopPropagation();
            if (!telUrl) {
              toast.error('Mobile number not available.');
              return;
            }
            window.location.href = telUrl;
          }}
          className="bg-indigo-50 text-indigo-700"
        />
        <ActionChip
          label="WhatsApp"
          onClick={(event) => {
            event.stopPropagation();
            if (!whatsAppUrl) {
              toast.error('Mobile number not available.');
              return;
            }
            window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
          }}
          className="bg-emerald-50 text-[#10B981]"
        />
        <ActionChip
          label="Update"
          icon={<SquarePen className="h-4 w-4" />}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="bg-violet-50 text-violet-700"
        />
      </div>
    </button>
  );
};

const ActionChip = ({
  label,
  icon,
  className,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  className: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold ${className}`}
  >
    {icon}
    {label}
  </button>
);

export default LeadsScreen;
