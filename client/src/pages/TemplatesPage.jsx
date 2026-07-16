import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, FileText, MoreHorizontal, Copy, Trash2, Pencil, Eye, Send, Search,
  Monitor, Smartphone, Sparkles, X,
} from 'lucide-react';
import { get, post, patch, del } from '@/api/client';
import { Page, PageHeader, Field, ConfirmDialog } from '@/components/shared';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton, Tabs, TabsList, TabsTrigger, TabsContent, Label } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/table';
import { titleCase, timeAgo, cn } from '@/lib/utils';

const CATEGORIES = ['cold_outreach', 'follow_up', 'newsletter', 'welcome', 'appointment_confirmation', 'appointment_reminder', 'product_update', 'payment_reminder', 'reactivation', 'transactional'];

function TemplateEditor({ open, onOpenChange, template }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('cold_outreach');
  const [subject, setSubject] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const [bodyText, setBodyText] = React.useState('');
  const [mode, setMode] = React.useState('rich');
  const [preview, setPreview] = React.useState(null);
  const [previewDevice, setPreviewDevice] = React.useState('desktop');
  const [testOpen, setTestOpen] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');

  React.useEffect(() => {
    setName(template?.name || '');
    setCategory(template?.category || 'cold_outreach');
    setSubject(template?.subject || '');
    setBodyHtml(template?.bodyHtml || '');
    setBodyText(template?.bodyText || '');
    setMode(template?.editorMode || 'rich');
    setPreview(null);
  }, [template, open]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, category, subject, bodyHtml, bodyText, editorMode: mode };
      return template ? patch(`/templates/${template._id}`, body) : post('/templates', body);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['templates'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const doPreview = useMutation({
    mutationFn: () => post('/templates/preview', { subject, bodyHtml: bodyHtml || `<div>${bodyText.replace(/\n/g, '<br/>')}</div>`, bodyText }),
    onSuccess: (res) => setPreview(res.data),
    onError: (err) => toast.error(err.message),
  });

  const aiGenerate = async (genMode) => {
    setAiBusy(true);
    try {
      const res = await post('/ai/generate', {
        mode: genMode,
        prompt: aiPrompt || `Write a ${titleCase(category)} email`,
        context: { existingSubject: subject, existingBody: bodyText || bodyHtml?.replace(/<[^>]+>/g, ' ') },
      });
      const r = res.data.result;
      if (r.subject) setSubject(r.subject);
      if (r.subjects?.length) setSubject(r.subjects[0]);
      if (r.body) {
        setBodyText(r.body);
        setBodyHtml(`<div>${r.body.split('\n\n').map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')}</div>`);
      }
      toast.success('AI draft applied — review before saving.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'New email template'}</DialogTitle>
          <DialogDescription>Use {'{{variables}}'} for personalization — fallbacks like {'{{first_name | default: "there"}}'} are supported.</DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr,240px] gap-4">
          <div className="space-y-3.5 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold intro v1" /></Field>
              <Field label="Category">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Subject line" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder='Quick question, {{first_name | default: "there"}}' />
            </Field>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label required>Email body</Label>
                <Tabs value={mode} onValueChange={setMode}>
                  <TabsList className="h-7">
                    <TabsTrigger value="rich" className="text-xs h-6">Rich text</TabsTrigger>
                    <TabsTrigger value="plain" className="text-xs h-6">Plain</TabsTrigger>
                    <TabsTrigger value="html" className="text-xs h-6">HTML</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {mode === 'rich' && <RichTextEditor value={bodyHtml} onChange={(html) => { setBodyHtml(html); }} />}
              {mode === 'plain' && <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={10} placeholder={'Hi {{first_name}},\n\nI noticed {{company}}…'} />}
              {mode === 'html' && <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} className="font-mono text-xs" placeholder="<p>Hi {{first_name}},</p>" />}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-2.5">
              <p className="text-[13px] font-medium flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI assist</p>
              <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} placeholder="Describe the email you want… e.g. 'Intro email for a CRM tool targeting sales VPs'" className="text-xs" />
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => aiGenerate('email')}>Generate</Button>
                <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => aiGenerate('subject')}>Subjects</Button>
                <Button size="sm" variant="outline" disabled={aiBusy || (!bodyText && !bodyHtml)} onClick={() => aiGenerate('shorten')}>Shorten</Button>
                <Button size="sm" variant="outline" disabled={aiBusy || (!bodyText && !bodyHtml)} onClick={() => aiGenerate('professional')}>Formal</Button>
                <Button size="sm" variant="outline" disabled={aiBusy || (!bodyText && !bodyHtml)} onClick={() => aiGenerate('friendly')}>Friendly</Button>
                <Button size="sm" variant="outline" disabled={aiBusy || (!bodyText && !bodyHtml)} onClick={() => aiGenerate('grammar')}>Fix grammar</Button>
              </div>
              {aiBusy && <p className="text-[11px] text-muted-foreground">Generating…</p>}
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-[13px] font-medium">Actions</p>
              <Button size="sm" variant="outline" className="w-full" onClick={() => doPreview.mutate()} loading={doPreview.isPending}><Eye /> Preview with sample data</Button>
              <Button size="sm" variant="outline" className="w-full" onClick={() => setTestOpen(true)}><Send /> Send test email</Button>
            </div>
          </div>
        </div>

        {preview && (
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/40">
              <p className="text-[13px] font-medium">Preview: {preview.subject}</p>
              <div className="flex items-center gap-1">
                {preview.missingVariables?.length > 0 && (
                  <Badge variant="warning">Missing: {preview.missingVariables.join(', ')}</Badge>
                )}
                <Button variant={previewDevice === 'desktop' ? 'secondary' : 'ghost'} size="iconSm" onClick={() => setPreviewDevice('desktop')}><Monitor /></Button>
                <Button variant={previewDevice === 'mobile' ? 'secondary' : 'ghost'} size="iconSm" onClick={() => setPreviewDevice('mobile')}><Smartphone /></Button>
                <Button variant="ghost" size="iconSm" onClick={() => setPreview(null)}><X /></Button>
              </div>
            </div>
            <div className="bg-background p-4 flex justify-center max-h-64 overflow-y-auto scrollbar-thin">
              <div className={cn('bg-card border rounded-md p-4 email-body w-full', previewDevice === 'mobile' && 'max-w-[375px]')}
                dangerouslySetInnerHTML={{ __html: preview.bodyHtml || `<pre style="white-space:pre-wrap;font-family:inherit">${preview.bodyText}</pre>` }} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!name.trim() || (!bodyHtml && !bodyText)} onClick={() => save.mutate()}>
            {template ? 'Save changes' : 'Save template'}
          </Button>
        </DialogFooter>

        <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} subject={subject} bodyHtml={bodyHtml || `<div>${bodyText.replace(/\n/g, '<br/>')}</div>`} bodyText={bodyText} />
      </DialogContent>
    </Dialog>
  );
}

export function TestEmailDialog({ open, onOpenChange, subject, bodyHtml, bodyText }) {
  const [to, setTo] = React.useState('');
  const [connectionId, setConnectionId] = React.useState('');
  const connectionsQ = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations'), enabled: open });
  const usable = (connectionsQ.data?.connections || []).filter((c) => c.status === 'connected');
  React.useEffect(() => { if (usable.length && !connectionId) setConnectionId(usable[0]._id); }, [usable, connectionId]);

  const send = useMutation({
    mutationFn: () => post('/templates/test-email', { to, connectionId, subject, bodyHtml, bodyText }),
    onSuccess: (res) => { toast.success(res.message); onOpenChange(false); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send test email</DialogTitle>
          <DialogDescription>Variables render with sample data. The subject gets a [TEST] prefix.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Send to" required><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@company.com" /></Field>
          <Field label="Send from" required>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger><SelectValue placeholder={usable.length ? 'Choose account' : 'No connected accounts'} /></SelectTrigger>
              <SelectContent>
                {usable.map((c) => <SelectItem key={c._id} value={c._id}>{c.email || c.defaultSenderEmail} ({c.provider})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {!usable.length && <p className="text-xs text-warning">Connect Gmail or Brevo on the Integrations page first.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={send.isPending} disabled={!to || !connectionId} onClick={() => send.mutate()}>Send test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [editor, setEditor] = React.useState({ open: false, template: null });
  const [confirmDelete, setConfirmDelete] = React.useState(null);

  const templatesQ = useQuery({
    queryKey: ['templates', search, category],
    queryFn: () => get('/templates', { ...(search && { search }), ...(category !== 'all' && { category }), limit: 100 }),
  });

  const duplicate = useMutation({
    mutationFn: (id) => post(`/templates/${id}/duplicate`),
    onSuccess: (res) => { toast.success(res.message); qc.invalidateQueries({ queryKey: ['templates'] }); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => del(`/templates/${id}`),
    onSuccess: () => { toast.success('Template archived.'); qc.invalidateQueries({ queryKey: ['templates'] }); setConfirmDelete(null); },
    onError: (err) => toast.error(err.message),
  });

  const items = templatesQ.data?.items || [];

  return (
    <Page>
      <PageHeader
        title="Templates"
        description="Reusable email content with personalization variables."
        actions={<Button onClick={() => setEditor({ open: true, template: null })}><Plus /> New template</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="pl-8 h-8" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[190px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {templatesQ.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : items.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t) => (
            <Card key={t._id} interactive onClick={() => setEditor({ open: true, template: t })}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><FileText className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{t.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">{titleCase(t.category)}</Badge>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="iconSm"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditor({ open: true, template: t })}><Pencil /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate.mutate(t._id)}><Copy /> Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onClick={() => setConfirmDelete(t)}><Trash2 /> Archive</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] font-medium truncate">{t.subject || <span className="text-muted-foreground">No subject</span>}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {(t.bodyText || t.bodyHtml?.replace(/<[^>]+>/g, ' ') || '').slice(0, 140) || 'Empty body'}
                </p>
                <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
                  <span>{t.usageCount || 0} uses</span>
                  <span>Updated {timeAgo(t.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={FileText} title="No templates yet" description="Templates speed up campaigns and keep your messaging consistent."
          action={<Button onClick={() => setEditor({ open: true, template: null })}><Plus /> Create your first template</Button>} /></Card>
      )}

      <TemplateEditor open={editor.open} template={editor.template} onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} />
      <ConfirmDialog
        open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}
        title={`Archive "${confirmDelete?.name}"?`}
        description="Archived templates are hidden from pickers but past campaigns keep their content."
        confirmLabel="Archive" destructive loading={remove.isPending}
        onConfirm={() => remove.mutate(confirmDelete._id)}
      />
    </Page>
  );
}
