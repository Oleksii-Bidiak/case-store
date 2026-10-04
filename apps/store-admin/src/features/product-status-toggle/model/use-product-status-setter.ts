"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useProductControllerActivate,
  useProductControllerDeactivate,
} from "@/entities/product";
import { toast } from "@/shared/ui/toast";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

export interface ProductStatusSetterApi {
  /** Show (`true`) or hide (`false`) one product. */
  setActive: (productId: string, isActive: boolean) => void;
  isPending: boolean;
}

/**
 * Show / hide ONE product from a row's «⋯» menu (wave 198, ProductsProposal).
 *
 * Replaces the per-row `ProductStatusToggle` button: the registry row carries a
 * read-only status badge and the write lives in «⋯», so the hook takes the id
 * at CALL time — one instance serves the whole page instead of one mutation
 * pair per row. Same endpoints and the same invalidation as before; nothing is
 * written optimistically, and a failure now says so instead of failing silent.
 *
 * Hiding a single product does not confirm — it never did, and putting it back
 * is the same menu item, one click away.
 */
export function useProductStatusSetter(): ProductStatusSetterApi {
  const queryClient = useQueryClient();
  const activate = useProductControllerActivate();
  const deactivate = useProductControllerDeactivate();
  const isPending = activate.isPending || deactivate.isPending;
  const activateMutate = activate.mutate;
  const deactivateMutate = deactivate.mutate;

  const setActive = useCallback(
    (productId: string, isActive: boolean) => {
      const mutate = isActive ? activateMutate : deactivateMutate;
      mutate(
        { id: productId },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: getProductControllerAdminFindAllQueryKey(),
            });
            void queryClient.invalidateQueries({
              queryKey: getProductControllerFindByIdQueryKey(productId),
            });
          },
          onError: (error) => {
            toast.error(
              apiErrorMessage(error) ?? dict.products.rowStatusFailed,
            );
          },
        },
      );
    },
    [activateMutate, deactivateMutate, queryClient],
  );

  return { setActive, isPending };
}
