import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Send, CalendarClock, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { get, post, patch } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { TestEmailDialog } from '@/pages/TemplatesPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label, Switch, Checkbox, Separator, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { cn, titleCase } from '@/lib/utils';

const STEPS = ['Details', 'Audience', 'Content', 'Schedule', 'Review'];

const emptyState = {
  name: '', description: '', type: 'outreach', provider: 'gmail', connectionId: '',
  audience: { listIds: [], segmentIds: [], excludeUnsubscribed: true, excludeBounced: true, excludeSuppressed: true, excludePreviouslyContacted: false },
  content: { templateId: null, subject: '', bodyHtml: '', bodyText: '' },
  schedule: { sendNow: true, scheduledAt: '', timezone: 'UTC', sendingWindowStart: '09:00', sendingWindowEnd: '18:00', skipWeekends: true, dailyLimit: 200, hourlyLimit: 40, delayBetweenEmailsSec: 45 },
};

export function CampaignWizard({ open, onOpenChange, existing }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState(emptyState);
  const [campaignId, setCampaignId] = React.useState(existing?._id || null);
  const [review, setReview] = React.useState(null);
  const [testOpen, setTestOpen] = React.useState(false);

  React.useEffect(() => {
    if (open && existing) {
      setForm({
        name: existing.name, description: existing.description || '', type: existing.type, provider: existing.provider,
        connectionId: existing.connectionId?._id || existing.connectionId || '',
        audience: { ...emptyState.audience, ...existing.audience, listIds: (existing.audience?.listIds || []).map((l) => l._id || l), segmentIds: (existing.audience?.segmentIds || []).map((s) => s._id || s) },
        content: { ...emptyState.content, ...existing.content },
        schedule: { ...emptyState.schedule, ...existing.schedule, scheduledAt: existing.schedule?.scheduledAt ? new Date(existing.schedule.scheduledAt).toISOString().slice(0, 16) : '' },
      });
      setCampaignId(existing._id);
    } else if (open) {
      setForm(emptyState);
      setCampaignId(null);
      setStep(0);
      setReview(null);
    }
  }, [open, existing]);

  const connectionsQ = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations'), enabled: open });
  const listsQ = useQuery({ queryKey: ['contact-lists'], queryFn: () => get('/contact-lists'), enabled: open });
  const segmentsQ = useQuery({ queryKey: ['segments'], queryFn: () => get('/segments'), enabled: open });
  const templatesQ = useQuery({ queryKey: ['templates'], queryFn: () => get('/templates', { limit: 100 }), enabled: open });

  const connections = (connectionsQ.data?.connections || []).filter((c) => c.provider === form.provider && c.status === 'connected');

  const set = (path, value) => {
    setForm((f) => {
      const next = structuredClone(f);
      const keys = path.split('.');
      let node = next;
      keys.slice(0, -1).forEach((k) => { node = node[k]; });
      node[keys.at(-1)] = value;
      return next;
    });
  };

  const buildPayload = () => ({
    ...form,
    connectionId: form.connectionId || undefined,
    content: { ...form.content, templateId: form.content.templateId || undefined },
    schedule: { ...form.schedule, scheduledAt: form.schedule.scheduledAt ? new Date(form.schedule.scheduledAt) : undefined },
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (campaignId) return patch(`/campaigns/${campaignId}`, payload);
      const res = await post('/campaigns', payload);
      setCampaignId(res.data.campaign._id);
      return res;
    },
    onError: (err) => toast.error(err.message),
  });

  const loadReview = useMutation({
    mutationFn: async () => {
      await saveDraft.mutateAsync();
      const id = campaignId || (await qc.getQueryData(['campaigns']))?.items?.[0]?._id;
      return get(`/campaigns/${campaignId || id}/review`);
    },
    onSuccess: (data) => { setReview(data); setStep(4); },
    onError: (err) => toast.error(err.message),
  });

  const launch = useMutation({
    mutationFn: async (mode) => {
      await saveDraft.mutateAsync();
      if (mode === 'schedule') return post(`/campaigns/${campaignId}/actions/schedule`);
      return post(`/campaigns/${campaignId}/actions/start`);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onOpenChange(false);
      if (campaignId) navigate(`/campaigns/${campaignId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const next = async () => {
    if (step === 0 && (!form.name.trim() || !form.connectionId)) return toast.error('Give the campaign a name and pick a sender account.');
    if (step === 1 && !form.audience.listIds.length && !form.audience.segmentIds.length) return toast.error('Choose at least one list or segment.');
    if (step === 2 && (!form.content.subject.trim() || (!form.content.bodyHtml && !form.content.bodyText))) return toast.error('Add a subject and body.');
    if (step === 3) return loadReview.mutate();
    try {
      await saveDraft.mutateAsync();
      setStep((s) => s + 1);
    } catch { /* toast shown in onError */ }
  };

  const applyTemplate = (id) => {
    const t = templatesQ.data?.items?.find((x) => x._id === id);
    if (!t) return;
    set('content.templateId', id);
    set('content.subject', t.subject || form.content.subject);
    set('content.bodyHtml', t.bodyHtml || '');
    set('content.bodyText', t.bodyText || '');
  };

  const toggleIn = (path, id) => {
    const arr = path.split('.').reduce((o, k) => o[k], form);
    set(path, arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit campaign' : 'Create campaign'}</DialogTitle>
          <DialogDescription>Emails go out one-by-one through background workers with suppression, limits and duplicate protection applied.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <button
                onClick={() => i < step && setStep(i)}
                className={cn('flex items-center gap-1.5 font-medium whitespace-nowrap', i === step ? 'text-primary' : i < step ? 'text-success' : 'text-muted-foreground')}
              >
                <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center text-[10px]', i === step && 'border-primary bg-primary/10', i < step && 'border-success bg-success/10')}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: details */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3.5">
              <Field label="Campaign name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="July outreach — SaaS founders" /></Field>
              <Field label="Campaign type">
                <Select value={form.type} onValueChange={(v) => set('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outreach">Sales outreach (1:1 personalized)</SelectItem>
                    <SelectItem value="marketing">Marketing blast</SelectItem>
                    <SelectItem value="newsletter">Newsletter</SelectItem>
                    <SelectItem value="transactional">Transactional</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Internal note about this campaign's goal" /></Field>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <Field label="Provider" description={form.provider === 'gmail' ? 'Gmail: personalized 1:1 sends with reply detection. Respect daily limits.' : 'Brevo: bulk-friendly with delivery, open and click webhooks.'}>
                <Select value={form.provider} onValueChange={(v) => { set('provider', v); set('connectionId', ''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail — sales outreach</SelectItem>
                    <SelectItem value="brevo">Brevo — bulk & marketing</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sender account" required>
                <Select value={form.connectionId} onValueChange={(v) => set('connectionId', v)}>
                  <SelectTrigger><SelectValue placeholder={connections.length ? 'Choose account' : `No ${form.provider} account connected`} /></SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => <SelectItem key={c._id} value={c._id}>{c.email || c.defaultSenderEmail}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {!connections.length && !connectionsQ.isLoading && (
              <p className="text-xs text-warning flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Connect a {form.provider} account on the Integrations page first.</p>
            )}
          </div>
        )}

        {/* Step 2: audience */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact lists</Label>
                <div className="rounded-md border divide-y max-h-52 overflow-y-auto scrollbar-thin">
                  {listsQ.data?.items?.length ? listsQ.data.items.map((l) => (
                    <label key={l._id} className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-secondary/50">
                      <Checkbox checked={form.audience.listIds.includes(l._id)} onCheckedChange={() => toggleIn('audience.listIds', l._id)} />
                      <span className="text-[13px] flex-1 truncate">{l.name}</span>
                      <span className="text-[11px] text-muted-foreground">{l.contactCount}</span>
                    </label>
                  )) : <p className="text-[13px] text-muted-foreground p-3">No lists yet.</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dynamic segments</Label>
                <div className="rounded-md border divide-y max-h-52 overflow-y-auto scrollbar-thin">
                  {segmentsQ.data?.items?.length ? segmentsQ.data.items.map((s) => (
                    <label key={s._id} className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-secondary/50">
                      <Checkbox checked={form.audience.segmentIds.includes(s._id)} onCheckedChange={() => toggleIn('audience.segmentIds', s._id)} />
                      <span className="text-[13px] flex-1 truncate">{s.name}</span>
                      <span className="text-[11px] text-muted-foreground">~{s.estimatedCount}</span>
                    </label>
                  )) : <p className="text-[13px] text-muted-foreground p-3">No segments yet.</p>}
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-2.5">
              <Label>Exclusions</Label>
              {[
                ['excludeUnsubscribed', 'Exclude unsubscribed contacts', 'Required for compliance — leave on.'],
                ['excludeBounced', 'Exclude bounced and invalid emails'],
                ['excludeSuppressed', 'Exclude suppression list'],
                ['excludePreviouslyContacted', 'Exclude contacts contacted before'],
              ].map(([key, label, hint]) => (
                <label key={key} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{label}{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</span>
                  <Switch checked={form.audience[key]} onCheckedChange={(v) => set(`audience.${key}`, v)} />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: content */}
        {step === 2 && (
          <div className="space-y-3.5">
            <Field label="Start from template (optional)">
              <Select value={form.content.templateId || 'none'} onValueChange={(v) => (v === 'none' ? set('content.templateId', null) : applyTemplate(v))}>
                <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templatesQ.data?.items?.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject" required>
              <Input value={form.content.subject} onChange={(e) => set('content.subject', e.target.value)} placeholder='Quick question, {{first_name | default: "there"}}' />
            </Field>
            <Field label="Body" required>
              <RichTextEditor value={form.content.bodyHtml} onChange={(html) => set('content.bodyHtml', html)} />
            </Field>
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}><Send /> Send test email</Button>
          </div>
        )}

        {/* Step 4: schedule */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => set('schedule.sendNow', true)}
                className={cn('rounded-md border p-3.5 text-left transition-colors', form.schedule.sendNow ? 'border-primary bg-accent/60' : 'hover:bg-secondary/50')}
              >
                <Send className="h-4 w-4 mb-1.5 text-primary" />
                <p className="text-[13px] font-medium">Send now</p>
                <p className="text-[11px] text-muted-foreground">Start as soon as you launch.</p>
              </button>
              <button
                onClick={() => set('schedule.sendNow', false)}
                className={cn('rounded-md border p-3.5 text-left transition-colors', !form.schedule.sendNow ? 'border-primary bg-accent/60' : 'hover:bg-secondary/50')}
              >
                <CalendarClock className="h-4 w-4 mb-1.5 text-primary" />
                <p className="text-[13px] font-medium">Schedule for later</p>
                <p className="text-[11px] text-muted-foreground">Pick a date and time.</p>
              </button>
            </div>
            {!form.schedule.sendNow && (
              <div className="grid sm:grid-cols-2 gap-3.5">
                <Field label="Start at" required><Input type="datetime-local" value={form.schedule.scheduledAt} onChange={(e) => set('schedule.scheduledAt', e.target.value)} /></Field>
                <Field label="Timezone">
                  <Select value={form.schedule.timezone} onValueChange={(v) => set('schedule.timezone', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'].map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            <Separator />
            <div className="grid sm:grid-cols-2 gap-3.5">
              <Field label="Sending window start"><Input type="time" value={form.schedule.sendingWindowStart} onChange={(e) => set('schedule.sendingWindowStart', e.target.value)} /></Field>
              <Field label="Sending window end"><Input type="time" value={form.schedule.sendingWindowEnd} onChange={(e) => set('schedule.sendingWindowEnd', e.target.value)} /></Field>
              <Field label="Daily limit" description="Max emails per day (Gmail health)."><Input type="number" min={1} value={form.schedule.dailyLimit} onChange={(e) => set('schedule.dailyLimit', +e.target.value)} /></Field>
              <Field label="Hourly limit"><Input type="number" min={1} value={form.schedule.hourlyLimit} onChange={(e) => set('schedule.hourlyLimit', +e.target.value)} /></Field>
              <Field label="Delay between emails (seconds)" description="Human-like pacing between sends."><Input type="number" min={5} value={form.schedule.delayBetweenEmailsSec} onChange={(e) => set('schedule.delayBetweenEmailsSec', +e.target.value)} /></Field>
              <label className="flex items-center justify-between gap-3 text-[13px] pt-6">
                <span>Skip weekends</span>
                <Switch checked={form.schedule.skipWeekends} onCheckedChange={(v) => set('schedule.skipWeekends', v)} />
              </label>
            </div>
          </div>
        )}

        {/* Step 5: review */}
        {step === 4 && (
          loadReview.isPending || !review ? <Skeleton className="h-48 w-full" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  ['Matched', review.totalMatched],
                  ['Will receive', review.validRecipients, 'text-success'],
                  ['Excluded', Object.values(review.excluded || {}).reduce((a, b) => a + b, 0), 'text-warning'],
                  ['Est. duration', `${review.estimatedMinutes} min`],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-md border p-3">
                    <p className={cn('text-lg font-semibold', color)}>{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {Object.entries(review.excluded || {}).filter(([, v]) => v > 0).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Excluded: {Object.entries(review.excluded).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${titleCase(k)}`).join(' · ')}
                </div>
              )}
              {review.missingVariables?.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-[13px]">
                  <p className="font-medium flex items-center gap-1.5 text-warning"><AlertTriangle className="h-4 w-4" /> Missing personalization data</p>
                  <ul className="mt-1 text-xs space-y-0.5">
                    {review.missingVariables.map((m) => (
                      <li key={m.variable}><code>{`{{${m.variable}}}`}</code> is empty for {m.count} of {m.sampled} sampled contacts — add a fallback like <code>{`{{${m.variable} | default: "..."}}`}</code></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-md border p-3.5 space-y-1.5 text-[13px]">
                <p><span className="text-muted-foreground w-24 inline-block">Sender</span> {review.sender ? `${review.sender.email} (${review.sender.status})` : '—'}</p>
                <p><span className="text-muted-foreground w-24 inline-block">Provider</span> {titleCase(review.provider || form.provider)}</p>
                <p><span className="text-muted-foreground w-24 inline-block">Subject</span> {form.content.subject}</p>
                <p><span className="text-muted-foreground w-24 inline-block">Schedule</span> {form.schedule.sendNow ? 'Send immediately' : `Starts ${form.schedule.scheduledAt} (${form.schedule.timezone})`}</p>
                <p><span className="text-muted-foreground w-24 inline-block">Window</span> {form.schedule.sendingWindowStart}–{form.schedule.sendingWindowEnd}{form.schedule.skipWeekends ? ', weekdays only' : ''}</p>
              </div>
              {review.sender?.status !== 'connected' && (
                <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Sender account is not healthy — reconnect it before launching.</p>
              )}
            </div>
          )
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}>
            <ChevronLeft /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => saveDraft.mutate(undefined, { onSuccess: () => toast.success('Draft saved.') })} loading={saveDraft.isPending}>
              Save draft
            </Button>
            {step < 4 ? (
              <Button onClick={next} loading={loadReview.isPending}>Continue <ChevronRight /></Button>
            ) : (
              <div className="flex gap-2">
                {!form.schedule.sendNow && (
                  <Button variant="outline" onClick={() => launch.mutate('schedule')} loading={launch.isPending}><CalendarClock /> Schedule</Button>
                )}
                <Button onClick={() => launch.mutate('start')} loading={launch.isPending} disabled={review && review.validRecipients === 0}>
                  <CheckCircle2 /> {form.schedule.sendNow ? 'Launch now' : 'Launch immediately'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} subject={form.content.subject} bodyHtml={form.content.bodyHtml} bodyText={form.content.bodyText} />
      </DialogContent>
    </Dialog>
  );
}
