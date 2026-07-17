import * as React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import AdminLayout from '@/layouts/AdminLayout';
import { FullPageSpinner } from '@/components/shared';

import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage';
import AcceptInvitePage from '@/pages/auth/AcceptInvitePage';

import DashboardPage from '@/pages/DashboardPage';
import InboxPage from '@/pages/InboxPage';
import ContactsPage from '@/pages/ContactsPage';
import ListsPage from '@/pages/ListsPage';
import TemplatesPage from '@/pages/TemplatesPage';
import CampaignsPage from '@/pages/CampaignsPage';
import CampaignDetailPage from '@/pages/CampaignDetailPage';
import SequencesPage from '@/pages/SequencesPage';
import SequenceDetailPage from '@/pages/SequenceDetailPage';
import AutomationsPage from '@/pages/AutomationsPage';
import RepliesPage from '@/pages/RepliesPage';
import AppointmentsPage from '@/pages/AppointmentsPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import IntegrationsPage from '@/pages/IntegrationsPage';
import BillingPage from '@/pages/BillingPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/admin/AdminPage';
import NotFoundPage from '@/pages/NotFoundPage';

function useSession() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const data = await get('/auth/me');
        setSession(data);
        return data;
      } catch (err) {
        clearSession();
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

function Protected({ children }) {
  const { isPending, isError, isFetching, data } = useSession();
  const location = useLocation();

  // A 401 from a previous visit stays cached in `isError` while React Query
  // revalidates on mount. Redirecting on that stale error would bounce a user who
  // has just signed in back to the login page, so wait for the refetch to settle.
  if (isPending || (isError && isFetching)) return <FullPageSpinner label="Signing you in…" />;
  if (isError && !data) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export default function App() {
  const applyTheme = useAuthStore((s) => s.applyTheme);
  React.useEffect(() => { applyTheme(); }, [applyTheme]);

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
      </Route>

      <Route element={<Protected><AppLayout /></Protected>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/sequences" element={<SequencesPage />} />
        <Route path="/sequences/:id" element={<SequenceDetailPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/replies" element={<RepliesPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/admin/*" element={<Protected><AdminLayout /></Protected>}>
        <Route path="*" element={<AdminPage />} />
        <Route index element={<AdminPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
