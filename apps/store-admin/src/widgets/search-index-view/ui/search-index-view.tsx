"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import { useReindexSearch } from "@/entities/search";
import { useAdminGetSearchSynonyms } from "@/entities/search-synonyms";
import { SearchSynonymsForm } from "@/features/search-synonyms-form";
import { Button, ErrorState, Skeleton } from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
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
 *
 * Wave 198 (TASK-1053, Н3): titled «Пошук на сайті»; the rebuild sits in a
 * «Покажчик» card. The mockup's numbers in that card (products and posts in the
 * index, when and by whom it was rebuilt) and the «Перевіряємо…» state after a
 * rebuild need an index-status endpoint the API does not have — until it does
 * the card keeps explaining when a rebuild helps, and the toast still reports
 * the counts the rebuild itself returns.
 */
export function SearchIndexView() {
  const { mutate, isPending } = useReindexSearch({
    mutation: {
      onSuccess: (res) => {
        toast.success(
          d.toastDone(res?.data?.indexed ?? 0, res?.data?.blogPosts ?? 0),
        );
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

      <FormSectionCard title={d.indexHeading}>
        <div>
          <p className="text-sm font-medium text-foreground">{d.whenHeading}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {d.whenReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">{d.safetyNote}</p>

        <div>
          <Button type="button" onClick={() => mutate()} disabled={isPending}>
            <RefreshCw
              aria-hidden="true"
              className={
                isPending
                  ? "size-4 animate-spin motion-reduce:animate-none"
                  : "size-4"
              }
            />
            {isPending ? d.buttonPending : d.button}
          </Button>
        </div>
      </FormSectionCard>

      <SearchSynonymsSection />
    </div>
  );
}

const s = dict.searchSynonyms;

/**
 * The synonym list (TASK-559) — on the same screen as the rebuild button
 * because the two go together: a new synonym works for correctly typed words
 * at once, and for misspelt ones after the rebuild. The loaded form draws its
 * own heading row (it holds «Додати групу» and the section «⋯»); the loading
 * and error states draw the same heading here.
 */
function SearchSynonymsSection() {
  const { data, isLoading, isError, isFetching, refetch } =
    useAdminGetSearchSynonyms();
  const settings = data?.data;

  return (
    <section
      aria-labelledby="search-synonyms-heading"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      {isLoading || isError || !settings ? (
        <h3
          id="search-synonyms-heading"
          className="text-sm font-semibold text-foreground"
        >
          {s.heading}
        </h3>
      ) : null}

      {isLoading ? (
        <div
          role="status"
          aria-label={s.loading}
          className="grid gap-2 md:grid-cols-2"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : isError || !settings ? (
        <ErrorState
          message={s.loadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <SearchSynonymsForm settings={settings} />
      )}
    </section>
  );
}
