import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, Play, Pause, XCircle, Pencil, Copy } from 'lucide-react';
import { get, post } from '@/api/client';
import { Page, PageHeader, StatusBadge, ProviderBadge, ConfirmDialog, FullPageSpinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/misc';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, Pagination } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { fullName, formatDateTime, timeAgo, titleCase } from '@/lib/utils';
import { CampaignWizard } from '@/features/campaigns/CampaignWizard';

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);
  const [recipientPage, setRecipientPage] = React.useState(1);
  const [recipientStatus, setRecipientStatus] = React.useState('all');

  const campaignQ = useQuery({ queryKey: ['campaign', id], queryFn: () => get(`/campaigns/${id}`), refetchInterval: 10000 });
  const reportQ = useQuery({ queryKey: ['campaign-report', id], queryFn: () => get(`/campaigns/${id}/report`), refetchInterval: 20000 });
  const recipientsQ = useQuery({
    queryKey: ['campaign-recipients', id, recipientPage, recipientStatus],
    queryFn: () => get(`/campaigns/${id}/recipients`, { page: recipientPage, limit: 20, ...(recipientStatus !== 'all' && { status: recipientStatus }) }),
    placeholderData: (p) => p,
  });

  const action = useMutation({
    mutationFn: (act) => post(`/campaigns/${id}/actions/${act}`),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      setConfirm(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const c = campaignQ.data?.campaign;
  if (campaignQ.isLoading) return <FullPageSpinner label="Loading campaign…" />;
  if (!c) return <Page><EmptyState title="Campaign not found" action={<Button asChild><Link to="/campaigns">Back to campaigns</Link></Button>} /></Page>;

  const rates = reportQ.data?.rates;
  const denom = c.stats?.queued || c.stats?.recipients || 0;

  const timelineData = React.useMemo(() => {
    const rows = reportQ.data?.timeline || [];
    const byDay = {};
    rows.forEach((r) => {
      byDay[r._id.day] = byDay[r._id.day] || { day: r._id.day };
      byDay[r._id.day][r._id.type] = r.count;
    });
    return Object.values(byDay);
  }, [reportQ.data]);

  return (
    <Page>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {c.name} <StatusBadge status={c.status} /> <ProviderBadge provider={c.provider} />
          </span>
        }
        description={c.description || `Created ${timeAgo(c.createdAt)} · Sender: ${c.connectionId?.email || c.connectionId?.defaultSenderEmail || 'not set'}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/campaigns')}><ArrowLeft /> Back</Button>
            {['draft', 'scheduled', 'paused'].includes(c.status) && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {['draft', 'scheduled'].includes(c.status) && (
              <Button onClick={() => setConfirm({ act: 'start', title: 'Start campaign now?', desc: 'Emails start sending through workers immediately.' })}><Play /> Start</Button>
            )}
            {c.status === 'running' && <Button variant="outline" onClick={() => action.mutate('pause')}><Pause /> Pause</Button>}
            {c.status === 'paused' && <Button onClick={() => action.mutate('resume')}><Play /> Resume</Button>}
            {['running', 'paused', 'scheduled'].includes(c.status) && (
              <Button variant="destructive" onClick={() => setConfirm({ act: 'cancel', title: 'Cancel campaign?', desc: 'Queued emails are cancelled permanently.', destructive: true })}><XCircle /> Cancel</Button>
            )}
          </>
        }
      />

      {['running', 'paused'].includes(c.status) && denom > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-[13px] mb-1.5">
                <span className="font-medium">Sending progress</span>
                <span className="text-muted-foreground">{c.stats.sent}/{denom} sent{c.stats.failed ? ` · ${c.stats.failed} failed` : ''}</span>
              </div>
              <Progress value={c.stats.sent + c.stats.failed} max={denom} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          ['Recipients', c.stats?.recipients ?? 0],
          ['Sent', c.stats?.sent ?? 0],
          ['Delivered', c.stats?.delivered ?? 0],
          ['Opens', `${rates?.openRate ?? 0}%`],
          ['Clicks', `${rates?.clickRate ?? 0}%`],
          ['Replies', `${rates?.replyRate ?? 0}%`],
          ['Interested', c.stats?.interested ?? 0],
          ['Bounces', c.stats?.bounced ?? 0],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-3.5">
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <Card>
            <CardHeader><CardTitle>Event timeline</CardTitle><CardDescription>Daily event counts for this campaign.</CardDescription></CardHeader>
            <CardContent className="h-[280px]">
              {reportQ.isLoading ? <Skeleton className="h-full w-full" /> : timelineData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sent" fill="#6d5ae6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="delivered" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="opened" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="replied" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState title="No events yet" description="Once emails start sending, the timeline fills in." className="py-8" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients">
          <Card>
            <div className="flex items-center gap-2 p-3.5 border-b">
              <Select value={recipientStatus} onValueChange={(v) => { setRecipientStatus(v); setRecipientPage(1); }}>
                <SelectTrigger className="w-[170px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {['queued', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'failed', 'cancelled', 'hard_bounce'].map((s) => (
                    <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead>
                  <TableHead>Opens</TableHead><TableHead>Clicks</TableHead><TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipientsQ.isLoading && <TableSkeleton rows={6} cols={6} />}
                {!recipientsQ.isLoading && !recipientsQ.data?.items?.length && (
                  <TableRow><TableCell colSpan={6}><EmptyState title="No recipients yet" description="Recipients appear once the campaign starts." /></TableCell></TableRow>
                )}
                {recipientsQ.data?.items?.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell>
                      <p className="font-medium">{fullName(m.contactId) || m.to?.[0]?.email}</p>
                      <p className="text-xs text-muted-foreground">{m.to?.[0]?.email}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{m.sentAt ? formatDateTime(m.sentAt) : '—'}</TableCell>
                    <TableCell className="text-[13px]">{m.openCount || 0}</TableCell>
                    <TableCell className="text-[13px]">{m.clickCount || 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{m.failReason || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagination={recipientsQ.data?.pagination} onPage={setRecipientPage} />
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>Email content</CardTitle>
              <CardDescription>Subject: {c.content?.subject || '—'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-background p-5 email-body max-w-2xl"
                dangerouslySetInnerHTML={{ __html: c.content?.bodyHtml || `<pre style="white-space:pre-wrap;font-family:inherit">${c.content?.bodyText || 'No content'}</pre>` }} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CampaignWizard open={editOpen} onOpenChange={setEditOpen} existing={c} />
      <ConfirmDialog
        open={!!confirm} onOpenChange={() => setConfirm(null)}
        title={confirm?.title} description={confirm?.desc}
        confirmLabel={titleCase(confirm?.act || '')} destructive={confirm?.destructive}
        loading={action.isPending}
        onConfirm={() => action.mutate(confirm.act)}
      />
    </Page>
  );
}
