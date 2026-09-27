"use client";

import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  getAdminGetSearchSynonymsQueryKey,
  useAdminUpdateSearchSynonyms,
  type SearchSynonymsEntity,
  type SearchSynonymsSaveResultEntity,
  type UpdateSearchSynonymsDto,
} from "@/entities/search-synonyms";
import { Button, FormActionsBar, Input, useConfirmDialog } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  mapSynonymsToFormValues,
  searchSynonymsSchema,
  type SearchSynonymsFormInput,
  type SearchSynonymsFormValues,
} from "../model/search-synonyms-schema";

const d = dict.searchSynonyms;

interface SearchSynonymsFormProps {
  /** The list as last read from the API (the built-in one while none is saved). */
  settings: SearchSynonymsEntity;
}

/**
 * The search-synonym list editor (TASK-559): one comma-separated line per
 * group, rows added and removed freely, the whole list saved at once.
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
 */
export function SearchSynonymsForm({ settings }: SearchSynonymsFormProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SearchSynonymsFormInput, unknown, SearchSynonymsFormValues>({
    resolver: zodResolver(searchSynonymsSchema),
    defaultValues: mapSynonymsToFormValues(settings),
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "groups",
  });

  // Keyed on `settings` alone ON PURPOSE. With `isDirty` in the deps, the
  // save's own `reset` (dirty → pristine) would fire this one render BEFORE
  // `setQueryData` reaches the prop (the query cache notifies on a later tick),
  // and flash the pre-save list over the rows just saved. `isDirty` read here is
  // the value of the render in which `settings` changed, which is current.
  useEffect(() => {
    if (!isDirty) reset(mapSynonymsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const update = useAdminUpdateSearchSynonyms();

  const save = (body: UpdateSearchSynonymsDto, restoring: boolean) => {
    update.mutate(
      { data: body },
      {
        onSuccess: (res) => {
          const saved: SearchSynonymsSaveResultEntity = res.data;
          reset(mapSynonymsToFormValues(saved));
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {settings.isDefault && (
        <p className="text-sm text-muted-foreground">{d.defaultNote}</p>
      )}
      <p id="search-synonyms-hint" className="text-sm text-muted-foreground">
        {d.termsHint}
      </p>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{d.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const error = errors.groups?.[index]?.terms?.message;
            const inputId = `search-synonyms-group-${index}`;
            return (
              <li key={field.id} className="flex flex-col gap-1">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={d.removeGroupAria(index + 1)}
                    onClick={() => remove(index)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
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
              </li>
            );
          })}
        </ol>
      )}

      {errors.groups?.root?.message && (
        <p role="alert" className="text-sm text-destructive">
          {errors.groups.root.message}
        </p>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ terms: "" })}
        >
          <Plus aria-hidden="true" className="size-4" />
          {d.addGroup}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{d.reindexNote}</p>

      {update.data?.data.appliedToSearch === false && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          {d.notApplied}
        </p>
      )}

      <FormActionsBar className="flex flex-wrap gap-2">
        {!settings.isDefault && (
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending}
            onClick={() => void onRestoreDefaults()}
          >
            {d.restoreDefaults}
          </Button>
        )}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? d.saving : d.submit}
        </Button>
      </FormActionsBar>
      {confirmDialog}
    </form>
  );
}
