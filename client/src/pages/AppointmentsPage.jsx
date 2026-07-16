import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, CalendarDays, MoreHorizontal, CheckCircle2, XCircle, Clock, Link2 } from 'lucide-react';
import { get, post, patch, del } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Page, PageHeader, StatusBadge, Field, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch, Label, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, Pagination } from '@/components/ui/table';
import { fullName, formatDateTime, titleCase } from '@/lib/utils';

function AppointmentDialog({ open, onOpenChange, appointment }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({});
  const [contactSearch, setContactSearch] = React.useState('');
  const [contact, setContact] = React.useState(null);
  const searchQ = useQuery({
    queryKey: ['contacts-mini', contactSearch],
    queryFn: () => get('/contacts', { search: contactSearch, limit: 6 }),
    enabled: open && contactSearch.length >= 2 && !appointment,
  });

  React.useEffect(() => {
    setForm({
      title: appointment?.title || '',
      description: appointment?.description || '',
      startsAt: appointment?.startsAt ? new Date(appointment.startsAt).toISOString().slice(0, 16) : '',
      meetingLink: appointment?.meetingLink || '',
      location: appointment?.location || '',
      sendConfirmation: true,
    });
    setContact(appointment?.contactId || null);
    setContactSearch('');
  }, [appointment, open]);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, startsAt: new Date(form.startsAt), contactId: contact?._id || contact };
      return appointment ? patch(`/appointments/${appointment._id}`, body) : post('/appointments', body);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit appointment' : 'Book appointment'}</DialogTitle>
          <DialogDescription>Booking a meeting stops active sequences for the contact and updates their lead status.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          {!appointment && (
            <Field label="Contact" required>
              {contact ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-[13px]">
                  <span>{fullName(contact)} · {contact.email}</span>
                  <Button variant="ghost" size="sm" onClick={() => setContact(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search contact by name or email…" />
                  {searchQ.data?.items?.length > 0 && (
                    <div className="rounded-md border divide-y max-h-36 overflow-y-auto scrollbar-thin mt-1">
                      {searchQ.data.items.map((c) => (
                        <button key={c._id} className="w-full text-left p-2 text-[13px] hover:bg-secondary/60" onClick={() => setContact(c)}>
                          {fullName(c)} · <span className="text-muted-foreground">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Field>
          )}
          <Field label="Title" required><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Product demo call" /></Field>
          <Field label="Date & time" required><Input type="datetime-local" value={form.startsAt || ''} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meeting link"><Input value={form.meetingLink || ''} onChange={(e) => set('meetingLink', e.target.value)} placeholder="https://meet.google.com/…" /></Field>
            <Field label="Location"><Input value={form.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="Zoom / Office" /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
          {!appointment && (
            <label className="flex items-center justify-between rounded-md border p-3 text-[13px]">
              <span>Send confirmation email to contact<span className="block text-[11px] text-muted-foreground">Uses Brevo (or Gmail fallback) transactional email.</span></span>
              <Switch checked={form.sendConfirmation} onCheckedChange={(v) => set('sendConfirmation', v)} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!form.title || !form.startsAt || (!appointment && !contact)} onClick={() => save.mutate()}>
            {appointment ? 'Save' : 'Book appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const workspace = useAuthStore((s) => s.activeWorkspace());
  const [tab, setTab] = React.useState('upcoming');
  const [page, setPage] = React.useState(1);
  const [dialog, setDialog] = React.useState({ open: false, appointment: null });
  const [confirmCancel, setConfirmCancel] = React.useState(null);

  const apptsQ = useQuery({
    queryKey: ['appointments', tab, page],
    queryFn: () => get('/appointments', { page, limit: 25, ...(tab === 'upcoming' ? { upcoming: 'true' } : {}) }),
    placeholderData: (p) => p,
  });

  const update = useMutation({
    mutationFn: ({ id, body }) => patch(`/appointments/${id}`, body),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (err) => toast.error(err.message),
  });
  const cancel = useMutation({
    mutationFn: (id) => del(`/appointments/${id}`),
    onSuccess: () => { toast.success('Appointment cancelled.'); qc.invalidateQueries({ queryKey: ['appointments'] }); setConfirmCancel(null); },
    onError: (err) => toast.error(err.message),
  });

  const items = apptsQ.data?.items || [];

  return (
    <Page>
      <PageHeader
        title="Appointments"
        description={workspace?.bookingLink ? `Booking link: ${workspace.bookingLink}` : 'Set a booking link in Settings to send it automatically to interested leads.'}
        actions={<Button onClick={() => setDialog({ open: true, appointment: null })}><Plus /> Book appointment</Button>}
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead><TableHead>Appointment</TableHead><TableHead>When</TableHead>
                  <TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {apptsQ.isLoading && <TableSkeleton rows={5} cols={6} />}
                {!apptsQ.isLoading && !items.length && (
                  <TableRow><TableCell colSpan={6}>
                    <EmptyState icon={CalendarDays} title="No appointments" description="Book meetings manually or let interested leads use your booking link."
                      action={<Button onClick={() => setDialog({ open: true, appointment: null })}><Plus /> Book appointment</Button>} />
                  </TableCell></TableRow>
                )}
                {items.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <p className="font-medium">{fullName(a.contactId)}</p>
                      <p className="text-xs text-muted-foreground">{a.contactId?.email}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-[13px] font-medium">{a.title}</p>
                      {a.meetingLink && <a className="text-xs text-primary flex items-center gap-1" href={a.meetingLink} target="_blank" rel="noreferrer"><Link2 className="h-3 w-3" /> Meeting link</a>}
                    </TableCell>
                    <TableCell className="text-[13px]">{formatDateTime(a.startsAt)}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{a.assignedTo?.name || '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialog({ open: true, appointment: a })}><Clock /> Reschedule / edit</DropdownMenuItem>
                          {a.status !== 'confirmed' && <DropdownMenuItem onClick={() => update.mutate({ id: a._id, body: { status: 'confirmed' } })}><CheckCircle2 /> Mark confirmed</DropdownMenuItem>}
                          {a.status !== 'completed' && <DropdownMenuItem onClick={() => update.mutate({ id: a._id, body: { status: 'completed' } })}><CheckCircle2 /> Mark completed</DropdownMenuItem>}
                          <DropdownMenuItem destructive onClick={() => setConfirmCancel(a)}><XCircle /> Cancel</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination pagination={apptsQ.data?.pagination} onPage={setPage} />
          </Card>
        </TabsContent>
      </Tabs>

      <AppointmentDialog open={dialog.open} appointment={dialog.appointment} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
      <ConfirmDialog
        open={!!confirmCancel} onOpenChange={() => setConfirmCancel(null)}
        title={`Cancel "${confirmCancel?.title}"?`} description="The appointment is marked cancelled. You can notify the contact separately."
        confirmLabel="Cancel appointment" destructive loading={cancel.isPending}
        onConfirm={() => cancel.mutate(confirmCancel._id)}
      />
    </Page>
  );
}
