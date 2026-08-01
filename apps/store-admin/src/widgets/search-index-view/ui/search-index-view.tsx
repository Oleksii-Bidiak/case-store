"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useReindexSearch } from "@/entities/search";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.searchIndex;

/**
 * Search-index maintenance screen (TASK-377).
 *
 * `POST /api/admin/search/reindex` has existed since TASK-075 behind the
 * `settings:search` permission, but nothing in the admin panel called it: the
 * generated hook was not even re-exported. So the one repair action for a search
 * that returns nothing was reachable only by curl with a bearer token — while
 * the deploy runbook told the operator to "finish it from the admin panel".
 *
 * Rebuilding is safe to run at any time and does not empty the index while it
 * works (TASK-376), so there is no confirmation dialog — the destructive-sounding
 * word "перебудувати" is the only thing that ever made it feel dangerous.
 */
export function SearchIndexView() {
  const { mutate, isPending } = useReindexSearch({
    mutation: {
      onSuccess: (res) => {
        toast.success(d.toastDone(res?.data?.indexed ?? 0));
      },
      onError: () => {
        toast.error(d.toastFailed);
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{d.subheading}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="text-sm font-medium text-foreground">{d.whenHeading}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {d.whenReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-muted-foreground">{d.safetyNote}</p>

        <Button
          type="button"
          onClick={() => mutate()}
          disabled={isPending}
          className="mt-4"
        >
          <RefreshCw
            aria-hidden="true"
            className={isPending ? "size-4 animate-spin" : "size-4"}
          />
          {isPending ? d.buttonPending : d.button}
        </Button>
      </div>
    </div>
  );
}
