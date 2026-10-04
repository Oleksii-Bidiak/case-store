"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  DeviceModelForm,
  deviceModelValuesToDto,
  type DeviceModelFormInput,
  type DeviceModelFormValues,
} from "@/features/device-model-form";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  getAdminDeviceControllerFindModelByIdQueryKey,
  useAdminDeviceControllerFindModelById,
  useAdminDeviceControllerUpdateModel,
  useLiveCompatPages,
} from "@/entities/device";
import { PERM } from "@/entities/permission";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useAuth } from "@/entities/session";
import { Badge, ErrorState } from "@/shared/ui";
import { dict } from "@/shared/config";
import { DeviceModelFormSkeleton } from "./device-model-form-skeleton";

const d = dict.devices;

interface EditDeviceModelViewProps {
  modelId: string;
}

/**
 * Edit-device-model page (wave 198, DevicesProposal ПР7, ПР11, TASK-1082).
 *
 * Header: «← Пристрої · Моделі», the model's name and its site status — the
 * same header in the loading and error states. Body: the sectioned form with
 * the live compatibility pages of this model, and the side panel —
 * «Сумісних товарів» (the products registry's own `meta.total`, a link into
 * «Товари» filtered by the device, for a session with `products:read`) and
 * «Сторінок на сайті». Without `devices:write` the same page is view-only.
 *
 * «Змінено» is not drawn: the model entity carries no `updatedAt` (TASK-1082
 * API tail). A missing model (404) redirects back to the list.
 */
export function EditDeviceModelView({ modelId }: EditDeviceModelViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.devicesWrite);
  const canOpenProducts = can(PERM.productsRead);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useAdminDeviceControllerFindModelById(modelId);
  const update = useAdminDeviceControllerUpdateModel();
  const compat = useLiveCompatPages();
  const products = useProductControllerAdminFindAll(
    { deviceModelId: modelId, page: 1, limit: 1 },
    { query: { enabled: canOpenProducts } },
  );

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/devices/models");
    }
  }, [isNotFound, router]);

  const model = data?.data;

  const handleSubmit = (values: DeviceModelFormValues) => {
    update.mutate(
      { id: modelId, data: deviceModelValuesToDto(values, { isUpdate: true }) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelByIdQueryKey(modelId),
          });
          toast.success(d.toastModelUpdated);
          router.push("/devices/models");
        },
        onError: () => toast.error(d.toastModelUpdateFailed),
      },
    );
  };

  if (isLoading) return <DeviceModelFormSkeleton withAside />;

  const livePages = compat.isLoading
    ? undefined
    : (compat.byModel.get(modelId) ?? []);
  const productsTotal = products.data?.meta?.total;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/devices/models"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {d.backToModels}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {model?.name ?? d.editModelHeading}
          </h2>
          {model ? (
            <Badge variant={model.isActive ? "default" : "secondary"}>
              {model.isActive ? d.statusActive : d.statusInactive}
            </Badge>
          ) : null}
        </div>
      </div>

      {isError || !model ? (
        isNotFound ? null : (
          <ErrorState
            variant="card"
            message={d.loadOneError}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        )
      ) : (
        <DeviceModelForm
          id={modelId}
          defaultValues={mapModelToFormValues(model)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          readOnly={!canWrite}
          livePages={livePages}
          aside={
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-card">
              {canOpenProducts ? (
                <Fact label={d.asideCompatProducts}>
                  {productsTotal === undefined ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Link
                      href={`/products?deviceModelId=${encodeURIComponent(modelId)}`}
                      className="rounded-xs font-medium text-primary tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {productsTotal} →
                    </Link>
                  )}
                </Fact>
              ) : null}
              <Fact label={d.asidePages}>
                <span className="tabular-nums">
                  {livePages === undefined ? "—" : livePages.length}
                </span>
              </Fact>
            </div>
          }
        />
      )}
    </div>
  );
}

/** One «label … value» line of the side panel. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Map a fetched model onto the form's string-based input shape. */
function mapModelToFormValues(model: {
  deviceBrandId: string;
  name: string;
  slug: string;
  series?: string | null;
  releaseYear?: number | null;
  isActive: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  description?: string | null;
}): Partial<DeviceModelFormInput> {
  return {
    deviceBrandId: model.deviceBrandId,
    name: model.name,
    slug: model.slug,
    series: model.series ?? "",
    releaseYear: model.releaseYear != null ? String(model.releaseYear) : "",
    isActive: model.isActive,
    // TASK-490 — the compat-landing copy. `?? ""` so a cleared override seeds
    // an empty (not an uncontrolled) input, same as `series` above.
    metaTitle: model.metaTitle ?? "",
    metaDescription: model.metaDescription ?? "",
    description: model.description ?? "",
  };
}
