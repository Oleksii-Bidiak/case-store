"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  PageForm,
  pageFormValuesToCreateDto,
  pageSaveConflictMessage,
  type PageFormValues,
} from "@/features/page-form";
import {
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerCreate,
} from "@/entities/page";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";

/**
 * «Нова сторінка» (PagesProposal СР10): the sectioned form, whose sticky bar
 * says the page is not saved yet and, after a failed submit, how many fields
 * need a look. Creates, invalidates the list and returns to it.
 */
export function CreatePageView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const create = useAdminPageControllerCreate();
  const { mutateAsync: createAsync } = create;

  const handleSubmit = async (values: PageFormValues) => {
    try {
      await createAsync({ data: pageFormValuesToCreateDto(values) });
    } catch (error) {
      toast.error(
        pageSaveConflictMessage(error, values.kind) ??
          dict.pages.toastCreateFailed,
      );
      return false;
    }
    void queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });
    toast.success(dict.pages.toastCreated);
    router.push("/pages");
    return true;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/pages"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.pages.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.pages.createHeading}
        </h2>
      </div>

      <PageForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.pages.createSubmit}
        readOnly={!can(PERM.pagesWrite)}
      />
    </div>
  );
}
