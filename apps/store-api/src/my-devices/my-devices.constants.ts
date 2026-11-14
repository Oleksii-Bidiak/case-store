/**
 * Upper bound on one account's «Мої пристрої» (TASK-1959). Not a product limit —
 * the storefront has none — but a defensive API bound: a request body, and the
 * list a merge produces, never exceed it.
 */
export const MAX_MY_DEVICES = 100;

/** Same cap as the storefront's `MAX_DEVICE_LABEL_LENGTH` and the column. */
export const MAX_DEVICE_LABEL_LENGTH = 30;

/** The settings an account reads before it has ever saved any. */
export const DEFAULT_MY_DEVICES_SETTINGS = Object.freeze({
  compatOnly: true,
  compatScope: 'active' as const,
});
