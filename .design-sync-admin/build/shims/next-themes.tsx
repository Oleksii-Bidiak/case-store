// design-sync shim for `next-themes` — the Toaster reads useTheme(); outside
// Next there is no theme provider, so resolve to a static light theme.
import * as React from "react";

export function useTheme() {
  return {
    theme: "light" as const,
    setTheme: () => {},
    resolvedTheme: "light" as const,
    systemTheme: "light" as const,
    themes: ["light", "dark"],
    forcedTheme: undefined as string | undefined,
  };
}

export function ThemeProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
