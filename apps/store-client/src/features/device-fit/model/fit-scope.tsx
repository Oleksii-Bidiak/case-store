"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Which saved devices a card mark answers for (Catalog mockup §2.3).
 *
 * - `active` — mode A, the default everywhere: «Підходить до / Не для
 *   {active device}».
 * - `all` — mode B, only while the catalogue filter «З урахуванням моїх
 *   пристроїв» is on in its «для всіх моїх» scope: «Підходить: {a}, {b}» /
 *   «Не для ваших пристроїв».
 *
 * A context, not a prop: the mark sits deep inside `ProductCard`'s action
 * slot, and only the listing that owns the filter state knows the scope.
 */
export type DeviceFitScope = "active" | "all";

const DeviceFitScopeContext = createContext<DeviceFitScope>("active");

export function DeviceFitScopeProvider({
  scope,
  children,
}: {
  scope: DeviceFitScope;
  children: ReactNode;
}) {
  return (
    <DeviceFitScopeContext.Provider value={scope}>
      {children}
    </DeviceFitScopeContext.Provider>
  );
}

export function useDeviceFitScope(): DeviceFitScope {
  return useContext(DeviceFitScopeContext);
}
