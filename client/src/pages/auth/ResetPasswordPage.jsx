import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const reset = useMutation({
    mutationFn: (v) => post('/auth/reset-password', { token, password: v.password }),
    onSuccess: (res) => {
      toast.success(res.message || 'Password updated.');
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <h1 className="text-xl font-semibold">Invalid link</h1>
        <p className="text-[13px] text-muted-foreground">This password reset link is missing its token.</p>
        <Link to="/forgot-password" className="text-primary text-[13px] hover:underline block">Request a new link</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-muted-foreground text-[13px] mt-1">Signing in on other devices will require the new password.</p>
      </div>
      <form onSubmit={handleSubmit((v) => reset.mutate(v))} className="space-y-4" noValidate>
        <Field label="New password" required error={errors.password}>
          <Input type="password" placeholder="••••••••" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" required error={errors.confirm}>
          <Input type="password" placeholder="••••••••" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={reset.isPending}>Update password</Button>
      </form>
    </div>
  );
}
