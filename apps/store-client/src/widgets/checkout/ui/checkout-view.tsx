"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import {
  CheckoutAddressForm,
  useCheckout,
  checkoutSchema,
  type CheckoutFormValues,
} from "@/features/checkout";
import { CartSkeleton } from "@/widgets/cart";
import { CheckoutOrderSummary } from "./checkout-order-summary";

/**
 * CheckoutView — client orchestrator for the `/checkout` route.
 *
 * Guards in order:
 *   1. While the silent auth refresh is in-flight, render a skeleton (avoids a
 *      flash-redirect to login for users who are actually signed in).
 *   2. Unauthenticated → redirect to `/login?redirect=/checkout` (the backend
 *      `POST /api/orders` requires a JWT).
 *   3. Authenticated but empty cart → redirect back to `/cart`.
 *   4. Otherwise render the address form + order summary.
 */
export function CheckoutView() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();

  const { data, isLoading: isCartLoading } = useGetCart({
    query: { enabled: isAuthenticated },
  });

  const { submitOrder, isPending, isError, errorMessage } = useCheckout();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { billingSameAsShipping: true },
  });

  const billingSameAsShipping = useWatch({
    control,
    name: "billingSameAsShipping",
  });
  const notes = useWatch({ control, name: "notes" }) ?? "";

  const items = data?.data?.items ?? [];
  const cartIsEmpty = isAuthenticated && !isCartLoading && items.length === 0;

  // Redirect unauthenticated visitors to login (once init has settled).
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace("/login?redirect=/checkout");
    }
  }, [isInitializing, isAuthenticated, router]);

  // Redirect to the cart when there is nothing to order.
  useEffect(() => {
    if (cartIsEmpty) {
      router.replace("/cart");
    }
  }, [cartIsEmpty, router]);

  if (isInitializing || !isAuthenticated || isCartLoading || cartIsEmpty) {
    return <CartSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
      <section className="lg:col-span-2">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Checkout</h1>

        <form
          onSubmit={handleSubmit(submitOrder)}
          className="flex flex-col gap-8"
          noValidate
        >
          <CheckoutAddressForm
            prefix="shippingAddress"
            legend="Shipping address"
            register={register}
            errors={errors}
          />

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              {...register("billingSameAsShipping")}
            />
            Billing address same as shipping
          </label>

          {!billingSameAsShipping && (
            <CheckoutAddressForm
              prefix="billingAddress"
              legend="Billing address"
              register={register}
              errors={errors}
            />
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="checkout-notes"
              className="text-sm font-medium text-foreground"
            >
              Order notes{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="checkout-notes"
              rows={3}
              maxLength={500}
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("notes")}
            />
            <span className="self-end text-xs text-muted-foreground">
              {notes.length}/500
            </span>
            {errors.notes && (
              <p role="alert" className="text-sm text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {isError && errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {isPending ? "Placing order…" : "Place order"}
          </button>
        </form>
      </section>

      <aside className="lg:col-span-1 lg:self-start">
        <CheckoutOrderSummary />
      </aside>
    </div>
  );
}
