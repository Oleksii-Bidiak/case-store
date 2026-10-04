"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon, GripVertical, PlusIcon, XIcon } from "lucide-react";
import type { ProductSiblingEntity } from "@/entities/product-group";
import {
  Badge,
  Button,
  Callout,
  Combobox,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
  SortableTree,
  Switch,
  useAnnouncer,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { formatCurrency } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { dict, STOREFRONT_URL } from "@/shared/config";
import {
  productGroupSchema,
  type ProductGroupFormInput,
  type ProductGroupFormValues,
} from "../model/product-group-schema";
import {
  analyzePositions,
  attributeUsage,
  axisValues,
  priceRange,
  type PositionProblems,
} from "../model/group-positions";

const f = dict.productGroupForm;
const g = dict.productGroups;

const FORM_ID = "product-group-form";

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: ProductGroupFormInput = {
  name: "",
  axes: [],
  isActive: true,
};

interface ProductGroupFormProps {
  /**
   * Entity id (edit mode). forms.md Rule 2b: the form re-seeds from
   * `defaultValues` only when it is a DIFFERENT group, never on a refetch.
   */
  id?: string;
  defaultValues?: Partial<ProductGroupFormInput>;
  /** The group's positions — the source of axis suggestions, values, problems. */
  positions?: readonly ProductSiblingEntity[];
  onSubmit: (values: ProductGroupFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** «Скасувати» goes back to the list. */
  cancelHref: string;
  /** No `products:write` (TASK-1011): fields disabled, nothing to save. */
  readOnly?: boolean;
  /**
   * The «Позиції» section, drawn between «Вибір на сайті» and the flag. Gets
   * the CURRENT axes and their problems, so the table follows unsaved edits.
   */
  renderPositions?: (axes: string[], problems: PositionProblems) => ReactNode;
}

const errorId = (field: string) => `group-${field}-error`;

/**
 * Create/edit form of a product group by mockup (wave 198,
 * ProductGroupsProposal ГТ3–ГТ6, TASK-1084).
 *
 * ## «Вибір на сайті»
 *
 * An axis is the NAME of a characteristic the positions carry: the storefront
 * matches `position.attributes[axis]`. So the picker suggests the names the
 * positions already hold, with how many hold each — the artboard's «list of the
 * category's characteristics» needs the group's category, which the group
 * payload does not carry (API tail). Free text stays accepted: a new group has
 * no positions to suggest from, and refusing a typed name would take away what
 * the old form allowed.
 *
 * The order is the order on the site: drag by the grip, or ↑/↓ on the grip.
 *
 * ## The flag
 *
 * `isActive` is stored but no storefront read filters by it (TASK-1031), so the
 * switch says so instead of promising to hide anything.
 */
export function ProductGroupForm({
  id,
  defaultValues,
  positions = [],
  onSubmit,
  isPending,
  submitLabel = f.submit,
  cancelHref,
  readOnly = false,
  renderPositions,
}: ProductGroupFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, submitCount, dirtyFields },
  } = useForm<ProductGroupFormInput, unknown, ProductGroupFormValues>({
    resolver: zodResolver(productGroupSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  // forms.md Rule 2b: re-seed only for a different group, never on a refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "axes",
  });

  const watchedAxes = useWatch({ control, name: "axes" });
  const axisNames = useMemo(
    () => (watchedAxes ?? []).map((axis) => axis?.name?.trim() ?? ""),
    [watchedAxes],
  );
  const filledAxes = useMemo(
    () => axisNames.filter((name) => name.length > 0),
    [axisNames],
  );
  const problems = useMemo(
    () => analyzePositions(filledAxes, positions),
    [filledAxes, positions],
  );
  const usage = useMemo(() => attributeUsage(positions), [positions]);

  const dirtySections = (
    [
      dirtyFields.name ? f.sectionMain : null,
      dirtyFields.axes ? f.axes : null,
      dirtyFields.isActive ? f.active : null,
    ] as Array<string | null>
  ).filter((section): section is string => section !== null);

  return (
    <form
      id={FORM_ID}
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {submitCount > 0 && errors.name ? (
        <FormAlert>{f.formAlert}</FormAlert>
      ) : null}
      {problems.problemCount > 0 ? (
        // A standing state of the data, not a refused submit: `status`, not
        // `alert`, so it is not shouted on every load.
        <FormAlert role="status">
          <strong className="font-semibold">
            {g.problemsLead(problems.problemCount)}
          </strong>
          {g.problemsBody}
        </FormAlert>
      ) : null}
      {readOnly ? (
        <Callout variant="strip">{dict.common.viewOnly}</Callout>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <FormSectionCard title={f.sectionMain}>
            <fieldset disabled={readOnly} className="flex flex-col gap-1.5">
              <Label htmlFor="group-name" required>
                {f.name}
              </Label>
              <Input
                id="group-name"
                aria-required="true"
                placeholder={f.namePlaceholder}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={
                  errors.name
                    ? `${errorId("name")} group-name-hint`
                    : "group-name-hint"
                }
                {...register("name")}
              />
              <FieldError id={errorId("name")}>
                {errors.name?.message}
              </FieldError>
              <p id="group-name-hint" className="text-xs text-muted-foreground">
                {f.nameHint}
              </p>
            </fieldset>
          </FormSectionCard>

          <FormSectionCard
            title={f.axes}
            description={f.axesHint}
            actions={
              <span className="text-xs text-muted-foreground">
                {f.axesOrder}
              </span>
            }
          >
            <AxisList
              control={control}
              fields={fields}
              axisNames={axisNames}
              positions={positions}
              usage={usage}
              readOnly={readOnly}
              onMove={move}
              onRemove={remove}
            />
            {positions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {f.axesNoPositions}
              </p>
            ) : null}
            {readOnly ? null : (
              <Button
                type="button"
                variant="outline"
                className="self-start max-md:h-11"
                onClick={() => append({ name: "" })}
              >
                <PlusIcon aria-hidden="true" />
                {f.addAxis}
              </Button>
            )}
          </FormSectionCard>

          {renderPositions?.(filledAxes, problems)}

          <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4 shadow-card">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="group-active">{f.active}</Label>
              <p
                id="group-active-hint"
                className="text-xs text-muted-foreground"
              >
                {f.activeHint}
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="group-active"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={readOnly}
                  aria-describedby="group-active-hint"
                  className="mt-0.5 shrink-0"
                />
              )}
            />
          </div>
        </div>

        <GroupAside axes={filledAxes} positions={positions} />
      </div>

      {readOnly ? null : (
        <FormActionsBar
          variant="sticky"
          formId={FORM_ID}
          dirtySections={dirtySections}
          saveLabel={isPending ? dict.common.saving : submitLabel}
          isSaving={isPending}
        >
          <Button asChild variant="outline">
            <Link href={cancelHref}>{dict.common.cancel}</Link>
          </Button>
        </FormActionsBar>
      )}
    </form>
  );
}

/* ── «Вибір на сайті»: the sortable axis rows ───────────────────────────── */

interface AxisListProps {
  control: Control<ProductGroupFormInput, unknown, ProductGroupFormValues>;
  fields: ReadonlyArray<{ id: string }>;
  axisNames: string[];
  positions: readonly ProductSiblingEntity[];
  usage: Array<{ name: string; count: number }>;
  readOnly: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function AxisList({
  control,
  fields,
  axisNames,
  positions,
  usage,
  readOnly,
  onMove,
  onRemove,
}: AxisListProps) {
  const { announcePolite } = useAnnouncer();
  if (fields.length === 0) return null;

  const labelOf = (index: number) => axisNames[index] || f.unnamedAxis;

  const moveBy = (index: number, step: -1 | 1) => {
    const to = index + step;
    if (to < 0 || to >= fields.length) return;
    onMove(index, to);
    announcePolite(f.axisMoved(labelOf(index), to + 1, fields.length));
  };

  const renderRow = ({
    item,
    index,
    setNodeRef,
    style,
    handleProps,
    isDragging,
  }: SortableTreeRowRenderProps) => {
    const name = axisNames[index] ?? "";
    const values = name ? axisValues(name, positions) : [];
    const taken = new Set(
      axisNames.filter((other, i) => i !== index && other).map(normalize),
    );
    const needle = normalize(name);
    const options = usage
      .filter(
        (entry) =>
          !taken.has(normalize(entry.name)) &&
          normalize(entry.name) !== needle &&
          (!needle || normalize(entry.name).includes(needle)),
      )
      .map((entry) => ({
        value: entry.name,
        label: entry.name,
        description: f.axisUsage(entry.count),
      }));
    const inputId = `group-axis-${item.id}`;

    return (
      <div
        key={item.id}
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 md:flex-nowrap",
          isDragging && "opacity-60",
        )}
      >
        {readOnly ? null : (
          <button
            type="button"
            {...handleProps}
            aria-label={f.moveAxisAria(labelOf(index))}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                moveBy(index, event.key === "ArrowUp" ? -1 : 1);
              }
            }}
            className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 max-md:size-11"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}
        <div className="w-full min-w-0 md:w-56 md:shrink-0">
          <Label htmlFor={inputId} className="sr-only">
            {f.axisNameAria(index + 1)}
          </Label>
          <Controller
            control={control}
            name={`axes.${index}.name` as const}
            render={({ field }) => (
              <Combobox
                id={inputId}
                value={field.value ?? ""}
                onInputChange={field.onChange}
                onSelect={(option) => field.onChange(option.value)}
                options={options}
                disabled={readOnly}
                placeholder={f.axisPlaceholder}
              />
            )}
          />
        </div>
        <ul
          aria-label={labelOf(index)}
          className="flex min-w-0 flex-1 flex-wrap gap-1"
        >
          {values.map((value) => (
            <li key={value}>
              <Badge variant="outline">{value}</Badge>
            </li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={f.removeAxisAria(index + 1)}
            onClick={() => onRemove(index)}
            className="shrink-0 text-muted-foreground max-md:size-11"
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <SortableTree
        items={fields.map((field, index) => ({
          id: field.id,
          parentId: null,
          label: labelOf(index),
        }))}
        maxDepth={1}
        disabled={readOnly}
        renderRow={renderRow}
        onMove={(_groups, next, movingId) => {
          const from = fields.findIndex((field) => field.id === movingId);
          const to = next.findIndex((item) => item.id === movingId);
          if (from === -1 || to === -1 || from === to) return;
          onMove(from, to);
          announcePolite(f.axisMoved(labelOf(from), to + 1, fields.length));
        }}
      />
    </div>
  );
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("uk");

/* ── the aside: preview + summary ───────────────────────────────────────── */

function GroupAside({
  axes,
  positions,
}: {
  axes: string[];
  positions: readonly ProductSiblingEntity[];
}) {
  const range = priceRange(positions);
  const shown = positions.filter((position) => position.isActive).length;
  const live = positions.find((position) => position.isActive);
  const choices = axes
    .map((axis) => ({ axis, values: axisValues(axis, positions) }))
    .filter((choice) => choice.values.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section
        aria-label={g.preview}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
      >
        <h3 className="text-sm font-semibold text-foreground">{g.preview}</h3>
        {choices.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            {choices.map(({ axis, values }) => (
              <div key={axis} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{axis}</span>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((value, index) => (
                    <span
                      key={value}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-sm text-foreground",
                        index === 0 && "border-foreground",
                      )}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{g.previewEmpty}</p>
        )}
        {live ? (
          <a
            href={`${STOREFRONT_URL}/products/${live.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-xs text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {g.openOnSite}
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </a>
        ) : null}
      </section>

      {positions.length > 0 ? (
        <dl className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-card">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{g.summaryShown}</dt>
            <dd className="text-foreground tabular-nums">
              {g.summaryShownValue(shown, positions.length)}
            </dd>
          </div>
          {range ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{g.summaryPrices}</dt>
              <dd className="text-foreground tabular-nums">
                {formatPriceRange(range)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

/** «52 999 – 79 999 ₴», or one price when they are all the same. */
export function formatPriceRange(range: { min: number; max: number }): string {
  if (range.min === range.max) return formatCurrency(range.min);
  const min = formatCurrency(range.min).replace(/\s₴$/, "");
  return `${min} – ${formatCurrency(range.max)}`;
}
