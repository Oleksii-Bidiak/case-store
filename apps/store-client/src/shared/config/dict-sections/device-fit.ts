// `dict.deviceFit` — copy for K2 V-контекст (TASK-1953), SД3.
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.

export const deviceFitDict = {} as const;
