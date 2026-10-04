"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import type { SectionSaveController } from "@/shared/lib/section-save";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  useUpdateProductSpecs,
  getProductControllerFindByIdQueryKey,
  type ProductSpecEntity,
  type ProductSpecValueDto,
} from "@/entities/product";
import {
  useAttributeDefinitionControllerFindEffective,
  AttributeDefinitionEntityType,
  type AttributeDefinitionEntity,
} from "@/entities/attribute-definition";

const d = dict.productSpecs;

interface ProductSpecsEditorProps {
  /**
   * The product being edited. Omitted in STAGED mode (TASK-442), on
   * `/products/new`: there is no `:id` to save to yet, so the editor holds the
   * values locally and reports the would-be payload through `onStage`.
   */
  productId?: string;
  /** LIVE selected category id (from the product form) — its effective
   *  definition set drives the rendered inputs (TASK-191). */
  categoryId: string;
  /** The product's currently-saved spec values, used to seed the inputs. */
  initialSpecs?: ProductSpecEntity[];
  /**
   * STAGED mode: the exact payload `PUT /products/:id/specs` will receive once
   * the product exists. Emitted whenever it changes — including when a live
   * category switch changes which definitions are in scope, which is why this is
   * an effect and not a callback on the inputs.
   */
  onStage?: (specs: ProductSpecValueDto[]) => void;
  /**
   * Wave 198 (TASK-1050): the page's one «Зберегти» drives this section. When
   * given, the editor renders no save button of its own and exposes
   * `save()` / `discard()` here instead.
   */
  controllerRef?: Ref<SectionSaveController>;
  /** Fired whenever the editor starts or stops differing from the saved specs. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Inside a form section card that already carries the title. */
  embedded?: boolean;
}

const NO_SPECS: ProductSpecEntity[] = [];

/**
 * Structured-spec value editor for a product (TASK-191). Renders one typed input
 * per EFFECTIVE definition of the product's (live-selected) category, seeded
 * from the product's saved values, and saves the full set via the dedicated
 * `PUT /products/:id/specs` endpoint. Values are keyed by definition KEY so a
 * live category switch preserves already-entered values whose key survives.
 *
 * STAGED MODE (TASK-442). Without a `productId` there is nothing to save to, so
 * the save button is replaced by a note and the payload goes to `onStage`
 * instead. The definition query keeps running: it is keyed by CATEGORY, not by
 * product, so the create form shows exactly the fields the edit form would —
 * the point of the whole change was to stop handing the operator a poorer
 * version of the same screen.
 */
export function ProductSpecsEditor({
  productId,
  categoryId,
  initialSpecs = NO_SPECS,
  onStage,
  controllerRef,
  onDirtyChange,
  embedded = false,
}: ProductSpecsEditorProps) {
  const queryClient = useQueryClient();
  const definitionsQuery = useAttributeDefinitionControllerFindEffective(
    categoryId,
    {
      query: { enabled: Boolean(categoryId) },
    },
  );
  const definitions = useMemo(
    () => definitionsQuery.data?.data ?? [],
    [definitionsQuery.data],
  );

  const mutation = useUpdateProductSpecs();

  // Values keyed by definition KEY. Seeded once per product from initialSpecs;
  // a live category change keeps values whose key is still in scope.
  //
  // The latch is a BOX around the id, not the id itself: in staged mode
  // `productId` is `undefined`, and a bare `useRef<string | null>(null)` would
  // read as "already seeded" on the very first run and never seed. `null` box =
  // never seeded; a box holding `undefined` = seeded for the staged (product-
  // less) editor, which then never re-seeds and never wipes live typing.
  const [values, setValues] = useState<Record<string, string>>({});
  const seededForRef = useRef<{ id: string | undefined } | null>(null);

  useEffect(() => {
    if (seededForRef.current && seededForRef.current.id === productId) return;
    const seeded: Record<string, string> = {};
    for (const spec of initialSpecs) {
      seeded[spec.key] = spec.value;
    }
    setValues(seeded);
    seededForRef.current = { id: productId };
  }, [productId, initialSpecs]);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  /** Exactly what the specs endpoint receives — in both modes. */
  const specs = useMemo(
    () =>
      definitions
        .map((def) => ({
          definitionId: def.id,
          value: (values[def.key] ?? "").trim(),
        }))
        .filter((entry) => entry.value !== ""),
    [definitions, values],
  );

  /**
   * STAGED mode: push the payload up whenever it actually changes.
   *
   * The guard is the `lastPushedRef` idiom of `docs/conventions/forms.md`
   * Rule 1b, pointed outward: `onStage` is typically an inline arrow, so a
   * dependency on it alone would re-fire on every parent render, and the payload
   * is recomputed (new identity) on every keystroke. Comparing the SERIALISED
   * payload makes this fire once per real change — including the one a callback
   * on the inputs could not catch, when switching category changes which
   * definitions are in scope and silently drops a value from the payload.
   */
  const lastStagedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onStage) return;
    const encoded = JSON.stringify(specs);
    if (encoded === lastStagedRef.current) return;
    lastStagedRef.current = encoded;
    onStage(specs);
  }, [specs, onStage]);

  /**
   * Differs from what the server holds: a value changed, or a saved spec whose
   * key the (new) category no longer defines — saving would drop it. Judged
   * only once the definitions are in, so a loading list is never "dirty".
   */
  const isDirty = useMemo(() => {
    if (!productId || definitions.length === 0) return false;
    const saved = new Map(initialSpecs.map((spec) => [spec.key, spec.value]));
    const keys = new Set(definitions.map((def) => def.key));
    return (
      definitions.some(
        (def) =>
          (values[def.key] ?? "").trim() !== (saved.get(def.key) ?? "").trim(),
      ) || initialSpecs.some((spec) => !keys.has(spec.key))
    );
  }, [definitions, initialSpecs, productId, values]);

  const lastDirtyRef = useRef(false);
  useEffect(() => {
    if (lastDirtyRef.current === isDirty) return;
    lastDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // The controller reads the LATEST payload at call time (it is called from an
  // async save chain that outlives renders), hence the refs.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});
  const mutateAsync = mutation.mutateAsync;
  useEffect(() => {
    saveRef.current = async () => {
      if (!productId) return;
      await mutateAsync({ id: productId, data: { specs } });
      await queryClient.invalidateQueries({
        queryKey: getProductControllerFindByIdQueryKey(productId),
      });
    };
    discardRef.current = () => {
      const seeded: Record<string, string> = {};
      for (const spec of initialSpecs) seeded[spec.key] = spec.value;
      setValues(seeded);
    };
  }, [initialSpecs, mutateAsync, productId, queryClient, specs]);
  useImperativeHandle(
    controllerRef,
    () => ({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    }),
    [],
  );

  const handleSave = () => {
    if (!productId) return;
    mutation.mutate(
      { id: productId, data: { specs } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          toast.success(d.toastSaved);
        },
        onError: () => toast.error(d.toastError),
      },
    );
  };

  if (!categoryId) {
    return <p className="text-sm text-muted-foreground">{d.noCategory}</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      {embedded ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">{d.heading}</h3>
          <p className="text-sm text-muted-foreground">{d.description}</p>
        </div>
      )}

      {definitionsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.empty}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {definitions.map((definition) => (
              <SpecField
                key={definition.id}
                definition={definition}
                value={values[definition.key] ?? ""}
                onChange={(value) => setValue(definition.key, value)}
              />
            ))}
          </div>
          {controllerRef ? null : productId ? (
            <div>
              <Button
                type="button"
                onClick={handleSave}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? d.saving : d.save}
              </Button>
            </div>
          ) : (
            // Nothing to save to yet — «Створити товар» carries these values.
            <p className="text-sm text-muted-foreground">{d.stagedHint}</p>
          )}
        </>
      )}
    </section>
  );
}

interface SpecFieldProps {
  definition: AttributeDefinitionEntity;
  value: string;
  onChange: (value: string) => void;
}

/** Renders the correct input widget for a definition's type. */
function SpecField({ definition, value, onChange }: SpecFieldProps) {
  const fieldId = `spec-${definition.id}`;
  const labelText = definition.unit
    ? `${definition.label} (${definition.unit})`
    : definition.label;

  return (
    <div className="flex flex-col gap-1.5">
      {definition.type === AttributeDefinitionEntityType.BOOLEAN ? (
        <BooleanSegments
          id={fieldId}
          label={labelText}
          value={value}
          onChange={onChange}
        />
      ) : (
        <>
          <Label htmlFor={fieldId}>{labelText}</Label>
          {definition.type === AttributeDefinitionEntityType.SELECT ? (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger id={fieldId}>
                <SelectValue placeholder={d.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {definition.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId}
              type={
                definition.type === AttributeDefinitionEntityType.NUMBER
                  ? "number"
                  : "text"
              }
              inputMode={
                definition.type === AttributeDefinitionEntityType.NUMBER
                  ? "decimal"
                  : undefined
              }
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </>
      )}
    </div>
  );
}

const BOOLEAN_SEGMENTS = [
  { value: "true", label: d.booleanYes },
  { value: "false", label: d.booleanNo },
  { value: "", label: d.booleanUnset },
] as const;

/**
 * «Так | Ні | Не вказано» (wave 198, TASK-1050). A checkbox could not say
 * "not specified": once touched it wrote «false», which the storefront then
 * printed as a fact. «Не вказано» writes nothing — the spec leaves the payload.
 */
function BooleanSegments({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const current = value === "true" || value === "false" ? value : "";
  return (
    <>
      <span id={id} className="text-sm leading-none font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="inline-flex self-start rounded-md border bg-background p-0.5"
      >
        {BOOLEAN_SEGMENTS.map((segment) => {
          const on = current === segment.value;
          return (
            <button
              key={segment.value || "unset"}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(segment.value)}
              className={cn(
                "inline-flex h-8 items-center rounded-sm px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                on && "bg-accent font-medium text-foreground",
              )}
            >
              {segment.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
