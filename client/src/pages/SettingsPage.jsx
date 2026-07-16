import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserRound, Building2, UsersRound, ShieldBan, Plus, Trash2, MoreHorizontal, Mail } from 'lucide-react';
import { get, post, patch, del } from '@/api/client';
import { useAuthStore, can } from '@/stores/authStore';
import { Page, PageHeader, Field, StatusBadge, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch, Avatar, Label } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Pagination, TableSkeleton } from '@/components/ui/table';
import { titleCase, timeAgo, formatDate } from '@/lib/utils';

function ProfileTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [name, setName] = React.useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');

  const save = useMutation({
    mutationFn: () => patch('/users/me', { name, ...(newPassword ? { currentPassword, newPassword } : {}) }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['me'] });
      setCurrentPassword(''); setNewPassword('');
    },
    onError: (err) => toast.error(err.message),
  });
  const resend = useMutation({
    mutationFn: () => post('/auth/resend-verification'),
    onSuccess: (res) => toast.success(res.message),
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Your personal account details.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user?.name} src={user?.avatarUrl} size="lg" />
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-[13px] text-muted-foreground">{user?.email}</p>
              {user?.isEmailVerified
                ? <Badge variant="success" className="mt-1">Email verified</Badge>
                : (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="warning">Email not verified</Badge>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => resend.mutate()}>Resend verification</Button>
                  </div>
                )}
            </div>
          </div>
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save profile</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Other active sessions are signed out after a change.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Current password"><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="New password" description="Minimum 8 characters."><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
          <Button variant="outline" disabled={!currentPassword || newPassword.length < 8} loading={save.isPending} onClick={() => save.mutate()}>Update password</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceTab() {
  const qc = useQueryClient();
  const wsQ = useQuery({ queryKey: ['workspace-current'], queryFn: () => get('/workspaces/current') });
  const ws = wsQ.data?.workspace;
  const [form, setForm] = React.useState(null);
  React.useEffect(() => {
    if (ws && !form) {
      setForm({
        name: ws.name, timezone: ws.timezone, businessName: ws.businessName || '', businessAddress: ws.businessAddress || '',
        bookingLink: ws.bookingLink || '', settings: { ...ws.settings },
      });
    }
  }, [ws]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => patch('/workspaces/current', form),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['workspace-current'] }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (err) => toast.error(err.message),
  });

  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setS = (k, v) => setForm((f) => ({ ...f, settings: { ...f.settings, [k]: v } }));

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card>
        <CardHeader><CardTitle>Workspace</CardTitle><CardDescription>Business identity used in compliance footers and booking flows.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Workspace name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Timezone" description="Used for sending windows.">
            <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'].map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Business name"><Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
          <Field label="Business address" description="Required in marketing email footers (CAN-SPAM/GDPR)."><Textarea rows={2} value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} /></Field>
          <Field label="Booking link" description="Sent automatically to interested leads (Calendly, Cal.com…).">
            <Input value={form.bookingLink} onChange={(e) => set('bookingLink', e.target.value)} placeholder="https://cal.com/you/intro" />
          </Field>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save workspace</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sending defaults</CardTitle><CardDescription>Applied to campaigns and sequences unless overridden.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily send limit"><Input type="number" min={1} value={form.settings.dailySendLimit} onChange={(e) => setS('dailySendLimit', +e.target.value)} /></Field>
            <Field label="Hourly send limit"><Input type="number" min={1} value={form.settings.hourlySendLimit} onChange={(e) => setS('hourlySendLimit', +e.target.value)} /></Field>
            <Field label="Window start"><Input type="time" value={form.settings.sendingWindowStart} onChange={(e) => setS('sendingWindowStart', e.target.value)} /></Field>
            <Field label="Window end"><Input type="time" value={form.settings.sendingWindowEnd} onChange={(e) => setS('sendingWindowEnd', e.target.value)} /></Field>
          </div>
          {[
            ['skipWeekends', 'Skip weekends'],
            ['trackOpens', 'Track opens (Brevo)'],
            ['trackClicks', 'Track clicks (Brevo)'],
            ['autoReplyEnabled', 'Allow automatic AI replies for safe categories', 'Off by default. AI replies are saved as drafts for human review.'],
          ].map(([key, label, hint]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-md border p-3 text-[13px]">
              <span>{label}{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</span>
              <Switch checked={!!form.settings[key]} onCheckedChange={(v) => setS(key, v)} />
            </label>
          ))}
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save defaults</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('sales');
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  const teamQ = useQuery({ queryKey: ['team'], queryFn: () => get('/team') });

  const invite = useMutation({
    mutationFn: () => post('/team/invite', { email, role }),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['team'] }); setInviteOpen(false); setEmail(''); },
    onError: (err) => toast.error(err.message),
  });
  const updateMember = useMutation({
    mutationFn: ({ id, body }) => patch(`/team/${id}`, body),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['team'] }); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => del(`/team/${id}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['team'] }); setConfirmRemove(null); },
    onError: (err) => toast.error(err.message),
  });

  const ROLE_DESCRIPTIONS = {
    admin: 'Contacts, templates, campaigns, sequences, analytics',
    sales: 'Assigned contacts & conversations, replies, follow-ups',
    viewer: 'Dashboards and analytics only',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div><CardTitle>Team members</CardTitle><CardDescription>Owner → Admin → Sales Member → Viewer. Workspace data stays isolated per workspace.</CardDescription></div>
          <Button onClick={() => setInviteOpen(true)}><Plus /> Invite member</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="pl-5">Member</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead className="w-10" /></TableRow>
          </TableHeader>
          <TableBody>
            {(teamQ.data?.members || []).map((m) => (
              <TableRow key={m._id}>
                <TableCell className="pl-5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.userId?.name || m.email} size="sm" />
                    <div>
                      <p className="font-medium">{m.userId?.name || m.email}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {m.role === 'owner' ? <Badge>Owner</Badge> : (
                    <Select value={m.role} onValueChange={(v) => updateMember.mutate({ id: m._id, body: { role: v } })}>
                      <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['admin', 'sales', 'viewer'].map((r) => <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{m.joinedAt ? formatDate(m.joinedAt) : 'Pending invite'}</TableCell>
                <TableCell>
                  {m.role !== 'owner' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {m.status === 'active' && <DropdownMenuItem onClick={() => updateMember.mutate({ id: m._id, body: { status: 'suspended' } })}>Suspend</DropdownMenuItem>}
                        {m.status === 'suspended' && <DropdownMenuItem onClick={() => updateMember.mutate({ id: m._id, body: { status: 'active' } })}>Reactivate</DropdownMenuItem>}
                        <DropdownMenuItem destructive onClick={() => setConfirmRemove(m)}><Trash2 /> Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite team member</DialogTitle><DialogDescription>They'll receive an email invitation to join this workspace.</DialogDescription></DialogHeader>
          <div className="space-y-3.5">
            <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" /></Field>
            <Field label="Role" description={ROLE_DESCRIPTIONS[role]}>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="sales">Sales Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button loading={invite.isPending} disabled={!email} onClick={() => invite.mutate()}><Mail /> Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}
        title={`Remove ${confirmRemove?.email}?`} description="They immediately lose access to this workspace."
        confirmLabel="Remove" destructive loading={remove.isPending}
        onConfirm={() => remove.mutate(confirmRemove._id)}
      />
    </Card>
  );
}

function SuppressionTab() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [addOpen, setAddOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  const suppQ = useQuery({ queryKey: ['suppression', page], queryFn: () => get('/suppression', { page, limit: 25 }), placeholderData: (p) => p });

  const add = useMutation({
    mutationFn: () => post('/suppression', { email, reason: 'manual_block' }),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['suppression'] }); setAddOpen(false); setEmail(''); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => del(`/suppression/${id}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['suppression'] }); setConfirmRemove(null); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Suppression list</CardTitle>
            <CardDescription>These addresses never receive campaigns or sequences. Unsubscribes, hard bounces and spam complaints land here automatically.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setAddOpen(true)}><ShieldBan /> Suppress email</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="pl-5">Email</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead>Added</TableHead><TableHead className="w-16" /></TableRow>
          </TableHeader>
          <TableBody>
            {suppQ.isLoading && <TableSkeleton rows={4} cols={5} />}
            {!suppQ.isLoading && !suppQ.data?.items?.length && (
              <TableRow><TableCell colSpan={5}><EmptyState icon={ShieldBan} title="Suppression list is empty" description="That's a good thing — it fills automatically when contacts opt out." /></TableCell></TableRow>
            )}
            {suppQ.data?.items?.map((s) => (
              <TableRow key={s._id}>
                <TableCell className="pl-5 font-medium">{s.email}</TableCell>
                <TableCell><StatusBadge status={s.reason} /></TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{s.source}</TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{timeAgo(s.createdAt)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(s)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination pagination={suppQ.data?.pagination} onPage={setPage} />
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suppress an email</DialogTitle>
            <DialogDescription>Stops all sequences, cancels scheduled emails and blocks future sends to this address.</DialogDescription>
          </DialogHeader>
          <Field label="Email address" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="destructive" loading={add.isPending} disabled={!email} onClick={() => add.mutate()}>Suppress</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}
        title={`Remove ${confirmRemove?.email} from suppression?`}
        description="Only do this with explicit consent from the contact — they'll become eligible for sends again."
        confirmLabel="Remove from list" destructive loading={remove.isPending}
        onConfirm={() => remove.mutate(confirmRemove._id)}
      />
    </Card>
  );
}

export default function SettingsPage() {
  const [params] = useSearchParams();
  const role = useAuthStore((s) => s.role());
  const defaultTab = params.get('tab') || 'profile';

  return (
    <Page>
      <PageHeader title="Settings" description="Manage your profile, workspace, team and compliance." />
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile"><UserRound className="h-3.5 w-3.5 mr-1.5" /> Profile</TabsTrigger>
          {can(role, 'workspace') && <TabsTrigger value="workspace"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Workspace</TabsTrigger>}
          {can(role, 'team') && <TabsTrigger value="team"><UsersRound className="h-3.5 w-3.5 mr-1.5" /> Team</TabsTrigger>}
          {can(role, 'suppression') && <TabsTrigger value="suppression"><ShieldBan className="h-3.5 w-3.5 mr-1.5" /> Suppression</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="workspace"><WorkspaceTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="suppression"><SuppressionTab /></TabsContent>
      </Tabs>
    </Page>
  );
}
