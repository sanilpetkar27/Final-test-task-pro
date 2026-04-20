import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ImagePlus,
  ClipboardPaste,
  MessageSquareText,
  Mic,
  Phone,
  Save,
  Send,
  X,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '../../../types';
import { supabase } from '../../lib/supabase';
import {
  ACTIVITY_TYPE_OPTIONS,
  LEAD_STAGE_OPTIONS,
  buildTelUrl,
  buildWhatsAppUrl,
  calculateBalanceDue,
  formatCompactDateTime,
  formatCurrency,
  formatDateTime,
  getLeadStageLabel,
  normalizeLead,
  normalizeLeadActivity,
  resolveEmployeeName,
  toDateTimeLocalValue,
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

const GEMINI_API_KEY = 'AIzaSyAdOHVLF40eNJbdmc_0D1XkEZIGYu4OOIU';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

const geminiRequest = async (body: object): Promise<string> => {
  const isRateLimit = (msg: string) =>
    msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('429');
  const isOverloaded = (msg: string, status: number) =>
    msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overloaded') || status === 503;

  const parseRetrySeconds = (msg: string): number => {
    const match = msg.match(/retry in ([\d.]+)s/i);
    return match ? Math.ceil(parseFloat(match[1])) + 2 : 60;
  };

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = await response.json();
    let errMsg: string = data?.error?.message || '';

    // Rate limited — auto-wait and retry once on the same model
    if (!response.ok && isRateLimit(errMsg)) {
      const waitSecs = parseRetrySeconds(errMsg);
      toast.info(`Rate limit hit. Auto-retrying in ${waitSecs}s...`);
      await new Promise((r) => setTimeout(r, waitSecs * 1000));
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      data = await response.json();
      errMsg = data?.error?.message || '';
    }

    if (!response.ok) {
      if (isOverloaded(errMsg, response.status)) {
        console.warn(`[Gemini] ${model} overloaded, trying next model...`);
        continue;
      }
      if (isRateLimit(errMsg)) {
        const waitSecs = parseRetrySeconds(errMsg);
        throw new Error(`Rate limit hit. Please wait ${waitSecs}s and try again.`);
      }
      throw new Error(errMsg || 'API Error');
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  throw new Error('All Gemini models are currently busy. Please try again in a moment.');
};

const buildDraftMessage = (lead: CRMLead): string =>
  `Hi ${lead.name},\n\nFollowing up regarding ${lead.requirement || 'your requirement'}.\nLet me know a convenient time to connect.`;

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
  const [savingEdit, setSavingEdit] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [activityNote, setActivityNote] = useState('');
  const [activityAmount, setActivityAmount] = useState('');
  const [lostReason, setLostReason] = useState(lead.lost_reason || '');
  const [draftMessage, setDraftMessage] = useState(buildDraftMessage(lead));
  const [voiceNote, setVoiceNote] = useState('');
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isVoiceNoteOpen, setIsVoiceNoteOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [improvingNote, setImprovingNote] = useState(false);
  const [rewritingDraft, setRewritingDraft] = useState(false);
  const [isChatDumpOpen, setIsChatDumpOpen] = useState(false);
  const [chatDumpText, setChatDumpText] = useState('');
  const [parsingChat, setParsingChat] = useState(false);
  const [chatDumpResult, setChatDumpResult] = useState('');
  const [isScreenshotOCROpen, setIsScreenshotOCROpen] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    totalAmount: lead.total_amount ? String(lead.total_amount) : '',
    newPaymentAmount: '',
    paymentStatus: lead.payment_status || 'pending',
    paymentDueDate: toDateTimeLocalValue(lead.payment_due_date),
    paymentReminderEnabled: Boolean(lead.payment_reminder_enabled),
  });
  const [editForm, setEditForm] = useState({
    name: lead.name || '',
    mobile: lead.mobile || '',
    email: lead.email || '',
    source: lead.source || '',
    sourceNotes: lead.source_notes || '',
    requirement: lead.requirement || '',
    industry: lead.industry || '',
    estimatedValue: lead.estimated_value ? String(lead.estimated_value) : '',
    assignedTo: lead.assigned_to || '',
  });

  useEffect(() => {
    setLostReason(lead.lost_reason || '');
    setDraftMessage(buildDraftMessage(lead));
    setPaymentForm({
      totalAmount: lead.total_amount ? String(lead.total_amount) : '',
      newPaymentAmount: '',
      paymentStatus: lead.payment_status || 'pending',
      paymentDueDate: toDateTimeLocalValue(lead.payment_due_date),
      paymentReminderEnabled: Boolean(lead.payment_reminder_enabled),
    });
    setEditForm({
      name: lead.name || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      source: lead.source || '',
      sourceNotes: lead.source_notes || '',
      requirement: lead.requirement || '',
      industry: lead.industry || '',
      estimatedValue: lead.estimated_value ? String(lead.estimated_value) : '',
      assignedTo: lead.assigned_to || '',
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
          if (!cancelled) toast.error('Could not load lead activities.');
          return;
        }

        if (!cancelled) {
          setActivities(((data || []) as Record<string, unknown>[]).map(normalizeLeadActivity));
        }
      } catch (error) {
        console.error('Unexpected error loading lead activities:', error);
      } finally {
        if (!cancelled) setLoadingActivities(false);
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
        advance_paid: (lead.advance_paid || 0) + (paymentForm.newPaymentAmount ? Number(paymentForm.newPaymentAmount) : 0),
        balance_due: lead.balance_due,
      }),
    [lead.advance_paid, lead.balance_due, lead.total_amount, paymentForm.newPaymentAmount, paymentForm.totalAmount],
  );
  const timelineActivities = useMemo(() => [...activities].reverse(), [activities]);
  const telUrl = buildTelUrl(lead.mobile);
  const whatsAppUrl = buildWhatsAppUrl(lead.mobile, draftMessage);

  const createActivity = async (payload: {
    activity_type: string;
    note?: string | null;
    old_stage?: string | null;
    new_stage?: string | null;
    amount?: number | null;
  }) => {
    const { data, error } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: lead.id,
        company_id: companyId,
        activity_type: payload.activity_type,
        note: payload.note ?? null,
        old_stage: payload.old_stage ?? null,
        new_stage: payload.new_stage ?? null,
        amount: payload.amount ?? null,
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;
    setActivities((prev) => [normalizeLeadActivity((data || {}) as Record<string, unknown>), ...prev]);
  };

  const updateStage = async (nextStage: CRMLeadStage) => {
    if (nextStage === lead.stage) return;

    setStageUpdating(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({ stage: nextStage, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to update lead stage:', error);
        toast.error(`Could not update stage: ${error.message}`);
        return;
      }

      onLeadUpdated(normalizeLead((data || {}) as Record<string, unknown>));
      await createActivity({
        activity_type: 'stage_change',
        note: `Stage moved from ${getLeadStageLabel(lead.stage)} to ${getLeadStageLabel(nextStage)}`,
        old_stage: lead.stage,
        new_stage: nextStage,
      });
      toast.success(nextStage === 'won' ? 'Lead marked as closed.' : 'Status updated.');
    } catch (error) {
      console.error('Unexpected stage update failure:', error);
      toast.error('Could not update stage.');
    } finally {
      setStageUpdating(false);
    }
  };

  const handleAIImproveNote = async () => {
    if (!activityNote.trim()) {
      toast.error('Please enter some text to improve.');
      return;
    }
    setImprovingNote(true);
    const toastId = toast.loading('AI is analyzing your note...');
    try {
      const prompt = `You are a professional CRM assistant. Improve the following quick note into a single polished, professional business log entry. CRITICAL RULE: DO NOT provide options. DO NOT include any conversational text like "Here is an option". Output ONLY the exact final revised sentence and absolutely nothing else. Here is the raw note: "${activityNote.trim()}"`;
      const result = await geminiRequest({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } });
      setActivityNote(result.trim());
      toast.success('Note enhanced!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('AI Failed: ' + err.message, { id: toastId });
    } finally {
      setImprovingNote(false);
    }
  };

  const handleAIRewriteDraft = async () => {
    setRewritingDraft(true);
    const toastId = toast.loading('AI is composing the perfect WhatsApp pitch...');
    try {
      const prompt = `You are an expert sales representative. Draft a friendly, concise, and professional WhatsApp follow-up message to a lead named "${lead.name}". Their exact requirement/interest is: "${lead.requirement || 'unknown products'}". My name is ${currentUser.name}. Keep it under 3 short paragraphs. Include a gentle call to action. Do not use placeholders like [Insert Link]. Make it sound human and persuasive. Do not use emojis aggressively. CRITICAL RULE: DO NOT include any conversational text like "Here is your draft:". Output ONLY the exact generated WhatsApp message text and absolutely nothing else.`;
      const result = await geminiRequest({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } });
      setDraftMessage(result.trim());
      toast.success('Message rewritten!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('AI Failed: ' + err.message, { id: toastId });
    } finally {
      setRewritingDraft(false);
    }
  };

  const handleAIChatDump = async () => {
    if (!chatDumpText.trim()) {
      toast.error('Paste a WhatsApp conversation first.');
      return;
    }
    setParsingChat(true);
    setChatDumpResult('');
    const toastId = toast.loading('AI is reading the conversation...');
    try {
      const prompt = `You are a CRM assistant analyzing a pasted WhatsApp conversation about a business lead named "${lead.name}". Extract the following in a clean, short bullet format:\n- **Summary**: 1-2 sentence summary of the conversation\n- **Requirement**: What the client wants\n- **Budget**: Any budget/price mentioned\n- **Next Step**: Suggested follow-up action\n- **Sentiment**: Positive / Neutral / Negative\n\nCRITICAL: Output ONLY the bullet points. No introductory text.\n\nConversation:\n${chatDumpText.trim()}`;
      const result = await geminiRequest({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } });
      setChatDumpResult(result.trim());
      toast.success('Conversation analyzed!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('AI Failed: ' + err.message, { id: toastId });
    } finally {
      setParsingChat(false);
    }
  };

  const handleLogChatDumpAsActivity = async () => {
    if (!chatDumpResult.trim()) return;
    setLoggingActivity(true);
    try {
      await createActivity({
        activity_type: 'whatsapp',
        note: `[AI Chat Summary]\n${chatDumpResult}`,
      });
      toast.success('Chat summary logged to timeline!');
      setChatDumpText('');
      setChatDumpResult('');
      setIsChatDumpOpen(false);
    } catch (err: any) {
      toast.error('Could not log activity: ' + err.message);
    } finally {
      setLoggingActivity(false);
    }
  };

  const handleScreenshotOCR = async (file: File) => {
    setOcrProcessing(true);
    setOcrResult('');
    const toastId = toast.loading('AI is reading your screenshot...');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || 'image/png';
      const prompt = `You are a CRM assistant. This is a screenshot of a WhatsApp conversation about a business lead named "${lead.name}". Read the text in the image and extract:\n- **Summary**: 1-2 sentence summary\n- **Requirement**: What the client wants\n- **Budget**: Any budget/price mentioned\n- **Next Step**: Suggested follow-up action\n- **Sentiment**: Positive / Neutral / Negative\n\nCRITICAL: Output ONLY the bullet points. No introductory text.`;
      const result = await geminiRequest({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0.3 },
      });
      setOcrResult(result.trim());
      toast.success('Screenshot analyzed!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('AI Failed: ' + err.message, { id: toastId });
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleLogOCRAsActivity = async () => {
    if (!ocrResult.trim()) return;
    setLoggingActivity(true);
    try {
      await createActivity({
        activity_type: 'whatsapp',
        note: `[AI Screenshot Summary]\n${ocrResult}`,
      });
      toast.success('Screenshot summary logged to timeline!');
      setOcrResult('');
      setIsScreenshotOCROpen(false);
    } catch (err: any) {
      toast.error('Could not log activity: ' + err.message);
    } finally {
      setLoggingActivity(false);
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
      setActivityType('call');
      setActivityNote('');
      setActivityAmount('');
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
      const addedPayment = paymentForm.newPaymentAmount.trim() ? Number(paymentForm.newPaymentAmount) : 0;
      const newAdvancePaid = (lead.advance_paid || 0) + addedPayment;

      const payload = {
        total_amount: paymentForm.totalAmount.trim() ? Number(paymentForm.totalAmount) : null,
        advance_paid: newAdvancePaid,
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

      onLeadUpdated(normalizeLead((data || {}) as Record<string, unknown>));
      
      if (addedPayment > 0) {
        await createActivity({
          activity_type: 'payment',
          note: `Payment received in phase. Status: ${payload.payment_status || 'pending'}`,
          amount: addedPayment,
        });
      } else {
        await createActivity({
          activity_type: 'payment',
          note: `Payment terms updated to ${payload.payment_status || 'pending'}`,
        });
      }
      
      setPaymentForm(prev => ({ ...prev, newPaymentAmount: '' }));
      toast.success('Payment details updated.');
    } catch (error) {
      console.error('Unexpected payment update failure:', error);
      toast.error('Could not save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleReschedule = async () => {
    if (!paymentForm.paymentDueDate) {
      toast.error('Select a follow-up date and time.');
      return;
    }

    setSavingPayment(true);
    try {
      const nextFollowUpAt = new Date(paymentForm.paymentDueDate).toISOString();
      const { data, error } = await supabase
        .from('leads')
        .update({ payment_due_date: nextFollowUpAt, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to reschedule follow-up:', error);
        toast.error(`Could not reschedule follow-up: ${error.message}`);
        return;
      }

      onLeadUpdated(normalizeLead((data || {}) as Record<string, unknown>));
      await createActivity({
        activity_type: 'follow_up',
        note: `Next follow-up scheduled for ${formatDateTime(nextFollowUpAt)}`,
      });
      setIsRescheduleOpen(false);
      toast.success('Next follow-up updated.');
    } catch (error) {
      console.error('Unexpected follow-up update failure:', error);
      toast.error('Could not reschedule follow-up.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSaveLostReason = async () => {
    setSavingLostReason(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({ lost_reason: lostReason.trim() || null, updated_at: new Date().toISOString() })
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

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('Lead name is required.');
      return;
    }

    setSavingEdit(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          name: editForm.name.trim(),
          mobile: editForm.mobile.trim() || null,
          email: editForm.email.trim() || null,
          source: editForm.source.trim() || null,
          source_notes: editForm.sourceNotes.trim() || null,
          requirement: editForm.requirement.trim() || null,
          industry: editForm.industry.trim() || null,
          estimated_value: editForm.estimatedValue.trim() ? Number(editForm.estimatedValue) : null,
          assigned_to: editForm.assignedTo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .eq('company_id', companyId)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to update lead:', error);
        toast.error(`Could not update lead: ${error.message}`);
        return;
      }

      onLeadUpdated(normalizeLead((data || {}) as Record<string, unknown>));
      setIsEditOpen(false);
      toast.success('Lead updated.');
    } catch (error) {
      console.error('Unexpected lead update failure:', error);
      toast.error('Could not update lead.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftMessage);
      toast.success('Draft copied.');
    } catch {
      toast.error('Could not copy draft.');
    }
  };

  const handleSaveVoiceNote = async () => {
    if (!voiceNote.trim()) {
      toast.error('Add a note first.');
      return;
    }

    setLoggingActivity(true);
    try {
      await createActivity({ activity_type: 'note', note: voiceNote.trim() });
      setVoiceNote('');
      setIsVoiceNoteOpen(false);
      toast.success('Voice note added.');
    } catch (error: any) {
      console.error('Failed to add voice note:', error);
      toast.error(`Could not save note: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoggingActivity(false);
    }
  };

  const handleStartRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in your browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceNote((prev) => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.onerror = () => {
      toast.error('Voice capture failed. Try again.');
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);

    recognition.start();
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-slate-950/25 backdrop-blur-[2px]">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl items-end justify-center sm:items-center">
          <div className="relative flex h-[95vh] w-full flex-col overflow-hidden rounded-t-[2.25rem] bg-[#F8FAFC] shadow-[0_30px_80px_rgba(15,23,42,0.16)] sm:h-[92vh] sm:max-w-4xl sm:rounded-[2rem]">
            <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/92 px-5 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-[2rem] font-black tracking-tight text-slate-950">{lead.name}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">{lead.mobile || 'Mobile not added'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.16em] text-slate-600"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                    aria-label="Close lead details"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="space-y-5">
                <section className="rounded-[1.9rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Requirement</p>
                  <p className="mt-3 text-[1.75rem] font-black tracking-tight text-slate-950">
                    {lead.requirement || 'Requirement not added yet.'}
                  </p>
                  <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                    <Field label="Status">
                      <select
                        value={lead.stage}
                        onChange={(event) => void updateStage(event.target.value as CRMLeadStage)}
                        disabled={stageUpdating}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-900 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                      >
                        {LEAD_STAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Next Follow-Up">
                      <button
                        type="button"
                        onClick={() => setIsRescheduleOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                      >
                        <span className="text-sm font-semibold text-slate-800">{formatCompactDateTime(lead.payment_due_date)}</span>
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                      </button>
                    </Field>
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-3">
                  <ActionSquare
                    label="Draft Message"
                    icon={<MessageSquareText className="h-5 w-5" />}
                    className="border-[#A7F3D0] bg-white text-[#047857]"
                    onClick={() => setIsDraftOpen(true)}
                  />
                  <ActionSquare
                    label="Call"
                    icon={<Phone className="h-5 w-5" />}
                    className="border-[#A7F3D0] bg-white text-[#047857]"
                    onClick={() => {
                      if (!telUrl) {
                        toast.error('Mobile number not available.');
                        return;
                      }
                      window.location.href = telUrl;
                    }}
                  />
                  <ActionSquare
                    label="Reschedule"
                    icon={<CalendarDays className="h-5 w-5" />}
                    className="border-slate-200 bg-white text-slate-700"
                    onClick={() => setIsRescheduleOpen(true)}
                  />
                  <ActionSquare
                    label="Close Deal"
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    className="border-[#10B981] bg-[#10B981] text-white"
                    onClick={() => void updateStage('won')}
                  />
                </section>

                <section className="rounded-[1.9rem] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 px-5 py-5 shadow-[0_16px_34px_rgba(139,92,246,0.08)]">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-violet-500" />
                    <h3 className="text-lg font-black text-slate-950">WhatsApp AI Tools</h3>
                  </div>
                  <p className="text-sm text-slate-500">Parse conversations or screenshots instantly with AI — zero manual data entry.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsChatDumpOpen(true)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-5 text-center transition hover:border-violet-400 hover:shadow-md"
                    >
                      <ClipboardPaste className="h-7 w-7 text-violet-500" />
                      <span className="text-sm font-bold text-slate-800">Paste Chat</span>
                      <span className="text-[11px] text-slate-400">Copy from WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScreenshotOCROpen(true)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-fuchsia-200 bg-white px-4 py-5 text-center transition hover:border-fuchsia-400 hover:shadow-md"
                    >
                      <ImagePlus className="h-7 w-7 text-fuchsia-500" />
                      <span className="text-sm font-bold text-slate-800">Screenshot</span>
                      <span className="text-[11px] text-slate-400">Upload & OCR</span>
                    </button>
                  </div>
                </section>

                {lead.stage === 'won' ? (
                  <section className="rounded-[1.9rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Deal Details</p>
                        <h3 className="mt-2 text-lg font-black text-slate-950">Payment</h3>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#10B981]">
                        Balance {formatCurrency(balanceDue)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field label="Total Amount">
                        <input type="number" min="0" value={paymentForm.totalAmount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, totalAmount: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" />
                      </Field>
                      <Field label={`Total Received: ${formatCurrency(lead.advance_paid || 0)}`}>
                        <input type="number" min="0" value={paymentForm.newPaymentAmount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, newPaymentAmount: event.target.value }))} placeholder="Log new payment amount..." className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" />
                      </Field>
                      <Field label="Payment Status">
                        <select value={paymentForm.paymentStatus} onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentStatus: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]">
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </Field>
                      <Field label="Reminder">
                        <label className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                          <input type="checkbox" checked={paymentForm.paymentReminderEnabled} onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentReminderEnabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-[var(--accent)]" />
                          Enable reminder
                        </label>
                      </Field>
                    </div>
                    <button type="button" onClick={() => void handleSavePayment()} disabled={savingPayment} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      {savingPayment ? 'Saving...' : 'Save Payment Details'}
                    </button>
                  </section>
                ) : null}

                {lead.stage === 'lost' ? (
                  <section className="rounded-[1.9rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                    <Field label="Lost Reason">
                      <textarea value={lostReason} onChange={(event) => setLostReason(event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="Why was this lead lost?" />
                    </Field>
                    <button type="button" onClick={() => void handleSaveLostReason()} disabled={savingLostReason} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      {savingLostReason ? 'Saving...' : 'Save Lost Reason'}
                    </button>
                  </section>
                ) : null}

                <section className="rounded-[1.9rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <div className="mb-4 flex items-center gap-2">
                    <Clock3 className="h-5 w-5 text-[var(--accent)]" />
                    <h3 className="text-lg font-black text-slate-950">Follow-up History</h3>
                  </div>
                  {loadingActivities ? (
                    <div className="rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Loading activities...</div>
                  ) : timelineActivities.length === 0 ? (
                    <div className="rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No activity logged yet.</div>
                  ) : (
                    <div className="space-y-4">
                      {timelineActivities.map((activity) => (
                        <TimelineBubble key={activity.id} activity={activity} currentUserId={currentUser.id} createdByLabel={resolveEmployeeName(activity.created_by, employees)} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-[1.9rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Quick Log</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <Field label="Activity Type">
                      <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]">
                        {ACTIVITY_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Amount (optional)">
                      <input type="number" min="0" value={activityAmount} onChange={(event) => setActivityAmount(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="0" />
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-col gap-3">
                    <textarea value={activityNote} onChange={(event) => setActivityNote(event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="Add a note for this follow-up" disabled={improvingNote} />
                    <div className="flex justify-end">
                      <button type="button" onClick={() => void handleAIImproveNote()} disabled={improvingNote} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-4 py-2 text-xs font-bold text-violet-600 transition hover:bg-violet-100 disabled:opacity-50">
                        <Sparkles className={`h-3.5 w-3.5 ${improvingNote ? 'animate-pulse' : ''}`} />
                        {improvingNote ? 'Improving...' : 'Improve Note'}
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => void handleLogActivity()} disabled={loggingActivity} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {loggingActivity ? 'Saving...' : 'Log Activity'}
                  </button>
                </section>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsVoiceNoteOpen(true)}
              className="absolute bottom-24 right-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-[0_18px_36px_rgba(37,99,235,0.32)] sm:bottom-6 sm:right-6"
              aria-label="Add voice note"
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>

      {isDraftOpen ? (
        <BottomSheet title="Draft Message" onClose={() => setIsDraftOpen(false)}>
          <p className="text-sm text-slate-500">Message context includes {lead.name} and {lead.requirement || 'their requirement'}.</p>
          <div className="mt-4 flex flex-col gap-3">
            <textarea value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} rows={7} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" disabled={rewritingDraft} />
            <div className="flex justify-end">
              <button type="button" onClick={() => void handleAIRewriteDraft()} disabled={rewritingDraft} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:scale-105 disabled:opacity-70 disabled:hover:scale-100">
                <Sparkles className={`h-4 w-4 ${rewritingDraft ? 'animate-spin opacity-80' : ''}`} />
                {rewritingDraft ? 'Rewriting...' : 'Rewrite Magic'}
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleCopyDraft()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              <Copy className="h-4 w-4" />
              Copy
            </button>
            <button type="button" onClick={() => {
              if (!whatsAppUrl) {
                toast.error('Mobile number not available.');
                return;
              }
              window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
            }} className="inline-flex items-center gap-2 rounded-2xl border border-[#A7F3D0] bg-white px-4 py-3 text-sm font-semibold text-[#047857]">
              <Send className="h-4 w-4" />
              Send to WhatsApp
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {isRescheduleOpen ? (
        <BottomSheet title="Reschedule Follow-Up" onClose={() => setIsRescheduleOpen(false)}>
          <Field label="Next Follow-Up">
            <input type="datetime-local" value={paymentForm.paymentDueDate} onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentDueDate: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" />
          </Field>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setIsRescheduleOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={() => void handleReschedule()} disabled={savingPayment} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingPayment ? 'Saving...' : 'Save'}
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {isEditOpen ? (
        <BottomSheet title="Edit Lead" onClose={() => setIsEditOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lead Name"><input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Mobile"><input value={editForm.mobile} onChange={(event) => setEditForm((prev) => ({ ...prev, mobile: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Email"><input value={editForm.email} onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Source"><input value={editForm.source} onChange={(event) => setEditForm((prev) => ({ ...prev, source: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Industry"><input value={editForm.industry} onChange={(event) => setEditForm((prev) => ({ ...prev, industry: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Estimated Value"><input type="number" min="0" value={editForm.estimatedValue} onChange={(event) => setEditForm((prev) => ({ ...prev, estimatedValue: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            <Field label="Assign To">
              <select value={editForm.assignedTo} onChange={(event) => setEditForm((prev) => ({ ...prev, assignedTo: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]">
                <option value="">Unassigned</option>
                {employees.filter((employee) => String(employee.company_id || '').trim() === companyId).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Requirement"><textarea value={editForm.requirement} onChange={(event) => setEditForm((prev) => ({ ...prev, requirement: event.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Source Notes"><textarea value={editForm.sourceNotes} onChange={(event) => setEditForm((prev) => ({ ...prev, sourceNotes: event.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" /></Field>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setIsEditOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={() => void handleSaveEdit()} disabled={savingEdit} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {isVoiceNoteOpen ? (
        <BottomSheet title="Voice Note" onClose={() => setIsVoiceNoteOpen(false)}>
          <p className="text-sm text-slate-500">Tap below to speak, or type your note manually.</p>
          <div className="my-6 flex justify-center">
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={isRecording}
              className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                isRecording 
                  ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
          {isRecording && <p className="mb-4 text-center text-xs font-bold text-red-500 animate-pulse">Listening...</p>}
          <textarea value={voiceNote} onChange={(event) => setVoiceNote(event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="Your note will appear here..." />
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setIsVoiceNoteOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={() => void handleSaveVoiceNote()} disabled={loggingActivity} className="rounded-2xl bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {loggingActivity ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {isChatDumpOpen ? (
        <BottomSheet title="Paste WhatsApp Chat" onClose={() => { setIsChatDumpOpen(false); setChatDumpResult(''); }}>
          <p className="text-sm text-slate-500">Copy-paste the full WhatsApp conversation below and let AI extract all key details for {lead.name}.</p>
          <textarea
            value={chatDumpText}
            onChange={(e) => setChatDumpText(e.target.value)}
            rows={8}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
            placeholder={'[12/04/2025, 10:32 AM] Client: Hi I need a 2BHK flat\n[12/04/2025, 10:33 AM] You: Sure, what is your budget?\n...'}
            disabled={parsingChat}
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void handleAIChatDump()}
              disabled={parsingChat}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:scale-105 disabled:opacity-70"
            >
              <Sparkles className={`h-4 w-4 ${parsingChat ? 'animate-spin' : ''}`} />
              {parsingChat ? 'Analyzing...' : 'Parse with AI'}
            </button>
          </div>
          {chatDumpResult ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">AI Summary</p>
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{chatDumpResult}</div>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => void handleLogChatDumpAsActivity()} disabled={loggingActivity} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {loggingActivity ? 'Saving...' : 'Save to Timeline'}
                </button>
                <button type="button" onClick={() => { setActivityNote(chatDumpResult); setIsChatDumpOpen(false); setChatDumpResult(''); toast.success('Pasted into Quick Log!'); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Copy to Quick Log
                </button>
              </div>
            </div>
          ) : null}
        </BottomSheet>
      ) : null}

      {isScreenshotOCROpen ? (
        <BottomSheet title="Screenshot OCR" onClose={() => { setIsScreenshotOCROpen(false); setOcrResult(''); }}>
          <p className="text-sm text-slate-500">Upload a WhatsApp screenshot and AI will extract all key details for {lead.name}.</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-fuchsia-400 hover:bg-fuchsia-50">
            <ImagePlus className="h-10 w-10 text-fuchsia-400" />
            <span className="text-sm font-bold text-slate-700">Tap to upload screenshot</span>
            <span className="text-[11px] text-slate-400">Supports JPG, PNG, WEBP</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleScreenshotOCR(file);
              }}
              disabled={ocrProcessing}
            />
          </label>
          {ocrProcessing ? (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-6">
              <Sparkles className="h-5 w-5 animate-spin text-fuchsia-500" />
              <p className="text-sm font-bold text-slate-600">AI is reading the screenshot...</p>
            </div>
          ) : null}
          {ocrResult ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">AI Summary</p>
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{ocrResult}</div>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => void handleLogOCRAsActivity()} disabled={loggingActivity} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {loggingActivity ? 'Saving...' : 'Save to Timeline'}
                </button>
                <button type="button" onClick={() => { setActivityNote(ocrResult); setIsScreenshotOCROpen(false); setOcrResult(''); toast.success('Pasted into Quick Log!'); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Copy to Quick Log
                </button>
              </div>
            </div>
          ) : null}
        </BottomSheet>
      ) : null}
    </>
  );
};

const ActionSquare = ({
  label,
  icon,
  className,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  className: string;
  onClick: () => void;
}) => (
  <button type="button" onClick={onClick} className={`flex min-h-[78px] items-center justify-center gap-3 rounded-[1.4rem] border px-4 py-4 text-sm font-bold ${className}`}>
    {icon}
    <span>{label}</span>
  </button>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
    {children}
  </label>
);

const TimelineBubble = ({
  activity,
  currentUserId,
  createdByLabel,
}: {
  activity: CRMLeadActivity;
  currentUserId: string;
  createdByLabel: string;
}) => {
  const isMine = String(activity.created_by || '').trim() === String(currentUserId || '').trim();

  return (
    <div className={`max-w-[88%] rounded-[1.4rem] px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${isMine ? 'ml-auto bg-indigo-50' : 'mr-auto bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-black capitalize text-slate-900">{String(activity.activity_type || 'note').replace(/_/g, ' ')}</p>
        <p className="text-[11px] font-semibold text-slate-500">{formatDateTime(activity.created_at)}</p>
      </div>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{createdByLabel}</p>
      {activity.note ? <p className="mt-3 text-sm leading-6 text-slate-700">{activity.note}</p> : null}
      {typeof activity.amount === 'number' ? <p className="mt-3 text-sm font-bold text-[#10B981]">{formatCurrency(activity.amount)}</p> : null}
      {activity.old_stage || activity.new_stage ? (
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {getLeadStageLabel(activity.old_stage)} to {getLeadStageLabel(activity.new_stage)}
        </p>
      ) : null}
    </div>
  );
};

const BottomSheet = ({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/35 px-4 py-4 sm:items-center">
    <div className="w-full max-w-2xl rounded-[2rem] bg-white px-5 py-5 shadow-[0_28px_70px_rgba(15,23,42,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black tracking-tight text-slate-950">{title}</h3>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  </div>
);

export default LeadDetailScreen;
