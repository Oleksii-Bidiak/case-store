"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  ProductForm,
  productFormValuesToDto,
  type ProductFormValues,
} from "@/features/product-form";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerCreate,
  useUpdateProductSpecs,
  type ProductSpecValueDto,
} from "@/entities/product";
import { useProductControllerUpdateDeviceCompat } from "@/entities/device";
import { useAddonServiceControllerSetProductDelta } from "@/entities/addon-service";
import {
  ProductImageManager,
  useImageUploadQueue,
} from "@/features/product-image-manager";
import { ProductSpecsEditor } from "@/features/product-specs-editor";
import { ProductDeviceCompatManager } from "@/features/product-device-compat";
import {
  ProductAddonDeltaPanel,
  type StagedAddon,
} from "@/features/product-addon-delta-panel";
import { Separator } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { apiErrorMessage } from "@/shared/lib";
import {
  hasCarryoverFailures,
  stashCreateCarryover,
  type CreateCarryoverFailures,
} from "../model/create-carryover";

type StepStatus = "idle" | "running" | "done" | "failed";

interface ReplayState {
  product: StepStatus;
  images: StepStatus;
  specs: StepStatus;
  compat: StepStatus;
  addons: StepStatus;
}

const IDLE_REPLAY: ReplayState = {
  product: "running",
  images: "idle",
  specs: "idle",
  compat: "idle",
  addons: "idle",
};

/**
 * Create-product page body, and the orchestrator of a create that carries
 * everything (TASK-442).
 *
 * WHAT CHANGED AND WHY. Photos, structured specs, device compatibility and
 * add-on deltas all live on endpoints keyed by a product id, so none of them can
 * exist before the first save. TASK-361 made that bearable — create a hidden
 * draft, then hand the operator over to the edit page — but it still meant
 * filling one product in two sittings on two screens. The four panels now also
 * run in a STAGED mode: with no `productId` they keep the operator's input
 * locally and call no mutation at all, while every query that does NOT need a
 * product id (the category's effective attribute definitions, the device-model
 * taxonomy, the add-on catalogue) keeps running — so the create form offers the
 * same fields as the edit form rather than a poorer surrogate.
 *
 * THE REPLAY. After `POST /products` answers, this view walks the four areas in
 * order against the new id, with the progress visible: photos one request per
 * file (through the very same queue the image panel uploads with — see
 * `features/product-image-manager/model/use-image-upload-queue`), then specs,
 * then compatibility, then one delta per picked add-on.
 *
 * PARTIAL FAILURE ROLLS BACK NOTHING, deliberately. The product exists and is
 * HIDDEN — that is the part that matters, and un-creating it would throw away
 * everything that did land. We go to `/products/:id/edit` either way and leave a
 * persistent ALERT there naming exactly what did not make it ("не вдалося: фото
 * 2, 3"), because the panels that can finish the job are on that page. An alert,
 * not a toast: a toast is gone before the operator has scrolled to the panel it
 * was talking about.
 *
 * NOT DONE, deliberately: an atomic multipart create (option "b" of plan 177) —
 * the decision is on record against it. Creation still yields a HIDDEN product
 * published through `ProductPublishPanel`'s readiness checklist, and catalogue
 * import still attaches no photos (owner's decision, 2026-07-29).
 */
export function CreateProductView() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── What the operator has filled in while no product exists yet ───────────
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const [stagedSpecs, setStagedSpecs] = useState<ProductSpecValueDto[]>([]);
  const [stagedCompat, setStagedCompat] = useState<string[]>([]);
  const [stagedAddons, setStagedAddons] = useState<StagedAddon[]>([]);

  const [replay, setReplay] = useState<ReplayState | null>(null);
  const isSaving = replay !== null;

  const create = useProductControllerCreate();
  const saveSpecs = useUpdateProductSpecs();
  const saveCompat = useProductControllerUpdateDeviceCompat();
  const saveAddon = useAddonServiceControllerSetProductDelta();
  const imageQueue = useImageUploadQueue();

  const progressRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // The submit button sits at the bottom of a long form; the progress panel
    // sits at the top. Bring it to the operator rather than asking them to
    // guess whether anything is happening.
    if (isSaving) progressRef.current?.scrollIntoView({ block: "center" });
  }, [isSaving]);

  const setStep = (key: keyof ReplayState, status: StepStatus) =>
    setReplay((prev) => (prev ? { ...prev, [key]: status } : prev));

  const handleSubmit = async (values: ProductFormValues) => {
    setReplay(IDLE_REPLAY);

    let productId: string;
    try {
      const response = await create.mutateAsync({
        data: productFormValuesToDto(values),
      });
      productId = response.data.id;
    } catch (error) {
      // Nothing was created, so nothing is half-done: back to the untouched
      // form with the server's own words (TASK-397).
      setReplay(null);
      toast.error(apiErrorMessage(error) ?? dict.products.toastCreateFailed);
      return;
    }
    setStep("product", "done");
    void queryClient.invalidateQueries({
      queryKey: getProductControllerAdminFindAllQueryKey(),
    });

    const failures: CreateCarryoverFailures = {
      images: [],
      specs: false,
      compat: false,
      addons: [],
    };

    // 1 — photos, one request per file, in the order they were staged (the
    // first one becomes the cover).
    if (stagedImages.length > 0) {
      setStep("images", "running");
      const summary = await imageQueue.enqueue(productId, stagedImages);
      failures.images = summary?.failedItems.map((item) => item.name) ?? [];
      setStep("images", failures.images.length > 0 ? "failed" : "done");
    }

    // 2 — structured specs, the whole set in one PUT.
    if (stagedSpecs.length > 0) {
      setStep("specs", "running");
      try {
        await saveSpecs.mutateAsync({
          id: productId,
          data: { specs: stagedSpecs },
        });
        setStep("specs", "done");
      } catch {
        failures.specs = true;
        setStep("specs", "failed");
      }
    }

    // 3 — device compatibility, the whole set in one PUT.
    if (stagedCompat.length > 0) {
      setStep("compat", "running");
      try {
        await saveCompat.mutateAsync({
          id: productId,
          data: { deviceModelIds: stagedCompat },
        });
        setStep("compat", "done");
      } catch {
        failures.compat = true;
        setStep("compat", "failed");
      }
    }

    // 4 — one delta row per picked add-on; the endpoint is per (product,
    // add-on) pair, so this is a loop by construction, not by choice.
    if (stagedAddons.length > 0) {
      setStep("addons", "running");
      for (const addon of stagedAddons) {
        try {
          await saveAddon.mutateAsync({
            productId,
            addonServiceId: addon.addonServiceId,
            data:
              addon.price === undefined
                ? { type: "ADD" }
                : { type: "ADD", price: addon.price },
          });
        } catch {
          failures.addons.push(addon.name);
        }
      }
      setStep("addons", failures.addons.length > 0 ? "failed" : "done");
    }

    if (hasCarryoverFailures(failures)) {
      // The edit page renders this as a persistent alert. No success toast on
      // top of it — "Чернетку створено" next to a list of what did not save
      // reads as reassurance the operator has not earned.
      stashCreateCarryover(productId, failures);
    } else {
      toast.success(dict.products.toastDraftCreated);
    }
    router.push(`/products/${productId}/edit`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.products.createHeading}
        </h2>
      </div>

      {replay && (
        <section
          ref={progressRef}
          role="status"
          aria-live="polite"
          className="flex max-w-2xl flex-col gap-2 rounded-lg border border-border p-4"
        >
          <h3 className="text-sm font-semibold text-foreground">
            {dict.products.createProgress.heading}
          </h3>
          <ul className="flex flex-col gap-1">
            <ProgressRow
              label={dict.products.createProgress.product}
              status={replay.product}
            />
            {stagedImages.length > 0 && (
              <ProgressRow
                label={dict.products.createProgress.images(
                  imageQueue.doneCount,
                  stagedImages.length,
                )}
                status={replay.images}
              />
            )}
            {stagedSpecs.length > 0 && (
              <ProgressRow
                label={dict.products.createProgress.specs}
                status={replay.specs}
              />
            )}
            {stagedCompat.length > 0 && (
              <ProgressRow
                label={dict.products.createProgress.compat}
                status={replay.compat}
              />
            )}
            {stagedAddons.length > 0 && (
              <ProgressRow
                label={dict.products.createProgress.addons}
                status={replay.addons}
              />
            )}
          </ul>
        </section>
      )}

      <div className="flex max-w-2xl flex-col gap-6">
        <ProductForm
          onSubmit={handleSubmit}
          isPending={isSaving}
          submitLabel={dict.products.createSubmit}
          renderSpecsSection={(categoryId) => (
            <>
              <Separator />
              {/* No productId: the editor stages the payload instead of
                  saving it, but renders the SAME inputs the edit page does —
                  its definition query is keyed by category, not by product. */}
              <ProductSpecsEditor
                categoryId={categoryId}
                onStage={setStagedSpecs}
              />
            </>
          )}
        />

        <Separator />

        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {dict.products.imagesHeading}
          </h3>
          <ProductImageManager value={stagedImages} onStage={setStagedImages} />
        </section>

        <Separator />

        <ProductAddonDeltaPanel
          value={stagedAddons}
          onStage={setStagedAddons}
        />

        <Separator />

        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {dict.productCompat.title}
          </h3>
          <ProductDeviceCompatManager onStage={setStagedCompat} />
        </section>
      </div>
    </div>
  );
}

/** One replay step and where it got to. */
function ProgressRow({ label, status }: { label: string; status: StepStatus }) {
  const p = dict.products.createProgress;
  const statusLabel =
    status === "done"
      ? p.statusDone
      : status === "failed"
        ? p.statusFailed
        : status === "running"
          ? p.statusRunning
          : p.statusWaiting;

  return (
    <li className="flex items-center gap-2 text-sm">
      {status === "running" ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : status === "done" ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : status === "failed" ? (
        <TriangleAlert
          className="size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
      ) : (
        <span className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={cn(
          "text-xs",
          status === "failed" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {statusLabel}
      </span>
    </li>
  );
}
