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
   * Starts the load, or joins the one in flight. Never rejects: a failure is
   * reported to monitoring and forgotten, so the next call tries again.
   * Call it on the trigger's intent and on every open.
   */
  load: () => Promise<void>;
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
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const load = (): Promise<void> => {
    if (loaded) return Promise.resolve();
    pending ??= loader().then(
      (component) => {
        loaded = component;
        listeners.forEach((notify) => notify());
      },
      (error: unknown) => {
        pending = null;
        captureException(error);
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
