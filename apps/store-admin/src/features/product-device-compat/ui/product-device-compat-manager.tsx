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
import { SearchIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
  useProductControllerUpdateDeviceCompat,
  useProductControllerUpdateGroupDeviceCompat,
} from "@/entities/device";
import { getProductControllerFindByIdQueryKey } from "@/entities/product";
import type { SectionSaveController } from "@/shared/lib/section-save";
import { cn } from "@/shared/lib/utils";
import { Badge, Button, Checkbox, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

const c = dict.productCompat;

interface ProductDeviceCompatManagerProps {
  /**
   * The product whose compat set this is. Omitted in STAGED mode (TASK-442), on
   * `/products/new`: the selection is held by the parent until the product
   * exists, and no save button is offered.
   */
  productId?: string;
  /** The product's group id (null when standalone) — gates the bulk action. */
  groupId?: string | null;
  /** Device model ids the product is currently compatible with. */
  initialModelIds?: string[];
  /** STAGED mode: the full next selection, after every tick/untick. */
  onStage?: (deviceModelIds: string[]) => void;
  /**
   * Wave 198 (TASK-1050): the page's one «Зберегти» drives this section — no
   * save button here, `save()` / `discard()` on this handle instead.
   */
  controllerRef?: Ref<SectionSaveController>;
  /** Fired whenever the selection starts or stops differing from the saved set. */
  onDirtyChange?: (dirty: boolean) => void;
}

const NO_MODEL_IDS: string[] = [];

/**
 * The model list is asked for with the endpoint's ceiling (`@Max(200)`): its
 * DEFAULT page is 50, which hid ~150 of the 198 seeded models from this picker
 * (TASK-1134). Past 200 models the picker needs a server-side search — that is
 * the API half of TASK-1134.
 */
const MODEL_LIMIT = 200;

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((id) => a.has(id));
}

/**
 * ProductDeviceCompatManager — the admin «Сумісні пристрої» control (TASK-190).
 * A checkbox per device model, bound to the product's compat set via the
 * dedicated `PUT /products/:id/device-compat` endpoint (compat is not part of
 * the product create/update DTO). When the product belongs to a group,
 * «Застосувати до всіх позицій групи» copies the same set to every sibling
 * position (`PUT /products/group/:groupId/device-compat`) — immediately, as
 * before: it writes OTHER products, so it is not part of this form's save.
 *
 * Wave 198 (ProductFormProposal Ф3): a model search, brand pills with counts,
 * «Лише вибрані» and a «Вибрано N» badge — finding one model among two hundred
 * by scrolling brand blocks was the complaint.
 *
 * `selected` seeds once from `initialModelIds` at mount — the parent only renders
 * this component after the product has loaded (docs/conventions/forms.md).
 *
 * STAGED MODE (TASK-442). Without a `productId` the save and the group action
 * drop away and every tick is reported to the parent instead.
 */
export function ProductDeviceCompatManager({
  productId,
  groupId = null,
  initialModelIds = NO_MODEL_IDS,
  onStage,
  controllerRef,
  onDirtyChange,
}: ProductDeviceCompatManagerProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialModelIds),
  );
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);

  const { data: brandsData } = useDeviceControllerFindBrands();
  const { data: modelsData, isLoading } = useDeviceControllerFindModels({
    limit: MODEL_LIMIT,
  });
  const brands = useMemo(() => brandsData?.data ?? [], [brandsData]);
  const models = useMemo(() => modelsData?.data ?? [], [modelsData]);

  const update = useProductControllerUpdateDeviceCompat();
  const updateGroup = useProductControllerUpdateGroupDeviceCompat();

  const countByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const model of models) {
      map.set(model.deviceBrandId, (map.get(model.deviceBrandId) ?? 0) + 1);
    }
    return map;
  }, [models]);

  const brandName = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.name])),
    [brands],
  );

  const needle = search.trim().toLocaleLowerCase("uk-UA");
  const visibleModels = models.filter(
    (model) =>
      (!brandFilter || model.deviceBrandId === brandFilter) &&
      (!onlySelected || selected.has(model.id)) &&
      (!needle ||
        model.name.toLocaleLowerCase("uk-UA").includes(needle) ||
        (brandName.get(model.deviceBrandId) ?? "")
          .toLocaleLowerCase("uk-UA")
          .includes(needle)),
  );

  const toggle = (modelId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(modelId);
    else next.delete(modelId);
    setSelected(next);
    // STAGED mode: the parent is the only place this selection survives until
    // the product exists, so it learns about every tick as it happens.
    onStage?.([...next]);
  };

  const deviceModelIds = [...selected];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getProductControllerFindByIdQueryKey(productId ?? ""),
    });

  const isDirty = Boolean(productId) && !sameSet(selected, initialModelIds);
  const lastDirtyRef = useRef(false);
  useEffect(() => {
    if (lastDirtyRef.current === isDirty) return;
    lastDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Read at CALL time by the page's save chain — hence refs, refreshed after
  // every render.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});
  const mutateAsync = update.mutateAsync;
  useEffect(() => {
    saveRef.current = async () => {
      if (!productId) return;
      await mutateAsync({ id: productId, data: { deviceModelIds } });
      await queryClient.invalidateQueries({
        queryKey: getProductControllerFindByIdQueryKey(productId),
      });
    };
    discardRef.current = () => setSelected(new Set(initialModelIds));
  });
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
    update.mutate(
      { id: productId, data: { deviceModelIds } },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(c.toastSaved);
        },
        onError: () => toast.error(c.toastSaveFailed),
      },
    );
  };

  const handleApplyToGroup = () => {
    if (!groupId) return;
    updateGroup.mutate(
      { groupId, data: { deviceModelIds } },
      {
        onSuccess: (response) => {
          void invalidate();
          toast.success(c.toastGroupApplied(response.data.updatedCount));
        },
        onError: () => toast.error(c.toastGroupFailed),
      },
    );
  };

  const pending = update.isPending || updateGroup.isPending;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{c.loading}</p>;
  }

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">{c.empty}</p>;
  }

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
      active && "border-primary bg-primary/10 text-primary hover:text-primary",
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{c.hint}</p>
        <Badge variant="secondary">{c.selectedCount(selected.size)}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={c.searchAria}
            placeholder={c.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={onlySelected ? "secondary" : "outline"}
          aria-pressed={onlySelected}
          onClick={() => setOnlySelected((value) => !value)}
        >
          {c.onlySelected}
        </Button>
      </div>

      <div
        role="group"
        aria-label={c.brandFilterAria}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {brands.map((brand) => {
          const count = countByBrand.get(brand.id) ?? 0;
          if (count === 0) return null;
          const active = brandFilter === brand.id;
          return (
            <button
              key={brand.id}
              type="button"
              aria-pressed={active}
              onClick={() => setBrandFilter(active ? "" : brand.id)}
              className={pill(active)}
            >
              {brand.name}
              <span className="text-xs tabular-nums">{count}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={brandFilter === ""}
          onClick={() => setBrandFilter("")}
          className={pill(brandFilter === "")}
        >
          {c.allBrands(models.length)}
        </button>
      </div>

      {visibleModels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.nothingFound}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModels.map((model) => {
            const inputId = `compat-${model.id}`;
            return (
              <li key={model.id} className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={selected.has(model.id)}
                  onCheckedChange={(checked) =>
                    toggle(model.id, checked === true)
                  }
                />
                <Label
                  htmlFor={inputId}
                  className="text-sm font-normal text-foreground"
                >
                  {model.name}
                </Label>
              </li>
            );
          })}
        </ul>
      )}

      {productId ? (
        <div className="flex flex-wrap items-center gap-3">
          {controllerRef ? null : (
            <Button type="button" onClick={handleSave} disabled={pending}>
              {update.isPending ? dict.common.saving : c.save}
            </Button>
          )}
          {groupId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleApplyToGroup}
              disabled={pending}
              title={c.applyToGroupHint}
            >
              {c.applyToGroup}
            </Button>
          )}
        </div>
      ) : (
        // Nothing to save to yet — «Створити товар» carries this selection.
        <p className="text-sm text-muted-foreground">{c.stagedHint}</p>
      )}
    </div>
  );
}
