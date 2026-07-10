import { dict, UMAMI_DASHBOARD_URL } from "@/shared/config";

interface DashboardTrafficCardProps {
  /** Defaults to the module-level env constant; overridable for tests. */
  dashboardUrl?: string;
}

/**
 * "Відвідуваність" traffic card (TASK-262, min scope) — a static outbound link
 * to the store's own website view inside Umami's dashboard UI. Deliberately no
 * Umami API call and no mirrored numbers: Umami's own interface already does
 * charts/funnels well, this card only reminds the owner it exists and gets
 * them there in one click. When `NEXT_PUBLIC_UMAMI_DASHBOARD_URL` is unset the
 * card renders a muted "not wired up yet" state instead of hiding — it signals
 * "ask your developer to finish this" rather than looking unbuilt.
 */
export function DashboardTrafficCard({
  dashboardUrl = UMAMI_DASHBOARD_URL,
}: DashboardTrafficCardProps) {
  const configured = Boolean(dashboardUrl);
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="text-sm font-medium text-muted-foreground">
        {dict.dashboard.trafficHeading}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {dict.dashboard.trafficSubtext}
      </p>
      {configured ? (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={dict.dashboard.trafficOpenLinkAria}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
        >
          {dict.dashboard.trafficOpenLink}
          <span aria-hidden="true">→</span>
        </a>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {dict.dashboard.trafficNotConfigured}
        </p>
      )}
    </div>
  );
}
