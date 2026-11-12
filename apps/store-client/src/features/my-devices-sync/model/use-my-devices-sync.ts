"use client";

// «Мої пристрої» ↔ the account (TASK-1959).
//
// A guest's list lives in localStorage only — the server never sees it, so the
// cookie-based merge of cart and wishlist (auth/guest-state-merge.service) does
// not cover it. Instead the storefront pushes it in once a session appears,
// whichever of the seven sign-in paths produced that session:
//   - guest → user, no owner marker, something saved locally → POST merge;
//   - the marker is this user (restored session)              → GET, replace local;
//   - the marker is ANOTHER user (shared computer)            → discard local, GET;
//   - nothing saved locally                                   → GET;
//   - signed out / no session but a mirror left behind        → clear list, settings, marker;
//   - the shopper's own edits while signed in                 → debounced PUT of the full state;
//   - window focus, nothing pending                           → GET (another browser's changes).
// localStorage stays the mirror, so every synchronous read keeps working.

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";
import { useAuth } from "@/entities/session";
import {
  hasLocalMyDevicesState,
  readMyDevices,
  readMyDevicesOwner,
  readMyDevicesSettings,
  replaceMyDevices,
  replaceMyDevicesSettings,
  subscribeMyDevicesEdits,
  writeMyDevicesOwner,
} from "@/entities/my-devices";
import type { MyDevicesStateEntity } from "@/shared/api/generated/models";
import {
  getMyDevices,
  mergeMyDevices,
  replaceMyDevices as putMyDevices,
} from "@/shared/api/generated/my-devices/my-devices";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import {
  toAccountPayload,
  toLocalDevices,
  toLocalSettings,
} from "./account-state";

/** Quiet period after the last local edit before the account is updated. */
export const MY_DEVICES_PUSH_DELAY_MS = 800;

/** Mutable sync bookkeeping, one per mounted sync. */
interface SyncState {
  /** The user the sync currently acts for (`null` = guest). */
  userId: string | null;
  /** The user whose start (merge / GET) already ran. */
  startedFor: string | null;
  /** The user whose account the local copy mirrors — edits are PUT only then. */
  syncedFor: string | null;
  /** Bumped by every local edit: a response older than an edit is not applied. */
  editSeq: number;
  /** A PUT is scheduled (debounced) but not yet sent. */
  pending: boolean;
  /** PUTs on the wire. */
  inFlight: number;
}

function clearLocalMirror(): void {
  replaceMyDevices([]);
  replaceMyDevicesSettings(null);
  writeMyDevicesOwner(null);
}

function localPayload() {
  return toAccountPayload(readMyDevices(), readMyDevicesSettings());
}

function report(error: unknown, action: string): void {
  Sentry.captureException(error, {
    tags: { feature: "my-devices-sync", action },
  });
}

/**
 * Apply the account state locally — unless the user changed meanwhile, or
 * (for a non-forced apply) a local edit happened after the request was sent:
 * that edit is newer and its own PUT is on the way.
 */
function apply(
  s: SyncState,
  userId: string,
  state: MyDevicesStateEntity,
  seqAtSend: number | null,
): void {
  if (s.userId !== userId) return;
  if (seqAtSend !== null && s.editSeq !== seqAtSend) return;
  replaceMyDevices(toLocalDevices(state.devices));
  replaceMyDevicesSettings(toLocalSettings(state.settings));
  writeMyDevicesOwner(userId);
  s.syncedFor = userId;
}

async function pull(s: SyncState, userId: string): Promise<void> {
  const seq = s.editSeq;
  try {
    const res = await getMyDevices();
    apply(s, userId, res.data, seq);
  } catch (error) {
    // The local copy stays; the next GET (focus, reload) realigns it.
    report(error, "get");
  }
}

async function start(s: SyncState, userId: string): Promise<void> {
  const owner = readMyDevicesOwner();
  if (owner === userId) {
    // Our own mirror: edits may be pushed right away, the GET refreshes it.
    s.syncedFor = userId;
    await pull(s, userId);
    return;
  }
  // Someone else's mirror is never merged into this account.
  if (owner !== null) clearLocalMirror();
  const merge = hasLocalMyDevicesState();
  try {
    const res = merge
      ? await mergeMyDevices(localPayload())
      : await getMyDevices();
    apply(s, userId, res.data, null);
  } catch (error) {
    // Nothing is lost: without a marker the next session start merges again.
    report(error, merge ? "merge" : "get");
  }
}

export function useMyDevicesSync(): void {
  const { userId, isInitializing } = useAuth();
  const ref = useRef<SyncState>({
    userId: null,
    startedFor: null,
    syncedFor: null,
    editSeq: 0,
    pending: false,
    inFlight: 0,
  });

  const push = useDebouncedCallback(() => {
    const s = ref.current;
    s.pending = false;
    const uid = s.userId;
    if (!uid || s.syncedFor !== uid) return;
    const seq = s.editSeq;
    s.inFlight += 1;
    putMyDevices(localPayload())
      // The server may have dropped a withdrawn model — mirror what it kept.
      .then((res) => apply(s, uid, res.data, seq))
      .catch((error: unknown) => report(error, "replace"))
      .finally(() => {
        s.inFlight -= 1;
      });
  }, MY_DEVICES_PUSH_DELAY_MS);

  // Session transitions.
  useEffect(() => {
    if (isInitializing) return;
    const s = ref.current;
    s.userId = userId;
    if (userId === null) {
      push.cancel();
      s.pending = false;
      s.startedFor = null;
      s.syncedFor = null;
      // Signed out, or a page load whose session is gone: the mirror belongs
      // to an account that is not here — a shared computer must not keep it.
      if (readMyDevicesOwner() !== null) clearLocalMirror();
      return;
    }
    if (s.startedFor === userId) return;
    s.startedFor = userId;
    s.syncedFor = null;
    void start(s, userId);
  }, [userId, isInitializing, push]);

  // The shopper's own edits → debounced PUT.
  useEffect(
    () =>
      subscribeMyDevicesEdits(() => {
        const s = ref.current;
        s.editSeq += 1;
        if (!s.userId || s.syncedFor !== s.userId) return;
        s.pending = true;
        push();
      }),
    [push],
  );

  // Back to the tab → pick up changes made in another browser.
  useEffect(() => {
    const onFocus = () => {
      const s = ref.current;
      const uid = s.userId;
      if (!uid || s.syncedFor !== uid || s.pending || s.inFlight > 0) return;
      void pull(s, uid);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
}
