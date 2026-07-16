import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Zap, MoreHorizontal, Play, Pause, Trash2, Pencil, ScrollText, ArrowRight, X } from 'lucide-react';
import { get, post, patch, del } from '@/api/client';
import { Page, PageHeader, StatusBadge, Field, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent, Skeleton, Label } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, Pagination } from '@/components/ui/table';
import { titleCase, timeAgo, fullName, formatDateTime } from '@/lib/utils';

const CONDITION_FIELDS = ['status', 'tag', 'source', 'list', 'lead_score', 'open_count', 'click_count', 'reply_classification', 'sentiment', 'provider', 'assigned_to', 'consent_status'];
const ACTION_PARAM_HINTS = {
  add_tag: [{ key: 'tag', label: 'Tag name', required: true }],
  remove_tag: [{ key: 'tag', label: 'Tag name', required: true }],
  update_contact_status: [{ key: 'status', label: 'New status', required: true }],
  assign_member: [{ key: 'userId', label: 'Team member', type: 'member', required: true }],
  start_sequence: [{ key: 'sequenceId', label: 'Sequence', type: 'sequence', required: true }],
  stop_sequence: [{ key: 'sequenceId', label: 'Sequence (empty = all)', type: 'sequence' }],
  create_follow_up: [{ key: 'title', label: 'Task title' }, { key: 'delayDays', label: 'Due in days' }],
  schedule_ai_call: [{ key: 'title', label: 'Call task title' }],
  notify_team: [{ key: 'title', label: 'Notification title' }, { key: 'body', label: 'Message' }],
  send_webhook: [{ key: 'url', label: 'HTTPS webhook URL', required: true }],
  send_gmail_email: [{ key: 'subject', label: 'Subject', required: true }, { key: 'body', label: 'Body (supports {{variables}})', long: true, required: true }],
  send_brevo_email: [{ key: 'subject', label: 'Subject', required: true }, { key: 'body', label: 'Body (supports {{variables}})', long: true, required: true }],
  create_gmail_draft: [{ key: 'subject', label: 'Subject' }, { key: 'body', label: 'Body', long: true }],
  send_booking_link: [{ key: 'subject', label: 'Subject (optional)' }],
};

function AutomationDialog({ open, onOpenChange, automation, meta }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [trigger, setTrigger] = React.useState('reply_received');
  const [conditions, setConditions] = React.useState([]);
  const [actions, setActions] = React.useState([{ type: 'add_tag', params: {} }]);
  const sequencesQ = useQuery({ queryKey: ['sequences'], queryFn: () => get('/sequences', { limit: 100 }), enabled: open });
  const teamQ = useQuery({ queryKey: ['team'], queryFn: () => get('/team'), enabled: open });

  React.useEffect(() => {
    setName(automation?.name || '');
    setTrigger(automation?.trigger || 'reply_received');
    setConditions(automation?.conditions?.map((c) => ({ field: c.field, operator: c.operator, value: c.value })) || []);
    setActions(automation?.actions?.map((a) => ({ type: a.type, params: { ...a.params } })) || [{ type: 'add_tag', params: {} }]);
  }, [automation, open]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, trigger, conditions, actions };
      return automation ? patch(`/automations/${automation._id}`, body) : post('/automations', body);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['automations'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const setAction = (i, patchObj) => setActions((as) => as.map((a, ai) => (ai === i ? { ...a, ...patchObj } : a)));
  const setParam = (i, key, value) => setActions((as) => as.map((a, ai) => (ai === i ? { ...a, params: { ...a.params, [key]: value } } : a)));

  const renderParamInput = (action, i, hint) => {
    if (hint.type === 'sequence') {
      return (
        <Select value={action.params[hint.key] || ''} onValueChange={(v) => setParam(i, hint.key, v)}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Choose sequence" /></SelectTrigger>
          <SelectContent>{sequencesQ.data?.items?.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    if (hint.type === 'member') {
      return (
        <Select value={action.params[hint.key] || ''} onValueChange={(v) => setParam(i, hint.key, v)}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Choose member" /></SelectTrigger>
          <SelectContent>{teamQ.data?.members?.filter((m) => m.userId).map((m) => <SelectItem key={m._id} value={m.userId._id}>{m.userId.name}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    if (hint.long) {
      return <Textarea rows={3} value={action.params[hint.key] || ''} onChange={(e) => setParam(i, hint.key, e.target.value)} className="text-xs" />;
    }
    return <Input className="h-8" value={action.params[hint.key] || ''} onChange={(e) => setParam(i, hint.key, e.target.value)} />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{automation ? 'Edit automation' : 'New automation'}</DialogTitle>
          <DialogDescription>When the trigger fires and all conditions match, actions run in order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag interested leads and notify sales" /></Field>

          <div className="rounded-md border p-3.5 space-y-2">
            <Label className="text-primary">WHEN — Trigger</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(meta?.triggers || []).map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-3.5 space-y-2">
            <Label>IF — Conditions (all must match; empty = always run)</Label>
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={c.field} onValueChange={(v) => setConditions((cs) => cs.map((x, xi) => (xi === i ? { ...x, field: v } : x)))}>
                  <SelectTrigger className="w-[170px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f} value={f}>{titleCase(f)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={(v) => setConditions((cs) => cs.map((x, xi) => (xi === i ? { ...x, operator: v } : x)))}>
                  <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['equals', 'not_equals', 'contains', 'gt', 'gte', 'lt', 'lte'].map((o) => <SelectItem key={o} value={o}>{titleCase(o)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="h-8 flex-1" value={c.value ?? ''} onChange={(e) => setConditions((cs) => cs.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))} placeholder="Value" />
                <Button variant="ghost" size="iconSm" onClick={() => setConditions((cs) => cs.filter((_, xi) => xi !== i))}><X /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setConditions((cs) => [...cs, { field: 'status', operator: 'equals', value: '' }])}><Plus /> Add condition</Button>
          </div>

          <div className="rounded-md border p-3.5 space-y-3">
            <Label className="text-primary">THEN — Actions</Label>
            {actions.map((a, i) => (
              <div key={i} className="rounded-md border bg-secondary/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                  <Select value={a.type} onValueChange={(v) => setAction(i, { type: v, params: {} })}>
                    <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(meta?.actions || []).map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="iconSm" onClick={() => setActions((as) => as.filter((_, ai) => ai !== i))} disabled={actions.length === 1}><X /></Button>
                </div>
                {(ACTION_PARAM_HINTS[a.type] || []).map((hint) => (
                  <Field key={hint.key} label={hint.label} required={hint.required}>
                    {renderParamInput(a, i, hint)}
                  </Field>
                ))}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setActions((as) => [...as, { type: 'notify_team', params: {} }])}><Plus /> Add action</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim() || !actions.length} onClick={() => save.mutate()}>{automation ? 'Save' : 'Create automation'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionLog() {
  const [page, setPage] = React.useState(1);
  const logsQ = useQuery({
    queryKey: ['automation-executions', page],
    queryFn: () => get('/automations/executions', { page, limit: 25 }),
    placeholderData: (p) => p,
    refetchInterval: 20000,
  });
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Automation</TableHead><TableHead>Trigger</TableHead><TableHead>Contact</TableHead>
            <TableHead>Conditions</TableHead><TableHead>Actions</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logsQ.isLoading && <TableSkeleton rows={6} cols={7} />}
          {!logsQ.isLoading && !logsQ.data?.items?.length && (
            <TableRow><TableCell colSpan={7}><EmptyState icon={ScrollText} title="No executions yet" description="Every automation run is logged here with its conditions and action results." /></TableCell></TableRow>
          )}
          {logsQ.data?.items?.map((e) => (
            <TableRow key={e._id}>
              <TableCell className="font-medium">{e.automationId?.name || '—'}</TableCell>
              <TableCell><Badge variant="secondary">{titleCase(e.trigger || '')}</Badge></TableCell>
              <TableCell className="text-[13px]">{fullName(e.contactId) || '—'}</TableCell>
              <TableCell className="text-[13px]">{e.conditionsResult?.passed ? <span className="text-success">Passed</span> : <span className="text-muted-foreground">Not matched</span>}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                {e.actionsExecuted?.length
                  ? e.actionsExecuted.map((a, i) => (
                    <span key={i} className="block truncate">{titleCase(a.type)}: <span className={a.status === 'success' ? 'text-success' : 'text-destructive'}>{a.status}</span>{a.error ? ` — ${a.error}` : ''}</span>
                  ))
                  : '—'}
              </TableCell>
              <TableCell><StatusBadge status={e.status} /></TableCell>
              <TableCell className="text-[13px] text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination pagination={logsQ.data?.pagination} onPage={setPage} />
    </Card>
  );
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = React.useState({ open: false, automation: null });
  const [confirmDelete, setConfirmDelete] = React.useState(null);

  const metaQ = useQuery({ queryKey: ['automation-meta'], queryFn: () => get('/automations/meta'), staleTime: Infinity });
  const automationsQ = useQuery({ queryKey: ['automations'], queryFn: () => get('/automations') });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => post(`/automations/${id}/status`, { status }),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['automations'] }); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => del(`/automations/${id}`),
    onSuccess: () => { toast.success('Automation deleted.'); qc.invalidateQueries({ queryKey: ['automations'] }); setConfirmDelete(null); },
    onError: (err) => toast.error(err.message),
  });

  const items = automationsQ.data?.items || [];

  return (
    <Page>
      <PageHeader
        title="Automations"
        description="Trigger → conditions → actions. Runs automatically as contacts engage."
        actions={<Button onClick={() => setDialog({ open: true, automation: null })}><Plus /> New automation</Button>}
      />
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules ({items.length})</TabsTrigger>
          <TabsTrigger value="log">Execution log</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          {automationsQ.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((a) => (
                <Card key={a._id}>
                  <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                    <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Zap className="h-4 w-4 text-primary" /></div>
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-[14px]">{a.name}</p>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <Badge variant="secondary">{titleCase(a.trigger)}</Badge>
                        {a.conditions?.length > 0 && <><ArrowRight className="h-3 w-3" /><span>{a.conditions.length} condition{a.conditions.length > 1 ? 's' : ''}</span></>}
                        <ArrowRight className="h-3 w-3" />
                        <span>{a.actions?.map((x) => titleCase(x.type)).join(', ')}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>{a.runCount || 0} runs</p>
                      <p>{a.lastRunAt ? `Last ${timeAgo(a.lastRunAt)}` : 'Never run'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {a.status === 'active'
                        ? <Button variant="outline" size="sm" onClick={() => setStatus.mutate({ id: a._id, status: 'paused' })}><Pause /> Pause</Button>
                        : <Button size="sm" onClick={() => setStatus.mutate({ id: a._id, status: 'active' })}><Play /> Activate</Button>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialog({ open: true, automation: a })}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => setConfirmDelete(a)}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><EmptyState icon={Zap} title="No automations yet"
              description='Example: when a reply is classified "interested" → tag the contact, notify the team and send your booking link.'
              action={<Button onClick={() => setDialog({ open: true, automation: null })}><Plus /> Create your first automation</Button>} /></Card>
          )}
        </TabsContent>

        <TabsContent value="log"><ExecutionLog /></TabsContent>
      </Tabs>

      <AutomationDialog open={dialog.open} automation={dialog.automation} meta={metaQ.data} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
      <ConfirmDialog
        open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`} description="The rule stops running. Past execution logs are kept."
        confirmLabel="Delete" destructive loading={remove.isPending}
        onConfirm={() => remove.mutate(confirmDelete._id)}
      />
    </Page>
  );
}
