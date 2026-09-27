"use client";

import { useCallback, useState } from "react";

export interface EditLockToken {
  /** The optimistic-lock token to send with the save. */
  token: string;
  /**
   * Hold `next` as the token from now on — after a save (the server's new
   * `updatedAt`) or after a conflict the operator has been told about (the
   * refetched `updatedAt`). `undefined` lets go: the next dirty render captures
   * whatever the entity carries then.
   */
  rebase: (next: string | undefined) => void;
}

/**
 * The optimistic-lock token an edit form should send (TASK-629).
 *
 * An edit form that writes `expectedUpdatedAt: entity.updatedAt` from the latest
 * render is only a lock while the entity does NOT refetch under it. Once the
 * page polls, `values` + `keepDirtyValues` (forms.md Rule 2a) keep the half-typed
 * text while the entity — and its `updatedAt` — move on, so a save sends a
 * colleague's token with the operator's text: the server accepts it and the
 * colleague's change is overwritten without a 409.
 *
 * So the token is CAPTURED when the form first becomes dirty — the version the
 * operator started editing — and held while it stays dirty. A clean form sends
 * the current one (there is nothing of the operator's to protect). The capture
 * is React's "adjusting state during render" idiom (forms.md Rule 1a), so the
 * render that first sees `isDirty` already returns the right token.
 *
 * With RHF, pass "some field is in `dirtyFields`", NOT `formState.isDirty`: a
 * `values`-driven reset with `keepDirtyValues` keeps the typed text and the
 * `dirtyFields`, but reports `isDirty: false` for a render until RHF's own
 * effect recomputes it — long enough to let go of the token. And an explicit
 * `reset()` meant to drop the dirty flags must pass `keepDirtyValues: false`,
 * or the form-level reset option keeps them (and the token) alive.
 *
 * Client-only; import directly (`@/shared/lib/use-edit-lock-token`), like
 * `use-now`.
 */
export function useEditLockToken(
  isDirty: boolean,
  current: string,
): EditLockToken {
  const [held, setHeld] = useState<string | null>(null);

  if (isDirty && held === null) {
    setHeld(current);
  } else if (!isDirty && held !== null) {
    setHeld(null);
  }

  const rebase = useCallback((next: string | undefined) => {
    setHeld(next ?? null);
  }, []);

  return { token: isDirty ? (held ?? current) : current, rebase };
}
