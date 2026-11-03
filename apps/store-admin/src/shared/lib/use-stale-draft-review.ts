"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A flat form of text fields — what both order forms on the card are. */
export type DraftValues = Record<string, string>;

/** The conflict under review: what the operator started from, and what won. */
export interface StaleDraftConflict<T extends DraftValues> {
  /** The values the operator started editing (the version the lock held). */
  base: T;
  /** The colleague's saved version, mapped to form values. */
  fresh: T;
  /** That version's lock token (`updatedAt`). */
  version: string;
}

export interface StaleDraftReview<T extends DraftValues> {
  /** The open review, or `null` when there is nothing to decide. */
  review: StaleDraftConflict<T> | null;
  /**
   * Fields where BOTH sides moved away from the base, to different values —
   * the ones the operator has to look at. Derived from the live draft, so a
   * field drops out once the operator types the colleague's value themselves.
   */
  diverging: Array<keyof T & string>;
  /** A review is open: the save must wait for the operator's decision. */
  pending: boolean;
  /**
   * Start a review after a 409. Fields only the colleague changed are written
   * into the form at once (`apply`) — there is nothing of the operator's there
   * to protect. The lock token is NOT moved.
   */
  open: (conflict: StaleDraftConflict<T> & { draft: T }) => void;
  /** Replace the draft of one field with the colleague's value. */
  takeTheirs: (field: keyof T & string) => void;
  /**
   * The operator has seen the colleague's version: rebase the lock onto it so
   * the next save is judged against what they reviewed, and close.
   */
  acknowledge: () => void;
  /**
   * Drop the review without moving the token (the edit was abandoned), and
   * disown any version still on its way. Stable across renders.
   */
  close: () => void;
  /**
   * The 409 has landed and the colleague's version is being fetched. The
   * handle's `open` / `fail` are ignored if, by the time the fetch settles, the
   * review was closed, a newer attempt began or the form unmounted — a late
   * answer must not open a panel over an edit that is no longer this one.
   */
  begin: () => PendingStaleDraft<T>;
  /** The colleague's version could not be fetched after the 409. */
  fetchFailed: boolean;
}

export interface PendingStaleDraft<T extends DraftValues> {
  open: StaleDraftReview<T>["open"];
  fail: () => void;
}

interface Options<T extends DraftValues> {
  /** The form's current values (RHF `useWatch`). */
  draft: T;
  /** Write one value into the form as pristine (RHF `resetField`). */
  apply: (field: keyof T & string, value: string) => void;
  /** Move the lock token — `useEditLockToken().rebase`. */
  rebase: (version: string, fresh: T) => void;
}

function changed<T extends DraftValues>(
  field: keyof T & string,
  from: T,
  to: T,
): boolean {
  return (from[field] ?? "") !== (to[field] ?? "");
}

/**
 * What an edit form does after its save was refused as stale (TASK-1972).
 *
 * The lock (`useEditLockToken`) makes the server answer 409 instead of letting
 * an operator overwrite a colleague's save — but that only helps if the operator
 * then SEES the colleague's version. The forms used to rebase the token onto the
 * refetched version inside `onError`, before anything was shown, while
 * `keepDirtyValues` kept the draft over the colleague's text: the second
 * «Зберегти» went through and the colleague's change was lost one click later.
 *
 * So a 409 opens a review instead. Every field the operator and the colleague
 * both changed, differently, is listed with the colleague's value; the operator
 * either takes it (`takeTheirs`) or says they have looked and keep their draft
 * (`acknowledge`), which is the only thing that moves the token. Until then
 * `pending` is true and the caller keeps «Зберегти» from sending anything.
 *
 * When the colleague changed only fields the operator never touched, those are
 * refreshed on `open` and nothing diverges — but the token still moves only on
 * the operator's acknowledgement, never silently.
 *
 * Client-only; import directly (`@/shared/lib/use-stale-draft-review`), like
 * `use-edit-lock-token`.
 */
export function useStaleDraftReview<T extends DraftValues>({
  draft,
  apply,
  rebase,
}: Options<T>): StaleDraftReview<T> {
  const [review, setReview] = useState<StaleDraftConflict<T> | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  // Which fetch may still answer: bumped by every `begin`, `close` and unmount.
  const attempt = useRef(0);

  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const diverging = review
    ? (Object.keys(review.fresh) as Array<keyof T & string>).filter(
        (field) =>
          changed(field, review.base, draft) &&
          changed(field, review.base, review.fresh) &&
          changed(field, draft, review.fresh),
      )
    : [];

  const open: StaleDraftReview<T>["open"] = ({
    base,
    draft: draftNow,
    fresh,
    version,
  }) => {
    for (const field of Object.keys(fresh) as Array<keyof T & string>) {
      if (!changed(field, base, draftNow) && changed(field, base, fresh)) {
        apply(field, fresh[field]);
      }
    }
    setReview({ base, fresh, version });
  };

  const takeTheirs = (field: keyof T & string) => {
    if (review) apply(field, review.fresh[field]);
  };

  const acknowledge = () => {
    if (!review) return;
    rebase(review.version, review.fresh);
    setReview(null);
  };

  const close = useCallback(() => {
    attempt.current += 1;
    setReview(null);
    setFetchFailed(false);
  }, []);

  const begin = (): PendingStaleDraft<T> => {
    attempt.current += 1;
    const mine = attempt.current;
    setFetchFailed(false);
    return {
      open: (conflict) => {
        if (attempt.current === mine) open(conflict);
      },
      fail: () => {
        if (attempt.current === mine) setFetchFailed(true);
      },
    };
  };

  return {
    review,
    diverging,
    pending: review !== null,
    open,
    takeTheirs,
    acknowledge,
    close,
    begin,
    fetchFailed,
  };
}
