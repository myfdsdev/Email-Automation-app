import { NavLink, Outlet, Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { EmptyState } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

const SECTIONS = [
  ['', 'Dashboard'],
  ['users', 'Users'],
  ['workspaces', 'Workspaces'],
  ['connections', 'Connections'],
  ['contacts', 'Contacts'],
  ['campaigns', 'Campaigns'],
  ['sequences', 'Sequences'],
  ['automations', 'Automations'],
  ['email-logs', 'Email Logs'],
  ['webhooks', 'Webhooks'],
  ['jobs', 'Queue Jobs'],
  ['suppression', 'Suppression'],
  ['usage', 'Usage & Credits'],
  ['plans', 'Plans'],
  ['payments', 'Payments'],
  ['audit-logs', 'Audit Logs'],
  ['system', 'System'],
];

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);

  if (!user?.isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <EmptyState
          icon={ShieldCheck}
          title="Admin access required"
          description="Your account does not have platform admin permission."
          action={<Button asChild><Link to="/dashboard">Back to app</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[220px] border-r bg-card flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 h-14 px-4 border-b">
          <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-background" />
          </div>
          <span className="font-semibold text-[15px]">Admin Panel</span>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
          <Link to="/dashboard" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-secondary mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          {SECTIONS.map(([path, label]) => (
            <NavLink
              key={path}
              to={`/admin/${path}`}
              end={path === ''}
              className={({ isActive }) =>
                cn('block rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        <Outlet />
      </main>
    </div>
  );
}
