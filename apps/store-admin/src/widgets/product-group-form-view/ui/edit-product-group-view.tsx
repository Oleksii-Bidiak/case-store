"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  GroupPositionsSection,
  ProductGroupForm,
  productGroupFormValuesToDto,
  type ProductGroupFormInput,
  type ProductGroupFormValues,
} from "@/features/product-group-form";
import {
  getProductGroupControllerFindAllQueryKey,
  getProductGroupControllerFindByIdQueryKey,
  useProductGroupControllerFindById,
  useProductGroupControllerUpdate,
  type ProductGroupDetailEntity,
} from "@/entities/product-group";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Badge, ErrorState } from "@/shared/ui";
import { dict } from "@/shared/config";
import { ProductGroupFormSkeleton } from "./product-group-form-skeleton";

const g = dict.productGroups;

const LIST_PATH = "/product-groups";

interface EditProductGroupViewProps {
  groupId: string;
}

/**
 * The group page (wave 198, ProductGroupsProposal ГТ3–ГТ5, ГТ9; TASK-1084):
 * the group's name as the title with its flag, the sectioned form, and the
 * positions managed in place. Without `products:write` (TASK-1011) the page
 * is read-only and offers no membership changes. A missing group (404) goes
 * back to the list.
 *
 * «Видалити групу…» from the artboard is not here: the API has no delete for
 * a group (API tail).
 */
export function EditProductGroupView({ groupId }: EditProductGroupViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useProductGroupControllerFindById(groupId);
  const update = useProductGroupControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) router.replace(LIST_PATH);
  }, [isNotFound, router]);

  const group = data?.data;

  const handleSubmit = (values: ProductGroupFormValues) => {
    update.mutate(
      { id: groupId, data: productGroupFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindByIdQueryKey(groupId),
          });
          toast.success(g.toastUpdated);
          router.push(LIST_PATH);
        },
        onError: () => toast.error(g.toastUpdateFailed),
      },
    );
  };

  if (isLoading) return <ProductGroupFormSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href={LIST_PATH}
          className="w-fit rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {g.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight break-words text-foreground">
            {group?.name ?? g.editHeading}
          </h2>
          {group ? (
            <Badge variant={group.isActive ? "default" : "secondary"}>
              {group.isActive ? g.statusActive : g.statusInactive}
            </Badge>
          ) : null}
        </div>
      </div>

      {isError && !isNotFound ? (
        <ErrorState
          variant="card"
          message={g.loadOneError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : group ? (
        <ProductGroupForm
          id={groupId}
          defaultValues={mapGroupToFormValues(group)}
          positions={group.positions}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          cancelHref={LIST_PATH}
          readOnly={!canWrite}
          renderPositions={(axes, problems) => (
            <GroupPositionsSection
              groupId={groupId}
              positions={group.positions}
              axes={axes}
              problems={problems}
              canWrite={canWrite}
            />
          )}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched group entity onto the form's input shape. */
function mapGroupToFormValues(
  group: ProductGroupDetailEntity,
): Partial<ProductGroupFormInput> {
  return {
    name: group.name,
    axes: [...group.axes]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((axis) => ({ name: axis.name })),
    isActive: group.isActive,
  };
}
