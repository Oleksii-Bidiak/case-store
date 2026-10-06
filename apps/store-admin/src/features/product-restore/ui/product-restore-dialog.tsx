"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  stripTombstonePrefix,
  useRestoreProduct,
  type RestoreProductDto,
} from "@/entities/product";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  FormAlert,
  Input,
  Label,
} from "@/shared/ui";
import { toast, UNDO_TOAST_DURATION_MS } from "@/shared/ui/toast";
import { STOREFRONT_HOST, dict } from "@/shared/config";
import {
  NO_CONFLICT,
  RESTORE_SKU_MAX_LENGTH,
  RESTORE_SLUG_MAX_LENGTH,
  conflictFromCode,
  makeRestoreConflictSchema,
  mergeConflicts,
  restoreConflictDefaults,
  toRestoreProductDto,
  type RestoreConflict,
  type RestoreConflictValues,
  type TakenValues,
} from "../model/restore-schema";
import { restoreErrorMessage } from "../model/restore-error";

const d = dict.products;

/** What the dialog needs of a row of the deleted view. */
export interface RestorableProduct {
  id: string;
  name: string;
  /** As the list returns it — `deleted:<id>:<slug>`. */
  slug: string;
  sku?: string | null;
}

export interface ProductRestoreDialogProps {
  /** The tombstone to restore; `null` closes the dialog. */
  product: RestorableProduct | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Відновити» (TASK-656, ProductsProposal Т9–Т11).
 *
 * Т9 — an `alertdialog` that says the two things the operator cannot guess:
 * the product comes back HIDDEN, and on its own address and артикул (shown
 * without the `deleted:<id>:` mangling). The confirm is the default colour,
 * not red — nothing is lost by restoring.
 *
 * Т10 — when the API answers 409 with a slot code, a plain `dialog` asks for
 * a new value of exactly the slot(s) named, prefilled «…-2». Until then the
 * product stays deleted: the API writes nothing on a conflict.
 *
 * Т11 — a success toast with «Відкрити картку»; the row leaves the view on the
 * refetch and the quick-view counters move with it.
 *
 * The gate is UI-only (`products:delete` — whoever deletes, restores); the
 * route's `PermissionGuard` is the real boundary. `can()` is false until the
 * permissions arrive, so nothing is offered early.
 */
export function ProductRestoreDialog({
  product,
  onOpenChange,
}: ProductRestoreDialogProps) {
  const { can } = useAuth();
  if (!can(PERM.productsDelete) || product === null) return null;
  // Mounted only while a product is picked: closing disposes the flow, so the
  // next «Відновити» starts from Т9 again, never from a stale Т10.
  return (
    <ProductRestoreFlow product={product} onClose={() => onOpenChange(false)} />
  );
}

type Step = "confirm" | "conflict";

function ProductRestoreFlow({
  product,
  onClose,
}: {
  product: RestorableProduct;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);
  const restore = useRestoreProduct();

  const nativeSlug = stripTombstonePrefix(product.slug, product.id);
  const nativeSku = stripTombstonePrefix(product.sku, product.id);

  const [step, setStep] = useState<Step>("confirm");
  const [conflict, setConflict] = useState<RestoreConflict>(NO_CONFLICT);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const busy = restore.isPending;

  const onRestored = () => {
    // The row leaves «Видалені» and joins «Усі» / «Приховані»: every list and
    // every quick-view counter is the same endpoint, so one prefix covers all.
    void queryClient.invalidateQueries({
      queryKey: getProductControllerAdminFindAllQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getProductControllerFindByIdQueryKey(product.id),
    });
    // The edit form for whoever may edit, the read-only card otherwise.
    const href = canWrite
      ? `/products/${product.id}/edit`
      : `/products/${product.id}`;
    toast.success(d.restoreToastDone(product.name), {
      duration: UNDO_TOAST_DURATION_MS,
      action: {
        label: d.restoreToastOpen,
        onClick: () => router.push(href),
      },
    });
    onClose();
  };

  /** A refusal that is no slot conflict: the list may be out of date. */
  const onRefused = (error: unknown) => {
    if (apiErrorStatus(error) === 404) {
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    }
  };

  const restoreNative = () => {
    setConfirmError(null);
    restore.mutate(
      { id: product.id, data: {} },
      {
        onSuccess: onRestored,
        onError: (error) => {
          const named =
            apiErrorStatus(error) === 409
              ? conflictFromCode(apiErrorCode(error))
              : null;
          if (named) {
            setConflict(named);
            setStep("conflict");
            return;
          }
          onRefused(error);
          setConfirmError(restoreErrorMessage(error, { withOverrides: false }));
        },
      },
    );
  };

  if (step === "conflict") {
    return (
      <RestoreConflictDialog
        product={product}
        nativeSlug={nativeSlug}
        nativeSku={nativeSku}
        conflict={conflict}
        onConflict={(next) => setConflict((now) => mergeConflicts(now, next))}
        restore={restore}
        onRestored={onRestored}
        onRefused={onRefused}
        onClose={onClose}
      />
    );
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent
        // A restore in flight cannot be walked away from half-way.
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{d.restoreTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {d.restoreLeadBefore(product.name)}{" "}
            <b className="font-semibold text-foreground">
              {d.restoreLeadHidden}
            </b>
            {d.restoreLeadAfter}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Т9: one bordered row per value — the label in a fixed column on
            the left, the value left-aligned beside it, a long address
            wrapping inside its own column rather than under the label. */}
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-baseline gap-3 rounded-md border px-3 py-2.5">
            <dt className="w-20 shrink-0 text-xs text-muted-foreground sm:w-28">
              {d.restoreAddress}
            </dt>
            <dd className="min-w-0 flex-1 font-mono break-all text-foreground">
              /products/{nativeSlug}
            </dd>
          </div>
          <div className="flex items-baseline gap-3 rounded-md border px-3 py-2.5">
            <dt className="w-20 shrink-0 text-xs text-muted-foreground sm:w-28">
              {d.restoreSku}
            </dt>
            <dd
              className={cn(
                "min-w-0 flex-1",
                nativeSku
                  ? "font-mono break-all text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {nativeSku ?? d.restoreNoSku}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{d.restoreHint}</p>

        <FormAlert title={d.restoreErrorTitle}>{confirmError}</FormAlert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="max-md:h-11">
            {dict.common.cancel}
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={busy}
            onClick={restoreNative}
            className="max-md:h-11"
          >
            {busy ? (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {busy ? d.restoreBusy : d.restoreConfirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─────────────────────────── Т10: the conflict ─────────────────────────── */

interface RestoreConflictDialogProps {
  product: RestorableProduct;
  nativeSlug: string;
  nativeSku: string | null;
  conflict: RestoreConflict;
  onConflict: (next: RestoreConflict) => void;
  restore: ReturnType<typeof useRestoreProduct>;
  onRestored: () => void;
  onRefused: (error: unknown) => void;
  onClose: () => void;
}

function RestoreConflictDialog({
  product,
  nativeSlug,
  nativeSku,
  conflict,
  onConflict,
  restore,
  onRestored,
  onRefused,
  onClose,
}: RestoreConflictDialogProps) {
  const baseId = useId();
  const formId = `${baseId}-form`;
  const slugId = `${baseId}-slug`;
  const skuId = `${baseId}-sku`;
  const slugHintId = `${baseId}-slug-hint`;
  const skuHintId = `${baseId}-sku-hint`;
  const slugErrorId = `${baseId}-slug-error`;
  const skuErrorId = `${baseId}-sku-error`;

  // Every value the server has refused so far — the native ones to start.
  const [taken, setTaken] = useState<TakenValues>(() => ({
    slug: [nativeSlug],
    sku: nativeSku ? [nativeSku] : [],
  }));
  const [serverError, setServerError] = useState<string | null>(null);

  // RHF reads its options afresh on every render, so a second 409 that adds
  // a field (or a refused value) re-shapes the rules for the next submit.
  const resolver = useMemo(
    () => zodResolver(makeRestoreConflictSchema(conflict, taken)),
    [conflict, taken],
  );
  const { control, register, handleSubmit, setFocus, setError, formState } =
    useForm<RestoreConflictValues>({
      // Default `onSubmit` mode (forms.md Rule 4a).
      resolver,
      // Not async data: the prefill is computed once from the row that opened
      // the dialog, and the form lives only while this step is on screen.
      defaultValues: restoreConflictDefaults(nativeSlug, nativeSku),
    });
  const errors = formState.errors;
  const busy = restore.isPending;
  const typedSlug = useWatch({ control, name: "slug" }).trim();

  /** forms.md Rule 4a: a blocked submit moves focus to what blocks it. */
  const onInvalid = (invalid: FieldErrors<RestoreConflictValues>) => {
    if (invalid.slug) setFocus("slug");
    else if (invalid.sku) setFocus("sku");
  };

  const onValid = (values: RestoreConflictValues) => {
    setServerError(null);
    const body: RestoreProductDto = toRestoreProductDto(values, conflict);
    restore.mutate(
      { id: product.id, data: body },
      {
        onSuccess: onRestored,
        onError: (error) => {
          const named =
            apiErrorStatus(error) === 409
              ? conflictFromCode(apiErrorCode(error))
              : null;
          if (!named) {
            onRefused(error);
            setServerError(restoreErrorMessage(error, { withOverrides: true }));
            return;
          }
          // Taken meanwhile too: remember the refused value(s), say so under
          // the field, and show a field the first answer did not ask for.
          setTaken((now) => ({
            slug: named.slug && body.slug ? [...now.slug, body.slug] : now.slug,
            sku: named.sku && body.sku ? [...now.sku, body.sku] : now.sku,
          }));
          onConflict(named);
          if (named.sku) {
            setError("sku", { type: "server", message: d.conflictSkuSame });
          }
          if (named.slug) {
            setError(
              "slug",
              { type: "server", message: d.conflictSlugSame },
              { shouldFocus: true },
            );
          } else if (named.sku) {
            setFocus("sku");
          }
        },
      },
    );
  };

  const title =
    conflict.slug && conflict.sku
      ? d.conflictTitleBoth
      : conflict.slug
        ? d.conflictTitleSlug
        : d.conflictTitleSku;
  // Т10 sets the taken address / артикул in mono inside the sentence.
  const mono = (value: string) => (
    <span className="font-mono break-words">{value}</span>
  );
  const address = mono(`/products/${nativeSlug}`);
  const lead =
    conflict.slug && conflict.sku ? (
      <>
        {d.conflictLeadBothBefore} {address} {d.conflictLeadBothMiddle}{" "}
        {mono(nativeSku ?? "")} {d.conflictLeadBothAfter}
      </>
    ) : conflict.slug ? (
      <>
        {d.conflictLeadSlugBefore} {address} {d.conflictLeadSlugAfter}
      </>
    ) : (
      <>
        {d.conflictLeadSkuBefore} {mono(nativeSku ?? "")}{" "}
        {d.conflictLeadSkuAfter}
      </>
    );
  const confirm =
    conflict.slug && conflict.sku
      ? d.conflictConfirmBoth
      : conflict.slug
        ? d.conflictConfirmSlug
        : d.conflictConfirmSku;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        // Т10 has no «×»: the way out is «Скасувати» or Esc, like Т9.
        showCloseButton={false}
        className="sm:max-w-140"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {lead} {d.conflictStillDeleted}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          noValidate
          aria-busy={busy}
          onSubmit={handleSubmit(onValid, onInvalid)}
          className="flex flex-col gap-4"
        >
          {conflict.slug ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={slugId} required>
                {d.conflictNewSlug}
              </Label>
              {/* No `key`: the field keeps its node — and the caret — for the
                  life of the dialog (forms.md). */}
              <Input
                id={slugId}
                autoComplete="off"
                spellCheck={false}
                maxLength={RESTORE_SLUG_MAX_LENGTH}
                className="font-mono"
                // readOnly, not disabled: a second 409 focuses this field
                // from the mutation callback, before the re-render that ends
                // `busy` — and a disabled input cannot take focus.
                readOnly={busy}
                aria-required="true"
                aria-invalid={errors.slug ? true : undefined}
                aria-describedby={
                  errors.slug ? `${slugErrorId} ${slugHintId}` : slugHintId
                }
                {...register("slug")}
              />
              <FieldError id={slugErrorId}>{errors.slug?.message}</FieldError>
              <p id={slugHintId} className="text-xs text-muted-foreground">
                {d.conflictSlugUrl(STOREFRONT_HOST, typedSlug || nativeSlug)}
                {!conflict.sku && nativeSku
                  ? ` · ${d.conflictSkuKept(nativeSku)}`
                  : null}
              </p>
            </div>
          ) : null}

          {conflict.sku ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={skuId} required>
                {d.conflictNewSku}
              </Label>
              <Input
                id={skuId}
                autoComplete="off"
                spellCheck={false}
                maxLength={RESTORE_SKU_MAX_LENGTH}
                className="font-mono"
                readOnly={busy}
                aria-required="true"
                aria-invalid={errors.sku ? true : undefined}
                aria-describedby={
                  [
                    errors.sku ? skuErrorId : null,
                    conflict.slug ? null : skuHintId,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                {...register("sku")}
              />
              <FieldError id={skuErrorId}>{errors.sku?.message}</FieldError>
              {conflict.slug ? null : (
                <p id={skuHintId} className="text-xs text-muted-foreground">
                  {d.conflictSlugKept(nativeSlug)}
                </p>
              )}
            </div>
          ) : null}

          <FormAlert title={d.restoreErrorTitle}>{serverError}</FormAlert>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
            className="max-md:h-11"
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={busy}
            className="max-md:h-11"
          >
            {busy ? (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {busy ? d.restoreBusy : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
