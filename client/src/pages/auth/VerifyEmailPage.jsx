import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/api/client';
import { Spinner } from '@/components/ui/misc';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const verify = useMutation({ mutationFn: () => post('/auth/verify-email', { token }) });
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (token && !fired.current) {
      fired.current = true;
      verify.mutate();
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-center space-y-4">
      {verify.isPending && (<><Spinner className="mx-auto h-7 w-7" /><p className="text-[13px] text-muted-foreground">Verifying your email…</p></>)}
      {verify.isSuccess && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="text-xl font-semibold">Email verified</h1>
          <p className="text-[13px] text-muted-foreground">Your account is fully activated.</p>
          <Link to="/dashboard" className="text-primary text-[13px] hover:underline block">Go to dashboard</Link>
        </>
      )}
      {(verify.isError || !token) && !verify.isPending && (
        <>
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">Verification failed</h1>
          <p className="text-[13px] text-muted-foreground">{verify.error?.message || 'This verification link is invalid or has expired.'}</p>
          <Link to="/login" className="text-primary text-[13px] hover:underline block">Back to sign in</Link>
        </>
      )}
    </div>
  );
}
