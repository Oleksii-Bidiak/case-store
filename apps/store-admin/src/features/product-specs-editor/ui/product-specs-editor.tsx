"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
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
} from "@/entities/product";
import {
  useAttributeDefinitionControllerFindEffective,
  AttributeDefinitionEntityType,
  type AttributeDefinitionEntity,
} from "@/entities/attribute-definition";

const d = dict.productSpecs;

interface ProductSpecsEditorProps {
  productId: string;
  /** LIVE selected category id (from the product form) — its effective
   *  definition set drives the rendered inputs (TASK-191). */
  categoryId: string;
  /** The product's currently-saved spec values, used to seed the inputs. */
  initialSpecs: ProductSpecEntity[];
}

/**
 * Structured-spec value editor for a product (TASK-191). Renders one typed input
 * per EFFECTIVE definition of the product's (live-selected) category, seeded
 * from the product's saved values, and saves the full set via the dedicated
 * `PUT /products/:id/specs` endpoint. Values are keyed by definition KEY so a
 * live category switch preserves already-entered values whose key survives.
 */
export function ProductSpecsEditor({
  productId,
  categoryId,
  initialSpecs,
}: ProductSpecsEditorProps) {
  const queryClient = useQueryClient();
  const definitionsQuery = useAttributeDefinitionControllerFindEffective(
    categoryId,
    {
      query: { enabled: Boolean(categoryId) },
    },
  );
  const definitions = definitionsQuery.data?.data ?? [];

  const mutation = useUpdateProductSpecs();

  // Values keyed by definition KEY. Seeded once per product from initialSpecs;
  // a live category change keeps values whose key is still in scope.
  const [values, setValues] = useState<Record<string, string>>({});
  const seededForRef = useRef<string | null>(null);

  useEffect(() => {
    if (seededForRef.current === productId) return;
    const seeded: Record<string, string> = {};
    for (const spec of initialSpecs) {
      seeded[spec.key] = spec.value;
    }
    setValues(seeded);
    seededForRef.current = productId;
  }, [productId, initialSpecs]);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    const specs = definitions
      .map((def) => ({
        definitionId: def.id,
        value: (values[def.key] ?? "").trim(),
      }))
      .filter((entry) => entry.value !== "");

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
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">{d.heading}</h3>
        <p className="text-sm text-muted-foreground">{d.description}</p>
      </div>

      {definitionsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.empty}</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {definitions.map((definition) => (
              <SpecField
                key={definition.id}
                definition={definition}
                value={values[definition.key] ?? ""}
                onChange={(value) => setValue(definition.key, value)}
              />
            ))}
          </div>
          <div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? d.saving : d.save}
            </Button>
          </div>
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
        <div className="flex items-center gap-2">
          <Checkbox
            id={fieldId}
            checked={value === "true"}
            onCheckedChange={(checked) =>
              onChange(checked === true ? "true" : "false")
            }
          />
          <Label htmlFor={fieldId}>{labelText}</Label>
        </div>
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
