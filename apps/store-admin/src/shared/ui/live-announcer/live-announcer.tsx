"use client";

/**
 * The single source of truth for screen-reader announcements in the reorder UI
 * (plan 158 §3.2 / §7.3).
 *
 * TWO permanently-mounted, empty-on-mount `sr-only` regions:
 * - `role="status" aria-live="polite"`    → progress (pick up, move, commit, …)
 * - `role="alert"  aria-live="assertive"` → rejections only
 *
 * Both are `aria-atomic`, both use CLIP-based hiding (Tailwind's `sr-only`) and
 * are NEVER `display:none` — a `display:none` live region is not announced.
 * Query them by `data-testid`: `role="status"` is already used by
 * `shared/ui/skeleton.tsx` and `role="alert"` appears 150+ times in store-admin.
 *
 * dnd-kit's own a11y layer is disabled by `shared/ui/sortable-tree` (§3.2), so
 * these two are the ONLY live regions in the widget.
 *
 * TIMING (§7.3, exact):
 * - `event.repeat === false` → emit IMMEDIATELY (leading edge).
 * - `event.repeat === true`  → suppress the intermediate message and emit only
 *   the SETTLED one after a 150 ms idle.
 * A blanket trailing debounce would be wrong: it would delay every deliberate
 * keypress by 150 ms and force fake timers into every announcement assertion.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { cn } from "@/shared/lib";

/** Idle window used to collapse a held (auto-repeating) arrow key. */
export const ANNOUNCE_SETTLE_MS = 150;

export interface AnnounceOptions {
  /** Pass `event.repeat`. `true` ⇒ defer until the key settles. */
  repeat?: boolean;
}

export interface AnnouncerApi {
  announcePolite: (message: string, options?: AnnounceOptions) => void;
  announceAssertive: (message: string) => void;
}

const noop: AnnouncerApi = {
  announcePolite: () => {},
  announceAssertive: () => {},
};

const AnnouncerContext = createContext<AnnouncerApi>(noop);

/**
 * Returns `{ announcePolite, announceAssertive }`. Outside a `<LiveAnnouncer>`
 * both are no-ops, so a primitive can call them unconditionally.
 */
export function useAnnouncer(): AnnouncerApi {
  return useContext(AnnouncerContext);
}

export interface LiveAnnouncerProps {
  children: ReactNode;
  className?: string;
}

export function LiveAnnouncer({ children, className }: LiveAnnouncerProps) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  /**
   * Monotonic token. An immediate (non-repeat) announcement bumps it, which
   * invalidates any still-pending settled message from a previous key repeat —
   * `useDebouncedCallback` has no `cancel()`, so the token IS the cancellation.
   */
  const tokenRef = useRef(0);

  const emitSettled = useDebouncedCallback((message: string, token: number) => {
    if (token !== tokenRef.current) return;
    setPolite(message);
  }, ANNOUNCE_SETTLE_MS);

  const announcePolite = useCallback(
    (message: string, options?: AnnounceOptions) => {
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      if (options?.repeat) {
        emitSettled(message, token);
        return;
      }
      setPolite(message);
    },
    [emitSettled],
  );

  const announceAssertive = useCallback((message: string) => {
    tokenRef.current += 1;
    setAssertive(message);
  }, []);

  const api = useMemo<AnnouncerApi>(
    () => ({ announcePolite, announceAssertive }),
    [announcePolite, announceAssertive],
  );

  return (
    <AnnouncerContext.Provider value={api}>
      <div
        className={cn("sr-only", className)}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="tree-live-polite"
      >
        {polite}
      </div>
      <div
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="tree-live-assertive"
      >
        {assertive}
      </div>
      {children}
    </AnnouncerContext.Provider>
  );
}
