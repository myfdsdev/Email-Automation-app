import { apiHref } from '@/api/client';
import { cn } from '@/lib/utils';

/** Google's mark. Inline so it works under the CSP and needs no network fetch. */
function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Must be an <a>, not a fetch: OAuth requires a full top-level navigation so Google
 * can render its consent screen and redirect back. An XHR would be blocked by CORS.
 */
export function GoogleAuthButton({ label = 'Continue with Google', next, className }) {
  const href = apiHref(`/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return (
    <a
      href={href}
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-md border bg-background',
        'text-[14px] font-medium text-foreground transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      <GoogleIcon />
      {label}
    </a>
  );
}

/** "or" divider between the Google button and the email form. */
export function AuthDivider({ label = 'or' }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-2 text-[12px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
