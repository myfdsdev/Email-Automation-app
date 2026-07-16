import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus, Upload, Download, Users, MoreHorizontal, Tag, ListPlus, UserCheck,
  Trash2, Ban, Search, X, FileSpreadsheet, ChevronRight, ChevronLeft, CheckCircle2,
} from 'lucide-react';
import { api, get, post, patch, del } from '@/api/client';
import { Page, PageHeader, Field, StatusBadge, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, Avatar, Label, Progress, Separator, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/misc';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  TableSkeleton, EmptyState, ErrorState, Pagination,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { fullName, timeAgo, titleCase, formatDate, cn } from '@/lib/utils';
import { ContactDrawer } from '@/features/contacts/ContactDrawer';

const CONTACT_STATUSES = ['new', 'contacted', 'delivered', 'opened', 'clicked', 'replied', 'interested', 'qualified', 'meeting_booked', 'not_interested', 'unsubscribed', 'bounced', 'invalid', 'converted'];

const contactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Enter a valid email'),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  tags: z.string().optional(),
});

function AddContactDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(contactSchema) });
  const create = useMutation({
    mutationFn: (v) => post('/contacts', { ...v, tags: v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Create a single contact manually. Use Import for bulk uploads.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3.5" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName}><Input {...register('firstName')} placeholder="Jane" /></Field>
            <Field label="Last name" error={errors.lastName}><Input {...register('lastName')} placeholder="Doe" /></Field>
          </div>
          <Field label="Email" required error={errors.email}><Input type="email" {...register('email')} placeholder="jane@company.com" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" error={errors.company}><Input {...register('company')} placeholder="Acme Inc" /></Field>
            <Field label="Job title" error={errors.jobTitle}><Input {...register('jobTitle')} placeholder="Head of Sales" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" error={errors.phone}><Input {...register('phone')} placeholder="+1 555 000 1234" /></Field>
            <Field label="Tags" error={errors.tags} description="Comma separated"><Input {...register('tags')} placeholder="prospect, saas" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input {...register('city')} /></Field>
            <Field label="Country"><Input {...register('country')} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Add contact</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Import wizard ---------------- */

function ImportWizard({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [step, setStep] = React.useState(0);
  const [session, setSession] = React.useState(null);
  const [mapping, setMapping] = React.useState([]);
  const [validation, setValidation] = React.useState(null);
  const [listIds, setListIds] = React.useState([]);
  const [report, setReport] = React.useState(null);
  const fileRef = React.useRef();

  const listsQ = useQuery({ queryKey: ['contact-lists'], queryFn: () => get('/contact-lists'), enabled: open });

  const reset = () => { setStep(0); setSession(null); setMapping([]); setValidation(null); setReport(null); setListIds([]); };

  const upload = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/contacts/import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data.data;
    },
    onSuccess: (data) => {
      setSession(data);
      setMapping(data.suggestedMapping);
      setStep(1);
    },
    onError: (err) => toast.error(err.message),
  });

  const validate = useMutation({
    mutationFn: () => post('/contacts/import/validate', { sessionId: session.sessionId, mapping }),
    onSuccess: (res) => { setValidation(res.data); setStep(2); },
    onError: (err) => toast.error(err.message),
  });

  const confirm = useMutation({
    mutationFn: () => post('/contacts/import/confirm', { sessionId: session.sessionId, listIds, updateExisting: true }),
    onSuccess: (res) => {
      setReport(res.data.report);
      setStep(3);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const FIELD_OPTIONS = [
    { value: '__skip__', label: 'Skip column' },
    ...['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'website', 'industry', 'city', 'state', 'country', 'source', 'tags'].map((f) => ({ value: f, label: titleCase(f) })),
  ];

  const steps = ['Upload', 'Map fields', 'Review', 'Done'];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent wide className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>Upload a CSV or Excel file, map columns, review duplicates and confirm.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 text-xs">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={cn('flex items-center gap-1.5 font-medium', i === step ? 'text-primary' : i < step ? 'text-success' : 'text-muted-foreground')}>
                <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center text-[10px]', i === step && 'border-primary bg-primary/10', i < step && 'border-success bg-success/10')}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s}
              </span>
              {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </React.Fragment>
          ))}
        </div>

        {step === 0 && (
          <div
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload.mutate(f); }}
          >
            <FileSpreadsheet className="h-9 w-9 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium text-sm">{upload.isPending ? 'Uploading…' : 'Drop your file here or click to browse'}</p>
            <p className="text-xs text-muted-foreground mt-1">CSV or Excel, up to 10 MB / 20,000 rows.</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          </div>
        )}

        {step === 1 && session && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">{session.filename} · {session.totalRows.toLocaleString()} rows detected. Match each column to a contact field.</p>
            <div className="max-h-[320px] overflow-y-auto scrollbar-thin border rounded-md divide-y">
              {session.headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  <div className="w-1/3 min-w-0">
                    <p className="text-[13px] font-medium truncate">{h}</p>
                    <p className="text-[11px] text-muted-foreground truncate">e.g. {String(session.sampleRows[0]?.[i] ?? '—')}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={mapping[i]?.field || '__skip__'}
                    onValueChange={(val) => setMapping((m) => m.map((x, xi) => (xi === i ? { ...x, field: val === '__skip__' ? null : val } : x)))}
                  >
                    <SelectTrigger className="flex-1 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      <SelectItem value={`custom:${h.toLowerCase().replace(/\s+/g, '_')}`}>Custom field "{h}"</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!mapping.some((m) => m.field === 'email') && <p className="text-xs text-destructive">Map one column to Email to continue.</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft /> Back</Button>
              <Button onClick={() => validate.mutate()} loading={validate.isPending} disabled={!mapping.some((m) => m.field === 'email')}>
                Validate contacts <ChevronRight />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                ['Total rows', validation.summary.totalRows],
                ['Ready to import', validation.summary.valid, 'text-success'],
                ['Already exist', validation.summary.existingContacts, 'text-info'],
                ['Invalid emails', validation.summary.invalidEmails, 'text-destructive'],
                ['Missing emails', validation.summary.missingEmails, 'text-destructive'],
                ['Duplicates in file', validation.summary.duplicatesInFile, 'text-warning'],
                ['Suppressed', validation.summary.suppressed, 'text-warning'],
              ].map(([label, val, color]) => (
                <div key={label} className="rounded-md border p-2.5">
                  <p className={cn('text-lg font-semibold', color)}>{val}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {validation.overLimit && (
              <p className="text-xs text-destructive">This import would exceed your plan limit of {validation.planLimit.toLocaleString()} contacts. Upgrade or reduce the file.</p>
            )}
            <div className="space-y-1.5">
              <Label>Add imported contacts to lists (optional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {listsQ.data?.items?.map((l) => (
                  <button
                    key={l._id}
                    type="button"
                    onClick={() => setListIds((ids) => (ids.includes(l._id) ? ids.filter((x) => x !== l._id) : [...ids, l._id]))}
                    className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', listIds.includes(l._id) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary')}
                  >
                    {l.name}
                  </button>
                ))}
                {!listsQ.data?.items?.length && <p className="text-xs text-muted-foreground">No lists yet — create them on the Lists page.</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft /> Back</Button>
              <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={validation.overLimit || (validation.summary.valid + validation.summary.existingContacts) === 0}>
                Import {validation.summary.valid + validation.summary.existingContacts} contacts
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && report && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <h3 className="text-lg font-semibold">Import complete</h3>
            <p className="text-[13px] text-muted-foreground">
              {report.imported} new contacts imported · {report.updated} updated · {report.skipped} skipped{report.failed ? ` · ${report.failed} failed` : ''}
            </p>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- main page ---------------- */

export default function ContactsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [tag, setTag] = React.useState('all');
  const [listId, setListId] = React.useState('all');
  const [assigned, setAssigned] = React.useState('all');
  const [selected, setSelected] = React.useState([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(!!params.get('import'));
  const [confirmBulk, setConfirmBulk] = React.useState(null);
  const openId = params.get('open');

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = {
    page, limit: 25,
    ...(debounced && { search: debounced }),
    ...(status !== 'all' && { status }),
    ...(tag !== 'all' && { tag }),
    ...(listId !== 'all' && { listId }),
    ...(assigned !== 'all' && { assignedTo: assigned }),
  };

  const contactsQ = useQuery({ queryKey: ['contacts', queryParams], queryFn: () => get('/contacts', queryParams), placeholderData: (p) => p });
  const facetsQ = useQuery({ queryKey: ['contact-facets'], queryFn: () => get('/contacts/facets') });
  const listsQ = useQuery({ queryKey: ['contact-lists'], queryFn: () => get('/contact-lists') });
  const teamQ = useQuery({ queryKey: ['team'], queryFn: () => get('/team') });

  const bulk = useMutation({
    mutationFn: (body) => post('/contacts/bulk', body),
    onSuccess: (res) => {
      toast.success(res.message);
      setSelected([]);
      setConfirmBulk(null);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-facets'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const items = contactsQ.data?.items || [];
  const pagination = contactsQ.data?.pagination;
  const allSelected = items.length > 0 && items.every((c) => selected.includes(c._id));

  const exportCsv = async () => {
    try {
      const res = await api.get('/contacts/export', { params: queryParams, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    }
  };

  return (
    <Page>
      <PageHeader
        title="Contacts"
        description={`${(pagination?.total ?? 0).toLocaleString()} contacts in your CRM.`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import</Button>
            <Button onClick={() => setAddOpen(true)}><Plus /> Add contact</Button>
          </>
        }
      />

      <Card>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 p-3.5 border-b">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company…" className="pl-8 h-8" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CONTACT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{titleCase(s)}{facetsQ.data?.statuses?.[s] ? ` (${facetsQ.data.statuses[s]})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={(v) => { setTag(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {facetsQ.data?.tags?.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={listId} onValueChange={(v) => { setListId(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-8"><SelectValue placeholder="List" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {listsQ.data?.items?.map((l) => <SelectItem key={l._id} value={l._id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={(v) => { setAssigned(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="Assigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {teamQ.data?.members?.filter((m) => m.userId).map((m) => (
                <SelectItem key={m._id} value={m.userId._id}>{m.userId.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk bar */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-accent/60 border-b text-[13px]">
            <span className="font-medium">{selected.length} selected</span>
            <Separator orientation="vertical" className="h-4" />
            <BulkTagButton onApply={(t, remove) => bulk.mutate({ ids: selected, action: remove ? 'remove_tag' : 'add_tag', value: t })} />
            <BulkListButton lists={listsQ.data?.items || []} onApply={(id) => bulk.mutate({ ids: selected, action: 'add_to_list', value: id })} />
            <BulkStatusButton onApply={(s) => bulk.mutate({ ids: selected, action: 'set_status', value: s })} />
            <BulkAssignButton members={teamQ.data?.members || []} onApply={(id) => bulk.mutate({ ids: selected, action: 'assign', value: id })} />
            <Button variant="ghost" size="sm" className="text-warning" onClick={() => setConfirmBulk('suppress')}><Ban /> Suppress</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmBulk('delete')}><Trash2 /> Delete</Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}

        {/* Table */}
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? items.map((c) => c._id) : [])} />
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last contacted</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contactsQ.isLoading && <TableSkeleton rows={8} cols={8} />}
            {contactsQ.isError && (
              <TableRow><TableCell colSpan={8}><ErrorState message={contactsQ.error.message} onRetry={() => contactsQ.refetch()} /></TableCell></TableRow>
            )}
            {!contactsQ.isLoading && !contactsQ.isError && !items.length && (
              <TableRow><TableCell colSpan={8}>
                <EmptyState
                  icon={Users}
                  title="No contacts found"
                  description={debounced || status !== 'all' ? 'Try adjusting your search or filters.' : 'Import a CSV or add your first contact to get started.'}
                  action={<div className="flex gap-2"><Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button><Button onClick={() => setAddOpen(true)}><Plus /> Add contact</Button></div>}
                />
              </TableCell></TableRow>
            )}
            {items.map((c) => (
              <TableRow key={c._id} className="cursor-pointer" onClick={() => setParams((p) => { p.set('open', c._id); return p; })}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.includes(c._id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, c._id] : s.filter((x) => x !== c._id)))} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={fullName(c)} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate max-w-[220px]">{fullName(c)}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[220px]">{c.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.company || '—'}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap max-w-[180px]">
                    {c.tags?.slice(0, 2).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                    {c.tags?.length > 2 && <Badge variant="muted">+{c.tags.length - 2}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-[13px]">{c.assignedTo?.name || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-[13px]">{c.lastContactedAt ? timeAgo(c.lastContactedAt) : 'Never'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <RowMenu contact={c} onSuppress={() => bulk.mutate({ ids: [c._id], action: 'suppress' })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination pagination={pagination} onPage={setPage} />
      </Card>

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportWizard open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setParams((p) => { p.delete('import'); return p; }); }} />
      {openId && <ContactDrawer contactId={openId} onClose={() => setParams((p) => { p.delete('open'); return p; })} />}

      <ConfirmDialog
        open={!!confirmBulk}
        onOpenChange={() => setConfirmBulk(null)}
        title={confirmBulk === 'delete' ? `Delete ${selected.length} contacts?` : `Suppress ${selected.length} contacts?`}
        description={confirmBulk === 'delete'
          ? 'Contacts are removed from your CRM and active sequences stop. This does not delete email history.'
          : 'Suppressed contacts never receive campaigns or sequences again, active sequences stop, and scheduled emails are cancelled.'}
        confirmLabel={confirmBulk === 'delete' ? 'Delete' : 'Suppress'}
        destructive
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate({ ids: selected, action: confirmBulk })}
      />
    </Page>
  );
}

function RowMenu({ contact, onSuppress }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = React.useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/contacts/${contact._id}`),
    onSuccess: () => { toast.success('Contact deleted.'); qc.invalidateQueries({ queryKey: ['contacts'] }); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSuppress}><Ban /> Suppress email</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => setConfirm(true)}><Trash2 /> Delete contact</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm}
        title={`Delete ${fullName(contact)}?`}
        description="The contact is removed from your CRM and stopped from any active sequences."
        confirmLabel="Delete" destructive loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function BulkTagButton({ onApply }) {
  const [value, setValue] = React.useState('');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Tag /> Tag</Button></DropdownMenuTrigger>
      <DropdownMenuContent className="p-2 w-56">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tag name" className="h-8 mb-2" onKeyDown={(e) => e.stopPropagation()} />
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" disabled={!value.trim()} onClick={() => { onApply(value.trim(), false); setValue(''); }}>Add</Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={!value.trim()} onClick={() => { onApply(value.trim(), true); setValue(''); }}>Remove</Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkListButton({ lists, onApply }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><ListPlus /> Add to list</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Choose list</DropdownMenuLabel>
        {lists.length ? lists.map((l) => (
          <DropdownMenuItem key={l._id} onClick={() => onApply(l._id)}>{l.name}</DropdownMenuItem>
        )) : <DropdownMenuItem disabled>No lists yet</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkStatusButton({ onApply }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><UserCheck /> Status</Button></DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        {CONTACT_STATUSES.map((s) => <DropdownMenuItem key={s} onClick={() => onApply(s)}>{titleCase(s)}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkAssignButton({ members, onApply }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Users /> Assign</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onApply(null)}>Unassigned</DropdownMenuItem>
        {members.filter((m) => m.userId).map((m) => (
          <DropdownMenuItem key={m._id} onClick={() => onApply(m.userId._id)}>{m.userId.name}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
