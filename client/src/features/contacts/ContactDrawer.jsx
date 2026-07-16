import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, Mail, Phone, Building2, Globe, MapPin, Pencil, StickyNote, Activity,
  CalendarDays, GitBranch, Send, MessageSquare, Clock,
} from 'lucide-react';
import { get, post, patch } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, Tabs, TabsList, TabsTrigger, TabsContent, Skeleton, Separator, Label } from '@/components/ui/misc';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge, Field, ProviderBadge } from '@/components/shared';
import { fullName, timeAgo, titleCase, formatDateTime, cn } from '@/lib/utils';

const CONTACT_STATUSES = ['new', 'contacted', 'delivered', 'opened', 'clicked', 'replied', 'interested', 'qualified', 'meeting_booked', 'not_interested', 'unsubscribed', 'bounced', 'invalid', 'converted'];

export function ContactDrawer({ contactId, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState('');

  const contactQ = useQuery({ queryKey: ['contact', contactId], queryFn: () => get(`/contacts/${contactId}`) });
  const timelineQ = useQuery({ queryKey: ['contact-timeline', contactId], queryFn: () => get(`/contacts/${contactId}/timeline`) });
  const teamQ = useQuery({ queryKey: ['team'], queryFn: () => get('/team') });

  const update = useMutation({
    mutationFn: (body) => patch(`/contacts/${contactId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact updated.');
    },
    onError: (err) => toast.error(err.message),
  });

  const addNote = useMutation({
    mutationFn: () => post(`/contacts/${contactId}/notes`, { body: note }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      toast.success('Note added.');
    },
    onError: (err) => toast.error(err.message),
  });

  const c = contactQ.data?.contact;
  const t = timelineQ.data;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-card border-l shadow-xl flex flex-col animate-fade-in">
        <header className="flex items-center gap-3 px-5 h-16 border-b shrink-0">
          {contactQ.isLoading ? <Skeleton className="h-9 w-48" /> : c && (
            <>
              <Avatar name={fullName(c)} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{fullName(c)}</p>
                <p className="text-xs text-muted-foreground truncate">{c.email}</p>
              </div>
              <Select value={c.status} onValueChange={(v) => update.mutate({ status: v })}>
                <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}</SelectContent>
              </Select>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}><X /></Button>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {c && (
            <Tabs defaultValue="profile" className="p-5">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="emails">Emails</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={c.status} />
                    <Badge variant="secondary">Score: {c.leadScore ?? 0}</Badge>
                    {c.subscriptionStatus === 'unsubscribed' && <Badge variant="destructive">Unsubscribed</Badge>}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}><Pencil /> {editing ? 'Close' : 'Edit'}</Button>
                </div>

                {editing ? <EditForm contact={c} onSave={(v) => { update.mutate(v); setEditing(false); }} saving={update.isPending} /> : (
                  <div className="space-y-2.5 text-[13px]">
                    <InfoRow icon={Mail} label="Email" value={c.email} />
                    <InfoRow icon={Phone} label="Phone" value={c.phone} />
                    <InfoRow icon={Building2} label="Company" value={[c.company, c.jobTitle].filter(Boolean).join(' · ')} />
                    <InfoRow icon={Globe} label="Website" value={c.website} />
                    <InfoRow icon={MapPin} label="Location" value={[c.city, c.state, c.country].filter(Boolean).join(', ')} />
                    <InfoRow icon={Activity} label="Source" value={c.source} />
                  </div>
                )}

                <Separator />
                <div className="space-y-1.5">
                  <Label>Assigned to</Label>
                  <Select value={c.assignedTo?._id || 'none'} onValueChange={(v) => update.mutate({ assignedTo: v === 'none' ? null : v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {teamQ.data?.members?.filter((m) => m.userId).map((m) => (
                        <SelectItem key={m._id} value={m.userId._id}>{m.userId.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {c.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button onClick={() => update.mutate({ tags: c.tags.filter((x) => x !== tag) })}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                    <TagAdder onAdd={(tag) => update.mutate({ tags: [...(c.tags || []), tag] })} />
                  </div>
                </div>

                {c.lists?.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Lists</Label>
                    <div className="flex flex-wrap gap-1.5">{c.lists.map((l) => <Badge key={l._id} variant="outline">{l.name}</Badge>)}</div>
                  </div>
                )}

                <Separator />
                <div className="grid grid-cols-2 gap-2.5 text-[13px]">
                  <Stat label="Opens" value={c.openCount || 0} />
                  <Stat label="Clicks" value={c.clickCount || 0} />
                  <Stat label="Replies" value={c.replyCount || 0} />
                  <Stat label="Last reply" value={c.lastRepliedAt ? timeAgo(c.lastRepliedAt) : '—'} />
                </div>

                {t?.enrollments?.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Sequences</Label>
                      {t.enrollments.map((e) => (
                        <div key={e._id} className="flex items-center justify-between rounded-md border p-2 text-[13px]">
                          <span className="truncate">{e.sequenceId?.name || 'Sequence'} · step {e.currentStepOrder}</span>
                          <StatusBadge status={e.status} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {t?.appointments?.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Appointments</Label>
                    {t.appointments.map((a) => (
                      <div key={a._id} className="flex items-center justify-between rounded-md border p-2 text-[13px]">
                        <span className="truncate">{a.title} · {formatDateTime(a.startsAt)}</span>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activity">
                {timelineQ.isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-0">
                    {!t?.events?.length && <p className="text-[13px] text-muted-foreground text-center py-8">No tracked activity yet.</p>}
                    {t?.events?.map((e) => (
                      <div key={e._id} className="flex gap-3 pb-4 relative">
                        <div className="flex flex-col items-center">
                          <span className={cn('h-2.5 w-2.5 rounded-full mt-1 shrink-0', e.type === 'replied' ? 'bg-success' : e.type.includes('bounce') || e.type === 'failed' ? 'bg-destructive' : 'bg-primary')} />
                          <span className="w-px flex-1 bg-border" />
                        </div>
                        <div className="text-[13px] pb-1">
                          <p className="font-medium">{titleCase(e.type)}{e.campaignId?.name ? ` · ${e.campaignId.name}` : ''}</p>
                          {e.meta?.url && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{e.meta.url}</p>}
                          <p className="text-[11px] text-muted-foreground">{formatDateTime(e.occurredAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="emails" className="space-y-2">
                {!t?.messages?.length && <p className="text-[13px] text-muted-foreground text-center py-8">No email history with this contact.</p>}
                {t?.messages?.map((msg) => (
                  <div key={msg._id} className="rounded-md border p-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      {msg.direction === 'inbound' ? <MessageSquare className="h-3.5 w-3.5 text-success shrink-0" /> : <Send className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <p className="text-[13px] font-medium truncate flex-1">{msg.subject || '(no subject)'}</p>
                      <StatusBadge status={msg.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{msg.snippet}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <ProviderBadge provider={msg.provider} />
                      {msg.campaignId?.name && <span>· {msg.campaignId.name}</span>}
                      {msg.sequenceId?.name && <span>· {msg.sequenceId.name}</span>}
                      <span className="ml-auto flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(msg.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="notes" className="space-y-3">
                <div className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this contact…" rows={3} />
                  <Button size="sm" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>
                    <StickyNote /> Add note
                  </Button>
                </div>
                <div className="space-y-2">
                  {!c.notes?.length && <p className="text-[13px] text-muted-foreground text-center py-6">No notes yet.</p>}
                  {c.notes?.map((n, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <p className="text-[13px] whitespace-pre-wrap">{n.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{n.author?.name || 'Unknown'} · {timeAgo(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </aside>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="truncate">{value || '—'}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-base font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function TagAdder({ onAdd }) {
  const [adding, setAdding] = React.useState(false);
  const [value, setValue] = React.useState('');
  if (!adding) return <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setAdding(true)}>+ Tag</Button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onAdd(value.trim()); setValue(''); setAdding(false); }} className="inline-flex">
      <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => setAdding(false)} className="h-6 w-28 text-xs" placeholder="Tag name" />
    </form>
  );
}

function EditForm({ contact, onSave, saving }) {
  const [form, setForm] = React.useState({
    firstName: contact.firstName || '', lastName: contact.lastName || '', phone: contact.phone || '',
    company: contact.company || '', jobTitle: contact.jobTitle || '', website: contact.website || '',
    industry: contact.industry || '', city: contact.city || '', state: contact.state || '', country: contact.country || '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-3 rounded-md border p-3.5 bg-secondary/30">
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="First name"><Input value={form.firstName} onChange={set('firstName')} className="h-8" /></Field>
        <Field label="Last name"><Input value={form.lastName} onChange={set('lastName')} className="h-8" /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} className="h-8" /></Field>
        <Field label="Company"><Input value={form.company} onChange={set('company')} className="h-8" /></Field>
        <Field label="Job title"><Input value={form.jobTitle} onChange={set('jobTitle')} className="h-8" /></Field>
        <Field label="Website"><Input value={form.website} onChange={set('website')} className="h-8" /></Field>
        <Field label="City"><Input value={form.city} onChange={set('city')} className="h-8" /></Field>
        <Field label="Country"><Input value={form.country} onChange={set('country')} className="h-8" /></Field>
      </div>
      <Button size="sm" loading={saving} onClick={() => onSave(form)}>Save changes</Button>
    </div>
  );
}
