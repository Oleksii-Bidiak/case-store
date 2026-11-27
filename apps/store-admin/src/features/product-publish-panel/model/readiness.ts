import { PublishBlocker } from "@/shared/api";
import { dict } from "@/shared/config";

/** One line of the publish readiness checklist. */
export interface ReadinessCheck {
  /** Stable key — also the React list key and the test hook. */
  key: string;
  label: string;
  /** Whether the requirement is satisfied right now. */
  done: boolean;
  /**
   * A failed BLOCKING check keeps the publish button disabled; a failed
   * advisory one is only a nudge. The split is about what makes a listing
   * broken versus merely thin: a product with no photo or no price is a
   * defective shop page, while one with no device compatibility is simply a
   * product nobody filtered for yet.
   */
  blocking: boolean;
}

/**
 * What the checklist judges LOCALLY, in the product's SAVED state — the
 * advisory checks only. The four blocking ones (name, category, price, photo)
 * come from the server's `publish-state` (TASK-2573): the API refuses to show
 * an unready product, so that is the one place the rule lives.
 */
export interface ReadinessInput {
  stock: number;
  description?: string | null;
  specCount: number;
  compatCount: number;
}

/**
 * The blocking checks, in the order the server reports its blockers — read from
 * the generated enum, so a blocker the API adds lands in the checklist (and
 * fails the type check until it has a label) instead of being silently dropped.
 */
const BLOCKING_KEYS: readonly PublishBlocker[] = Object.values(PublishBlocker);

/**
 * Rich text is "filled in" only when it has text — Tiptap serializes a cleared
 * document as `<p></p>`, which would otherwise read as a written description.
 */
function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.replace(/<[^>]*>/g, "").trim());
}

/**
 * Build the publish readiness checklist for a product (TASK-361).
 *
 * The BLOCKING checks mirror `blockers` from `GET /products/:id/publish-state`
 * (TASK-2573): a check is done when the server does not list it. They used to
 * be judged here, which let the panel and the API disagree about what may go on
 * sale. The advisory checks stay local — they never block, so the server has no
 * opinion on them.
 *
 * Both halves judge the SAVED product rather than the form's current values:
 * publishing is a separate action from saving, and a checklist that went green
 * on unsaved text would be lying about what visitors are about to see.
 *
 * Pure function — no hooks, no API. Unit-tested.
 */
export function buildReadinessChecks(
  input: ReadinessInput,
  blockers: readonly PublishBlocker[],
): ReadinessCheck[] {
  const c = dict.productPublish.checks;
  return [
    ...BLOCKING_KEYS.map((key) => ({
      key,
      label: c[key],
      done: !blockers.includes(key),
      blocking: true,
    })),
    {
      key: "description",
      label: c.description,
      done: hasText(input.description),
      blocking: false,
    },
    { key: "stock", label: c.stock, done: input.stock > 0, blocking: false },
    {
      key: "specs",
      label: c.specs,
      done: input.specCount > 0,
      blocking: false,
    },
    {
      key: "compat",
      label: c.compat,
      done: input.compatCount > 0,
      blocking: false,
    },
  ];
}

/** Are all BLOCKING checks satisfied — i.e. may this product be published? */
export function canPublish(checks: ReadinessCheck[]): boolean {
  return checks.every((check) => !check.blocking || check.done);
}

/**
 * The product-form section a check is fixed in (wave 198, ProductFormProposal
 * Ф1) — keys are the form's section ids, so the page can paint a «не
 * заповнено» dot next to the section that needs work.
 */
export const READINESS_SECTION: Record<string, string> = {
  name: "main",
  category: "main",
  price: "price",
  stock: "price",
  photo: "photos",
  description: "description",
  specs: "specs",
  compat: "compat",
};

/** Section ids with at least one unmet check, each once, in check order. */
export function missingSections(checks: ReadinessCheck[]): string[] {
  const out: string[] = [];
  for (const check of checks) {
    const section = READINESS_SECTION[check.key];
    if (!check.done && section && !out.includes(section)) out.push(section);
  }
  return out;
}
