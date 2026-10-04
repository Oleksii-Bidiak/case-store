/**
 * What the group form can tell about its positions WITHOUT asking the API
 * (wave 198, ProductGroupsProposal ГТ3–ГТ4, TASK-1084). Everything here reads
 * the positions the group detail already carries (`ProductSiblingEntity`):
 * their `attributes` are keyed by the axis name, which is exactly what the
 * storefront's variant switcher matches on.
 */

export interface GroupPosition {
  id: string;
  attributes: Record<string, unknown>;
  price: string;
  isActive: boolean;
}

export interface PositionProblems {
  /** Position id → the axes it has no value for. */
  missing: Map<string, string[]>;
  /** Positions whose full combination repeats another position's. */
  duplicates: Set<string>;
  /** Positions without a value + repeated combinations (one per repeat). */
  problemCount: number;
}

const valueOf = (position: GroupPosition, axis: string): string =>
  String(position.attributes?.[axis] ?? "").trim();

/** Comparison key: the shopper does not see case or padding as a difference. */
const normalize = (value: string) => value.trim().toLocaleLowerCase("uk");

/**
 * A position with no value for an axis cannot be picked on the site; two
 * positions with the same combination make one of them unreachable. Repeats
 * are only judged among positions that have every value.
 */
export function analyzePositions(
  axes: readonly string[],
  positions: readonly GroupPosition[],
): PositionProblems {
  const missing = new Map<string, string[]>();
  const duplicates = new Set<string>();
  const names = axes.map((axis) => axis.trim()).filter(Boolean);
  if (names.length === 0) return { missing, duplicates, problemCount: 0 };

  const byCombination = new Map<string, string[]>();
  for (const position of positions) {
    const absent = names.filter((axis) => !valueOf(position, axis));
    if (absent.length > 0) {
      missing.set(position.id, absent);
      continue;
    }
    const key = names
      .map((axis) => normalize(valueOf(position, axis)))
      .join("␟");
    byCombination.set(key, [...(byCombination.get(key) ?? []), position.id]);
  }

  let repeatedCombinations = 0;
  for (const ids of byCombination.values()) {
    if (ids.length < 2) continue;
    repeatedCombinations += 1;
    for (const id of ids) duplicates.add(id);
  }

  return {
    missing,
    duplicates,
    problemCount: missing.size + repeatedCombinations,
  };
}

/** The values an axis takes across the positions, first-seen order. */
export function axisValues(
  axis: string,
  positions: readonly GroupPosition[],
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const position of positions) {
    const value = valueOf(position, axis.trim());
    if (!value || seen.has(normalize(value))) continue;
    seen.add(normalize(value));
    values.push(value);
  }
  return values;
}

/** The characteristics the positions carry, with how many positions carry each. */
export function attributeUsage(
  positions: readonly GroupPosition[],
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const position of positions) {
    for (const [name, value] of Object.entries(position.attributes ?? {})) {
      if (!name.trim() || !String(value ?? "").trim()) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk"));
}

/** Lowest and highest position price, or `null` without positions. */
export function priceRange(
  positions: readonly Pick<GroupPosition, "price">[],
): { min: number; max: number } | null {
  const prices = positions
    .map((position) => Number(position.price))
    .filter((price) => Number.isFinite(price));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
