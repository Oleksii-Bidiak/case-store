"use client";

import { useCallback, useState } from "react";

/** A row of the plan, as far as the decision state cares. */
export interface DecidableRow {
  sourceSku: string;
  changes: Array<{ field: string; conflict: boolean }>;
}

/**
 * Tracks what the operator has UNTICKED (TASK-360).
 *
 * Modelled as exclusions rather than inclusions because the owner's rule is that
 * the supplier file wins by default: everything starts ticked, so the state only
 * has to remember the exceptions. On a 1300-row plan that is the difference
 * between a payload of a few hundred bytes and one of a few hundred kilobytes —
 * and it means a plan rendered with rows collapsed still submits correctly,
 * since an unrendered row has no state to lose.
 */
export function useImportDecisions() {
  const [excludedSkus, setExcludedSkus] = useState<Set<string>>(new Set());
  const [excludedFields, setExcludedFields] = useState<
    Map<string, Set<string>>
  >(new Map());

  const isRowExcluded = useCallback(
    (sku: string) => excludedSkus.has(sku),
    [excludedSkus],
  );

  const isFieldExcluded = useCallback(
    (sku: string, field: string) =>
      excludedSkus.has(sku) || (excludedFields.get(sku)?.has(field) ?? false),
    [excludedSkus, excludedFields],
  );

  const toggleRow = useCallback((sku: string) => {
    setExcludedSkus((previous) => {
      const next = new Set(previous);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  }, []);

  const toggleField = useCallback((sku: string, field: string) => {
    setExcludedFields((previous) => {
      const next = new Map(previous);
      const fields = new Set(next.get(sku) ?? []);
      if (fields.has(field)) {
        fields.delete(field);
      } else {
        fields.add(field);
      }
      if (fields.size === 0) {
        next.delete(sku);
      } else {
        next.set(sku, fields);
      }
      return next;
    });
  }, []);

  /**
   * Untick every change that would overwrite a hand edit. The one bulk action
   * worth having: conflicts are exactly the changes an operator might regret,
   * and hunting for them across 1300 rows is not review, it is archaeology.
   */
  const excludeAllConflicts = useCallback((rows: DecidableRow[]) => {
    setExcludedFields(() => {
      const next = new Map<string, Set<string>>();
      for (const row of rows) {
        const conflicting = row.changes
          .filter((change) => change.conflict)
          .map((change) => change.field);
        if (conflicting.length > 0) {
          next.set(row.sourceSku, new Set(conflicting));
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setExcludedSkus(new Set());
    setExcludedFields(new Map());
  }, []);

  /** The payload shape the apply endpoint expects. */
  const toPayload = useCallback(
    () => ({
      excludedSkus: [...excludedSkus],
      excludedFields: Object.fromEntries(
        [...excludedFields.entries()].map(([sku, fields]) => [
          sku,
          [...fields],
        ]),
      ),
    }),
    [excludedSkus, excludedFields],
  );

  return {
    isRowExcluded,
    isFieldExcluded,
    toggleRow,
    toggleField,
    excludeAllConflicts,
    reset,
    toPayload,
    excludedCount: excludedSkus.size,
  };
}
