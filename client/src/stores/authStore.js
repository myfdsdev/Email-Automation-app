import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      workspaces: [],
      activeWorkspaceId: null,
      theme: 'light',
      sidebarCollapsed: false,

      setSession: ({ user, workspaces }) => {
        const current = get().activeWorkspaceId;
        const valid = workspaces?.some((w) => w.id === current);
        set({
          user,
          workspaces: workspaces || [],
          activeWorkspaceId: valid ? current : workspaces?.[0]?.id || null,
        });
      },
      setWorkspace: (id) => set({ activeWorkspaceId: id }),
      clearSession: () => set({ user: null, workspaces: [], activeWorkspaceId: null }),
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark', next === 'dark');
        set({ theme: next });
      },
      applyTheme: () => document.documentElement.classList.toggle('dark', get().theme === 'dark'),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      activeWorkspace: () => get().workspaces.find((w) => w.id === get().activeWorkspaceId) || null,
      role: () => get().workspaces.find((w) => w.id === get().activeWorkspaceId)?.role || 'viewer',
    }),
    {
      name: 'ea-auth',
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId, theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);

export const can = (role, perm) => {
  const map = {
    owner: ['billing', 'integrations', 'team', 'workspace', 'contacts', 'templates', 'campaigns', 'sequences', 'automations', 'inbox', 'analytics', 'appointments', 'suppression'],
    admin: ['contacts', 'templates', 'campaigns', 'sequences', 'automations', 'inbox', 'analytics', 'appointments', 'suppression'],
    sales: ['inbox', 'appointments', 'analytics'],
    viewer: ['analytics'],
  };
  return (map[role] || []).includes(perm);
};
