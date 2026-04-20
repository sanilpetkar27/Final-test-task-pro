import React, { useEffect, useState } from 'react';
import { ImageUp, Loader2, MessageSquareText, Sparkles, X } from 'lucide-react';
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

type AddLeadTab = 'manual' | 'import';
type ImportMode = 'chat' | 'screenshot';

type LeadDraft = {
  name: string;
  mobile: string;
  requirement: string;
  nextFollowUp: string;
};

const GEMINI_API_KEY = 'AIzaSyAdOHVLF40eNJbdmc_0D1XkEZIGYu4OOIU';

const LEAD_EXTRACTION_SYSTEM_PROMPT = `Extract lead information from this WhatsApp conversation or screenshot. Return JSON only with these fields:
{
  name: string or null,
  mobile: string or null (digits only, no spaces or dashes),
  requirement: string or null
}
If you cannot find a field return null for that field.`;

const emptyLeadDraft: LeadDraft = {
  name: '',
  mobile: '',
  requirement: '',
  nextFollowUp: '',
};

const getDigitsOnly = (value: unknown): string => String(value || '').replace(/\D/g, '');

const toIsoStringOrNull = (value: string): string | null => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const parseJsonStringSafely = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(value.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
};

const extractLeadRecordFromResponse = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const parsed = parseJsonStringSafely(value);
    return extractLeadRecordFromResponse(parsed);
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if ('name' in record || 'mobile' in record || 'requirement' in record) {
    return record;
  }

  const nestedKeys = ['data', 'result', 'output', 'lead', 'extracted', 'response', 'text'];
  for (const key of nestedKeys) {
    const nested = extractLeadRecordFromResponse(record[key]);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const normalizeExtractedLeadDraft = (value: unknown): LeadDraft | null => {
  const record = extractLeadRecordFromResponse(value);
  if (!record) {
    return null;
  }

  return {
    name: String(record.name || '').trim(),
    mobile: getDigitsOnly(record.mobile),
    requirement: String(record.requirement || '').trim(),
    nextFollowUp: '',
  };
};

const inferLeadFromChatText = (rawText: string): LeadDraft | null => {
  const text = String(rawText || '').trim();
  if (!text) return null;

  // Strip WhatsApp timestamp prefixes like [12/04/2025, 10:32 AM] or [12/04, 10:32]
  const cleanLine = (line: string) =>
    line.replace(/^\[.*?\]\s*/, '').trim();

  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanLine(line.trim()))
    .filter(Boolean);

  const mobileMatch = text.match(/(?:\+91[\s-]?)?(\d[\d\s-]{8,}\d)/);
  const mobile = mobileMatch ? getDigitsOnly(mobileMatch[1]).slice(-10) : '';

  let name = '';
  for (const line of lines) {
    // match "Name: message" pattern - name is before the first colon
    const match = line.match(/^([^:]{2,60}):/);
    const candidate = String(match?.[1] || '').trim();
    // Skip common WhatsApp UI/system words and self-references
    if (
      candidate &&
      !/^(me|you|i|system|messages|whatsapp)$/i.test(candidate) &&
      !/^\d/.test(candidate) // skip lines starting with digits (timestamps)
    ) {
      name = candidate;
      break;
    }
  }

  let requirement = '';
  for (const line of lines) {
    if (/^me\s*:/i.test(line)) continue;
    const content = line.replace(/^[^:]{1,60}:\s*/, '').trim();
    if (!content) continue;
    if (mobile && content.includes(mobile)) continue;
    if (/\b(need|looking for|want|require|interested in)\b/i.test(content)) {
      requirement = content;
      break;
    }
    if (!requirement) {
      requirement = content;
    }
  }

  if (!name && !mobile && !requirement) {
    return null;
  }

  return {
    name,
    mobile,
    requirement,
    nextFollowUp: '',
  };
};

const readImageFile = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      if (!base64) {
        reject(new Error('Could not read image file.'));
        return;
      }

      resolve({
        base64,
        mimeType: file.type || 'image/png',
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

const AddLeadModal: React.FC<AddLeadModalProps> = ({
  isOpen,
  companyId,
  currentUser,
  employees: _employees,
  onClose,
  onLeadCreated,
}) => {
  const [activeTab, setActiveTab] = useState<AddLeadTab>('manual');
  const [importMode, setImportMode] = useState<ImportMode>('chat');
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [manualDraft, setManualDraft] = useState<LeadDraft>(emptyLeadDraft);
  const [chatInput, setChatInput] = useState('');
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [extractedDraft, setExtractedDraft] = useState<LeadDraft | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('manual');
      setImportMode('chat');
      setSubmitting(false);
      setExtracting(false);
      setManualDraft(emptyLeadDraft);
      setChatInput('');
      setUploadedImageName('');
      setExtractedDraft(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const updateManualDraft = (field: keyof LeadDraft, value: string) => {
    setManualDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateExtractedDraft = (field: keyof LeadDraft, value: string) => {
    setExtractedDraft((prev) => ({ ...(prev || emptyLeadDraft), [field]: value }));
  };

  const createLead = async (draft: LeadDraft) => {
    const leadName = String(draft.name || '').trim();
    if (!leadName) {
      toast.error('Lead name is required.');
      return false;
    }

    const nextFollowUpAt = toIsoStringOrNull(draft.nextFollowUp);
    if (draft.nextFollowUp && !nextFollowUpAt) {
      toast.error('Enter a valid next follow-up date and time.');
      return false;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        company_id: companyId,
        name: leadName,
        mobile: getDigitsOnly(draft.mobile) || null,
        email: null,
        source: null,
        source_notes: null,
        requirement: String(draft.requirement || '').trim() || null,
        estimated_value: null,
        industry: null,
        stage: 'new',
        assigned_to: null,
        total_amount: null,
        advance_paid: null,
        payment_status: null,
        payment_due_date: nextFollowUpAt,
        payment_reminder_enabled: Boolean(nextFollowUpAt),
        lost_reason: null,
        created_by: currentUser.id,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await supabase
        .from('leads')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to create lead:', error);
        toast.error(`Could not create lead: ${error.message}`);
        return false;
      }

      onLeadCreated(normalizeLead((data || {}) as Record<string, unknown>));
      toast.success('Lead created.');
      onClose();
      return true;
    } catch (error) {
      console.error('Unexpected lead creation failure:', error);
      toast.error('Could not create lead.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const extractWithAi = async (
    payload: Record<string, unknown>,
    fallback?: () => LeadDraft | null,
  ) => {
    setExtracting(true);
    try {
      // Try direct Gemini API first (no backend needed)
      const isChat = payload.inputType === 'chat';
      const conversation = isChat ? String(payload.conversation || '') : null;
      const imageBase64 = !isChat ? String(payload.imageBase64 || '') : null;
      const mimeType = !isChat ? String(payload.mimeType || 'image/png') : null;

      const textPart = { text: `${LEAD_EXTRACTION_SYSTEM_PROMPT}\n\n${conversation || 'Extract from image.'}` };
      const parts = imageBase64
        ? [textPart, { inlineData: { mimeType, data: imageBase64 } }]
        : [textPart];

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } }),
        }
      );
      const geminiData = await geminiRes.json();
      if (geminiRes.ok) {
        const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const extracted = normalizeExtractedLeadDraft(rawText);
        if (extracted && (extracted.name || extracted.mobile)) {
          setExtractedDraft(extracted);
          toast.success('Lead details extracted.');
          return;
        }
      }

      // Fallback to regex parser for chat
      if (fallback) {
        const fallbackResult = fallback();
        if (fallbackResult) {
          setExtractedDraft(fallbackResult);
          toast.success('Lead details extracted.');
          return;
        }
      }

      toast.error('AI could not extract lead details from this input.');
    } catch (error) {
      console.error('Lead extraction failed:', error);
      if (fallback) {
        const fallbackResult = fallback();
        if (fallbackResult) {
          setExtractedDraft(fallbackResult);
          toast.success('Lead details extracted.');
          return;
        }
      }
      toast.error('Lead extraction is unavailable right now.');
    } finally {
      setExtracting(false);
    }
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await createLead(manualDraft);
  };

  const handleChatExtraction = async () => {
    const conversation = chatInput.trim();
    if (!conversation) {
      toast.error('Paste a WhatsApp conversation first.');
      return;
    }

    await extractWithAi(
      {
        inputType: 'chat',
        conversation,
      },
      () => inferLeadFromChatText(conversation),
    );
  };

  const handleScreenshotUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Upload a JPG or PNG image.');
      return;
    }

    setUploadedImageName(file.name);

    try {
      const { base64, mimeType } = await readImageFile(file);
      await extractWithAi({
        inputType: 'image',
        imageBase64: base64,
        mimeType,
        fileName: file.name,
      });
    } catch (error) {
      console.error('Failed to prepare screenshot for extraction:', error);
      toast.error('Could not read the uploaded image.');
    }
  };

  const manualTabClasses = activeTab === 'manual'
    ? 'bg-[#4F46E5] text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]'
    : 'text-slate-600 hover:text-slate-900';
  const importTabClasses = activeTab === 'import'
    ? 'bg-[#4F46E5] text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]'
    : 'text-slate-600 hover:text-slate-900';

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 px-4 py-4 sm:items-center">
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[#F8FAFC] shadow-[0_28px_70px_rgba(15,23,42,0.2)]"
        style={{ fontFamily: '"DM Sans", sans-serif' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#4F46E5]">CRM</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Add Lead</h2>
            <p className="mt-1 text-sm text-slate-500">Quick entry for manual leads or WhatsApp imports.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="Close add lead modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="inline-flex rounded-full bg-[#EEF2FF] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${manualTabClasses}`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${importTabClasses}`}
            >
              Import
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {activeTab === 'manual' ? (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <Field label="Lead Name">
                <input
                  value={manualDraft.name}
                  onChange={(event) => updateManualDraft('name', event.target.value)}
                  className={inputClassName}
                  placeholder="Enter lead name"
                  autoFocus
                />
              </Field>

              <Field label="Mobile">
                <input
                  type="number"
                  inputMode="numeric"
                  value={manualDraft.mobile}
                  onChange={(event) => updateManualDraft('mobile', event.target.value)}
                  className={inputClassName}
                  placeholder="Enter mobile number"
                />
              </Field>

              <Field label="Requirement">
                <input
                  value={manualDraft.requirement}
                  onChange={(event) => updateManualDraft('requirement', event.target.value)}
                  className={inputClassName}
                  placeholder="What does the lead need?"
                />
              </Field>

              <Field label="Next Follow-up">
                <input
                  type="datetime-local"
                  value={manualDraft.nextFollowUp}
                  onChange={(event) => updateManualDraft('nextFollowUp', event.target.value)}
                  className={inputClassName}
                />
              </Field>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[#4F46E5] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(79,70,229,0.28)] transition hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Lead'}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('chat');
                    setExtractedDraft(null);
                  }}
                  className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                    importMode === 'chat'
                      ? 'border-[#4F46E5]/20 bg-[#EEF2FF] shadow-[0_14px_28px_rgba(79,70,229,0.12)]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <MessageSquareText className={`h-5 w-5 ${importMode === 'chat' ? 'text-[#4F46E5]' : 'text-slate-500'}`} />
                  <p className="mt-3 text-sm font-black text-slate-950">Paste Chat</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Paste a raw WhatsApp conversation and extract details.</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportMode('screenshot');
                    setExtractedDraft(null);
                  }}
                  className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                    importMode === 'screenshot'
                      ? 'border-[#4F46E5]/20 bg-[#EEF2FF] shadow-[0_14px_28px_rgba(79,70,229,0.12)]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <ImageUp className={`h-5 w-5 ${importMode === 'screenshot' ? 'text-[#4F46E5]' : 'text-slate-500'}`} />
                  <p className="mt-3 text-sm font-black text-slate-950">Paste Screenshot</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Upload a WhatsApp screenshot and extract details.</p>
                </button>
              </div>

              {importMode === 'chat' ? (
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                  <Field label="Paste Chat">
                    <textarea
                      value={chatInput}
                      onChange={(event) => {
                        setChatInput(event.target.value);
                        setExtractedDraft(null);
                      }}
                      rows={8}
                      className={`${inputClassName} min-h-[180px] resize-none`}
                      placeholder={`Paste WhatsApp conversation here...
e.g.
John: Hi I need a 3kW solar panel for my roof
Me: Sure, whats your address?
John: Andheri West, Mumbai. My number is 9876543210`}
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={() => void handleChatExtraction()}
                    disabled={extracting}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4F46E5] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(79,70,229,0.28)] transition hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {extracting ? 'Extracting...' : 'Extract with AI'}
                  </button>
                </div>
              ) : (
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-[#4F46E5]/25 bg-[#EEF2FF]/40 px-5 py-10 text-center transition hover:border-[#4F46E5]/40 hover:bg-[#EEF2FF]/70">
                    <ImageUp className="h-8 w-8 text-[#4F46E5]" />
                    <p className="mt-3 text-sm font-black text-slate-950">Upload WhatsApp screenshot</p>
                    <p className="mt-1 text-xs text-slate-500">Accepts JPG and PNG only.</p>
                    {uploadedImageName ? (
                      <p className="mt-3 text-xs font-semibold text-slate-600">{uploadedImageName}</p>
                    ) : null}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(event) => void handleScreenshotUpload(event)}
                    />
                  </label>

                  {extracting ? (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading screenshot with AI...
                    </div>
                  ) : null}
                </div>
              )}

              {extractedDraft ? (
                <div className="rounded-[1.6rem] border border-[#4F46E5]/15 bg-[#F7F7FF] p-4 shadow-[0_16px_32px_rgba(79,70,229,0.08)]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#4F46E5]" />
                    <p className="text-sm font-black text-slate-950">Preview extracted fields</p>
                  </div>

                  <div className="mt-4 space-y-4">
                    <Field label="Lead Name">
                      <input
                        value={extractedDraft.name}
                        onChange={(event) => updateExtractedDraft('name', event.target.value)}
                        className={inputClassName}
                        placeholder="Lead name"
                      />
                    </Field>

                    <Field label="Mobile">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={extractedDraft.mobile}
                        onChange={(event) => updateExtractedDraft('mobile', event.target.value)}
                        className={inputClassName}
                        placeholder="Mobile number"
                      />
                    </Field>

                    <Field label="Requirement">
                      <input
                        value={extractedDraft.requirement}
                        onChange={(event) => updateExtractedDraft('requirement', event.target.value)}
                        className={inputClassName}
                        placeholder="Requirement"
                      />
                    </Field>

                    <Field label="Next Follow-up">
                      <input
                        type="datetime-local"
                        value={extractedDraft.nextFollowUp}
                        onChange={(event) => updateExtractedDraft('nextFollowUp', event.target.value)}
                        className={inputClassName}
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => void createLead(extractedDraft)}
                      disabled={submitting}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-[#4F46E5] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(79,70,229,0.28)] transition hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? 'Creating...' : 'Create Lead'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const inputClassName =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10';

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
    {children}
  </label>
);

export default AddLeadModal;
