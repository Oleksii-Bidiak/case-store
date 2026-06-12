/**
 * Layout for the unauthenticated auth area (login). Renders a bare, centered
 * card with no admin shell — the global Providers (incl. AuthProvider) come
 * from the root layout.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
