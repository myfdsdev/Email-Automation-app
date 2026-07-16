import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, Sparkles } from 'lucide-react';
import { get, post } from '@/api/client';
import { Page, PageHeader, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress, Skeleton, Separator } from '@/components/ui/misc';
import { titleCase, formatDate, cn } from '@/lib/utils';

const USAGE_LABELS = {
  contacts: 'Contacts',
  emails_sent: 'Emails sent (this month)',
  ai_credits: 'AI credits (this month)',
  gmail_accounts: 'Gmail accounts',
  team_members: 'Team members',
  active_sequences: 'Active sequences',
};

export default function BillingPage() {
  const qc = useQueryClient();
  const [confirmPlan, setConfirmPlan] = React.useState(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const billingQ = useQuery({ queryKey: ['billing'], queryFn: () => get('/billing') });
  const changePlan = useMutation({
    mutationFn: (plan) => post('/billing/change-plan', { plan }),
    onSuccess: (res) => {
      toast.success(res.message || res.data?.message);
      qc.invalidateQueries({ queryKey: ['billing'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      setConfirmPlan(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelSub = useMutation({
    mutationFn: () => post('/billing/cancel'),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['billing'] }); setConfirmCancel(false); },
    onError: (err) => toast.error(err.message),
  });

  const data = billingQ.data;

  return (
    <Page>
      <PageHeader title="Billing & Usage" description="Your plan, usage limits and billing history. Provider costs (Brevo, OpenAI) are billed by those providers directly." />

      {billingQ.isLoading ? <Skeleton className="h-64 w-full" /> : data && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Current plan: {titleCase(data.plan)}</CardTitle>
                  <CardDescription>
                    {data.subscription?.currentPeriodEnd ? `Renews ${formatDate(data.subscription.currentPeriodEnd)}` : 'Free plan — no billing period'}
                    {data.subscription?.cancelAtPeriodEnd && ' · cancels at period end'}
                  </CardDescription>
                </div>
                {data.plan !== 'free' && !data.subscription?.cancelAtPeriodEnd && (
                  <Button variant="outline" onClick={() => setConfirmCancel(true)}>Cancel subscription</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(data.usage || {}).map(([key, u]) => (
                  <div key={key} className="rounded-md border p-3.5">
                    <div className="flex justify-between text-[13px] mb-2">
                      <span className="font-medium">{USAGE_LABELS[key] || titleCase(key)}</span>
                      <span className="text-muted-foreground">{u.used.toLocaleString()} / {u.limit.toLocaleString()}</span>
                    </div>
                    <Progress value={u.used} max={u.limit} className="h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(data.plans || []).map((p) => {
              const isCurrent = p.id === data.plan;
              return (
                <Card key={p.id} className={cn(isCurrent && 'border-primary ring-1 ring-primary/30')}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle>{p.name}</CardTitle>
                      {isCurrent && <Badge>Current</Badge>}
                      {p.id === 'growth' && !isCurrent && <Badge variant="info"><Sparkles className="h-3 w-3" /> Popular</Badge>}
                    </div>
                    <p className="text-2xl font-semibold">${p.price}<span className="text-[13px] font-normal text-muted-foreground">/mo</span></p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      `${p.contacts.toLocaleString()} contacts`,
                      `${p.emailsPerMonth.toLocaleString()} emails/mo`,
                      `${p.gmailAccounts} Gmail account${p.gmailAccounts > 1 ? 's' : ''}`,
                      `${p.teamMembers} team members`,
                      `${p.activeSequences} active sequences`,
                      `${p.aiCreditsPerMonth.toLocaleString()} AI credits/mo`,
                    ].map((f) => (
                      <p key={f} className="text-[13px] flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> {f}</p>
                    ))}
                    <Separator className="my-2" />
                    <Button
                      className="w-full" size="sm"
                      variant={isCurrent ? 'secondary' : 'default'}
                      disabled={isCurrent}
                      onClick={() => setConfirmPlan(p)}
                    >
                      {isCurrent ? 'Current plan' : data.plans.findIndex((x) => x.id === p.id) > data.plans.findIndex((x) => x.id === data.plan) ? 'Upgrade' : 'Downgrade'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader><CardTitle>Billing history</CardTitle></CardHeader>
            <CardContent>
              {data.history?.length ? (
                <div className="divide-y">
                  {data.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="capitalize font-medium">{h.event}</span>
                      <span className="text-muted-foreground">{h.fromPlan} → {h.toPlan}</span>
                      <span>{h.amount ? `$${h.amount}` : '—'}</span>
                      <span className="text-muted-foreground">{formatDate(h.at)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[13px] text-muted-foreground py-4 text-center">No billing events yet.</p>}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!confirmPlan} onOpenChange={() => setConfirmPlan(null)}
        title={`Switch to the ${confirmPlan?.name} plan?`}
        description={confirmPlan?.price ? `$${confirmPlan.price}/month. Limits apply immediately.` : 'You will move to the Free plan limits immediately.'}
        confirmLabel="Confirm change" loading={changePlan.isPending}
        onConfirm={() => changePlan.mutate(confirmPlan.id)}
      />
      <ConfirmDialog
        open={confirmCancel} onOpenChange={setConfirmCancel}
        title="Cancel subscription?"
        description="You keep your current plan until the period ends, then move to Free. Data is never deleted."
        confirmLabel="Cancel subscription" destructive loading={cancelSub.isPending}
        onConfirm={() => cancelSub.mutate()}
      />
    </Page>
  );
}
