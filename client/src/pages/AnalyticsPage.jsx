import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BarChart3, Users as UsersIcon } from 'lucide-react';
import { get } from '@/api/client';
import { Page, PageHeader, StatusBadge } from '@/components/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/misc';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/table';
import { titleCase, timeAgo } from '@/lib/utils';

const COLORS = ['#6d5ae6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const tooltipStyle = { borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 };
const RANGES = { '7d': 7, '30d': 30, '90d': 90 };

export default function AnalyticsPage() {
  const [range, setRange] = React.useState('30d');
  const from = React.useMemo(() => new Date(Date.now() - RANGES[range] * 864e5).toISOString(), [range]);

  const overview = useQuery({ queryKey: ['analytics-overview', range], queryFn: () => get('/analytics/overview', { from }) });
  const perf = useQuery({ queryKey: ['analytics-performance', range], queryFn: () => get('/analytics/performance', { from }) });
  const providers = useQuery({ queryKey: ['analytics-providers', range], queryFn: () => get('/analytics/providers', { from }) });
  const replies = useQuery({ queryKey: ['analytics-replies', range], queryFn: () => get('/analytics/replies', { from }) });
  const team = useQuery({ queryKey: ['analytics-team', range], queryFn: () => get('/analytics/team', { from }) });
  const health = useQuery({ queryKey: ['integration-health'], queryFn: () => get('/analytics/health') });
  const campaigns = useQuery({ queryKey: ['campaigns-analytics'], queryFn: () => get('/campaigns', { limit: 15 }) });

  const providerRows = React.useMemo(() => {
    const p = providers.data?.providers || { gmail: {}, brevo: {} };
    return ['sent', 'delivered', 'opened', 'clicked', 'replied', 'hard_bounce'].map((k) => ({
      metric: titleCase(k), Gmail: p.gmail[k] || 0, Brevo: p.brevo[k] || 0,
    }));
  }, [providers.data]);

  const e = overview.data?.events || {};

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description="Performance across campaigns, sequences, providers and your team."
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['Sent', e.sent || 0], ['Delivered', e.delivered || 0], ['Opened', e.opened || 0],
          ['Clicked', e.clicked || 0], ['Replied', e.replied || 0], ['Bounced', (e.hard_bounce || 0) + (e.soft_bounce || 0)],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4">
            <p className="text-xl font-semibold">{Number(value).toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="replies">Replies</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <Card>
            <CardHeader><CardTitle>Daily email activity</CardTitle><CardDescription>Sent, delivered, opened, clicked and replied per day.</CardDescription></CardHeader>
            <CardContent className="h-[320px]">
              {perf.isLoading ? <Skeleton className="h-full w-full" /> : perf.data?.series?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perf.data.series} margin={{ top: 5, right: 5, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RTooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sent" stroke="#6d5ae6" fill="#6d5ae61a" strokeWidth={2} />
                    <Area type="monotone" dataKey="delivered" stroke="#3b82f6" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="opened" stroke="#10b981" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="clicked" stroke="#f59e0b" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="replied" stroke="#ef4444" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={BarChart3} title="No activity in this period" className="py-10" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader><CardTitle>Campaign performance</CardTitle><CardDescription>Delivery, engagement and reply rates per campaign.</CardDescription></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead><TableHead>Status</TableHead><TableHead>Recipients</TableHead>
                  <TableHead>Sent</TableHead><TableHead>Open rate</TableHead><TableHead>Click rate</TableHead>
                  <TableHead>Reply rate</TableHead><TableHead>Interested</TableHead><TableHead>Bounces</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns.data?.items || []).map((c) => {
                  const s = c.stats || {};
                  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');
                  return (
                    <TableRow key={c._id}>
                      <TableCell className="font-medium max-w-[220px] truncate">{c.name}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell>{s.recipients || 0}</TableCell>
                      <TableCell>{s.sent || 0}</TableCell>
                      <TableCell>{pct(s.uniqueOpened || s.opened, s.sent)}</TableCell>
                      <TableCell>{pct(s.uniqueClicked || s.clicked, s.sent)}</TableCell>
                      <TableCell>{pct(s.replied, s.sent)}</TableCell>
                      <TableCell>{s.interested || 0}</TableCell>
                      <TableCell>{s.bounced || 0}</TableCell>
                    </TableRow>
                  );
                })}
                {!campaigns.data?.items?.length && (
                  <TableRow><TableCell colSpan={9}><EmptyState title="No campaigns yet" className="py-8" /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Gmail vs Brevo</CardTitle><CardDescription>Event volume by provider.</CardDescription></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={providerRows} margin={{ top: 5, right: 5, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RTooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Gmail" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Brevo" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Sender account health</CardTitle><CardDescription>Connection status and sync recency.</CardDescription></CardHeader>
              <CardContent className="space-y-2.5">
                {(health.data?.integrations || []).map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{i.email || i.provider}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {titleCase(i.provider)} · {i.lastSyncAt ? `synced ${timeAgo(i.lastSyncAt)}` : 'never synced'} · {i.sentToday || 0} sent today
                      </p>
                      {i.lastError && <p className="text-[11px] text-destructive truncate max-w-[300px]">{i.lastError}</p>}
                    </div>
                    <StatusBadge status={i.status} />
                  </div>
                ))}
                {!health.data?.integrations?.length && <EmptyState title="No accounts connected" className="py-6" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="replies">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Reply classification</CardTitle><CardDescription>AI-detected intent distribution.</CardDescription></CardHeader>
              <CardContent className="h-[300px]">
                {replies.data?.breakdown?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={replies.data.breakdown} dataKey="count" nameKey="classification" innerRadius={60} outerRadius={95} paddingAngle={2}>
                        {replies.data.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RTooltip contentStyle={tooltipStyle} formatter={(v, n) => [v, titleCase(n)]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => titleCase(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="No classified replies yet" className="py-10" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(replies.data?.breakdown || []).map((b, i) => (
                  <div key={b.classification} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1">{titleCase(b.classification)}</span>
                    <span className="font-medium">{b.count}</span>
                  </div>
                ))}
                {!replies.data?.breakdown?.length && <p className="text-[13px] text-muted-foreground py-4 text-center">Nothing yet.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader><CardTitle>Team performance</CardTitle><CardDescription>Replies handled, interested leads and meetings per member.</CardDescription></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead><TableHead>Role</TableHead>
                  <TableHead>Emails sent</TableHead><TableHead>Interested leads</TableHead><TableHead>Appointments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(team.data?.members || []).map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell><p className="font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.email}</p></TableCell>
                    <TableCell className="capitalize text-[13px]">{m.role}</TableCell>
                    <TableCell>{m.repliesHandled || 0}</TableCell>
                    <TableCell>{m.interested || 0}</TableCell>
                    <TableCell>{m.appointments || 0}</TableCell>
                  </TableRow>
                ))}
                {!team.data?.members?.length && (
                  <TableRow><TableCell colSpan={5}><EmptyState icon={UsersIcon} title="No team activity yet" className="py-8" /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
