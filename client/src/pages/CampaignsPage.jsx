import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Megaphone, MoreHorizontal, Play, Pause, Copy, Archive, XCircle, Search, BarChart3 } from 'lucide-react';
import { get, post } from '@/api/client';
import { Page, PageHeader, StatusBadge, ProviderBadge, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, ErrorState, Pagination } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/misc';
import { timeAgo, titleCase } from '@/lib/utils';
import { CampaignWizard } from '@/features/campaigns/CampaignWizard';

export default function CampaignsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [wizardOpen, setWizardOpen] = React.useState(!!params.get('new'));
  const [confirm, setConfirm] = React.useState(null);

  const campaignsQ = useQuery({
    queryKey: ['campaigns', page, search, status],
    queryFn: () => get('/campaigns', { page, limit: 20, ...(search && { search }), ...(status !== 'all' && { status }) }),
    placeholderData: (p) => p,
    refetchInterval: 15000,
  });

  const action = useMutation({
    mutationFn: ({ id, act }) => post(`/campaigns/${id}/actions/${act}`),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      setConfirm(null);
      if (res.data?.campaign?._id && confirm?.act === 'duplicate') navigate(`/campaigns/${res.data.campaign._id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const items = campaignsQ.data?.items || [];

  return (
    <Page>
      <PageHeader
        title="Campaigns"
        description="One-off email blasts through Gmail (outreach) or Brevo (marketing)."
        actions={<Button onClick={() => setWizardOpen(true)}><Plus /> Create campaign</Button>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3.5 border-b">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search campaigns…" className="pl-8 h-8" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed', 'archived'].map((s) => (
                <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[160px]">Progress</TableHead>
              <TableHead>Open</TableHead>
              <TableHead>Reply</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaignsQ.isLoading && <TableSkeleton rows={6} cols={8} />}
            {campaignsQ.isError && <TableRow><TableCell colSpan={8}><ErrorState message={campaignsQ.error.message} onRetry={() => campaignsQ.refetch()} /></TableCell></TableRow>}
            {!campaignsQ.isLoading && !campaignsQ.isError && !items.length && (
              <TableRow><TableCell colSpan={8}>
                <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to send personalized emails to a list or segment."
                  action={<Button onClick={() => setWizardOpen(true)}><Plus /> Create campaign</Button>} />
              </TableCell></TableRow>
            )}
            {items.map((c) => {
              const denom = c.stats?.queued || c.stats?.recipients || 0;
              const sentPct = denom ? Math.round((c.stats.sent / denom) * 100) : 0;
              const openRate = c.stats?.sent ? Math.round(((c.stats.uniqueOpened || c.stats.opened) / c.stats.sent) * 100) : 0;
              const replyRate = c.stats?.sent ? Math.round((c.stats.replied / c.stats.sent) * 100) : 0;
              return (
                <TableRow key={c._id} className="cursor-pointer" onClick={() => navigate(`/campaigns/${c._id}`)}>
                  <TableCell>
                    <p className="font-medium truncate max-w-[260px]">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[260px]">{c.content?.subject || 'No subject yet'}</p>
                  </TableCell>
                  <TableCell><ProviderBadge provider={c.provider} /></TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell>
                    {['running', 'paused', 'completed'].includes(c.status) && denom > 0 ? (
                      <div className="space-y-1">
                        <Progress value={c.stats.sent} max={denom} className="h-1.5" />
                        <p className="text-[11px] text-muted-foreground">{c.stats.sent}/{denom} sent{c.stats.failed ? ` · ${c.stats.failed} failed` : ''}</p>
                      </div>
                    ) : c.status === 'scheduled' && c.schedule?.scheduledAt ? (
                      <span className="text-xs text-muted-foreground">Starts {timeAgo(c.schedule.scheduledAt)}</span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[13px]">{c.stats?.sent ? `${openRate}%` : '—'}</TableCell>
                  <TableCell className="text-[13px]">{c.stats?.sent ? `${replyRate}%` : '—'}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{timeAgo(c.updatedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/campaigns/${c._id}`)}><BarChart3 /> View report</DropdownMenuItem>
                        {['draft', 'scheduled'].includes(c.status) && (
                          <DropdownMenuItem onClick={() => setConfirm({ id: c._id, act: 'start', label: `Start "${c.name}" now?`, desc: 'Emails begin sending to the resolved audience through background workers.' })}><Play /> Start now</DropdownMenuItem>
                        )}
                        {['running', 'scheduled'].includes(c.status) && (
                          <DropdownMenuItem onClick={() => action.mutate({ id: c._id, act: 'pause' })}><Pause /> Pause</DropdownMenuItem>
                        )}
                        {c.status === 'paused' && (
                          <DropdownMenuItem onClick={() => action.mutate({ id: c._id, act: 'resume' })}><Play /> Resume</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => action.mutate({ id: c._id, act: 'duplicate' })}><Copy /> Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!['completed', 'cancelled', 'archived'].includes(c.status) && (
                          <DropdownMenuItem destructive onClick={() => setConfirm({ id: c._id, act: 'cancel', label: `Cancel "${c.name}"?`, desc: 'Queued and scheduled emails are cancelled. Already-sent emails are unaffected.', destructive: true })}>
                            <XCircle /> Cancel
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => action.mutate({ id: c._id, act: 'archive' })}><Archive /> Archive</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Pagination pagination={campaignsQ.data?.pagination} onPage={setPage} />
      </Card>

      <CampaignWizard open={wizardOpen} onOpenChange={(o) => { setWizardOpen(o); if (!o) setParams((p) => { p.delete('new'); return p; }); }} />
      <ConfirmDialog
        open={!!confirm} onOpenChange={() => setConfirm(null)}
        title={confirm?.label} description={confirm?.desc}
        confirmLabel={titleCase(confirm?.act || '')} destructive={confirm?.destructive}
        loading={action.isPending}
        onConfirm={() => action.mutate({ id: confirm.id, act: confirm.act })}
      />
    </Page>
  );
}
