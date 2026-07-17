import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, GoogleAuthButton, AuthDivider } from '@/components/shared';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Failure reasons the Google callback can redirect back with (?error=...). */
const GOOGLE_ERRORS = {
  access_denied: 'Google sign-in was cancelled.',
  google_not_configured: 'Google sign-in is not configured on this server.',
  invalid_state: 'That sign-in link expired. Please try again.',
  missing_code: 'Google did not return an authorization code. Please try again.',
  google_exchange_failed: 'Could not complete Google sign-in. Please try again.',
  no_email: 'Your Google account did not share an email address.',
  email_not_verified: 'Verify your email address with Google before signing in.',
  account_disabled: 'This account has been deactivated.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  // The Google callback reports failures by redirecting here with ?error=<reason>.
  // Show it once, then strip it so a refresh does not repeat the toast.
  React.useEffect(() => {
    const reason = searchParams.get('error');
    if (!reason) return;
    toast.error(GOOGLE_ERRORS[reason] || 'Google sign-in failed. Please try again.');
    searchParams.delete('error');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const login = useMutation({
    mutationFn: (values) => post('/auth/login', values),
    onSuccess: async () => {
      // removeQueries, not invalidateQueries: this page has no ['me'] observer, so
      // invalidate would only mark the cached 401 stale without refetching it, and the
      // route guard would then read that stale error and bounce us straight back here.
      qc.removeQueries({ queryKey: ['me'] });
      toast.success('Welcome back!');
      navigate(location.state?.from || '/dashboard', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-[13px] mt-1">Welcome back. Enter your details to continue.</p>
      </div>
      {/* Preserves the route the guard bounced the user from, so Google sign-in
          returns them there instead of always landing on the dashboard. */}
      <GoogleAuthButton next={location.state?.from} />
      <AuthDivider label="or sign in with email" />
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4" noValidate>
        <Field label="Email" required error={errors.email}>
          <Input type="email" placeholder="you@company.com" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" required error={errors.password}>
          <Input type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] text-primary hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={login.isPending}>Sign in</Button>
      </form>
      <p className="text-[13px] text-muted-foreground text-center">
        Don't have an account? <Link to="/signup" className="text-primary hover:underline font-medium">Create one free</Link>
      </p>
    </div>
  );
}
