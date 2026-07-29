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

/** Everything the checklist needs to judge a product, in its SAVED state. */
export interface ReadinessInput {
  name: string;
  categoryId: string;
  /** Decimal string off the API (never a float). */
  price: string;
  stock: number;
  description?: string | null;
  imageCount: number;
  specCount: number;
  compatCount: number;
}

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
 * Deliberately judges the SAVED product rather than the form's current values:
 * publishing is a separate action from saving, and a checklist that went green
 * on unsaved text would be lying about what visitors are about to see.
 *
 * Pure function — no hooks, no API. Unit-tested.
 */
export function buildReadinessChecks(input: ReadinessInput): ReadinessCheck[] {
  const c = dict.productPublish.checks;
  return [
    {
      key: "name",
      label: c.name,
      done: input.name.trim().length > 0,
      blocking: true,
    },
    {
      key: "category",
      label: c.category,
      done: input.categoryId.trim().length > 0,
      blocking: true,
    },
    {
      key: "price",
      label: c.price,
      done: Number(input.price) > 0,
      blocking: true,
    },
    {
      key: "photo",
      label: c.photo,
      done: input.imageCount > 0,
      blocking: true,
    },
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
