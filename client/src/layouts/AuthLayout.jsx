import { Outlet, Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-primary p-10 text-primary-foreground">
        <Link to="/" className="flex items-center gap-2.5 font-semibold text-lg">
          <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center"><Inbox className="h-5 w-5" /></div>
          Email Automation
        </Link>
        <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Outreach that runs itself — from first email to booked meeting.</h2>
          <p className="text-primary-foreground/75 text-[15px] leading-relaxed">
            Connect Gmail and Brevo, import your contacts, launch personalized campaigns and
            follow-up sequences, and let reply intelligence stop follow-ups and surface interested leads automatically.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} Email Automation. Send responsibly — every marketing email includes unsubscribe handling.</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-[400px] animate-fade-in">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
