"use client";

import { useSyncExternalStore } from "react";

/**
 * A discount the customer has applied to their cart, as returned by the
 * preview endpoint. Persisted client-side only — the server re-validates and
 * persists authoritatively at order creation (the code is sent as
 * `discountCode` in CreateOrderDto). MVP supports a single order-level code.
 */
export interface AppliedDiscount {
  code: string;
  /** Discount amount as a decimal string ("XX.YY"). */
  amount: string;
  /** Cart subtotal after the discount, as a decimal string. */
  newTotal: string;
}

const STORAGE_KEY = "appliedDiscount";

/**
 * Tiny external store for the applied promo code, shared across the cart and
 * checkout views via `useSyncExternalStore`. Backed by `sessionStorage` so the
 * code survives a cart→checkout navigation but never outlives the tab session
 * (a stale code is harmless — the server recomputes — but we avoid leaking it
 * across sessions). SSR-safe: reads return null on the server.
 */
let current: AppliedDiscount | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    current = raw ? (JSON.parse(raw) as AppliedDiscount) : null;
  } catch {
    current = null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppliedDiscount | null {
  hydrate();
  return current;
}

function getServerSnapshot(): AppliedDiscount | null {
  return null;
}

/** Set (or replace) the applied discount and notify subscribers. */
export function setAppliedDiscount(discount: AppliedDiscount): void {
  current = discount;
  hydrated = true;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(discount));
    } catch {
      /* storage full / unavailable — in-memory value still applies */
    }
  }
  emit();
}

/** Clear any applied discount and notify subscribers. */
export function clearAppliedDiscount(): void {
  current = null;
  hydrated = true;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  emit();
}

/**
 * Read the applied discount reactively. Returns null when no code is applied.
 */
export function useAppliedDiscount(): AppliedDiscount | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
