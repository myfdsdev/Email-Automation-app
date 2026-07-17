import * as React from 'react';
import { cn, titleCase } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label, Spinner } from '@/components/ui/misc';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Mail, Send } from 'lucide-react';

/** Page shell: consistent max width + padding. */
export function Page({ children, className }) {
  return <div className={cn('mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 space-y-6 animate-fade-in', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] sm:text-[28px] font-semibold tracking-tight leading-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-[13px] sm:text-sm mt-1">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, description, actions, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** react-hook-form field wrapper with label, description and error message. */
export function Field({ label, required, error, description, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error.message || String(error)}</p>}
    </div>
  );
}

const STATUS_VARIANTS = {
  // contact statuses
  new: 'muted', contacted: 'info', delivered: 'info', opened: 'default', clicked: 'default',
  replied: 'success', interested: 'success', qualified: 'success', meeting_booked: 'success',
  not_interested: 'warning', unsubscribed: 'destructive', bounced: 'destructive',
  invalid: 'destructive', converted: 'success',
  // campaign / sequence / generic
  draft: 'muted', scheduled: 'info', running: 'success', active: 'success', paused: 'warning',
  completed: 'default', cancelled: 'muted', failed: 'destructive', archived: 'muted', stopped: 'warning',
  // message statuses
  queued: 'muted', sending: 'info', sent: 'info', soft_bounce: 'warning', hard_bounce: 'destructive',
  blocked: 'destructive', spam: 'destructive', // eslint-disable-line
  // connections
  connected: 'success', unhealthy: 'warning', disconnected: 'destructive', expired: 'destructive',
  // classifications
  pricing_question: 'success', more_information: 'success', meeting_request: 'success',
  out_of_office: 'muted', wrong_contact: 'warning', referral: 'info', complaint: 'destructive',
  support_request: 'info', automatic_reply: 'muted', unclassified: 'muted',
  // execution / jobs
  success: 'success', partial: 'warning', skipped: 'muted', retrying: 'warning',
  processed: 'success', duplicate: 'muted', received: 'info', invited: 'info', suspended: 'warning',
};

export function StatusBadge({ status, className }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANTS[status] || 'secondary'} className={className}>{titleCase(status)}</Badge>;
}

export function ProviderBadge({ provider }) {
  if (!provider) return null;
  return provider === 'gmail' ? (
    <Badge variant="destructive" className="bg-red-500/10 text-red-600 dark:text-red-400"><Mail className="h-3 w-3" /> Gmail</Badge>
  ) : (
    <Badge variant="info"><Send className="h-3 w-3" /> Brevo</Badge>
  );
}

/** Confirmation dialog replacing browser alert/confirm. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm, loading }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <Spinner className="h-6 w-6" />
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

export { GoogleAuthButton, AuthDivider } from './GoogleAuthButton';
