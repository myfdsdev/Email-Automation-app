import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
  workspaceName: z.string().min(2, 'Workspace name must be at least 2 characters'),
});

export default function SignupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const signup = useMutation({
    mutationFn: (values) => post('/auth/signup', values),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(res.message || 'Account created!');
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-[13px] mt-1">Free plan includes 500 contacts and 1,000 emails per month.</p>
      </div>
      <form onSubmit={handleSubmit((v) => signup.mutate(v))} className="space-y-4" noValidate>
        <Field label="Full name" required error={errors.name}>
          <Input placeholder="Alex Morgan" autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Work email" required error={errors.email}>
          <Input type="email" placeholder="you@company.com" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" required error={errors.password} description="Minimum 8 characters.">
          <Input type="password" placeholder="••••••••" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Workspace name" required error={errors.workspaceName} description="Your team's shared space — you can invite members later.">
          <Input placeholder="Acme Outreach" {...register('workspaceName')} />
        </Field>
        <Button type="submit" className="w-full" loading={signup.isPending}>Create account</Button>
      </form>
      <p className="text-[13px] text-muted-foreground text-center">
        Already have an account? <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  );
}
