"use client";

import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "lucide-react";
import { discountValueLabel } from "@/entities/discount";
import {
  Button,
  Callout,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
  SegmentedControl,
  Switch,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { cn, formatCurrency } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  discountSchema,
  type DiscountFormInput,
  type DiscountFormValues,
} from "../model/discount-schema";
import { generateDiscountCode } from "../model/generate-code";

const f = dict.discountForm;
const FORM_ID = "discount-form";

interface DiscountFormProps {
  /** Entity id (edit mode). Re-seeds the form only when navigating to a
   *  different discount (forms.md Rule 2b), never on background refetch. */
  id?: string;
  /** Edit mode: re-seeded by `id`. Create mode: a synchronous seed (the copy
   *  «Дублювати» opens with), read once on mount. */
  defaultValues?: Partial<DiscountFormInput>;
  onSubmit: (values: DiscountFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** In edit mode the code is immutable — old mailings and banners keep working. */
  lockCode?: boolean;
  /** No `discounts:write`: every field disabled, no save bar (ПК7). */
  readOnly?: boolean;
  /** Extra cards under the cart preview — the usage stats of a saved code. */
  aside?: ReactNode;
}

/** Empty form baseline for create mode and the merge base in edit mode. */
const EMPTY_VALUES: DiscountFormInput = {
  code: "",
  type: "PERCENT",
  value: "",
  minSpend: "",
  maxRedemptions: "",
  perUserLimit: "",
  startsAt: "",
  expiresAt: "",
  isActive: true,
  showOnPromoPage: false,
};

type FieldName = keyof DiscountFormInput;

/** Section → its fields: drives «Незбережені зміни: …». */
const SECTIONS: readonly { label: string; fields: readonly FieldName[] }[] = [
  { label: f.sectionCode, fields: ["code", "type", "value"] },
  {
    label: f.sectionConditions,
    fields: ["minSpend", "maxRedemptions", "perUserLimit"],
  },
  { label: f.sectionPeriod, fields: ["startsAt", "expiresAt"] },
  { label: f.sectionVisibility, fields: ["isActive", "showOnPromoPage"] },
];

const TYPE_OPTIONS = [
  { value: "PERCENT" as const, label: f.typePercent },
  { value: "FIXED" as const, label: f.typeFixed },
];

const errorId = (field: FieldName) => `discount-${field}-error`;
const DATES_ERROR_ID = "discount-dates-error";
const DATES_HINT_ID = "discount-dates-hint";

/** `YYYY-MM-DD` from a date input → «15.10.2026», no time zone involved. */
const dayLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

/**
 * Create/edit promo-code form (DiscountsProposal ПК3–ПК5, TASK-1085): the
 * owner-confirmed «лише зареєстрований» notice, four sections «Код і знижка ·
 * Умови · Період · Видимість», the cart line the customer will see beside it,
 * and ONE sticky «Зберегти» that names what is unsaved.
 *
 * Errors sit next to their field (`aria-invalid` + `FieldError`, canon 1.5): a
 * `0` in the discount or a cap says what it means, a reversed window marks both
 * dates (TASK-796). The window is a pair of Kyiv calendar days, inclusive
 * (TASK-795) — the conversion lives in `discountFormValuesToDto`.
 */
export function DiscountForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  lockCode = false,
  readOnly = false,
  aside,
}: DiscountFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<DiscountFormInput, unknown, DiscountFormValues>({
    resolver: zodResolver(discountSchema),
    defaultValues: id ? EMPTY_VALUES : { ...EMPTY_VALUES, ...defaultValues },
  });

  // forms.md Rule 2b: re-seed only when the edited entity id changes.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const typeLabelId = useId();
  const unitId = useId();
  const minSpendUnitId = useId();

  const [code, type, value, minSpend, perUserLimit, startsAt, expiresAt] =
    useWatch({
      control,
      name: [
        "code",
        "type",
        "value",
        "minSpend",
        "perUserLimit",
        "startsAt",
        "expiresAt",
      ],
    });

  const unit = type === "FIXED" ? f.unitCurrency : f.unitPercent;
  const datesError = errors.expiresAt?.message ?? errors.startsAt?.message;

  // A reversed window marks both dates but is ONE thing to fix.
  const errorCount = (Object.keys(errors) as FieldName[]).filter(
    (field) => field !== "startsAt" || !errors.expiresAt,
  ).length;
  const showErrors = submitCount > 0 && errorCount > 0;
  const dirtySections = SECTIONS.filter((section) =>
    section.fields.some((field) => dirtyFields[field]),
  ).map((section) => section.label);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A submit bubbling through a portal (a dialog's own form) is not ours.
    if (event.target !== event.currentTarget) return;
    if (readOnly) {
      event.preventDefault();
      return;
    }
    void handleSubmit(onSubmit)(event);
  };

  const fieldA11y = (field: FieldName, ...extraIds: (string | undefined)[]) => {
    const describedBy = [
      ...extraIds,
      errors[field] ? errorId(field) : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  const datesA11y = (field: "startsAt" | "expiresAt") => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [datesError ? DATES_ERROR_ID : undefined, DATES_HINT_ID]
      .filter(Boolean)
      .join(" "),
  });

  const previewHint = [
    minSpend && Number(minSpend) > 0
      ? f.previewMinSpend(formatCurrency(minSpend))
      : null,
    startsAt && expiresAt
      ? f.previewRange(dayLabel(startsAt), dayLabel(expiresAt))
      : startsAt
        ? f.previewFrom(dayLabel(startsAt))
        : expiresAt
          ? f.previewUntil(dayLabel(expiresAt))
          : null,
    perUserLimit && /^\d+$/.test(perUserLimit) && Number(perUserLimit) > 0
      ? dict.discounts.condPerUser(Number(perUserLimit))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      id={FORM_ID}
      onSubmit={onFormSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <Callout variant="primary">
        {f.guestNoticeBefore}
        <strong>{f.guestNoticeStrong}</strong>
        {f.guestNoticeAfter}
      </Callout>

      {showErrors ? <FormAlert>{f.errorSummary(errorCount)}</FormAlert> : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
        <fieldset
          disabled={readOnly}
          className="flex min-w-0 flex-col gap-4 lg:col-span-3"
        >
          <FormSectionCard title={f.sectionCode}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-code" required={!lockCode}>
                {f.code}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="discount-code"
                  placeholder={f.codePlaceholder}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={lockCode || readOnly}
                  aria-required={!lockCode}
                  className="font-mono uppercase"
                  {...fieldA11y("code", "discount-code-hint")}
                  {...register("code")}
                />
                {lockCode || readOnly ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setValue("code", generateDiscountCode(), {
                        shouldDirty: true,
                        shouldValidate: submitCount > 0,
                      })
                    }
                  >
                    <SparklesIcon aria-hidden="true" />
                    {f.generate}
                  </Button>
                )}
              </div>
              <FieldError id={errorId("code")}>
                {errors.code?.message}
              </FieldError>
              <p
                id="discount-code-hint"
                className="text-xs text-muted-foreground"
              >
                {lockCode ? f.codeLockedHint : f.codeHint}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <p
                id={typeLabelId}
                className="text-sm leading-none font-medium text-foreground"
              >
                {f.type}
              </p>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <SegmentedControl
                    aria-labelledby={typeLabelId}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={TYPE_OPTIONS}
                    disabled={readOnly}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-value" required>
                {f.value}
              </Label>
              <UnitField unit={unit} unitId={unitId}>
                <Input
                  id="discount-value"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-required="true"
                  className="pr-8"
                  {...fieldA11y("value", unitId)}
                  {...register("value")}
                />
              </UnitField>
              <FieldError id={errorId("value")}>
                {errors.value?.message}
              </FieldError>
            </div>
          </FormSectionCard>

          <FormSectionCard title={f.sectionConditions}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-min-spend">{f.minSpend}</Label>
                <UnitField unit={f.unitCurrency} unitId={minSpendUnitId}>
                  <Input
                    id="discount-min-spend"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder={f.minSpendPlaceholder}
                    className="pr-8"
                    {...fieldA11y(
                      "minSpend",
                      minSpendUnitId,
                      "discount-min-spend-hint",
                    )}
                    {...register("minSpend")}
                  />
                </UnitField>
                <HintOrError
                  hintId="discount-min-spend-hint"
                  hint={f.minSpendHint}
                  errorId={errorId("minSpend")}
                  error={errors.minSpend?.message}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-max">{f.maxRedemptions}</Label>
                <Input
                  id="discount-max"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder={f.noLimitPlaceholder}
                  {...fieldA11y("maxRedemptions", "discount-max-hint")}
                  {...register("maxRedemptions")}
                />
                <HintOrError
                  hintId="discount-max-hint"
                  hint={f.maxRedemptionsHint}
                  errorId={errorId("maxRedemptions")}
                  error={errors.maxRedemptions?.message}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-per-user">{f.perUserLimit}</Label>
                <Input
                  id="discount-per-user"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder={f.noLimitPlaceholder}
                  {...fieldA11y("perUserLimit", "discount-per-user-hint")}
                  {...register("perUserLimit")}
                />
                <HintOrError
                  hintId="discount-per-user-hint"
                  hint={f.perUserLimitHint}
                  errorId={errorId("perUserLimit")}
                  error={errors.perUserLimit?.message}
                />
              </div>
            </div>
          </FormSectionCard>

          <FormSectionCard title={f.sectionPeriod}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-starts">{f.startsAt}</Label>
                <Input
                  id="discount-starts"
                  type="date"
                  {...datesA11y("startsAt")}
                  {...register("startsAt")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount-expires">{f.expiresAt}</Label>
                <Input
                  id="discount-expires"
                  type="date"
                  {...datesA11y("expiresAt")}
                  {...register("expiresAt")}
                />
              </div>
            </div>
            <FieldError id={DATES_ERROR_ID}>{datesError}</FieldError>
            <p id={DATES_HINT_ID} className="text-xs text-muted-foreground">
              {f.datesHint}
            </p>
          </FormSectionCard>

          <FormSectionCard title={f.sectionVisibility}>
            <SwitchRow
              id="discount-active"
              label={f.active}
              hint={f.activeHint}
            >
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id="discount-active"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                    aria-describedby="discount-active-hint"
                  />
                )}
              />
            </SwitchRow>
            <div className="border-t" />
            <SwitchRow
              id="discount-show-on-promo-page"
              label={f.showOnPromoPage}
              hint={f.showOnPromoPageHint}
            >
              <Controller
                control={control}
                name="showOnPromoPage"
                render={({ field }) => (
                  <Switch
                    id="discount-show-on-promo-page"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                    aria-describedby="discount-show-on-promo-page-hint"
                  />
                )}
              />
            </SwitchRow>
          </FormSectionCard>
        </fieldset>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:col-span-2">
          <CartPreview
            code={(code ?? "").trim().toUpperCase()}
            discount={discountValueLabel({
              type: type ?? "PERCENT",
              value: value && value.trim() !== "" ? value : "0",
            })}
            hint={previewHint}
          />
          {aside}
        </div>
      </div>

      {readOnly ? null : (
        <FormActionsBar
          variant="sticky"
          dirtySections={dirtySections}
          onDiscard={() => reset()}
          saveLabel={isPending ? dict.common.saving : submitLabel}
          formId={FORM_ID}
          isSaving={isPending}
        />
      )}
    </form>
  );
}

/** An input with its unit («%», «₴») drawn inside, on the right. */
function UnitField({
  unit,
  unitId,
  children,
}: {
  unit: string;
  unitId: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <span
        id={unitId}
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  );
}

/** The hint under a field — replaced by the error while there is one (ПК4). */
function HintOrError({
  hintId,
  hint,
  errorId: id,
  error,
}: {
  hintId: string;
  hint: string;
  errorId: string;
  error?: string;
}) {
  return error ? (
    <FieldError id={id}>{error}</FieldError>
  ) : (
    <p id={hintId} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
}

/** A labelled switch with its consequence under the label. */
function SwitchRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

/** «Як побачить покупець» — the cart line, static, from the form values (ПК3). */
function CartPreview({
  code,
  discount,
  hint,
}: {
  code: string;
  discount: string;
  hint: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <h3 id={titleId} className="text-sm font-semibold text-foreground">
        {f.previewTitle}
      </h3>
      <div className="flex flex-col gap-1 rounded-md border border-dashed p-3">
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0 text-foreground">
            {f.previewCode}{" "}
            <span
              className={cn(
                "font-mono font-semibold",
                code ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {code || f.codePlaceholder}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-success">
            {discount}
          </span>
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </section>
  );
}
