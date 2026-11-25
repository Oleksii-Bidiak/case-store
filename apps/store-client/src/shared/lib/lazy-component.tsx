"use client";

import {
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
} from "react";
import { captureException } from "./monitoring";

export interface LazyComponent<P extends object> {
  /**
   * Renders the loaded component with the given props, or nothing while it
   * loads — and nothing if the load failed. Starts the load on mount.
   */
  Component: (props: P) => ReactElement | null;
  /**
   * Starts the load, or joins the one in flight. Never rejects: it resolves to
   * whether the code arrived. A failure is forgotten, so the next call tries
   * again, and is reported to monitoring once — a trigger hovered while the
   * chunk is unreachable must not flood it.
   * Call it on the trigger's intent and on every open; a host that opened on a
   * click takes the open back on `false`, or a later successful load would
   * pop the panel open on its own.
   */
  load: () => Promise<boolean>;
}

/**
 * A component whose code is fetched on demand (TASK-2524), for panels that are
 * closed on first paint (mini-cart, sign-in sheet, device picker).
 *
 * Not `next/dynamic` / `React.lazy`: those cache a failed import forever, so a
 * chunk that failed once (offline, or a tab left open across a deploy) throws
 * into the nearest error boundary — for the header, `global-error`, which
 * replaces the whole page — and stays dead. Here a failure renders nothing,
 * is reported, and the next `load()` retries.
 *
 * Pass a plain `import()` so the bundler splits the target into its own chunk:
 *   lazyComponent(() => import("./panel").then((m) => m.Panel))
 */
export function lazyComponent<P extends object>(
  loader: () => Promise<ComponentType<P>>,
): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<boolean> | null = null;
  let reported = false;
  const listeners = new Set<() => void>();

  const load = (): Promise<boolean> => {
    if (loaded) return Promise.resolve(true);
    pending ??= loader().then(
      (component) => {
        loaded = component;
        listeners.forEach((notify) => notify());
        return true;
      },
      (error: unknown) => {
        pending = null;
        if (!reported) {
          reported = true;
          captureException(error);
        }
        return false;
      },
    );
    return pending;
  };

  const subscribe = (notify: () => void) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  };
  const getSnapshot = () => loaded;
  const getServerSnapshot = () => null;

  function LazyComponentHost(props: P) {
    const Loaded = useSyncExternalStore(
      subscribe,
      getSnapshot,
      getServerSnapshot,
    );
    useEffect(() => {
      void load();
    }, []);
    return Loaded ? <Loaded {...props} /> : null;
  }

  return { Component: LazyComponentHost, load };
}
