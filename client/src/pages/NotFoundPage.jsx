import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center">
        <Compass className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground text-[14px] max-w-sm">The page you're looking for doesn't exist or has been moved.</p>
      <Button asChild><Link to="/dashboard">Back to dashboard</Link></Button>
    </div>
  );
}
