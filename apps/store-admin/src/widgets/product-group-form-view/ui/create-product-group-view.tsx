"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  GroupPositionsSection,
  ProductGroupForm,
  productGroupFormValuesToDto,
  type ProductGroupFormValues,
} from "@/features/product-group-form";
import {
  getProductGroupControllerFindAllQueryKey,
  useProductGroupControllerCreate,
} from "@/entities/product-group";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";

const g = dict.productGroups;

const LIST_PATH = "/product-groups";

/**
 * «Нова група» (wave 198, ProductGroupsProposal ГТ6): the same sectioned form
 * as the group page. Positions can only join a group that exists, so the
 * section explains that instead of offering «Додати позицію…». Without
 * `products:write` (the API's guard) the form is read-only with nothing to
 * submit (TASK-1011).
 */
export function CreateProductGroupView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);
  const create = useProductGroupControllerCreate();

  const handleSubmit = (values: ProductGroupFormValues) => {
    create.mutate(
      { data: productGroupFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindAllQueryKey(),
          });
          toast.success(g.toastCreated);
          router.push(LIST_PATH);
        },
        onError: () => toast.error(g.toastCreateFailed),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href={LIST_PATH}
          className="w-fit rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {g.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {g.createHeading}
        </h2>
      </div>

      <ProductGroupForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={g.createSubmit}
        cancelHref={LIST_PATH}
        readOnly={!canWrite}
        renderPositions={(axes, problems) => (
          <GroupPositionsSection
            positions={[]}
            axes={axes}
            problems={problems}
            canWrite={canWrite}
          />
        )}
      />
    </div>
  );
}
