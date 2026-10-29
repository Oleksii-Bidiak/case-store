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

  // TASK-1989. `<main>` is the only scroller and is `relative`, so every
  // absolutely positioned descendant (sr-only radios, Radix hidden inputs)
  // resolves its containing block here and scrolls with the page. Without it
  // they fall through to the initial containing block, sit at their unscrolled
  // offset far below, and give the viewport a scroll range that focus or a
  // `#section` anchor then uses — sliding the whole shell up behind the body's
  // overflow-hidden. The wrappers use `overflow-clip`, not `-hidden`: clip is
  // not a scroll container, so nothing (focus, anchors, script) can scroll it.
  return (
    <div className="flex h-screen overflow-clip">
      <AdminSidebar />
      <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex flex-1 flex-col overflow-clip">
        <AdminHeader
          mobileNavOpen={mobileNavOpen}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="relative flex-1 overflow-y-auto p-4 lg:p-6">
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
