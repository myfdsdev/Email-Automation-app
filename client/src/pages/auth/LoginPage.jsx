import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const login = useMutation({
    mutationFn: (values) => post('/auth/login', values),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
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
