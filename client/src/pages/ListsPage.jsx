import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ListChecks, Filter, Trash2, Pencil, RefreshCw, Users, MoreHorizontal, Send } from 'lucide-react';
import { get, post, patch, del } from '@/api/client';
import { Page, PageHeader, Field, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent, Skeleton, Label } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/table';
import { timeAgo, titleCase } from '@/lib/utils';

const SEGMENT_FIELDS = [
  { value: 'status', label: 'Contact status' },
  { value: 'tag', label: 'Tag' },
  { value: 'source', label: 'Source' },
  { value: 'industry', label: 'Industry' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'company', label: 'Company' },
  { value: 'lead_score', label: 'Lead score' },
  { value: 'open_count', label: 'Open count' },
  { value: 'click_count', label: 'Click count' },
  { value: 'reply_count', label: 'Reply count' },
  { value: 'last_contacted_at', label: 'Last contacted date' },
  { value: 'assigned_to', label: 'Assigned member' },
  { value: 'subscription_status', label: 'Subscription status' },
];
const OPERATORS = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'exists', label: 'has any value' },
  { value: 'not_exists', label: 'is empty' },
  { value: 'before', label: 'before (date)' },
  { value: 'after', label: 'after (date)' },
];

function ListDialog({ open, onOpenChange, list }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(list?.name || '');
  const [description, setDescription] = React.useState(list?.description || '');
  React.useEffect(() => { setName(list?.name || ''); setDescription(list?.description || ''); }, [list, open]);
  const save = useMutation({
    mutationFn: () => (list ? patch(`/contact-lists/${list._id}`, { name, description }) : post('/contact-lists', { name, description })),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? 'Edit list' : 'New contact list'}</DialogTitle>
          <DialogDescription>Static lists hold a fixed set of contacts you add manually or via import.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 SaaS prospects" /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this list for?" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{list ? 'Save' : 'Create list'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SegmentDialog({ open, onOpenChange, segment }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [filters, setFilters] = React.useState([{ field: 'status', operator: 'equals', value: '' }]);
  React.useEffect(() => {
    setName(segment?.name || '');
    setFilters(segment?.filters?.length ? segment.filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value ?? '' })) : [{ field: 'status', operator: 'equals', value: '' }]);
  }, [segment, open]);

  const preview = useQuery({
    queryKey: ['segment-preview', filters],
    queryFn: () => post('/segments/preview', { filters }).then((r) => r.data),
    enabled: open && filters.every((f) => f.field && (f.operator === 'exists' || f.operator === 'not_exists' || String(f.value).length > 0)),
  });

  const save = useMutation({
    mutationFn: () => (segment ? patch(`/segments/${segment._id}`, { name, filters }) : post('/segments', { name, filters })),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['segments'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const setFilter = (i, k, v) => setFilters((fs) => fs.map((f, fi) => (fi === i ? { ...f, [k]: v } : f)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{segment ? 'Edit segment' : 'New dynamic segment'}</DialogTitle>
          <DialogDescription>Segments update automatically — contacts matching all conditions are included.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engaged US leads" /></Field>
          <div className="space-y-2">
            <Label>Conditions (all must match)</Label>
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={f.field} onValueChange={(v) => setFilter(i, 'field', v)}>
                  <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEGMENT_FIELDS.map((sf) => <SelectItem key={sf.value} value={sf.value}>{sf.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={f.operator} onValueChange={(v) => setFilter(i, 'operator', v)}>
                  <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {!['exists', 'not_exists'].includes(f.operator) && (
                  <Input value={f.value} onChange={(e) => setFilter(i, 'value', e.target.value)} className="h-8 flex-1" placeholder="Value" />
                )}
                <Button variant="ghost" size="iconSm" onClick={() => setFilters((fs) => fs.filter((_, fi) => fi !== i))} disabled={filters.length === 1}>
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFilters((fs) => [...fs, { field: 'tag', operator: 'equals', value: '' }])}><Plus /> Add condition</Button>
          </div>
          <div className="rounded-md border bg-secondary/40 p-3 text-[13px]">
            {preview.isFetching ? 'Calculating…' : preview.data ? (
              <>
                <span className="font-semibold">{preview.data.count.toLocaleString()}</span> contacts currently match
                {preview.data.sample?.length > 0 && (
                  <span className="text-muted-foreground"> — e.g. {preview.data.sample.map((s) => s.email).slice(0, 3).join(', ')}</span>
                )}
              </>
            ) : 'Complete the conditions to preview matching contacts.'}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{segment ? 'Save' : 'Create segment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ListsPage() {
  const qc = useQueryClient();
  const [listDialog, setListDialog] = React.useState({ open: false, list: null });
  const [segmentDialog, setSegmentDialog] = React.useState({ open: false, segment: null });
  const [confirmDelete, setConfirmDelete] = React.useState(null);

  const listsQ = useQuery({ queryKey: ['contact-lists'], queryFn: () => get('/contact-lists') });
  const segmentsQ = useQuery({ queryKey: ['segments'], queryFn: () => get('/segments') });

  const removeList = useMutation({
    mutationFn: (id) => del(`/contact-lists/${id}`),
    onSuccess: () => { toast.success('List deleted.'); qc.invalidateQueries({ queryKey: ['contact-lists'] }); setConfirmDelete(null); },
    onError: (err) => toast.error(err.message),
  });
  const removeSegment = useMutation({
    mutationFn: (id) => del(`/segments/${id}`),
    onSuccess: () => { toast.success('Segment deleted.'); qc.invalidateQueries({ queryKey: ['segments'] }); setConfirmDelete(null); },
    onError: (err) => toast.error(err.message),
  });
  const syncBrevo = useMutation({
    mutationFn: (id) => post(`/contact-lists/${id}/sync-brevo`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['contact-lists'] }); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Page>
      <PageHeader title="Lists & Segments" description="Group contacts into static lists or auto-updating dynamic segments." />
      <Tabs defaultValue="lists">
        <TabsList>
          <TabsTrigger value="lists">Static lists ({listsQ.data?.items?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="segments">Dynamic segments ({segmentsQ.data?.items?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="lists">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setListDialog({ open: true, list: null })}><Plus /> New list</Button>
          </div>
          {listsQ.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : listsQ.data?.items?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listsQ.data.items.map((l) => (
                <Card key={l._id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><ListChecks className="h-4 w-4 text-primary" /></div>
                        <CardTitle className="truncate">{l.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setListDialog({ open: true, list: l })}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => syncBrevo.mutate(l._id)}><Send /> Sync to Brevo</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => setConfirmDelete({ type: 'list', item: l })}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {l.description && <CardDescription className="line-clamp-2">{l.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {l.contactCount.toLocaleString()} contacts</span>
                    <div className="flex items-center gap-1.5">
                      {l.brevoListId && <Badge variant="info">Brevo synced</Badge>}
                      <span className="text-[11px] text-muted-foreground">{timeAgo(l.updatedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><EmptyState icon={ListChecks} title="No lists yet" description="Lists let you target specific groups in campaigns and sequences."
              action={<Button onClick={() => setListDialog({ open: true, list: null })}><Plus /> Create your first list</Button>} /></Card>
          )}
        </TabsContent>

        <TabsContent value="segments">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setSegmentDialog({ open: true, segment: null })}><Plus /> New segment</Button>
          </div>
          {segmentsQ.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : segmentsQ.data?.items?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {segmentsQ.data.items.map((s) => (
                <Card key={s._id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-md bg-info/10 flex items-center justify-center shrink-0"><Filter className="h-4 w-4 text-info" /></div>
                        <CardTitle className="truncate">{s.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSegmentDialog({ open: true, segment: s })}><Pencil /> Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => setConfirmDelete({ type: 'segment', item: s })}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {s.filters?.slice(0, 3).map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{titleCase(f.field)} {OPERATORS.find((o) => o.value === f.operator)?.label} {['exists', 'not_exists'].includes(f.operator) ? '' : String(f.value)}</Badge>
                      ))}
                      {s.filters?.length > 3 && <Badge variant="muted">+{s.filters.length - 3}</Badge>}
                    </div>
                    <span className="text-[13px] text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> ~{s.estimatedCount.toLocaleString()} matching now</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><EmptyState icon={Filter} title="No segments yet" description="Segments update automatically as contacts change — great for targeting engaged or interested leads."
              action={<Button onClick={() => setSegmentDialog({ open: true, segment: null })}><Plus /> Create your first segment</Button>} /></Card>
          )}
        </TabsContent>
      </Tabs>

      <ListDialog open={listDialog.open} list={listDialog.list} onOpenChange={(o) => setListDialog((d) => ({ ...d, open: o }))} />
      <SegmentDialog open={segmentDialog.open} segment={segmentDialog.segment} onOpenChange={(o) => setSegmentDialog((d) => ({ ...d, open: o }))} />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.item?.name}"?`}
        description={confirmDelete?.type === 'list' ? 'Contacts stay in your CRM; they are only removed from this list.' : 'The segment definition is removed. Contacts are not affected.'}
        confirmLabel="Delete" destructive
        loading={removeList.isPending || removeSegment.isPending}
        onConfirm={() => (confirmDelete.type === 'list' ? removeList.mutate(confirmDelete.item._id) : removeSegment.mutate(confirmDelete.item._id))}
      />
    </Page>
  );
}
