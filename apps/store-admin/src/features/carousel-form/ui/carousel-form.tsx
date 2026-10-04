"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCategoryControllerGetAdminTree,
  type CategoryTreeNodeEntity,
} from "@/shared/api";
import {
  FieldError,
  FormActionsBar,
  Input,
  Label,
  NumberStepper,
  RadioCard,
  RadioCardGroup,
  SegmentedControl,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { dict } from "@/shared/config";
import {
  carouselSchema,
  CAROUSEL_PLACEMENT,
  CAROUSEL_SOURCE,
  type CarouselFormInput,
  type CarouselFormValues,
  type CarouselPlacementValue,
  type CarouselSourceValue,
  type CarouselStatusValue,
} from "../model/carousel-schema";

const f = dict.carouselForm;
const FORM_ID = "carousel-form";

/** A selectable category, flattened out of the admin tree with its depth. */
interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flatten the admin category tree keeping EVERY node (parents included), with
 * its depth for visual indent. Deliberately NOT `product-form`'s leaf-only
 * `collectLeafCategories`: a CATEGORY carousel legitimately targets a parent
 * category — `ProductService.findAll` rolls the subtree up on read (TASK-236),
 * so picking «Чохли» includes every продукт filed under its subcategories.
 */
export function flattenCategoryTree(
  nodes: CategoryTreeNodeEntity[],
  depth = 0,
): CategoryOption[] {
  const out: CategoryOption[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      out.push(...flattenCategoryTree(node.children, depth + 1));
    }
  }
  return out;
}

interface CarouselFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different
   *  carousel, never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<CarouselFormInput>;
  onSubmit: (values: CarouselFormValues) => void | Promise<void>;
  isPending: boolean;
  submitLabel?: string;
  /**
   * The section under «Звідки товари» — receives the LIVE `source`, so the
   * host shows the MANUAL item picker the moment «Вибрані вручну» is picked,
   * before saving, and something truthful for every automatic source.
   */
  renderItemsSection?: (source: CarouselSourceValue) => ReactNode;
  /** Labels of host-owned sections with unsaved edits (the item list). */
  extraDirtySections?: readonly string[];
  /** «Скасувати зміни» for the host-owned sections. */
  onDiscardExtra?: () => void;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: CarouselFormInput = {
  title: "",
  source: "BESTSELLING",
  // Mirrors the API's create-time default (CreateCarouselDto.placement).
  placement: "HOME_RAILS",
  categoryId: "",
  itemLimit: "12",
  // No `sortOrder` (TASK-428): the field is gone from the form, and omitting it from
  // the payload is what makes the server append a new carousel to its placement bucket.
  status: "DRAFT",
  scheduledAt: "",
};

/** The API's limits for `itemLimit` (CreateCarouselDto: 1…24). */
const LIMIT_MIN = 1;
const LIMIT_MAX = 24;

const STATUS_OPTIONS: readonly { value: CarouselStatusValue; label: string }[] =
  [
    { value: "PUBLISHED", label: f.statusPublished },
    { value: "DRAFT", label: f.statusDraft },
    { value: "SCHEDULED", label: f.statusScheduled },
  ];

type FieldName = keyof CarouselFormInput;

const SECTIONS: readonly { label: string; fields: readonly FieldName[] }[] = [
  { label: f.sectionMain, fields: ["title", "placement"] },
  { label: f.source, fields: ["source", "categoryId", "itemLimit"] },
  { label: f.status, fields: ["status", "scheduledAt"] },
];

const ERROR_FIELDS: readonly FieldName[] = [
  "title",
  "placement",
  "source",
  "categoryId",
  "itemLimit",
  "status",
  "scheduledAt",
];

const errorId = (field: FieldName) => `carousel-${field}-error`;

/**
 * Create/edit carousel form (CarouselsProposal КР5–КР8, wave 198): «Основне»
 * (title + «Місце на головній» as cards), «Звідки товари» as cards with what
 * each source does, the count as −/+ for an automatic source, the host's items
 * section right under it, «Публікація» as segments — and ONE sticky «Зберегти»
 * that names what is unsaved, the host's item list included.
 *
 * «Місце на головній» stays a field here until the `/home` block editor takes
 * it over (Д-н2, TASK-662/664). TASK-428 removed the sort-order number field:
 * the order within a placement is set by dragging rows in the carousel list.
 */
export function CarouselForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  renderItemsSection,
  extraDirtySections = [],
  onDiscardExtra,
}: CarouselFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<CarouselFormInput, unknown, CarouselFormValues>({
    resolver: zodResolver(carouselSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const statusValue = useWatch({ control, name: "status" });
  const sourceValue = useWatch({ control, name: "source" }) ?? "BESTSELLING";

  // Full admin tree (ALL nodes, inactive included) so an existing carousel
  // pointed at a now-hidden category still shows it selected.
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const categoryOptions = flattenCategoryTree(categoriesQuery.data?.data ?? []);

  const errorCount = ERROR_FIELDS.filter((field) => errors[field]).length;
  const dirtySections = [
    ...SECTIONS.filter((section) =>
      section.fields.some((field) => dirtyFields[field]),
    ).map((section) => section.label),
    ...extraDirtySections,
  ];
  const summary =
    submitCount > 0 && errorCount > 0
      ? f.barErrors(errorCount)
      : !id && dirtySections.length === 0
        ? f.barNew
        : undefined;

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A submit bubbling through a portal (a dialog's own form) is not ours.
    if (event.target !== event.currentTarget) return;
    void handleSubmit(onSubmit)(event);
  };

  const fieldA11y = (field: FieldName, hintId?: string) => {
    const describedBy = [hintId, errors[field] ? errorId(field) : undefined]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  return (
    <form
      id={FORM_ID}
      onSubmit={onFormSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormSectionCard title={f.sectionMain}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-title" required>
            {f.title}
          </Label>
          <Input
            id="carousel-title"
            aria-required="true"
            {...fieldA11y("title", "carousel-title-hint")}
            {...register("title")}
          />
          <p id="carousel-title-hint" className="text-xs text-muted-foreground">
            {f.titleHint}
          </p>
          <FieldError id={errorId("title")}>{errors.title?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{f.placement}</p>
          <Controller
            control={control}
            name="placement"
            render={({ field }) => (
              <RadioCardGroup
                aria-label={f.placement}
                value={field.value}
                onValueChange={(value) =>
                  field.onChange(value as CarouselPlacementValue)
                }
                className="md:grid-cols-2"
              >
                {CAROUSEL_PLACEMENT.map((placement) => (
                  <RadioCard
                    key={placement}
                    value={placement}
                    title={f.placementOptions[placement]}
                    description={dict.carousels.placementWhere[placement]}
                    className="data-[state=checked]:bg-primary/6"
                  />
                ))}
              </RadioCardGroup>
            )}
          />
          <p className="text-xs text-muted-foreground">{f.placementHint}</p>
        </div>
      </FormSectionCard>

      <FormSectionCard title={f.source}>
        <Controller
          control={control}
          name="source"
          render={({ field }) => (
            <RadioCardGroup
              aria-label={f.source}
              value={field.value}
              onValueChange={(value) =>
                field.onChange(value as CarouselSourceValue)
              }
              className="md:grid-cols-3"
            >
              {CAROUSEL_SOURCE.map((source) => (
                <RadioCard
                  key={source}
                  value={source}
                  title={f.sourceOptions[source]}
                  description={f.sourceDescriptions[source]}
                  className="data-[state=checked]:bg-primary/6"
                />
              ))}
            </RadioCardGroup>
          )}
        />

        {sourceValue === "CATEGORY" && (
          <div className="flex flex-col gap-1.5 md:max-w-sm">
            <Label htmlFor="carousel-category">{f.category}</Label>
            <select
              id="carousel-category"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm aria-invalid:border-destructive"
              {...fieldA11y("categoryId")}
              {...register("categoryId")}
            >
              <option value="">{f.categoryPlaceholder}</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${" ".repeat(option.depth * 2)}${option.name}`}
                </option>
              ))}
            </select>
            <FieldError id={errorId("categoryId")}>
              {errors.categoryId?.message}
            </FieldError>
          </div>
        )}

        {/* «Вибрані вручну» shows every product added — the count does not
            apply there, so it is not asked (its value is kept). */}
        {sourceValue !== "MANUAL" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="carousel-item-limit">{f.itemLimit}</Label>
            <Controller
              control={control}
              name="itemLimit"
              render={({ field }) => (
                <NumberStepper
                  id="carousel-item-limit"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  min={LIMIT_MIN}
                  max={LIMIT_MAX}
                  decreaseLabel={f.stepDown}
                  increaseLabel={f.stepUp}
                  {...fieldA11y("itemLimit", "carousel-item-limit-hint")}
                />
              )}
            />
            <p
              id="carousel-item-limit-hint"
              className="text-xs text-muted-foreground"
            >
              {f.itemLimitHint}
            </p>
            <FieldError id={errorId("itemLimit")}>
              {errors.itemLimit?.message}
            </FieldError>
          </div>
        )}
      </FormSectionCard>

      {renderItemsSection?.(sourceValue)}

      <FormSectionCard title={f.status}>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <SegmentedControl
              aria-label={f.status}
              value={field.value}
              onValueChange={field.onChange}
              options={STATUS_OPTIONS}
            />
          )}
        />

        {statusValue === "SCHEDULED" && (
          <div className="flex flex-col gap-1.5 md:max-w-sm">
            <Label htmlFor="carousel-scheduled-at">{f.scheduledAt}</Label>
            <Input
              id="carousel-scheduled-at"
              type="datetime-local"
              {...fieldA11y("scheduledAt", "carousel-scheduled-at-hint")}
              {...register("scheduledAt")}
            />
            <p
              id="carousel-scheduled-at-hint"
              className="text-xs text-muted-foreground"
            >
              {f.scheduledAtHint}
            </p>
            <FieldError id={errorId("scheduledAt")}>
              {errors.scheduledAt?.message}
            </FieldError>
          </div>
        )}
      </FormSectionCard>

      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        summary={summary}
        onDiscard={() => {
          reset();
          onDiscardExtra?.();
        }}
        saveLabel={isPending ? dict.common.saving : submitLabel}
        formId={FORM_ID}
        isSaving={isPending}
      />
    </form>
  );
}
