import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, GitBranch, MoreHorizontal, Play, Pause, Archive, Users } from 'lucide-react';
import { get, post } from '@/api/client';
import { Page, PageHeader, StatusBadge, ProviderBadge, Field, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/table';
import { timeAgo } from '@/lib/utils';

function NewSequenceDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [provider, setProvider] = React.useState('gmail');
  const [connectionId, setConnectionId] = React.useState('');
  const connectionsQ = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations'), enabled: open });
  const usable = (connectionsQ.data?.connections || []).filter((c) => c.provider === provider && c.status === 'connected');

  const create = useMutation({
    mutationFn: () => post('/sequences', { name, description, provider, connectionId: connectionId || undefined }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['sequences'] });
      onOpenChange(false);
      navigate(`/sequences/${res.data.sequence._id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New sequence</DialogTitle>
          <DialogDescription>Automated multi-step follow-ups that stop when a contact replies, books a meeting, or unsubscribes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold outreach — 4 touches" /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <Select value={provider} onValueChange={(v) => { setProvider(v); setConnectionId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Gmail (recommended)</SelectItem>
                  <SelectItem value="brevo">Brevo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sender account">
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger><SelectValue placeholder={usable.length ? 'Choose' : 'None connected'} /></SelectTrigger>
                <SelectContent>{usable.map((c) => <SelectItem key={c._id} value={c._id}>{c.email || c.defaultSenderEmail}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>Create & add steps</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SequencesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);

  const sequencesQ = useQuery({ queryKey: ['sequences'], queryFn: () => get('/sequences', { limit: 100 }) });
  const action = useMutation({
    mutationFn: ({ id, act }) => post(`/sequences/${id}/actions/${act}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['sequences'] }); setConfirm(null); },
    onError: (err) => toast.error(err.message),
  });

  const items = sequencesQ.data?.items || [];

  return (
    <Page>
      <PageHeader
        title="Sequences"
        description="Step-based follow-up flows with automatic stop-on-reply."
        actions={<Button onClick={() => setNewOpen(true)}><Plus /> New sequence</Button>}
      />

      {sequencesQ.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : items.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((s) => (
            <Card key={s._id} interactive onClick={() => navigate(`/sequences/${s._id}`)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><GitBranch className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{s.name}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1"><StatusBadge status={s.status} /><ProviderBadge provider={s.provider} /></div>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status !== 'active' && <DropdownMenuItem onClick={() => action.mutate({ id: s._id, act: 'activate' })}><Play /> Activate</DropdownMenuItem>}
                        {s.status === 'active' && <DropdownMenuItem onClick={() => action.mutate({ id: s._id, act: 'pause' })}><Pause /> Pause</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onClick={() => setConfirm(s)}><Archive /> Archive</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {s.description && <CardDescription className="line-clamp-2">{s.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Enrolled', s.stats?.enrolled ?? 0],
                    ['Active', s.stats?.active ?? 0],
                    ['Replied', s.stats?.replied ?? 0],
                    ['Done', s.stats?.completed ?? 0],
                  ].map(([label, v]) => (
                    <div key={label} className="rounded-md bg-secondary/50 py-2">
                      <p className="text-sm font-semibold">{v}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">Updated {timeAgo(s.updatedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={GitBranch} title="No sequences yet"
          description="A sequence sends a series of emails with delays — and automatically stops when someone replies or books a meeting."
          action={<Button onClick={() => setNewOpen(true)}><Plus /> Build your first sequence</Button>} /></Card>
      )}

      <NewSequenceDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConfirmDialog
        open={!!confirm} onOpenChange={() => setConfirm(null)}
        title={`Archive "${confirm?.name}"?`}
        description="Active enrollments are stopped and no further steps send."
        confirmLabel="Archive" destructive loading={action.isPending}
        onConfirm={() => action.mutate({ id: confirm._id, act: 'archive' })}
      />
    </Page>
  );
}
