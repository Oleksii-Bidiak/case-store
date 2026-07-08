// Human-readable duration formatter for the admin panel (TASK-251).
//
// Input is a plain number of hours (as returned by the dashboard
// `operations.averageProcessingHoursLast30Days` metric). Under two days it reads
// as a plain hour count ("36 год"); at two days and beyond it breaks into days +
// hours ("2 дн 2 год"). Mirrors `formatPercent.ts`'s defensive non-finite
// fallback (stringify the raw input).

/**
 * Format a number of hours as a Ukrainian duration string:
 *   0    → "0 год"
 *   36   → "36 год"
 *   50   → "2 дн 2 год"
 * A non-finite input falls back to `String(value)`.
 */
export function formatDurationHours(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const totalHours = Math.round(value);
  if (totalHours < 48) {
    return `${totalHours} год`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} дн ${hours} год`;
}
