import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, Send, Plug, RefreshCw, Unplug, CheckCircle2, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { get, post, del } from '@/api/client';
import { Page, PageHeader, StatusBadge, Field, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton, Separator } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { timeAgo, formatDateTime } from '@/lib/utils';

function BrevoConnectDialog({ open, onOpenChange, existing }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ apiKey: '', defaultSenderName: '', defaultSenderEmail: '', replyToEmail: '', webhookSecret: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  React.useEffect(() => {
    if (existing) setForm((f) => ({ ...f, defaultSenderName: existing.defaultSenderName || '', defaultSenderEmail: existing.defaultSenderEmail || '', replyToEmail: existing.replyToEmail || '' }));
  }, [existing, open]);

  const connect = useMutation({
    mutationFn: () => post('/integrations/brevo', form),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['integrations'] });
      if (res.data.webhookUrl) {
        navigator.clipboard?.writeText(res.data.webhookUrl).catch(() => {});
        toast.info('Webhook URL copied — add it in Brevo → Transactional → Settings → Webhooks.');
      }
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Update Brevo connection' : 'Connect Brevo'}</DialogTitle>
          <DialogDescription>
            Paste your Brevo API key (Brevo → Settings → SMTP & API → API Keys). The key is encrypted before storage and never sent to the browser again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Brevo API key" required><Input type="password" value={form.apiKey} onChange={set('apiKey')} placeholder="xkeysib-…" autoComplete="off" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default sender name" required><Input value={form.defaultSenderName} onChange={set('defaultSenderName')} placeholder="Alex from Acme" /></Field>
            <Field label="Default sender email" required description="Must be a verified sender in Brevo."><Input type="email" value={form.defaultSenderEmail} onChange={set('defaultSenderEmail')} placeholder="alex@acme.com" /></Field>
          </div>
          <Field label="Reply-to email"><Input type="email" value={form.replyToEmail} onChange={set('replyToEmail')} placeholder="Defaults to sender email" /></Field>
          <Field label="Webhook secret" description="Optional shared secret; send it as X-Webhook-Secret from Brevo for verification.">
            <Input value={form.webhookSecret} onChange={set('webhookSecret')} autoComplete="off" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={connect.isPending} disabled={!form.apiKey || !form.defaultSenderName || !form.defaultSenderEmail} onClick={() => connect.mutate()}>
            Validate & connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [brevoOpen, setBrevoOpen] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(null);

  React.useEffect(() => {
    const gmail = params.get('gmail');
    if (gmail === 'connected') {
      toast.success('Gmail connected! Initial sync is running in the background.');
      setParams((p) => { p.delete('gmail'); return p; }, { replace: true });
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } else if (gmail === 'error') {
      toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`);
      setParams((p) => { p.delete('gmail'); p.delete('reason'); return p; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const integQ = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations'), refetchInterval: 30000 });

  const gmailConnect = useMutation({
    mutationFn: () => get('/integrations/gmail/auth-url'),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(err.message),
  });
  const gmailSync = useMutation({
    mutationFn: (id) => post(`/integrations/gmail/${id}/sync`),
    onSuccess: (res) => toast.success(res.message),
    onError: (err) => toast.error(err.message),
  });
  const disconnect = useMutation({
    mutationFn: ({ provider, id }) => del(`/integrations/${provider}/${id}`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['integrations'] }); setConfirmDisconnect(null); },
    onError: (err) => toast.error(err.message),
  });
  const testBrevo = useMutation({
    mutationFn: () => post('/integrations/brevo/test'),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['integrations'] }); },
    onError: (err) => { toast.error(err.message); qc.invalidateQueries({ queryKey: ['integrations'] }); },
  });

  const connections = integQ.data?.connections || [];
  const gmailConns = connections.filter((c) => c.provider === 'gmail' && c.status !== 'disconnected');
  const brevoConn = connections.find((c) => c.provider === 'brevo' && c.status !== 'disconnected');

  return (
    <Page>
      <PageHeader title="Integrations" description="Gmail powers 1:1 outreach and inbox sync. Brevo powers bulk campaigns, tracking and transactional email." />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Gmail */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><Mail className="h-5 w-5 text-red-500" /></div>
              <div className="flex-1">
                <CardTitle>Gmail</CardTitle>
                <CardDescription>Inbox sync, personalized sends, reply detection, drafts and labels.</CardDescription>
              </div>
              <Button onClick={() => gmailConnect.mutate()} loading={gmailConnect.isPending}>
                <Plug /> Connect Gmail
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {integQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!integQ.isLoading && !gmailConns.length && (
              <div className="rounded-md border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                No Gmail account connected yet.
                {!integQ.data?.googleConfigured && (
                  <p className="text-xs text-warning mt-1.5 flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — see README for setup.
                  </p>
                )}
              </div>
            )}
            {gmailConns.map((c) => (
              <div key={c._id} className="rounded-md border p-3.5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{c.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.lastSyncAt ? `Synced ${timeAgo(c.lastSyncAt)}` : 'Not synced yet'}
                      {c.gmailWatchExpiration && ` · push notifications until ${formatDateTime(c.gmailWatchExpiration)}`}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                {c.lastError && <p className="text-[11px] text-destructive">{c.lastError}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => gmailSync.mutate(c._id)} loading={gmailSync.isPending}><RefreshCw /> Sync now</Button>
                  {(c.status === 'expired' || c.status === 'unhealthy') && (
                    <Button size="sm" onClick={() => gmailConnect.mutate()}><Plug /> Reconnect</Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={() => setConfirmDisconnect({ provider: 'gmail', conn: c })}>
                    <Unplug /> Disconnect
                  </Button>
                </div>
              </div>
            ))}
            <Separator />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-xs">Gmail is used for</p>
              <p>Inbox sync · one-to-one sales outreach · replying in threads · drafts · labels · reply detection. Not for unrestricted bulk sending — daily limits apply.</p>
            </div>
          </CardContent>
        </Card>

        {/* Brevo */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center"><Send className="h-5 w-5 text-info" /></div>
              <div className="flex-1">
                <CardTitle>Brevo</CardTitle>
                <CardDescription>Bulk campaigns, transactional email, delivery/open/click webhooks, list sync.</CardDescription>
              </div>
              <Button variant={brevoConn ? 'outline' : 'default'} onClick={() => setBrevoOpen(true)}>
                <Plug /> {brevoConn ? 'Update key' : 'Connect Brevo'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {integQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!integQ.isLoading && !brevoConn && (
              <div className="rounded-md border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                Not connected. You'll need your own Brevo account and API key.
              </div>
            )}
            {brevoConn && (
              <div className="rounded-md border p-3.5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{brevoConn.defaultSenderName} &lt;{brevoConn.defaultSenderEmail}&gt;</p>
                    <p className="text-[11px] text-muted-foreground">Account: {brevoConn.brevoAccountEmail || '—'} · Plan: {brevoConn.brevoPlan || '—'}</p>
                  </div>
                  <StatusBadge status={brevoConn.status} />
                </div>
                {brevoConn.lastError && <p className="text-[11px] text-destructive">{brevoConn.lastError}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => testBrevo.mutate()} loading={testBrevo.isPending}><CheckCircle2 /> Test connection</Button>
                  <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={() => setConfirmDisconnect({ provider: 'brevo', conn: brevoConn })}>
                    <Unplug /> Disconnect
                  </Button>
                </div>
                <Separator />
                <WebhookInfo workspaceReady />
              </div>
            )}
            <Separator />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-xs">Brevo is used for</p>
              <p>Bulk & marketing campaigns · transactional emails · appointment confirmations · delivery, open, click, bounce & unsubscribe tracking via webhooks.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <BrevoConnectDialog open={brevoOpen} onOpenChange={setBrevoOpen} existing={brevoConn} />
      <ConfirmDialog
        open={!!confirmDisconnect} onOpenChange={() => setConfirmDisconnect(null)}
        title={`Disconnect ${confirmDisconnect?.conn?.email || 'Brevo'}?`}
        description="Stored credentials are removed. Campaigns and sequences using this account will fail until you reconnect."
        confirmLabel="Disconnect" destructive loading={disconnect.isPending}
        onConfirm={() => disconnect.mutate({ provider: confirmDisconnect.provider, id: confirmDisconnect.conn._id })}
      />
    </Page>
  );
}

function WebhookInfo() {
  const wid = JSON.parse(localStorage.getItem('ea-auth') || '{}')?.state?.activeWorkspaceId;
  const url = `${window.location.origin}/api/webhooks/brevo?workspace=${wid}`;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">Webhook endpoint (add in Brevo → Webhooks, all transactional + marketing events)</p>
      <div className="flex items-center gap-1.5">
        <code className="text-[11px] bg-secondary rounded px-2 py-1 truncate flex-1">{url}</code>
        <Button variant="ghost" size="iconSm" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied.'); }}><Copy /></Button>
        <Button variant="ghost" size="iconSm" asChild><a href="https://app.brevo.com/settings/webhooks" target="_blank" rel="noreferrer"><ExternalLink /></a></Button>
      </div>
    </div>
  );
}
