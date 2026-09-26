/**
 * Durations as the environment writes them — `15m`, `1h`, `7d` (TASK-790, TASK-824).
 *
 * ONE implementation for every `*_EXPIRATION` variable. There used to be two
 * near-verbatim copies (AuthService and EmailVerificationService), each with a
 * DIFFERENT silent fallback for a value it could not read — seven days in one,
 * twenty-four hours in the other. A silent fallback is the whole defect:
 * `PASSWORD_RESET_TOKEN_EXPIRATION=60`, meant as "an hour", produced a
 * single-use link that lived for a week, and nothing anywhere said so.
 *
 * So nothing here falls back. `env.validation.ts` refuses such a value at boot
 * with {@link DURATION_PATTERN}, and the parser throws on it as well — a reader
 * that somehow gets past validation (a test harness, a future caller with a
 * literal) fails loudly instead of guessing.
 */

/**
 * `<whole number><unit>`, unit one of s/m/h/d. The single source for both the
 * boot-time validator and the parser, so the two can never disagree about what
 * is a duration.
 */
export const DURATION_PATTERN = /^(\d+)([smhd])$/;

type DurationUnit = 's' | 'm' | 'h' | 'd';

const UNIT_MS: Record<DurationUnit, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** [one, few, many] — the three Ukrainian plural forms of each unit. */
const UNIT_FORMS: Record<DurationUnit, [string, string, string]> = {
  s: ['секунду', 'секунди', 'секунд'],
  m: ['хвилину', 'хвилини', 'хвилин'],
  h: ['годину', 'години', 'годин'],
  d: ['день', 'дні', 'днів'],
};

function parse(value: string): { amount: number; unit: DurationUnit } {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}": expected a whole number followed by s, m, h or d ` +
        '(e.g. "15m", "1h", "7d")',
    );
  }

  return { amount: parseInt(match[1], 10), unit: match[2] as DurationUnit };
}

/**
 * `"7d"` → `604800000`.
 *
 * @throws Error for anything that is not `<integer><s|m|h|d>` — never a default.
 */
export function parseDurationToMs(value: string): number {
  const { amount, unit } = parse(value);
  return amount * UNIT_MS[unit];
}

/**
 * Pick the Ukrainian plural form for a count: 1 день · 2 дні · 5 днів ·
 * 11 днів · 21 день · 22 дні.
 */
export function pluralizeUk(count: number, [one, few, many]: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * `"1h"` → `"1 годину"`, `"24h"` → `"24 години"` — the lifetime as the email
 * copy says it ("посилання діє …").
 *
 * The accusative singular (`годину`, `хвилину`) is deliberate: the phrase it
 * fills is "діє 1 годину", not "1 година".
 *
 * @throws Error for anything that is not `<integer><s|m|h|d>` — never echoes the
 *   raw string into a customer's inbox.
 */
export function humanizeDuration(value: string): string {
  const { amount, unit } = parse(value);
  return `${amount} ${pluralizeUk(amount, UNIT_FORMS[unit])}`;
}
