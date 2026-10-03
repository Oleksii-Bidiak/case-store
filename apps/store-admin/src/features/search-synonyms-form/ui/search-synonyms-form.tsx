"use client";

import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import {
  getAdminGetSearchSynonymsQueryKey,
  useAdminUpdateSearchSynonyms,
  type SearchSynonymsEntity,
  type SearchSynonymsSaveResultEntity,
  type UpdateSearchSynonymsDto,
} from "@/entities/search-synonyms";
import { Button, FormActionsBar, Input, useConfirmDialog } from "@/shared/ui";
import { RowActionsMenu } from "@/shared/ui/data-registry";
import { toast } from "@/shared/ui/toast";
import { apiErrorMessage, cn } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  mapSynonymsToFormValues,
  parseSynonymTerms,
  searchSynonymsSchema,
  type SearchSynonymsFormInput,
  type SearchSynonymsFormValues,
} from "../model/search-synonyms-schema";

const d = dict.searchSynonyms;

/** Groups shown before «показати всі» (Н3: «Показано 12 з 43»). */
const SHOWN_BY_DEFAULT = 12;

interface SearchSynonymsFormProps {
  /** The list as last read from the API (the built-in one while none is saved). */
  settings: SearchSynonymsEntity;
}

/** A group's identity for «what changed»: its words, order-free. */
function groupKey(terms: string | undefined): string {
  return parseSynonymTerms(terms).sort().join(",");
}

/**
 * How many groups differ from the saved list — an edited group counts once,
 * not as one removed plus one added.
 */
function changedGroups(
  current: readonly ({ terms?: string } | undefined)[],
  saved: readonly ({ terms?: string } | undefined)[],
): number {
  const remaining = new Map<string, number>();
  for (const group of saved) {
    const key = groupKey(group?.terms);
    if (key) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let added = 0;
  for (const group of current) {
    const key = groupKey(group?.terms);
    if (!key) continue;
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    else added += 1;
  }
  let removed = 0;
  for (const left of remaining.values()) removed += left;
  return Math.max(added, removed);
}

/**
 * The search-synonym list editor (TASK-559): groups added and removed freely,
 * the whole list saved at once.
 *
 * Wave 198 (TASK-1053, Н3): the groups are a two-column grid of chips — the
 * words, read at a glance — each with its «⋯» («Змінити», «Видалити»);
 * «Змінити» turns the card into the comma-separated input, a group with an
 * error or no words yet stays open. A word search filters the grid; the first
 * twelve show until «показати всі». «Повернути стандартний список» moved to the
 * section's «⋯». The sticky bar counts the changed groups and can discard them.
 *
 * STATE SYNC (docs/conventions/forms.md, Rule 2). The list is a singleton with
 * no id, so there is no entity identity to key a reset on — the form follows
 * `settings` itself, but only while it is PRISTINE: a refetch that lands while
 * the operator is editing is ignored, and their whole list is what a save sends.
 * The form is also re-seeded from its OWN save's answer — the normalised list
 * the server stored, so «Чохол ,CASE» comes back as «чохол, case».
 *
 * Why not Rule 2a (`values` + `keepDirtyValues`): that option merges per FIELD
 * PATH, i.e. per row index, and a field array is not a set of independent
 * fields. Measured on RHF 7.83 with a refetch that grew the list 2 → 3: after
 * an edit to row 1 the array kept its old length and the server's third group
 * vanished; after a removed row the removal was undone; after an added row it
 * overwrote the server's third group. Every one of those is then PUT as the
 * whole list — a group silently deleted or resurrected. All-or-nothing is the
 * only merge a whole-list save can honour.
 *
 * The search text, «показати всі» and which cards are open are view state, not
 * form state: none of them is seeded from the server, so none needs a guard.
 */
export function SearchSynonymsForm({ settings }: SearchSynonymsFormProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isDirty, defaultValues },
  } = useForm<SearchSynonymsFormInput, unknown, SearchSynonymsFormValues>({
    resolver: zodResolver(searchSynonymsSchema),
    defaultValues: mapSynonymsToFormValues(settings),
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "groups",
  });
  const groups = useWatch({ control, name: "groups" }) ?? [];

  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Keyed on `settings` alone ON PURPOSE. With `isDirty` in the deps, the
  // save's own `reset` (dirty → pristine) would fire this one render BEFORE
  // `setQueryData` reaches the prop (the query cache notifies on a later tick),
  // and flash the pre-save list over the rows just saved. `isDirty` read here is
  // the value of the render in which `settings` changed, which is current.
  useEffect(() => {
    if (!isDirty) reset(mapSynonymsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // «Змінити» opens the card's input; focus it once it exists. A ref, not
  // state: it is a one-shot instruction to the DOM, not something to render.
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    setFocus(`groups.${pendingFocus.current}.terms`);
    pendingFocus.current = null;
  });

  const update = useAdminUpdateSearchSynonyms();

  const resetTo = (values: SearchSynonymsFormInput) => {
    reset(values);
    setEditing(new Set());
  };

  const save = (body: UpdateSearchSynonymsDto, restoring: boolean) => {
    update.mutate(
      { data: body },
      {
        onSuccess: (res) => {
          const saved: SearchSynonymsSaveResultEntity = res.data;
          resetTo(mapSynonymsToFormValues(saved));
          queryClient.setQueryData(getAdminGetSearchSynonymsQueryKey(), {
            data: { groups: saved.groups, isDefault: saved.isDefault },
          });
          // A save the engine did not take is still a save; the explanation
          // stays on screen (below) instead of fading with the toast.
          toast.success(restoring ? d.toastRestored : d.toastSaved);
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.toastFailed);
        },
      },
    );
  };

  const onRestoreDefaults = async (
    description: string = d.restoreDescription,
  ) => {
    const confirmed = await confirm({
      title: d.restoreTitle,
      description,
      confirmLabel: d.restoreConfirm,
      destructive: true,
    });
    if (confirmed) save({ groups: [] }, true);
  };

  /**
   * The API stores an empty list as "never saved" — i.e. the built-in
   * dictionary. So a save with no groups left (every row removed or blank) IS
   * the restore operation: it takes the same confirmation and says so, instead
   * of toasting «saved» and silently bringing the defaults back.
   */
  const onSubmit = (values: SearchSynonymsFormValues) => {
    if (values.groups.length === 0) {
      void onRestoreDefaults(d.emptySaveDescription);
      return;
    }
    save(values, false);
  };

  const startEditing = (id: string, index: number) => {
    pendingFocus.current = index;
    setEditing((prev) => new Set(prev).add(id));
  };
  const stopEditing = (id: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const addGroup = () => {
    setShowAll(true);
    setQuery("");
    // `append` focuses the new input itself (RHF `shouldFocus`).
    append({ terms: "" });
  };

  // Which cards are open, and which are shown.
  const needle = query.trim().toLowerCase();
  const items = fields.map((field, index) => {
    const terms = groups[index]?.terms ?? "";
    const words = parseSynonymTerms(terms);
    const error = errors.groups?.[index]?.terms?.message;
    const open = editing.has(field.id) || Boolean(error) || words.length === 0;
    return { field, index, terms, words, error, open };
  });
  const matching = needle
    ? items.filter(
        (item) => item.open || item.words.some((word) => word.includes(needle)),
      )
    : items;
  const shown =
    needle || showAll
      ? matching
      : matching.filter((item) => item.index < SHOWN_BY_DEFAULT || item.open);

  // A card opened by itself (no words yet, or an error) STAYS open until
  // «Готово»: otherwise the first typed letter of a new group, or the keystroke
  // that clears an error, would fold the input away from under the cursor.
  // Adjusted during render (React's «storing information from previous
  // renders» pattern) — it converges in one extra pass, since the ids it adds
  // are then in `editing`.
  const forcedOpen = items
    .filter((item) => item.open && !editing.has(item.field.id))
    .map((item) => item.field.id);
  if (forcedOpen.length > 0) {
    setEditing((prev) => new Set([...prev, ...forcedOpen]));
  }

  const changed = changedGroups(groups, defaultValues?.groups ?? []);
  const dirtySections = isDirty ? [d.dirtyLabel(changed)] : [];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            id="search-synonyms-heading"
            className="text-sm font-semibold text-foreground"
          >
            {d.heading}
          </h3>
          <p className="text-xs text-muted-foreground">
            {d.countHint(fields.length)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" onClick={addGroup}>
            <Plus aria-hidden="true" />
            {d.addGroup}
          </Button>
          {!settings.isDefault && (
            <RowActionsMenu
              label={d.sectionMenuAria}
              items={[
                {
                  label: d.restoreDefaults,
                  destructive: true,
                  disabled: update.isPending,
                  onSelect: () => void onRestoreDefaults(),
                },
              ]}
            />
          )}
        </div>
      </div>

      {settings.isDefault && (
        <p className="text-sm text-muted-foreground">{d.defaultNote}</p>
      )}

      {fields.length > 0 ? (
        <div className="relative w-full max-w-90">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // A search box inside the form must not submit it.
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={d.searchPlaceholder}
            aria-label={d.searchAria}
            className="pl-8"
          />
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{d.empty}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {d.noMatches(query.trim())}
        </p>
      ) : (
        <ul aria-label={d.heading} className="grid gap-2 md:grid-cols-2">
          {shown.map(({ field, index, words, error, open }) => {
            const inputId = `search-synonyms-group-${index}`;
            const menu = (
              <RowActionsMenu
                label={d.groupActionsAria(index + 1)}
                items={[
                  ...(open
                    ? []
                    : [
                        {
                          label: d.editGroup,
                          onSelect: () => startEditing(field.id, index),
                        },
                      ]),
                  {
                    label: d.removeGroup,
                    destructive: true,
                    onSelect: () => remove(index),
                  },
                ]}
              />
            );
            return (
              <li
                key={field.id}
                className={cn(
                  "flex flex-col gap-1 rounded-md border border-border py-1.5 pr-1.5 pl-2.5",
                  open && "md:col-span-2",
                )}
              >
                {open ? (
                  <>
                    <div className="flex items-center gap-2">
                      <label htmlFor={inputId} className="sr-only">
                        {d.termsLabel(index + 1)}
                      </label>
                      <Input
                        id={inputId}
                        placeholder={d.termsPlaceholder}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={
                          error
                            ? `${inputId}-error search-synonyms-hint`
                            : "search-synonyms-hint"
                        }
                        {...register(`groups.${index}.terms`)}
                      />
                      {editing.has(field.id) && !error && words.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => stopEditing(field.id)}
                        >
                          {d.doneEditing}
                        </Button>
                      ) : null}
                      {menu}
                    </div>
                    {error && (
                      <p
                        id={`${inputId}-error`}
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {error}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {words.map((word) => (
                        <span
                          key={word}
                          data-slot="synonym-chip"
                          className="rounded-full bg-muted px-2 py-0.5 text-sm text-foreground"
                        >
                          {word}
                        </span>
                      ))}
                    </span>
                    {menu}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p id="search-synonyms-hint" className="text-xs text-muted-foreground">
        {d.termsHint}
      </p>

      {fields.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span>{d.shownOf(shown.length, fields.length)}</span>
          {!needle && !showAll && shown.length < fields.length ? (
            <>
              {" · "}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setShowAll(true)}
              >
                {d.showAll}
              </Button>
            </>
          ) : null}
          {!settings.isDefault ? <> {d.restoreHint}</> : null}
        </p>
      ) : null}

      {errors.groups?.root?.message && (
        <p role="alert" className="text-sm text-destructive">
          {errors.groups.root.message}
        </p>
      )}

      <p className="text-sm text-muted-foreground">{d.reindexNote}</p>

      {update.data?.data.appliedToSearch === false && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          {d.notApplied}
        </p>
      )}

      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        onDiscard={() => resetTo(mapSynonymsToFormValues(settings))}
        saveLabel={update.isPending ? d.saving : d.submit}
        isSaving={update.isPending}
      />
      {confirmDialog}
    </form>
  );
}
