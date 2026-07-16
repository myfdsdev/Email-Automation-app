import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Play, Pause, Clock, Mail, Trash2, Pencil, UserPlus,
  StopCircle, RotateCcw, ChevronDown, BarChart3,
} from 'lucide-react';
import { api, get, post, patch, del } from '@/api/client';
import { Page, PageHeader, StatusBadge, ProviderBadge, Field, ConfirmDialog, FullPageSpinner } from '@/components/shared';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch, Label, Checkbox, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, Pagination } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { fullName, timeAgo, titleCase, formatDateTime, cn } from '@/lib/utils';

function StepEditor({ open, onOpenChange, sequenceId, step, nextOrder }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({});
  const templatesQ = useQuery({ queryKey: ['templates'], queryFn: () => get('/templates', { limit: 100 }), enabled: open });

  React.useEffect(() => {
    setForm({
      order: step?.order ?? nextOrder,
      name: step?.name || '',
      subject: step?.subject || '',
      bodyHtml: step?.bodyHtml || '',
      templateId: step?.templateId || null,
      delayDays: step?.delayDays ?? (nextOrder === 1 ? 0 : 2),
      delayHours: step?.delayHours ?? 0,
      replyToThread: step?.replyToThread ?? true,
      conditions: step?.conditions || { skipIfReplied: true, skipIfMeetingBooked: true, skipIfUnsubscribed: true, skipIfBounced: true },
    });
  }, [step, nextOrder, open]);

  const saveStep = useMutation({
    mutationFn: () => {
      const body = { ...form, templateId: form.templateId || undefined };
      return fetchPut(`/sequences/${sequenceId}/steps`, body);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['sequence', sequenceId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{step ? `Edit step ${step.order}` : `Add step ${nextOrder}`}</DialogTitle>
          <DialogDescription>
            {form.order > 1 ? 'Follow-ups send inside the original Gmail thread by default (Re: subject).' : 'The first email starts each enrollment.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Step name"><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Intro email" /></Field>
            <Field label="Wait days" description="After previous step"><Input type="number" min={0} max={90} value={form.delayDays ?? 0} onChange={(e) => set('delayDays', +e.target.value)} /></Field>
            <Field label="Wait hours"><Input type="number" min={0} max={23} value={form.delayHours ?? 0} onChange={(e) => set('delayHours', +e.target.value)} /></Field>
          </div>
          <Field label="Use template (optional)">
            <Select value={form.templateId || 'none'} onValueChange={(v) => {
              if (v === 'none') return set('templateId', null);
              const t = templatesQ.data?.items?.find((x) => x._id === v);
              setForm((f) => ({ ...f, templateId: v, subject: t?.subject || f.subject, bodyHtml: t?.bodyHtml || f.bodyHtml }));
            }}>
              <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {templatesQ.data?.items?.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject" required={form.order === 1} description={form.order > 1 ? 'Leave as-is to reply in-thread with Re:' : undefined}>
            <Input value={form.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder='Quick question, {{first_name | default: "there"}}' />
          </Field>
          <Field label="Body" required>
            <RichTextEditor value={form.bodyHtml} onChange={(html) => set('bodyHtml', html)} minHeight={150} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {form.order > 1 && (
              <label className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-[13px]">
                Reply in same Gmail thread
                <Switch checked={form.replyToThread} onCheckedChange={(v) => set('replyToThread', v)} />
              </label>
            )}
            {[
              ['skipIfReplied', 'Skip if contact replied'],
              ['skipIfMeetingBooked', 'Skip if meeting booked'],
              ['skipIfUnsubscribed', 'Skip if unsubscribed'],
              ['skipIfBounced', 'Skip if bounced'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-[13px]">
                {label}
                <Switch checked={form.conditions?.[key] ?? true} onCheckedChange={(v) => set('conditions', { ...form.conditions, [key]: v })} />
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={saveStep.isPending} disabled={!form.bodyHtml || (form.order === 1 && !form.subject)} onClick={() => saveStep.mutate()}>Save step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const fetchPut = (url, body) => api.put(url, body).then((r) => r.data);

function EnrollDialog({ open, onOpenChange, sequenceId }) {
  const qc = useQueryClient();
  const [listIds, setListIds] = React.useState([]);
  const [emails, setEmails] = React.useState('');
  const listsQ = useQuery({ queryKey: ['contact-lists'], queryFn: () => get('/contact-lists'), enabled: open });
  const searchQ = useQuery({
    queryKey: ['contacts-mini', emails],
    queryFn: () => get('/contacts', { search: emails, limit: 6 }),
    enabled: open && emails.length >= 2,
  });
  const [picked, setPicked] = React.useState([]);

  const enroll = useMutation({
    mutationFn: () => post(`/sequences/${sequenceId}/enroll`, { contactIds: picked.map((p) => p._id), listIds }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['sequence', sequenceId] });
      qc.invalidateQueries({ queryKey: ['sequence-enrollments', sequenceId] });
      setPicked([]); setListIds([]); setEmails('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll contacts</DialogTitle>
          <DialogDescription>Suppressed and unsubscribed contacts are skipped automatically. Duplicates are never enrolled twice.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Entire lists</Label>
            <div className="flex flex-wrap gap-1.5">
              {listsQ.data?.items?.map((l) => (
                <button key={l._id} type="button"
                  onClick={() => setListIds((ids) => (ids.includes(l._id) ? ids.filter((x) => x !== l._id) : [...ids, l._id]))}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', listIds.includes(l._id) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary')}>
                  {l.name} ({l.contactCount})
                </button>
              ))}
              {!listsQ.data?.items?.length && <p className="text-xs text-muted-foreground">No lists yet.</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Individual contacts</Label>
            <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Search by name or email…" className="h-8" />
            {searchQ.data?.items?.length > 0 && (
              <div className="rounded-md border divide-y max-h-36 overflow-y-auto scrollbar-thin">
                {searchQ.data.items.filter((c) => !picked.some((p) => p._id === c._id)).map((c) => (
                  <button key={c._id} className="w-full text-left p-2 text-[13px] hover:bg-secondary/60" onClick={() => setPicked((p) => [...p, c])}>
                    {fullName(c)} · <span className="text-muted-foreground">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {picked.map((c) => (
                  <Badge key={c._id} variant="secondary" className="gap-1">
                    {c.email}
                    <button onClick={() => setPicked((p) => p.filter((x) => x._id !== c._id))}>×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={enroll.isPending} disabled={!picked.length && !listIds.length} onClick={() => enroll.mutate()}>
            <UserPlus /> Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SequenceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stepEditor, setStepEditor] = React.useState({ open: false, step: null });
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [confirmStep, setConfirmStep] = React.useState(null);
  const [enrollPage, setEnrollPage] = React.useState(1);
  const [enrollStatus, setEnrollStatus] = React.useState('all');

  const seqQ = useQuery({ queryKey: ['sequence', id], queryFn: () => get(`/sequences/${id}`) });
  const reportQ = useQuery({ queryKey: ['sequence-report', id], queryFn: () => get(`/sequences/${id}/report`) });
  const enrollmentsQ = useQuery({
    queryKey: ['sequence-enrollments', id, enrollPage, enrollStatus],
    queryFn: () => get(`/sequences/${id}/enrollments`, { page: enrollPage, limit: 20, ...(enrollStatus !== 'all' && { status: enrollStatus }) }),
    placeholderData: (p) => p,
    refetchInterval: 20000,
  });

  const action = useMutation({
    mutationFn: (act) => post(`/sequences/${id}/actions/${act}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['sequence', id] }); qc.invalidateQueries({ queryKey: ['sequences'] }); },
    onError: (err) => toast.error(err.message),
  });
  const enrollAction = useMutation({
    mutationFn: ({ enrollmentId, act }) => post(`/sequences/${id}/enrollments/${enrollmentId}/${act}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['sequence-enrollments', id] }); },
    onError: (err) => toast.error(err.message),
  });
  const removeStep = useMutation({
    mutationFn: (stepId) => del(`/sequences/${id}/steps/${stepId}`),
    onSuccess: () => { toast.success('Step removed.'); qc.invalidateQueries({ queryKey: ['sequence', id] }); setConfirmStep(null); },
    onError: (err) => toast.error(err.message),
  });
  const updateSettings = useMutation({
    mutationFn: (settings) => patch(`/sequences/${id}`, { settings }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sequence', id] }); toast.success('Settings saved.'); },
    onError: (err) => toast.error(err.message),
  });

  if (seqQ.isLoading) return <FullPageSpinner label="Loading sequence…" />;
  const sequence = seqQ.data?.sequence;
  const steps = seqQ.data?.steps || [];
  if (!sequence) return <Page><EmptyState title="Sequence not found" action={<Button asChild><Link to="/sequences">Back</Link></Button>} /></Page>;

  const nextOrder = (steps.at(-1)?.order || 0) + 1;

  return (
    <Page>
      <PageHeader
        title={<span className="flex items-center gap-3 flex-wrap">{sequence.name} <StatusBadge status={sequence.status} /> <ProviderBadge provider={sequence.provider} /></span>}
        description={sequence.description || `Sender: ${sequence.connectionId?.email || sequence.connectionId?.defaultSenderEmail || 'not set'}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/sequences')}><ArrowLeft /> Back</Button>
            <Button variant="outline" onClick={() => setEnrollOpen(true)}><UserPlus /> Enroll contacts</Button>
            {sequence.status !== 'active'
              ? <Button onClick={() => action.mutate('activate')} loading={action.isPending}><Play /> Activate</Button>
              : <Button variant="outline" onClick={() => action.mutate('pause')} loading={action.isPending}><Pause /> Pause</Button>}
          </>
        }
      />

      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="steps">Steps ({steps.length})</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments ({sequence.stats?.enrolled ?? 0})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="steps">
          <div className="max-w-2xl space-y-0">
            {steps.map((step, i) => (
              <React.Fragment key={step._id}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1.5 pl-5">
                    <div className="flex flex-col items-center"><ChevronDown className="h-4 w-4 text-muted-foreground" /></div>
                    <Badge variant="muted" className="gap-1"><Clock className="h-3 w-3" /> Wait {step.delayDays}d {step.delayHours ? `${step.delayHours}h` : ''}</Badge>
                  </div>
                )}
                <Card>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold">Step {step.order}{step.name ? ` — ${step.name}` : ''}</p>
                        {step.replyToThread && step.order > 1 && <Badge variant="secondary" className="text-[10px]">In-thread</Badge>}
                      </div>
                      <p className="text-[13px] truncate mt-0.5">{step.subject || <span className="text-muted-foreground italic">Replies in thread (Re:)</span>}</p>
                      <p className="text-xs text-muted-foreground truncate">{(step.bodyText || step.bodyHtml?.replace(/<[^>]+>/g, ' ') || '').slice(0, 110)}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{step.stats?.sent ?? 0} sent</span>
                        <span>{step.stats?.replied ?? 0} replies</span>
                        <span>{step.stats?.skipped ?? 0} skipped</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="iconSm" onClick={() => setStepEditor({ open: true, step })}><Pencil /></Button>
                      <Button variant="ghost" size="iconSm" onClick={() => setConfirmStep(step)}><Trash2 className="text-muted-foreground" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </React.Fragment>
            ))}
            <div className="pt-3">
              <Button variant="outline" className="w-full border-dashed" onClick={() => setStepEditor({ open: true, step: null })}>
                <Plus /> Add step {nextOrder}
              </Button>
            </div>
            {!steps.length && (
              <p className="text-[13px] text-muted-foreground text-center pt-4">
                Add your first step — e.g. an intro email, then a follow-up 2 days later.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="enrollments">
          <Card>
            <div className="flex items-center gap-2 p-3.5 border-b">
              <Select value={enrollStatus} onValueChange={(v) => { setEnrollStatus(v); setEnrollPage(1); }}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {['active', 'paused', 'completed', 'stopped', 'failed'].map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEnrollOpen(true)}><UserPlus /> Enroll</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead>Step</TableHead>
                  <TableHead>Next send</TableHead><TableHead>Stop reason</TableHead><TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollmentsQ.isLoading && <TableSkeleton rows={5} cols={6} />}
                {!enrollmentsQ.isLoading && !enrollmentsQ.data?.items?.length && (
                  <TableRow><TableCell colSpan={6}>
                    <EmptyState icon={Users} title="No contacts enrolled" description="Enroll contacts or lists to start the sequence."
                      action={<Button onClick={() => setEnrollOpen(true)}><UserPlus /> Enroll contacts</Button>} />
                  </TableCell></TableRow>
                )}
                {enrollmentsQ.data?.items?.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell>
                      <p className="font-medium">{fullName(e.contactId)}</p>
                      <p className="text-xs text-muted-foreground">{e.contactId?.email}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-[13px]">{e.currentStepOrder}/{steps.length}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{e.status === 'active' && e.nextStepAt ? formatDateTime(e.nextStepAt) : '—'}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{e.stopReason ? titleCase(e.stopReason) : '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><ChevronDown /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {e.status === 'active' && <DropdownMenuItem onClick={() => enrollAction.mutate({ enrollmentId: e._id, act: 'pause' })}><Pause /> Pause</DropdownMenuItem>}
                          {e.status === 'paused' && <DropdownMenuItem onClick={() => enrollAction.mutate({ enrollmentId: e._id, act: 'resume' })}><Play /> Resume</DropdownMenuItem>}
                          {['active', 'paused'].includes(e.status) && <DropdownMenuItem onClick={() => enrollAction.mutate({ enrollmentId: e._id, act: 'stop' })}><StopCircle /> Stop</DropdownMenuItem>}
                          {['stopped', 'completed', 'failed'].includes(e.status) && <DropdownMenuItem onClick={() => enrollAction.mutate({ enrollmentId: e._id, act: 'restart' })}><RotateCcw /> Restart</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagination={enrollmentsQ.data?.pagination} onPage={setEnrollPage} />
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {Object.entries(reportQ.data?.enrollmentByStatus || {}).map(([k, v]) => (
              <Card key={k}><CardContent className="p-3.5">
                <p className="text-lg font-semibold">{v}</p>
                <p className="text-[11px] text-muted-foreground">{titleCase(k)}</p>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Step performance</CardTitle><CardDescription>Sent, reply rate and drop-off per step.</CardDescription></CardHeader>
            <CardContent>
              {reportQ.isLoading ? <Skeleton className="h-32 w-full" /> : reportQ.data?.steps?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Step</TableHead><TableHead>Sent</TableHead><TableHead>Opened</TableHead><TableHead>Replied</TableHead><TableHead>Reply rate</TableHead><TableHead>Skipped</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportQ.data.steps.map((s) => (
                      <TableRow key={s.order}>
                        <TableCell className="font-medium">Step {s.order}{s.name ? ` — ${s.name}` : ''}</TableCell>
                        <TableCell>{s.sent}</TableCell><TableCell>{s.opened}</TableCell>
                        <TableCell>{s.replied}</TableCell><TableCell>{s.replyRate}%</TableCell><TableCell>{s.skipped}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <EmptyState icon={BarChart3} title="No data yet" className="py-6" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="max-w-xl">
            <CardHeader><CardTitle>Stop conditions</CardTitle><CardDescription>The sequence automatically stops for a contact when any of these happen.</CardDescription></CardHeader>
            <CardContent className="space-y-2.5">
              {[
                ['stopOnReply', 'Stop when contact replies'],
                ['stopOnMeetingBooked', 'Stop when a meeting is booked'],
                ['stopOnUnsubscribe', 'Stop on unsubscribe'],
                ['stopOnBounce', 'Stop on bounce'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-md border p-3 text-[13px]">
                  {label}
                  <Switch checked={sequence.settings?.[key] ?? true} onCheckedChange={(v) => updateSettings.mutate({ [key]: v })} />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Field label="Sending window start">
                  <Input type="time" defaultValue={sequence.settings?.sendingWindowStart || '09:00'} onBlur={(e) => updateSettings.mutate({ sendingWindowStart: e.target.value })} />
                </Field>
                <Field label="Sending window end">
                  <Input type="time" defaultValue={sequence.settings?.sendingWindowEnd || '18:00'} onBlur={(e) => updateSettings.mutate({ sendingWindowEnd: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-[13px]">
                Skip weekends
                <Switch checked={sequence.settings?.skipWeekends ?? true} onCheckedChange={(v) => updateSettings.mutate({ skipWeekends: v })} />
              </label>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StepEditor open={stepEditor.open} step={stepEditor.step} nextOrder={nextOrder} sequenceId={id} onOpenChange={(o) => setStepEditor((s) => ({ ...s, open: o }))} />
      <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} sequenceId={id} />
      <ConfirmDialog
        open={!!confirmStep} onOpenChange={() => setConfirmStep(null)}
        title={`Remove step ${confirmStep?.order}?`}
        description="Later steps shift up by one. Contacts currently waiting on this step move to the next one."
        confirmLabel="Remove" destructive loading={removeStep.isPending}
        onConfirm={() => removeStep.mutate(confirmStep._id)}
      />
    </Page>
  );
}
