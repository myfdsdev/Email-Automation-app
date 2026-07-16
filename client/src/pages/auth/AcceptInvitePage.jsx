import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { get, post } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { UsersRound } from 'lucide-react';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const session = useQuery({ queryKey: ['me'], queryFn: () => get('/auth/me'), retry: false });

  const accept = useMutation({
    mutationFn: () => post('/team/accept-invite', { token }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(res.message || 'Invitation accepted!');
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  if (session.isLoading) return <div className="text-center"><Spinner className="mx-auto" /></div>;

  if (session.isError) {
    return (
      <div className="text-center space-y-4">
        <UsersRound className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">You've been invited</h1>
        <p className="text-[13px] text-muted-foreground">Sign in or create an account with the invited email address, then open this link again to join the workspace.</p>
        <div className="flex gap-2 justify-center">
          <Button asChild variant="outline"><Link to={`/login?next=/accept-invite%3Ftoken=${token}`}>Sign in</Link></Button>
          <Button asChild><Link to="/signup">Create account</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <UsersRound className="mx-auto h-12 w-12 text-primary" />
      <h1 className="text-xl font-semibold">Join workspace</h1>
      <p className="text-[13px] text-muted-foreground">Accept the invitation to start collaborating with your team.</p>
      <Button onClick={() => accept.mutate()} loading={accept.isPending} disabled={!token}>Accept invitation</Button>
    </div>
  );
}
