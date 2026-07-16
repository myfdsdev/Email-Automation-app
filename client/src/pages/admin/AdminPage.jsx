import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Users, Building2, AlertTriangle, Activity, Server, MoreHorizontal } from 'lucide-react';
import { get, post, patch } from '@/api/client';
import { Page, PageHeader, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, Pagination } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { titleCase, timeAgo, formatDateTime, fullName } from '@/lib/utils';

function AdminDashboard() {
  const q = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => get('/admin/dashboard'), refetchInterval: 20000 });
  const d = q.data;
  if (q.isLoading) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const stats = [
    ['Total users', d?.totalUsers, Users],
    ['Active workspaces', d?.activeWorkspaces, Building2],
    ['Emails sent today', d?.emailsToday, Activity],
    ['Failed today', d?.failedToday, AlertTriangle],
    ['Active campaigns', d?.activeCampaigns, Activity],
    ['Gmail disconnections', d?.gmailDisconnections, AlertTriangle],
    ['Brevo failures', d?.brevoFailures, AlertTriangle],
    ['Pending jobs', d?.pendingJobs, Server],
    ['Failed jobs', d?.failedJobs, AlertTriangle],
    ['Pending webhooks', d?.pendingWebhooks, Server],
    ['Bounce rate (30d)', `${d?.bounceRate ?? 0}%`, Activity],
    ['Spam rate (30d)', `${d?.spamRate ?? 0}%`, Activity],
  ];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map(([label, value, Icon]) => (
          <Card key={label}><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-semibold">{value ?? 0}</p>
          </CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Queues</CardTitle><CardDescription>{d?.queues?.enabled ? (d.queues.available ? 'Redis connected' : 'Redis configured but unreachable') : 'Redis not configured — inline dev queue active'}</CardDescription></CardHeader>
        <CardContent>
          {d?.queues?.queues?.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Queue</TableHead><TableHead>Waiting</TableHead><TableHead>Active</TableHead><TableHead>Delayed</TableHead><TableHead>Completed</TableHead><TableHead>Failed</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.queues.queues.map((qq) => (
                  <TableRow key={qq.name}>
                    <TableCell className="font-medium">{qq.name}</TableCell>
                    <TableCell>{qq.waiting ?? '—'}</TableCell><TableCell>{qq.active ?? '—'}</TableCell>
                    <TableCell>{qq.delayed ?? '—'}</TableCell><TableCell>{qq.completed ?? '—'}</TableCell>
                    <TableCell className={qq.failed ? 'text-destructive font-medium' : ''}>{qq.failed ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-[13px] text-muted-foreground">Queue stats unavailable without Redis.</p>}
        </CardContent>
      </Card>
    </>
  );
}

const SECTION_CONFIG = {
  users: {
    title: 'Users', endpoint: '/admin/users', search: true,
    columns: [
      { h: 'User', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email}</p></> },
      { h: 'Verified', render: (r) => (r.isEmailVerified ? <Badge variant="success">Yes</Badge> : <Badge variant="muted">No</Badge>) },
      { h: 'Platform admin', render: (r) => (r.isPlatformAdmin ? <Badge>Admin</Badge> : '—') },
      { h: 'Active', render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Disabled</Badge>) },
      { h: 'Last login', render: (r) => (r.lastLoginAt ? timeAgo(r.lastLoginAt) : '—') },
    ],
    rowActions: (r, { mutate }) => [
      { label: r.isActive ? 'Deactivate' : 'Reactivate', onClick: () => mutate({ url: `/admin/users/${r._id}`, body: { isActive: !r.isActive } }) },
      { label: r.isPlatformAdmin ? 'Revoke platform admin' : 'Make platform admin', onClick: () => mutate({ url: `/admin/users/${r._id}`, body: { isPlatformAdmin: !r.isPlatformAdmin } }) },
    ],
  },
  workspaces: {
    title: 'Workspaces', endpoint: '/admin/workspaces', search: true,
    columns: [
      { h: 'Workspace', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.slug}</p></> },
      { h: 'Owner', render: (r) => r.owner?.email || '—' },
      { h: 'Plan', render: (r) => <Badge variant="secondary">{titleCase(r.plan)}</Badge> },
      { h: 'Active', render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Disabled</Badge>) },
      { h: 'Created', render: (r) => timeAgo(r.createdAt) },
    ],
    rowActions: (r, { mutate }) => [
      { label: r.isActive ? 'Disable workspace' : 'Enable workspace', onClick: () => mutate({ url: `/admin/workspaces/${r._id}`, body: { isActive: !r.isActive } }) },
    ],
  },
  connections: {
    title: 'Gmail & Brevo Connections', endpoint: '/admin/connections', search: true,
    columns: [
      { h: 'Account', render: (r) => <><p className="font-medium">{r.email || r.defaultSenderEmail}</p><p className="text-xs text-muted-foreground">{r.workspaceId?.name}</p></> },
      { h: 'Provider', render: (r) => <Badge variant={r.provider === 'gmail' ? 'destructive' : 'info'}>{titleCase(r.provider)}</Badge> },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Last sync', render: (r) => (r.lastSyncAt ? timeAgo(r.lastSyncAt) : '—') },
      { h: 'Error', render: (r) => <span className="text-xs text-destructive truncate block max-w-[220px]">{r.lastError || '—'}</span> },
    ],
  },
  contacts: {
    title: 'Contacts', endpoint: '/admin/contacts', search: true,
    columns: [
      { h: 'Contact', render: (r) => <><p className="font-medium">{fullName(r)}</p><p className="text-xs text-muted-foreground">{r.email}</p></> },
      { h: 'Workspace', render: (r) => r.workspaceId?.name || '—' },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Created', render: (r) => timeAgo(r.createdAt) },
    ],
  },
  campaigns: {
    title: 'Campaigns', endpoint: '/admin/campaigns', search: true,
    columns: [
      { h: 'Campaign', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.workspaceId?.name}</p></> },
      { h: 'Provider', render: (r) => titleCase(r.provider) },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Sent', render: (r) => `${r.stats?.sent ?? 0}/${r.stats?.recipients ?? 0}` },
      { h: 'Updated', render: (r) => timeAgo(r.updatedAt) },
    ],
  },
  sequences: {
    title: 'Sequences', endpoint: '/admin/sequences', search: true,
    columns: [
      { h: 'Sequence', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.workspaceId?.name}</p></> },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Enrolled', render: (r) => r.stats?.enrolled ?? 0 },
      { h: 'Active', render: (r) => r.stats?.active ?? 0 },
    ],
  },
  automations: {
    title: 'Automations', endpoint: '/admin/automations', search: true,
    columns: [
      { h: 'Automation', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.workspaceId?.name}</p></> },
      { h: 'Trigger', render: (r) => <Badge variant="secondary">{titleCase(r.trigger)}</Badge> },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Runs', render: (r) => r.runCount ?? 0 },
    ],
  },
  'email-logs': {
    title: 'Email Logs', endpoint: '/admin/email-logs', search: true,
    columns: [
      { h: 'Subject', render: (r) => <><p className="font-medium truncate max-w-[240px]">{r.subject || '(no subject)'}</p><p className="text-xs text-muted-foreground">{r.workspaceId?.name}</p></> },
      { h: 'From', render: (r) => <span className="text-xs">{r.from?.email}</span> },
      { h: 'Direction', render: (r) => <Badge variant={r.direction === 'inbound' ? 'success' : 'secondary'}>{titleCase(r.direction)}</Badge> },
      { h: 'Provider', render: (r) => titleCase(r.provider) },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'When', render: (r) => timeAgo(r.createdAt) },
      { h: 'Fail reason', render: (r) => <span className="text-xs text-destructive truncate block max-w-[200px]">{r.failReason || '—'}</span> },
    ],
  },
  webhooks: {
    title: 'Webhook Events', endpoint: '/admin/webhooks', search: true, retry: true,
    columns: [
      { h: 'Event', render: (r) => <><p className="font-medium">{r.eventType || '—'}</p><p className="text-xs text-muted-foreground truncate max-w-[280px]">{r.eventId}</p></> },
      { h: 'Provider', render: (r) => titleCase(r.provider) },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Attempts', render: (r) => r.attempts ?? 0 },
      { h: 'Error', render: (r) => <span className="text-xs text-destructive truncate block max-w-[220px]">{r.error || '—'}</span> },
      { h: 'Received', render: (r) => formatDateTime(r.createdAt) },
    ],
  },
  jobs: {
    title: 'Queue Jobs', endpoint: '/admin/jobs', search: true,
    columns: [
      { h: 'Job', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.queue} · {r.jobId || 'inline'}</p></> },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Attempts', render: (r) => r.attempts ?? 0 },
      { h: 'Duration', render: (r) => (r.durationMs ? `${r.durationMs} ms` : '—') },
      { h: 'Error', render: (r) => <span className="text-xs text-destructive truncate block max-w-[220px]">{r.error || '—'}</span> },
      { h: 'When', render: (r) => timeAgo(r.createdAt) },
    ],
  },
  suppression: {
    title: 'Suppression List (global)', endpoint: '/admin/suppression', search: true,
    columns: [
      { h: 'Email', render: (r) => <p className="font-medium">{r.email}</p> },
      { h: 'Workspace', render: (r) => r.workspaceId?.name || '—' },
      { h: 'Reason', render: (r) => <StatusBadge status={r.reason} /> },
      { h: 'Source', render: (r) => r.source },
      { h: 'Added', render: (r) => timeAgo(r.createdAt) },
    ],
  },
  usage: {
    title: 'Usage & Credits', endpoint: '/admin/usage',
    columns: [
      { h: 'Workspace', render: (r) => <><p className="font-medium">{r.workspaceId?.name || '—'}</p><Badge variant="secondary" className="mt-0.5">{titleCase(r.workspaceId?.plan || 'free')}</Badge></> },
      { h: 'Metric', render: (r) => titleCase(r.metric) },
      { h: 'Period', render: (r) => r.period },
      { h: 'Count', render: (r) => r.count?.toLocaleString() },
    ],
  },
  payments: {
    title: 'Payments & Subscriptions', endpoint: '/admin/payments',
    columns: [
      { h: 'Workspace', render: (r) => r.workspaceId?.name || '—' },
      { h: 'Plan', render: (r) => <Badge variant="secondary">{titleCase(r.plan)}</Badge> },
      { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { h: 'Cycle', render: (r) => titleCase(r.billingCycle || 'monthly') },
      { h: 'Period ends', render: (r) => (r.currentPeriodEnd ? formatDateTime(r.currentPeriodEnd) : '—') },
    ],
  },
  'audit-logs': {
    title: 'Audit Logs', endpoint: '/admin/audit-logs', search: true,
    columns: [
      { h: 'Action', render: (r) => <Badge variant="secondary">{r.action}</Badge> },
      { h: 'User', render: (r) => r.userId?.email || '—' },
      { h: 'Workspace', render: (r) => r.workspaceId?.name || '—' },
      { h: 'Resource', render: (r) => (r.resourceType ? `${r.resourceType} ${r.resourceId ? `#${String(r.resourceId).slice(-6)}` : ''}` : '—') },
      { h: 'IP', render: (r) => <span className="text-xs">{r.ip || '—'}</span> },
      { h: 'When', render: (r) => formatDateTime(r.createdAt) },
    ],
  },
};

function AdminTable({ section }) {
  const cfg = SECTION_CONFIG[section];
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const listQ = useQuery({
    queryKey: ['admin', section, page, search],
    queryFn: () => get(cfg.endpoint, { page, limit: 25, ...(search && { search }) }),
    placeholderData: (p) => p,
  });
  const mutate = useMutation({
    mutationFn: ({ url, body }) => patch(url, body),
    onSuccess: (res) => { toast.success(res.message || 'Updated.'); qc.invalidateQueries({ queryKey: ['admin', section] }); },
    onError: (err) => toast.error(err.message),
  });
  const retry = useMutation({
    mutationFn: (id) => post(`/admin/webhooks/${id}/retry`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['admin', section] }); },
    onError: (err) => toast.error(err.message),
  });

  const items = listQ.data?.items || [];
  return (
    <Card>
      {cfg.search && (
        <div className="p-3.5 border-b">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={`Search ${cfg.title.toLowerCase()}…`} className="h-8 max-w-sm" />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {cfg.columns.map((c) => <TableHead key={c.h}>{c.h}</TableHead>)}
            {(cfg.rowActions || cfg.retry) && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {listQ.isLoading && <TableSkeleton rows={8} cols={cfg.columns.length + 1} />}
          {!listQ.isLoading && !items.length && (
            <TableRow><TableCell colSpan={cfg.columns.length + 1}><EmptyState title={`No ${cfg.title.toLowerCase()} found`} /></TableCell></TableRow>
          )}
          {items.map((r) => (
            <TableRow key={r._id}>
              {cfg.columns.map((c) => <TableCell key={c.h}>{c.render(r)}</TableCell>)}
              {(cfg.rowActions || cfg.retry) && (
                <TableCell>
                  {cfg.retry && ['failed', 'received'].includes(r.status) && (
                    <Button variant="outline" size="sm" onClick={() => retry.mutate(r._id)}><RefreshCw /> Retry</Button>
                  )}
                  {cfg.rowActions && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {cfg.rowActions(r, { mutate: mutate.mutate }).map((a) => (
                          <DropdownMenuItem key={a.label} onClick={a.onClick}>{a.label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination pagination={listQ.data?.pagination} onPage={setPage} />
    </Card>
  );
}

function AdminPlans() {
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => get('/admin/plans') });
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {(q.data?.plans || []).map((p) => (
        <Card key={p.id}>
          <CardHeader><CardTitle>{p.name}</CardTitle><CardDescription>${p.price}/mo · {p.workspaces} workspaces</CardDescription></CardHeader>
          <CardContent className="text-[13px] space-y-1 text-muted-foreground">
            <p>{p.contacts.toLocaleString()} contacts</p>
            <p>{p.emailsPerMonth.toLocaleString()} emails/mo</p>
            <p>{p.teamMembers} members · {p.gmailAccounts} Gmail</p>
            <p>{p.aiCreditsPerMonth.toLocaleString()} AI credits</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdminSystem() {
  const q = useQuery({ queryKey: ['admin-system'], queryFn: () => get('/admin/system'), refetchInterval: 15000 });
  const d = q.data;
  return (
    <Card>
      <CardHeader><CardTitle>System settings & health</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-[13px]">
        {[
          ['Node version', d?.node],
          ['Uptime', d ? `${Math.floor(d.uptimeSec / 3600)}h ${Math.floor((d.uptimeSec % 3600) / 60)}m` : '—'],
          ['Memory (RSS)', d ? `${d.memoryMb} MB` : '—'],
          ['MongoDB', d?.mongo],
          ['Environment', d?.env?.nodeEnv],
          ['Workers (Redis)', d?.env?.workersEnabled ? 'Enabled' : 'Inline dev mode (no Redis)'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b last:border-0 py-2">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{String(v ?? '—')}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const params = useParams();
  const section = (params['*'] || '').split('/')[0];

  let content;
  let title = 'Admin Dashboard';
  let description = 'Platform-wide health and activity.';
  if (!section) content = <AdminDashboard />;
  else if (section === 'plans') { content = <AdminPlans />; title = 'Plans'; description = 'Plan definitions and adoption.'; }
  else if (section === 'system') { content = <AdminSystem />; title = 'System'; description = 'Runtime health and configuration.'; }
  else if (SECTION_CONFIG[section]) {
    title = SECTION_CONFIG[section].title;
    description = 'Cross-workspace administration.';
    content = <AdminTable section={section} />;
  } else content = <EmptyState title="Section not found" />;

  return (
    <Page>
      <PageHeader title={title} description={description} />
      {content}
    </Page>
  );
}
