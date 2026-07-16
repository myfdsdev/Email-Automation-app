import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Inbox as InboxIcon, Search, RefreshCw, Star, Archive, MailOpen, Mail,
  Reply, Forward, Paperclip, Send, PenSquare, Sparkles, UserRound, X,
  ChevronLeft, Tag as TagIcon, CircleDot, Bot, MessageSquareWarning, FileEdit,
} from 'lucide-react';
import { get, post } from '@/api/client';
import { Page, StatusBadge, Field } from '@/components/shared';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, Skeleton, Separator, Label, Tip, TooltipProvider } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/table';
import { cn, fullName, inboxTime, timeAgo, titleCase, formatDateTime, initials } from '@/lib/utils';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: InboxIcon },
  { id: 'unread', label: 'Unread', icon: CircleDot },
  { id: 'needs_response', label: 'Needs response', icon: MessageSquareWarning },
  { id: 'interested', label: 'Interested replies', icon: Star },
  { id: 'automated', label: 'Automated replies', icon: Bot },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'archived', label: 'Archived', icon: Archive },
];

function ComposeDialog({ open, onOpenChange, connections }) {
  const qc = useQueryClient();
  const [connectionId, setConnectionId] = React.useState('');
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const gmailConns = connections.filter((c) => c.provider === 'gmail' && c.status === 'connected');
  React.useEffect(() => { if (gmailConns.length && !connectionId) setConnectionId(gmailConns[0]._id); }, [gmailConns, connectionId]);

  const send = useMutation({
    mutationFn: (asDraft) => post('/inbox/compose', {
      connectionId,
      to: to.split(',').map((e) => ({ email: e.trim() })).filter((t) => t.email),
      subject, bodyHtml, asDraft,
    }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['inbox-threads'] });
      setTo(''); setSubject(''); setBodyHtml('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>New email</DialogTitle>
          <DialogDescription>One-to-one email sent through your Gmail account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="From" required>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger><SelectValue placeholder={gmailConns.length ? 'Choose account' : 'No Gmail connected'} /></SelectTrigger>
              <SelectContent>{gmailConns.map((c) => <SelectItem key={c._id} value={c._id}>{c.email}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="To" required description="Separate multiple addresses with commas.">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="jane@company.com" />
          </Field>
          <Field label="Subject" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" required><RichTextEditor value={bodyHtml} onChange={setBodyHtml} minHeight={140} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={!connectionId || !to || send.isPending} onClick={() => send.mutate(true)}>Save as draft</Button>
          <Button loading={send.isPending} disabled={!connectionId || !to || !subject || !bodyHtml} onClick={() => send.mutate(false)}><Send /> Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadView({ threadId, onBack, connections }) {
  const qc = useQueryClient();
  const [replyHtml, setReplyHtml] = React.useState('');
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [showContact, setShowContact] = React.useState(true);

  const threadQ = useQuery({ queryKey: ['inbox-thread', threadId], queryFn: () => get(`/inbox/threads/${threadId}`), enabled: !!threadId });
  const teamQ = useQuery({ queryKey: ['team'], queryFn: () => get('/team') });

  const thread = threadQ.data?.thread;
  const messages = threadQ.data?.messages || [];
  const contact = thread?.contactId;

  React.useEffect(() => {
    // opening a thread with unread messages marks it read
    if (thread && thread.unreadCount > 0) {
      post(`/inbox/threads/${threadId}/actions/read`).then(() => {
        qc.invalidateQueries({ queryKey: ['inbox-threads'] });
        qc.invalidateQueries({ queryKey: ['inbox-counts'] });
      }).catch(() => {});
    }
  }, [thread?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useMutation({
    mutationFn: ({ action, body }) => post(`/inbox/threads/${threadId}/actions/${action}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-thread', threadId] });
      qc.invalidateQueries({ queryKey: ['inbox-threads'] });
      qc.invalidateQueries({ queryKey: ['inbox-counts'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const reply = useMutation({
    mutationFn: (asDraft) => post(`/inbox/threads/${threadId}/reply`, { bodyHtml: replyHtml, asDraft }),
    onSuccess: (res) => {
      toast.success(res.message);
      setReplyHtml('');
      setReplyOpen(false);
      qc.invalidateQueries({ queryKey: ['inbox-thread', threadId] });
      qc.invalidateQueries({ queryKey: ['inbox-threads'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const aiSuggest = async () => {
    setAiBusy(true);
    try {
      const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
      const res = await post('/ai/generate', {
        mode: 'reply',
        prompt: 'Suggest a reply to the last message in this thread.',
        context: { incoming: (lastInbound?.bodyText || lastInbound?.snippet || '').slice(0, 2000), subject: thread?.subject },
      });
      if (res.data.result?.body) {
        setReplyHtml(`<div>${String(res.data.result.body).replace(/\n/g, '<br/>')}</div>`);
        setReplyOpen(true);
        toast.success('AI draft ready — review before sending.');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  if (!threadId) {
    return (
      <div className="flex-1 hidden lg:flex items-center justify-center">
        <EmptyState icon={MailOpen} title="Select a conversation" description="Choose a thread from the list to read and reply." />
      </div>
    );
  }
  if (threadQ.isLoading) return <div className="flex-1 p-6 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (!thread) return <div className="flex-1"><EmptyState title="Conversation not found" /></div>;

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Thread header */}
        <div className="border-b px-4 py-3 flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="iconSm" className="lg:hidden" onClick={onBack}><ChevronLeft /></Button>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[15px] truncate">{thread.subject || '(no subject)'}</p>
            <p className="text-xs text-muted-foreground truncate">
              {thread.participants?.map((p) => p.name || p.email).slice(0, 3).join(', ')}
              {thread.campaignId?.name && <> · via <span className="text-primary">{thread.campaignId.name}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Tip content={thread.isStarred ? 'Unstar' : 'Star'}>
              <Button variant="ghost" size="iconSm" onClick={() => act.mutate({ action: thread.isStarred ? 'unstar' : 'star' })}>
                <Star className={cn(thread.isStarred && 'fill-warning text-warning')} />
              </Button>
            </Tip>
            <Tip content="Mark unread"><Button variant="ghost" size="iconSm" onClick={() => act.mutate({ action: 'unread' })}><Mail /></Button></Tip>
            <Tip content={thread.isArchived ? 'Unarchive' : 'Archive'}>
              <Button variant="ghost" size="iconSm" onClick={() => act.mutate({ action: thread.isArchived ? 'unarchive' : 'archive' })}><Archive /></Button>
            </Tip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Tip content="Assign"><Button variant="ghost" size="iconSm"><UserRound /></Button></Tip></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => act.mutate({ action: 'assign', body: { userId: null } })}>Unassigned</DropdownMenuItem>
                {teamQ.data?.members?.filter((m) => m.userId).map((m) => (
                  <DropdownMenuItem key={m._id} onClick={() => act.mutate({ action: 'assign', body: { userId: m.userId._id } })}>{m.userId.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tip content="Contact panel"><Button variant="ghost" size="iconSm" className="hidden xl:flex" onClick={() => setShowContact((s) => !s)}><UserRound className={cn(showContact && 'text-primary')} /></Button></Tip>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {messages.map((m) => (
            <div key={m._id} className={cn('rounded-lg border p-4', m.direction === 'inbound' ? 'bg-card' : 'bg-accent/40 border-primary/20')}>
              <div className="flex items-center gap-2.5 mb-2.5">
                <Avatar name={m.from?.name || m.from?.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">
                    {m.from?.name || m.from?.email}
                    {m.isDraft && <Badge variant="warning" className="ml-2">Draft</Badge>}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">to {(m.to || []).map((t) => t.email).join(', ')}</p>
                </div>
                {m.aiAnalysis?.classification && m.direction === 'inbound' && <StatusBadge status={m.aiAnalysis.classification} />}
                <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(m.sentAt || m.createdAt)}</span>
              </div>
              {m.aiAnalysis?.summary && m.direction === 'inbound' && (
                <div className="rounded-md bg-secondary/60 px-3 py-2 mb-2.5 text-xs flex gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span><span className="font-medium">AI summary:</span> {m.aiAnalysis.summary}</span>
                </div>
              )}
              <div className="email-body" dangerouslySetInnerHTML={{ __html: m.bodyHtml || `<pre style="white-space:pre-wrap;font-family:inherit">${m.bodyText || m.snippet || ''}</pre>` }} />
              {m.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {m.attachments.map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1"><Paperclip className="h-3 w-3" /> {a.filename} <span className="text-muted-foreground">({Math.round((a.size || 0) / 1024)} KB)</span></Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Reply box */}
        <div className="border-t p-3.5 shrink-0 space-y-2.5">
          {replyOpen ? (
            <>
              <RichTextEditor value={replyHtml} onChange={setReplyHtml} minHeight={110} placeholder="Write your reply…" />
              <div className="flex items-center gap-2">
                <Button size="sm" loading={reply.isPending} disabled={!replyHtml} onClick={() => reply.mutate(false)}><Send /> Send reply</Button>
                <Button size="sm" variant="outline" disabled={!replyHtml || reply.isPending} onClick={() => reply.mutate(true)}>Save as Gmail draft</Button>
                <Button size="sm" variant="ghost" onClick={() => setReplyOpen(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setReplyOpen(true)}><Reply /> Reply</Button>
              <Button size="sm" variant="outline" onClick={aiSuggest} loading={aiBusy}><Sparkles /> AI suggest reply</Button>
              {thread.needsResponse && (
                <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => act.mutate({ action: 'resolve' })}>Mark handled</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contact panel */}
      {showContact && contact && (
        <aside className="w-[270px] border-l hidden xl:flex flex-col overflow-y-auto scrollbar-thin shrink-0">
          <div className="p-4 space-y-3">
            <div className="flex flex-col items-center text-center gap-1.5 pb-2">
              <Avatar name={fullName(contact)} size="lg" />
              <p className="font-semibold text-[15px]">{fullName(contact)}</p>
              <p className="text-xs text-muted-foreground">{contact.email}</p>
              <StatusBadge status={contact.status} />
            </div>
            <Separator />
            <PanelRow label="Company" value={contact.company} />
            <PanelRow label="Title" value={contact.jobTitle} />
            <PanelRow label="Phone" value={contact.phone} />
            <PanelRow label="Lead score" value={String(contact.leadScore ?? 0)} />
            <PanelRow label="Last reply" value={contact.lastRepliedAt ? timeAgo(contact.lastRepliedAt) : '—'} />
            {contact.tags?.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">TAGS</p>
                <div className="flex flex-wrap gap-1">{contact.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
              </div>
            )}
            <Separator />
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href={`/contacts?open=${contact._id}`}>Open full profile</a>
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}

function PanelRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate max-w-[150px]">{value || '—'}</span>
    </div>
  );
}

export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [folder, setFolder] = React.useState('inbox');
  const [search, setSearch] = React.useState('');
  const [connectionId, setConnectionId] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [composeOpen, setComposeOpen] = React.useState(false);
  const activeThread = params.get('thread');

  const connectionsQ = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations') });
  const countsQ = useQuery({ queryKey: ['inbox-counts'], queryFn: () => get('/inbox/counts'), refetchInterval: 30000 });
  const threadsQ = useQuery({
    queryKey: ['inbox-threads', folder, search, connectionId, statusFilter],
    queryFn: () => get('/inbox/threads', {
      folder, limit: 40,
      ...(search && { search }),
      ...(connectionId !== 'all' && { connectionId }),
      ...(statusFilter !== 'all' && { status: statusFilter }),
    }),
    refetchInterval: 30000,
  });

  const sync = useMutation({
    mutationFn: () => post('/inbox/sync'),
    onSuccess: (res) => { toast.success(res.message); setTimeout(() => qc.invalidateQueries({ queryKey: ['inbox-threads'] }), 4000); },
    onError: (err) => toast.error(err.message),
  });

  const gmailConnections = (connectionsQ.data?.connections || []).filter((c) => c.provider === 'gmail');
  const counts = countsQ.data?.counts || {};
  const items = threadsQ.data?.items || [];
  const isDrafts = folder === 'drafts';

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <div className="flex-1 flex min-h-0">
          {/* Left column: folders */}
          <aside className={cn('w-[210px] border-r flex-col shrink-0 hidden md:flex', activeThread && 'hidden lg:flex')}>
            <div className="p-3 space-y-2">
              <Button className="w-full" size="sm" onClick={() => setComposeOpen(true)}><PenSquare /> Compose</Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => sync.mutate()} loading={sync.isPending}><RefreshCw /> Sync Gmail</Button>
            </div>
            <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3 space-y-0.5">
              {FOLDERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setFolder(f.id); setParams((p) => { p.delete('thread'); return p; }); }}
                  className={cn('w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                    folder === f.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
                >
                  <f.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{f.label}</span>
                  {counts[f.id] > 0 && <span className="text-[11px] font-medium">{counts[f.id]}</span>}
                </button>
              ))}
              {gmailConnections.length > 0 && (
                <>
                  <p className="text-[11px] font-medium text-muted-foreground px-2.5 pt-3 pb-1">ACCOUNTS</p>
                  {gmailConnections.map((c) => (
                    <div key={c._id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.status === 'connected' ? 'bg-success' : 'bg-destructive')} />
                      <span className="truncate">{c.email}</span>
                    </div>
                  ))}
                </>
              )}
            </nav>
          </aside>

          {/* Middle column: thread list */}
          <div className={cn('w-full md:w-[340px] lg:w-[360px] border-r flex flex-col shrink-0 min-h-0', activeThread && 'hidden lg:flex')}>
            <div className="p-3 space-y-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail…" className="pl-8 h-8" />
              </div>
              <div className="flex gap-2">
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {gmailConnections.map((c) => <SelectItem key={c._id} value={c._id}>{c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any lead status</SelectItem>
                    {['interested', 'replied', 'meeting_booked', 'not_interested', 'qualified'].map((s) => (
                      <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
              {threadsQ.isLoading && Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="p-3 border-b space-y-1.5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /></div>
              ))}
              {!threadsQ.isLoading && !items.length && (
                <EmptyState
                  icon={InboxIcon}
                  title={gmailConnections.length ? 'No conversations' : 'Connect Gmail to see your inbox'}
                  description={gmailConnections.length ? 'New mail appears here after sync.' : 'Head to Integrations to connect your Gmail account.'}
                  action={!gmailConnections.length && <Button size="sm" asChild><a href="/integrations">Connect Gmail</a></Button>}
                  className="py-10"
                />
              )}
              {!isDrafts && items.map((t) => (
                <button
                  key={t._id}
                  onClick={() => setParams((p) => { p.set('thread', t._id); return p; })}
                  className={cn('w-full text-left p-3 border-b hover:bg-secondary/50 transition-colors block',
                    activeThread === t._id && 'bg-accent/70',
                    t.unreadCount > 0 && 'bg-primary/[0.03]')}
                >
                  <div className="flex items-center gap-2">
                    {t.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <p className={cn('text-[13px] truncate flex-1', t.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
                      {t.contactId ? fullName(t.contactId) : t.participants?.find((p) => p.email)?.name || t.participants?.[0]?.email || 'Unknown'}
                    </p>
                    {t.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className="text-[11px] text-muted-foreground shrink-0">{inboxTime(t.lastMessageAt)}</span>
                  </div>
                  <p className="text-[13px] truncate mt-0.5">{t.subject || '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.snippet}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {t.contactId?.status && <StatusBadge status={t.contactId.status} />}
                    {t.campaignId?.name && <Badge variant="outline" className="text-[10px]">{t.campaignId.name}</Badge>}
                    {t.assignedTo?.name && <Badge variant="muted" className="text-[10px]">{t.assignedTo.name}</Badge>}
                  </div>
                </button>
              ))}
              {isDrafts && items.map((d) => (
                <div key={d._id} className="p-3 border-b">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-3.5 w-3.5 text-warning shrink-0" />
                    <p className="text-[13px] font-medium truncate flex-1">{d.to?.[0]?.email || 'No recipient'}</p>
                    <span className="text-[11px] text-muted-foreground">{inboxTime(d.createdAt)}</span>
                  </div>
                  <p className="text-[13px] truncate mt-0.5">{d.subject || '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.snippet}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Draft saved in Gmail — finish and send from there or via reply box.</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: thread view */}
          <ThreadView
            threadId={activeThread}
            connections={connectionsQ.data?.connections || []}
            onBack={() => setParams((p) => { p.delete('thread'); return p; })}
          />
        </div>
        <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} connections={connectionsQ.data?.connections || []} />
      </div>
    </TooltipProvider>
  );
}
