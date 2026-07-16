import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { MailCheck } from 'lucide-react';

const schema = z.object({ email: z.string().email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });
  const req = useMutation({
    mutationFn: (v) => post('/auth/forgot-password', v),
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(err.message),
  });

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-success/10 flex items-center justify-center"><MailCheck className="h-6 w-6 text-success" /></div>
        <h1 className="text-xl font-semibold">Check your inbox</h1>
        <p className="text-[13px] text-muted-foreground">If an account exists for that email, we've sent a password reset link. It expires in 1 hour.</p>
        <Link to="/login" className="text-primary text-[13px] hover:underline block">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-muted-foreground text-[13px] mt-1">Enter your email and we'll send you a reset link.</p>
      </div>
      <form onSubmit={handleSubmit((v) => req.mutate(v))} className="space-y-4" noValidate>
        <Field label="Email" required error={errors.email}>
          <Input type="email" placeholder="you@company.com" {...register('email')} />
        </Field>
        <Button type="submit" className="w-full" loading={req.isPending}>Send reset link</Button>
      </form>
      <p className="text-[13px] text-muted-foreground text-center">
        Remembered it? <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  );
}
