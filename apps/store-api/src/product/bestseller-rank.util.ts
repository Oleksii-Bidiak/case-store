/**
 * Bestseller ranking helper (TASK-164).
 *
 * Pure, side-effect-free ordering used by the `sortBy=bestselling` product sort.
 * Kept separate from the repository so the ordering rule — the critical business
 * logic — is unit-testable without a database.
 */

/** A catalogue candidate to be ranked: its id plus the tie-break timestamp. */
export interface SalesRankCandidate {
  id: string;
  createdAt: Date;
}

/**
 * Order product ids by units sold, most sold first. `unitsSold` holds the
 * summed quantity per product across PAID orders; products absent from the map
 * are treated as zero sales and sink to the bottom (still ordered newest-first
 * among themselves) so the FULL catalogue stays browsable under this sort, not
 * just products that already have sales.
 *
 * Ties (equal sales, including the zero-sales tail) break by newest `createdAt`
 * first, giving a stable, deterministic order for pagination.
 */
export function rankProductIdsBySales(
  candidates: SalesRankCandidate[],
  unitsSold: Map<string, number>,
): string[] {
  return [...candidates]
    .sort((a, b) => {
      const soldA = unitsSold.get(a.id) ?? 0;
      const soldB = unitsSold.get(b.id) ?? 0;
      if (soldB !== soldA) {
        return soldB - soldA;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((candidate) => candidate.id);
}
