"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Hand focus to the right place once a cart action has re-rendered the cart
 * (TASK-657). The «Прибрати недоступні» button the shopper just pressed
 * unmounts with the last withdrawn line, and a removed focused element leaves
 * focus on <body> — a keyboard or screen-reader user is thrown to the top.
 *
 * `arm()` before the action; the first commit where `ready` is true focuses
 * `primary` (or `fallback` when `primary` is not mounted). Arming BEFORE the
 * awaited action, not after it, matters: the refetch can commit the new cart
 * before the promise continuation runs, and an effect that already fired would
 * never fire again. `disarm()` after a failure, which leaves `ready` false.
 */
export function useFocusWhenReady(
  ready: boolean,
  primary: RefObject<HTMLElement | null>,
  fallback?: RefObject<HTMLElement | null>,
) {
  const armedRef = useRef(false);

  useEffect(() => {
    if (!ready || !armedRef.current) return;
    armedRef.current = false;
    (primary.current ?? fallback?.current)?.focus();
  }, [ready, primary, fallback]);

  return {
    arm: () => {
      armedRef.current = true;
    },
    disarm: () => {
      armedRef.current = false;
    },
  };
}
