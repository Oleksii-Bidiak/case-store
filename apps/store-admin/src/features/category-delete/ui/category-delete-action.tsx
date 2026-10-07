"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CategoryDeleteDialog } from "./category-delete-dialog";

interface CategoryDeleteActionProps {
  categoryId: string;
  /** Ran after the delete — the card navigates back to `/categories`. */
  onDeleted?: () => void;
}

/**
 * «Видалити…» on the category card (ДН-2.12): an outline button in the
 * destructive colour that opens the same dialog as the tree's «⋯». Nothing at
 * all without `categories:delete` — the same gate as the menu item.
 */
export function CategoryDeleteAction({
  categoryId,
  onDeleted,
}: CategoryDeleteActionProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (!can(PERM.categoriesDelete)) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon aria-hidden="true" />
        {dict.categories.delete.action}
      </Button>
      <CategoryDeleteDialog
        categoryId={open ? categoryId : null}
        onOpenChange={setOpen}
        onDeleted={onDeleted}
      />
    </>
  );
}
