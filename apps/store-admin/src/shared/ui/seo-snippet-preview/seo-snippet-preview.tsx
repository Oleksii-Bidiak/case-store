import { dict } from "@/shared/config";
import {
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
  type SeoPreviewTier,
} from "@/shared/lib/seo";

const d = dict.seoSnippetPreview;

/** Hint copy under the mock, keyed by which tier resolved the title. */
const HINT_BY_TIER: Record<SeoPreviewTier, string> = {
  own: d.hintOwn,
  default: d.hintDefault,
  derived: d.hintDerived,
  empty: d.hintEmpty,
};

export interface SeoSnippetPreviewProps {
  /** Fully resolved, template-applied display title (resolveSeoPreviewTitle().text). */
  title: string;
  /** Which tier produced `title` — drives the hint line. */
  titleTier: SeoPreviewTier;
  /** Fully resolved description, or undefined when no tier yields usable text. */
  description?: string;
  descriptionTier: SeoPreviewTier;
  /** Green breadcrumb line, e.g. "mobilestore.ua › products › chohol-iphone". */
  url: string;
  /** Raw length of the entity's own metaTitle field (0 if blank) — counter only. */
  rawTitleLength: number;
  rawDescriptionLength: number;
}

/**
 * Purely presentational Google-SERP snippet mock (plan 130, TASK-268).
 *
 * Takes only pre-resolved primitives — no Orval hooks, no react-hook-form, no
 * truncation math (the resolver already truncated `title`/`description`). It
 * renders a title / green URL / grey description card, two advisory char
 * counters (`{typed}/{max}`, red past the limit), and a one-line hint explaining
 * which source the title came from. All copy flows through `dict`.
 */
export function SeoSnippetPreview({
  title,
  titleTier,
  description,
  // `descriptionTier` is part of the public prop contract but the single hint
  // line is keyed off the title tier (AC-B); it is intentionally not read here.
  url,
  rawTitleLength,
  rawDescriptionLength,
}: SeoSnippetPreviewProps) {
  const titleOver = rawTitleLength > SEO_TITLE_MAX;
  const descriptionOver = rawDescriptionLength > SEO_DESCRIPTION_MAX;

  return (
    <section
      aria-label={d.heading}
      data-testid="seo-snippet-preview"
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {d.heading}
      </p>

      <div className="flex flex-col gap-0.5">
        <p
          data-testid="seo-snippet-url"
          className="truncate text-xs text-success"
        >
          {url}
        </p>
        <p
          data-testid="seo-snippet-title"
          className={`truncate text-lg leading-snug ${
            title ? "text-primary" : "text-muted-foreground italic"
          }`}
        >
          {title || d.emptyTitle}
        </p>
        {description ? (
          <p
            data-testid="seo-snippet-description"
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span
          data-testid="seo-snippet-title-counter"
          aria-label={d.titleCounterAria(rawTitleLength, SEO_TITLE_MAX)}
          className={titleOver ? "text-destructive" : "text-muted-foreground"}
        >
          {d.counter(rawTitleLength, SEO_TITLE_MAX)}
        </span>
        <span
          data-testid="seo-snippet-description-counter"
          aria-label={d.descriptionCounterAria(
            rawDescriptionLength,
            SEO_DESCRIPTION_MAX,
          )}
          className={
            descriptionOver ? "text-destructive" : "text-muted-foreground"
          }
        >
          {d.counter(rawDescriptionLength, SEO_DESCRIPTION_MAX)}
        </span>
      </div>

      <p
        data-testid="seo-snippet-hint"
        className="text-xs text-muted-foreground"
      >
        {HINT_BY_TIER[titleTier]}
      </p>
    </section>
  );
}
