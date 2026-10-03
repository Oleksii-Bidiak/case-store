"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/entities/session";
import { ErrorState } from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminSidebar } from "./admin-sidebar";
import { SessionExpiredDialog } from "./session-expired-dialog";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { AdminHeader } from "./admin-header";

/**
 * AdminShell — the client shell that owns the mobile-nav open state.
 *
 * The burger trigger (in `AdminHeader`) and the drawer content
 * (`MobileNavDrawer`) are siblings, so the `mobileNavOpen` state is lifted here
 * to the nearest common parent and passed down as plain props — no Context is
 * warranted for a single level of prop-drilling.
 *
 * Close-on-navigate has two layers. The primary mechanism is the per-link
 * `onNavigate` handler threaded into `AdminNavList` (TASK-204 pattern). The
 * backstop closes the drawer on any route change — including navigations that
 * don't go through a rendered `<Link>` click (browser back/forward, a future
 * `router.push`) — implemented with the render-time "adjust state during render"
 * guard (forms.md Rule 1a) rather than a `useEffect`, so there is no extra render
 * pass and no `react-hooks/set-state-in-effect` violation.
 *
 * `children` is a Server Component subtree passed straight through — handing it
 * to a Client Component as a prop does not "client-ize" it (standard App Router
 * Server-in-Client composition).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const { permissionsFailed, isRetryingPermissions, retryPermissions } =
    useAuth();

  const [syncedPathname, setSyncedPathname] = useState(pathname);
  if (pathname !== syncedPathname) {
    setSyncedPathname(pathname);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader
          mobileNavOpen={mobileNavOpen}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {permissionsFailed ? (
            // TASK-1014 (П6). Without permissions every section answers "no"
            // — the owner's too — so the page itself would render a refusal
            // or nothing. Say what happened and offer the one way out.
            <ErrorState
              variant="card"
              title={dict.header.permissionsErrorTitle}
              message={dict.header.permissionsErrorBody}
              onRetry={retryPermissions}
              isRetrying={isRetryingPermissions}
              className="max-w-xl"
            />
          ) : (
            children
          )}
        </main>
      </div>
      <SessionExpiredDialog />
    </div>
  );
}
