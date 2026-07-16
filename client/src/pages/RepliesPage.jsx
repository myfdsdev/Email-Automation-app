import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Sparkles } from 'lucide-react';
import { get } from '@/api/client';
import { Page, PageHeader, StatusBadge } from '@/components/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/table';
import { fullName, timeAgo, titleCase, cn } from '@/lib/utils';

const CLASSIFICATIONS = ['interested', 'pricing_question', 'more_information', 'meeting_request', 'not_interested', 'unsubscribe', 'out_of_office', 'wrong_contact', 'referral', 'complaint', 'support_request', 'automatic_reply', 'spam', 'unclassified'];

export default function RepliesPage() {
  const navigate = useNavigate();
  const [classification, setClassification] = React.useState('all');
  const breakdownQ = useQuery({ queryKey: ['analytics-replies'], queryFn: () => get('/analytics/replies') });
  const threadsQ = useQuery({
    queryKey: ['replies-threads'],
    queryFn: () => get('/inbox/threads', { folder: 'inbox', limit: 100 }),
    refetchInterval: 30000,
  });

  const threads = (threadsQ.data?.items || []).filter((t) => t.lastClassification && (classification === 'all' || t.lastClassification === classification));

  return (
    <Page>
      <PageHeader title="Replies" description="Every incoming reply, classified by AI so you can focus on interested leads." />

      <div className="flex gap-2 flex-wrap">
        {(breakdownQ.data?.breakdown || []).map((b) => (
          <button key={b.classification} onClick={() => setClassification((c) => (c === b.classification ? 'all' : b.classification))}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', classification === b.classification ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary')}>
            {titleCase(b.classification)} <span className="opacity-70">({b.count})</span>
          </button>
        ))}
        <div className="ml-auto">
          <Select value={classification} onValueChange={setClassification}>
            <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All classifications</SelectItem>
              {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {threadsQ.isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : threads.length ? (
        <div className="space-y-2.5">
          {threads.map((t) => (
            <Card key={t._id} interactive onClick={() => navigate(`/inbox?thread=${t._id}`)} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={t.contactId ? fullName(t.contactId) : t.participants?.[0]?.email} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-[14px]">{t.contactId ? fullName(t.contactId) : t.participants?.[0]?.email}</p>
                    <StatusBadge status={t.lastClassification} />
                    {t.needsResponse && <Badge variant="warning">Needs response</Badge>}
                    {t.campaignId?.name && <Badge variant="outline" className="text-[10px]">{t.campaignId.name}</Badge>}
                    <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeAgo(t.lastInboundAt || t.lastMessageAt)}</span>
                  </div>
                  <p className="text-[13px] font-medium truncate mt-1">{t.subject || '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.snippet}</p>
                  {t.contactId?.company && <p className="text-[11px] text-muted-foreground mt-1">{t.contactId.company}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No classified replies yet"
            description="When contacts reply to your Gmail campaigns and sequences, the AI classifies intent (interested, pricing, meeting request…) and they appear here."
          />
        </Card>
      )}
    </Page>
  );
}
