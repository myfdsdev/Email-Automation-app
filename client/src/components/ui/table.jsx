import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Skeleton } from './misc';
import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto scrollbar-thin">
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef(({ className, sticky, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', sticky && 'sticky top-0 bg-card z-10', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-accent', className)} {...props} />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th ref={ref} className={cn('h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap', className)} {...props} />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-2.5 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

/** Loading skeleton rows for tables. */
function TableSkeleton({ rows = 6, cols = 5 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <TableRow key={r}>
      {Array.from({ length: cols }).map((_, c) => (
        <TableCell key={c}><Skeleton className="h-4 w-full max-w-[160px]" /></TableCell>
      ))}
    </TableRow>
  ));
}

/** Standard empty state block. */
function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-6 text-center', className)}>
      <div className="rounded-full bg-secondary p-3.5 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-[15px]">{title}</p>
      {description && <p className="text-[13px] text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Standard error state block with retry. */
function ErrorState({ message = 'Failed to load data.', onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-6 text-center', className)}>
      <p className="font-medium text-[15px] text-destructive">Something went wrong</p>
      <p className="text-[13px] text-muted-foreground mt-1 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

/** Pagination footer. */
function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total } = pagination;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t text-[13px] text-muted-foreground">
      <span>Page {page} of {pages} · {total.toLocaleString()} total</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="iconSm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
        <Button variant="outline" size="iconSm" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
      </div>
    </div>
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton, EmptyState, ErrorState, Pagination };
