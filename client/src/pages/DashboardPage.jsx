import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Users, Send, MailCheck, MailOpen, MousePointerClick, MessageSquare, Star,
  CalendarCheck, Plus, Upload, ArrowUpRight, ArrowDownRight, Megaphone, GitBranch,
  Activity, Plug, Clock,
} from 'lucide-react';
import { get } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Page, PageHeader, StatusBadge, ProviderBadge } from '@/components/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/table';
import { cn, compactNumber, timeAgo, titleCase, fullName, formatDateTime } from '@/lib/utils';

const RANGES = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
};

const CHART_COLORS = ['#6d5ae6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

function MetricCard({ icon: Icon, label, value, suffix = '', change, loading }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center"><Icon className="h-3.5 w-3.5 text-primary" /></div>
        </div>
        {loading ? <Skeleton className="h-7 w-20" /> : (
          <div className="flex items-end gap-2">
            <span className="text-[22px] font-semibold leading-none">{value}{suffix}</span>
            {change != null && (
              <span className={cn('flex items-center text-[11px] font-medium mb-0.5', change >= 0 ? 'text-success' : 'text-destructive')}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(change)}%
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function chartTooltipStyle() {
  return { borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12, color: 'hsl(var(--foreground))' };
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [range, setRange] = React.useState('30d');
  const from = React.useMemo(() => new Date(Date.now() - RANGES[range].days * 864e5).toISOString(), [range]);

  const overview = useQuery({ queryKey: ['analytics-overview', range], queryFn: () => get('/analytics/overview', { from }) });
  const perf = useQuery({ queryKey: ['analytics-performance', range], queryFn: () => get('/analytics/performance', { from }) });
  const providers = useQuery({ queryKey: ['analytics-providers', range], queryFn: () => get('/analytics/providers', { from }) });
  const replies = useQuery({ queryKey: ['analytics-replies', range], queryFn: () => get('/analytics/replies', { from }) });
  const panels = useQuery({ queryKey: ['dashboard-panels'], queryFn: () => get('/analytics/dashboard-panels') });
  const health = useQuery({ queryKey: ['integration-health'], queryFn: () => get('/analytics/health') });
  const upcoming = useQuery({ queryKey: ['upcoming-emails'], queryFn: () => get('/email-messages/upcoming') });

  const m = overview.data?.metrics;
  const funnel = React.useMemo(() => {
    const e = overview.data?.events || {};
    return [
      { stage: 'Sent', value: e.sent || 0 },
      { stage: 'Delivered', value: e.delivered || 0 },
      { stage: 'Opened', value: e.opened || 0 },
      { stage: 'Clicked', value: e.clicked || 0 },
      { stage: 'Replied', value: e.replied || 0 },
    ];
  }, [overview.data]);

  const providerRows = React.useMemo(() => {
    const p = providers.data?.providers || { gmail: {}, brevo: {} };
    return ['sent', 'delivered', 'opened', 'replied'].map((k) => ({
      metric: titleCase(k), Gmail: p.gmail[k] || 0, Brevo: p.brevo[k] || 0,
    }));
  }, [providers.data]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <Page>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's how your outreach is performing."
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(RANGES).map(([k, r]) => <SelectItem key={k} value={k}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={() => navigate('/contacts?import=1')}><Upload /> Import Contacts</Button>
            <Button onClick={() => navigate('/campaigns?new=1')}><Plus /> Create Campaign</Button>
          </>
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard icon={Users} label="Total Contacts" value={compactNumber(m?.totalContacts?.value)} loading={overview.isLoading} />
        <MetricCard icon={Send} label="Emails Sent" value={compactNumber(m?.emailsSent?.value)} loading={overview.isLoading} />
        <MetricCard icon={MailCheck} label="Delivered" value={compactNumber(m?.delivered?.value)} loading={overview.isLoading} />
        <MetricCard icon={MailOpen} label="Open Rate" value={m?.openRate?.value ?? 0} suffix="%" loading={overview.isLoading} />
        <MetricCard icon={MousePointerClick} label="Click Rate" value={m?.clickRate?.value ?? 0} suffix="%" loading={overview.isLoading} />
        <MetricCard icon={MessageSquare} label="Reply Rate" value={m?.replyRate?.value ?? 0} suffix="%" loading={overview.isLoading} />
        <MetricCard icon={Star} label="Interested Leads" value={compactNumber(m?.interestedLeads?.value)} loading={overview.isLoading} />
        <MetricCard icon={CalendarCheck} label="Appointments" value={compactNumber(m?.appointmentsBooked?.value)} loading={overview.isLoading} />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Email performance</CardTitle>
            <CardDescription>Daily sends, opens and replies over the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            {perf.isLoading ? <Skeleton className="h-full w-full" /> : perf.data?.series?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perf.data.series} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6d5ae6" stopOpacity={0.25} /><stop offset="100%" stopColor="#6d5ae6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RTooltip contentStyle={chartTooltipStyle()} />
                  <Area type="monotone" dataKey="sent" stroke="#6d5ae6" fill="url(#gSent)" strokeWidth={2} name="Sent" />
                  <Area type="monotone" dataKey="opened" stroke="#10b981" fill="transparent" strokeWidth={2} name="Opened" />
                  <Area type="monotone" dataKey="replied" stroke="#f59e0b" fill="transparent" strokeWidth={2} name="Replied" />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Activity} title="No email activity yet" description="Launch your first campaign to see performance data here." className="py-8" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Campaign funnel</CardTitle>
            <CardDescription>From sent to replied.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            {overview.isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={70} />
                  <RTooltip contentStyle={chartTooltipStyle()} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                    {funnel.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Gmail vs Brevo</CardTitle>
            <CardDescription>Volume comparison by provider.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={providerRows} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip contentStyle={chartTooltipStyle()} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Gmail" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="Brevo" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Reply classification</CardTitle>
            <CardDescription>AI-detected intent of incoming replies.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px] pt-2">
            {replies.data?.breakdown?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={replies.data.breakdown} dataKey="count" nameKey="classification" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {replies.data.breakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={chartTooltipStyle()} formatter={(v, n) => [v, titleCase(n)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => titleCase(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={MessageSquare} title="No replies analyzed yet" description="When contacts reply, AI classification appears here." className="py-8" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Panels */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> Active campaigns</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/campaigns">View all</Link></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {panels.data?.activeCampaigns?.length ? panels.data.activeCampaigns.map((c) => (
              <Link key={c._id} to={`/campaigns/${c._id}`} className="flex items-center justify-between gap-2 rounded-md border p-2.5 hover:border-primary/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.stats?.sent || 0}/{c.stats?.queued || c.stats?.recipients || 0} sent</p>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            )) : <p className="text-[13px] text-muted-foreground py-3 text-center">No active campaigns.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" /> Active sequences</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/sequences">View all</Link></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {panels.data?.activeSequences?.length ? panels.data.activeSequences.map((s) => (
              <Link key={s._id} to={`/sequences/${s._id}`} className="flex items-center justify-between gap-2 rounded-md border p-2.5 hover:border-primary/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.stats?.active || 0} active · {s.stats?.replied || 0} replies</p>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            )) : <p className="text-[13px] text-muted-foreground py-3 text-center">No active sequences.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Recent replies</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/replies">View all</Link></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {panels.data?.recentReplies?.length ? panels.data.recentReplies.map((r) => (
              <Link key={r._id} to={`/inbox?thread=${r.threadId || ''}`} className="block rounded-md border p-2.5 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium truncate">{fullName(r.contactId) || r.from?.email}</p>
                  {r.aiAnalysis?.classification && <StatusBadge status={r.aiAnalysis.classification} />}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{r.snippet || r.subject}</p>
              </Link>
            )) : <p className="text-[13px] text-muted-foreground py-3 text-center">No replies yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Upcoming scheduled emails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.data?.items?.length ? upcoming.data.items.slice(0, 5).map((u) => (
              <div key={u._id} className="flex items-center justify-between text-[13px] border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.subject || '(no subject)'}</p>
                  <p className="text-[11px] text-muted-foreground">{u.to?.[0]?.email} · {formatDateTime(u.scheduledAt)}</p>
                </div>
                <ProviderBadge provider={u.provider} />
              </div>
            )) : <p className="text-[13px] text-muted-foreground py-3 text-center">Nothing scheduled.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /> Integration health</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/integrations">Manage</Link></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {health.data?.integrations?.length ? health.data.integrations.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{i.email || i.provider}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{i.provider}{i.lastSyncAt ? ` · synced ${timeAgo(i.lastSyncAt)}` : ''}</p>
                </div>
                <StatusBadge status={i.status} />
              </div>
            )) : (
              <div className="text-center py-3">
                <p className="text-[13px] text-muted-foreground mb-2">No accounts connected yet.</p>
                <Button size="sm" variant="outline" asChild><Link to="/integrations">Connect Gmail or Brevo</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0 max-h-[240px] overflow-y-auto scrollbar-thin">
              {panels.data?.recentActivity?.length ? panels.data.recentActivity.map((a) => (
                <div key={a._id} className="flex items-center gap-2.5 text-[13px] py-1.5 border-b last:border-0">
                  <Badge variant="secondary" className="capitalize shrink-0">{titleCase(a.type)}</Badge>
                  <span className="truncate text-muted-foreground">
                    {fullName(a.contactId) || 'System'}{a.campaignId?.name ? ` · ${a.campaignId.name}` : ''}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeAgo(a.occurredAt)}</span>
                </div>
              )) : <p className="text-[13px] text-muted-foreground py-3 text-center">Activity will appear as emails send and contacts engage.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
