import * as React from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Inbox, Users, ListChecks, FileText, Megaphone, GitBranch, Zap,
  MessageSquare, CalendarDays, BarChart3, Plug, CreditCard, Settings, Search, Bell,
  HelpCircle, ChevronsLeft, Menu, Moon, Sun, LogOut, UserRound, Check, Plus,
  ShieldCheck, X, Gauge,
} from 'lucide-react';
import { api, get, post } from '@/api/client';
import { useAuthStore, can } from '@/stores/authStore';
import { cn, initials, timeAgo, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, Tip, TooltipProvider, Progress, Separator, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/misc';
import { toast } from 'sonner';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/lists', label: 'Lists', icon: ListChecks },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/sequences', label: 'Sequences', icon: GitBranch },
  { to: '/automations', label: 'Automations', icon: Zap },
  { to: '/replies', label: 'Replies', icon: MessageSquare },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/integrations', label: 'Integrations', icon: Plug, perm: 'integrations' },
  { to: '/billing', label: 'Billing', icon: CreditCard, perm: 'billing' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SidebarContent({ collapsed, onNavigate }) {
  const role = useAuthStore((s) => s.role());
  const user = useAuthStore((s) => s.user);
  const items = NAV.filter((n) => !n.perm || can(role, n.perm));
  return (
    <>
      <div className={cn('flex h-16 items-center gap-3 border-b border-white/10 px-5 text-white shrink-0', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm">
          <Inbox className="h-4.5 w-4.5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="min-w-0 truncate text-[16px] font-semibold leading-none tracking-tight">Email Automation</span>}
      </div>
      <nav className={cn('flex-1 overflow-y-auto scrollbar-thin py-4', collapsed ? 'px-2 space-y-1.5' : 'px-3 space-y-1')}>
        {items.map(({ to, label, icon: Icon }) => (
          <Tip key={to} content={collapsed ? label : null} side="right">
            <NavLink
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-10 w-full items-center rounded-lg text-[14px] font-medium leading-none transition-colors',
                  collapsed ? 'justify-center px-2' : 'justify-start gap-3 px-3',
                  isActive ? 'bg-white/10 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
                )
              }
            >
              <Icon className="h-[19px] w-[19px] shrink-0" />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
            </NavLink>
          </Tip>
        ))}
        {user?.isPlatformAdmin && (
          <>
            <Separator className="my-2 bg-white/10" />
            <Tip content={collapsed ? 'Admin Panel' : null} side="right">
              <NavLink
                to="/admin"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex h-10 w-full items-center rounded-lg text-[14px] font-medium leading-none transition-colors',
                    collapsed ? 'justify-center px-2' : 'justify-start gap-3 px-3',
                    isActive ? 'bg-white/10 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                <ShieldCheck className="h-[19px] w-[19px] shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">Admin Panel</span>}
              </NavLink>
            </Tip>
          </>
        )}
      </nav>
      <UsageWidget collapsed={collapsed} />
    </>
  );
}

function UsageWidget({ collapsed }) {
  const { data } = useQuery({ queryKey: ['billing'], queryFn: () => get('/billing'), staleTime: 120000 });
  if (collapsed || !data) return null;
  const emails = data.usage?.emails_sent;
  return (
    <div className="border-t border-white/10 p-4 text-white shrink-0">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold leading-none">
          <Gauge className="h-4 w-4 shrink-0" />
          <span className="truncate">Emails this month</span>
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">{titleCase(data.plan)}</Badge>
      </div>
      <Progress value={emails?.used || 0} max={emails?.limit || 1} className="h-2" />
      <p className="mt-2 text-[12px] leading-none text-white/70">
        {(emails?.used || 0).toLocaleString()} / {(emails?.limit || 0).toLocaleString()} sent
      </p>
    </div>
  );
}

function WorkspaceSelector() {
  const { workspaces, activeWorkspaceId, setWorkspace } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2 max-w-[220px]">
          <div className="h-6 w-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
            {initials(active?.name)}
          </div>
          <span className="truncate text-[13px] hidden sm:block">{active?.name || 'Workspace'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => { setWorkspace(w.id); qc.clear(); }}>
            <div className="h-6 w-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold">{initials(w.name)}</div>
            <div className="flex-1 min-w-0">
              <p className="truncate">{w.name}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{w.role} · {w.plan}</p>
            </div>
            {w.id === activeWorkspaceId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings?tab=workspace&new=1')}><Plus /> Create workspace</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => get('/search', { q }),
    enabled: q.length >= 2,
    staleTime: 10000,
  });
  return (
    <Popover open={open && q.length >= 2} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-md hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            placeholder="Search contacts, campaigns, conversations…"
            className="pl-8 h-8 bg-secondary/60 border-transparent focus-visible:bg-card"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        {isFetching && <p className="text-xs text-muted-foreground px-2 py-1">Searching…</p>}
        {data && !data.contacts.length && !data.campaigns.length && !data.threads.length && (
          <p className="text-[13px] text-muted-foreground px-2 py-2">No results for "{q}"</p>
        )}
        {data?.contacts?.length > 0 && (
          <div className="mb-1">
            <p className="text-[11px] font-medium text-muted-foreground px-2 py-1">CONTACTS</p>
            {data.contacts.map((c) => (
              <button key={c._id} className="w-full text-left px-2 py-1.5 rounded hover:bg-secondary text-[13px]"
                onClick={() => { setOpen(false); setQ(''); navigate(`/contacts?open=${c._id}`); }}>
                {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email} <span className="text-muted-foreground">· {c.email}</span>
              </button>
            ))}
          </div>
        )}
        {data?.campaigns?.length > 0 && (
          <div className="mb-1">
            <p className="text-[11px] font-medium text-muted-foreground px-2 py-1">CAMPAIGNS</p>
            {data.campaigns.map((c) => (
              <button key={c._id} className="w-full text-left px-2 py-1.5 rounded hover:bg-secondary text-[13px]"
                onClick={() => { setOpen(false); setQ(''); navigate(`/campaigns/${c._id}`); }}>
                {c.name} <span className="text-muted-foreground">· {titleCase(c.status)}</span>
              </button>
            ))}
          </div>
        )}
        {data?.threads?.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground px-2 py-1">CONVERSATIONS</p>
            {data.threads.map((t) => (
              <button key={t._id} className="w-full text-left px-2 py-1.5 rounded hover:bg-secondary text-[13px]"
                onClick={() => { setOpen(false); setQ(''); navigate(`/inbox?thread=${t._id}`); }}>
                <span className="truncate block">{t.subject || '(no subject)'}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationsMenu() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get('/notifications', { limit: 12 }),
    refetchInterval: 45000,
  });
  const markAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id) => post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const navigate = useNavigate();
  const unread = data?.unreadCount || 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>Mark all read</Button>
          )}
        </div>
        <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
          {!data?.items?.length && <p className="text-[13px] text-muted-foreground text-center py-8">You're all caught up.</p>}
          {data?.items?.map((n) => (
            <button
              key={n._id}
              className={cn('w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-secondary/60 transition-colors', !n.isRead && 'bg-accent/50')}
              onClick={() => { if (!n.isRead) markOne.mutate(n._id); if (n.link) navigate(n.link); }}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, sidebarCollapsed, toggleSidebar, theme, toggleTheme, clearSession } = useAuthStore();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const logout = async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    clearSession();
    navigate('/login');
    toast.success('Signed out');
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar */}
        <aside className={cn('hidden lg:flex flex-col border-r border-slate-800 bg-[#18181d] transition-[width] duration-200 shrink-0', sidebarCollapsed ? 'w-[68px]' : 'w-[260px]')}>
          <SidebarContent collapsed={sidebarCollapsed} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-[280px] border-r border-slate-800 bg-[#18181d] flex flex-col animate-fade-in">
              <Button variant="ghost" size="icon" className="absolute right-2 top-2.5 z-10 text-white hover:bg-white/10 hover:text-white" onClick={() => setMobileOpen(false)}><X /></Button>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 border-b bg-card flex items-center gap-2 px-3 sm:px-4 shrink-0">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button>
            <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={toggleSidebar}>
              <ChevronsLeft className={cn('transition-transform', sidebarCollapsed && 'rotate-180')} />
            </Button>
            <WorkspaceSelector />
            <div className="flex-1 flex justify-center px-2"><GlobalSearch /></div>
            <div className="flex items-center gap-0.5">
              <Tip content="Help & docs"><Button variant="ghost" size="icon" onClick={() => window.open('https://github.com', '_blank')}><HelpCircle /></Button></Tip>
              <Tip content={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
              </Tip>
              <NotificationsMenu />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="font-medium text-[13px]">{user?.name}</p>
                    <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')}><UserRound /> Profile & settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/billing')}><CreditCard /> Billing</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={logout}><LogOut /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
