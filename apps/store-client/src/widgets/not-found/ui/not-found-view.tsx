import Link from "next/link";
import { Home, Search } from "lucide-react";
import { dict, H1_CLASS } from "@/shared/config";
import { Button } from "@/shared/ui";

/** A root category the 404 offers as a shortcut (TASK-873). */
export interface NotFoundCategoryLink {
  name: string;
  slug: string;
}

/** How many category chips sit before «Акції» — the mockup's row of four. */
export const NOT_FOUND_CATEGORY_LIMIT = 3;

const PILL_BASE =
  "inline-flex h-[38px] items-center rounded-full border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * NotFoundView — the storefront 404 screen from the NotFound.dc.html design.
 *
 * Rendered inside the root layout (so the shared Header/Footer wrap it), it
 * offers three ways back into the store: a native GET search box that submits
 * to the real `/search` results page, primary/outline CTAs (home + catalog),
 * and a row of popular-section shortcuts. Everything here is static navigation,
 * so this stays a server component with no client JS.
 *
 * TASK-873 — the shortcuts are the store's real root categories, read by
 * `app/not-found.tsx`; they used to be «Смартфони / Ноутбуки / Аудіо», all
 * pointing at /products. Without a tree (API down) the row offers the category
 * hub instead, so it is never a row of guesses.
 */
export function NotFoundView({
  categories = [],
}: {
  categories?: readonly NotFoundCategoryLink[];
} = {}) {
  const d = dict.notFound;

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-[560px] text-center">
        <div
          className="mb-2 font-display text-8xl leading-none font-bold tracking-tighter text-transparent sm:text-9xl"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 50%, oklch(0.4 0.16 300)))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          {d.code}
        </div>

        <h1 className={`mb-3 ${H1_CLASS} text-foreground`}>{d.heading}</h1>
        <p className="mx-auto mb-7 max-w-[460px] text-[15.5px] leading-[1.6] text-muted-foreground">
          {d.body}
        </p>

        {/* Native GET search — works without JS, lands on the real /search page. */}
        <form
          action="/search"
          method="get"
          role="search"
          className="mx-auto mb-6 flex h-[52px] max-w-[420px] items-center overflow-hidden rounded-cta border-[1.5px] border-border bg-card"
        >
          <input
            name="q"
            type="text"
            aria-label={d.searchPlaceholder}
            placeholder={d.searchPlaceholder}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-[18px] text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {/* Neutral icon button, not filled (TASK-865): «На головну» below is
              the page's one primary action (design-system §1). */}
          <button
            type="submit"
            aria-label={d.searchSubmitAria}
            className="flex h-full w-14 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-cta px-6 text-base font-bold"
          >
            <Link href="/">
              <Home aria-hidden="true" />
              {d.home}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-cta px-6 text-base font-semibold"
          >
            <Link href="/products">{d.catalog}</Link>
          </Button>
        </div>

        <div className="mt-10 border-t border-border pt-7">
          <p className="mb-3.5 text-[13px] text-muted-foreground">
            {d.popularHeading}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {categories.length > 0 ? (
              categories.slice(0, NOT_FOUND_CATEGORY_LIMIT).map((category) => (
                <Link
                  key={category.slug}
                  href={`/categories/${category.slug}`}
                  className={`${PILL_BASE} border-border bg-card text-foreground hover:border-primary hover:text-primary`}
                >
                  {category.name}
                </Link>
              ))
            ) : (
              <Link
                href="/categories"
                className={`${PILL_BASE} border-border bg-card text-foreground hover:border-primary hover:text-primary`}
              >
                {d.allCategories}
              </Link>
            )}
            {/* Акції keeps the sale accent, mirroring the header promo link. */}
            <Link
              href="/promo"
              className={`${PILL_BASE} border-border bg-card text-sale hover:border-sale`}
            >
              {d.popular.promo}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
