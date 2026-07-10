import Link from "next/link";
import { Home, Search } from "lucide-react";
import { dict } from "@/shared/config";

const PILL_BASE =
  "inline-flex h-[38px] items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * NotFoundView — the storefront 404 screen from the NotFound.dc.html design.
 *
 * Rendered inside the root layout (so the shared Header/Footer wrap it), it
 * offers three ways back into the store: a native GET search box that submits
 * to the real `/search` results page, primary/secondary CTAs (home + catalog),
 * and a row of popular-section shortcuts. Everything here is static navigation,
 * so this stays a server component with no client JS.
 */
export function NotFoundView() {
  const d = dict.notFound;

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-[560px] text-center">
        <div
          className="mb-2 font-display text-[110px] leading-none font-bold tracking-[-0.04em] text-transparent sm:text-[140px]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 50%, oklch(0.4 0.16 300)))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          {d.code}
        </div>

        <h1 className="mb-3 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
          {d.heading}
        </h1>
        <p className="mx-auto mb-7 max-w-[460px] text-[15.5px] leading-[1.6] text-muted-foreground">
          {d.body}
        </p>

        {/* Native GET search — works without JS, lands on the real /search page. */}
        <form
          action="/search"
          method="get"
          role="search"
          className="mx-auto mb-6 flex h-[52px] max-w-[420px] items-center overflow-hidden rounded-[13px] border-[1.5px] border-border bg-card"
        >
          <input
            name="q"
            type="text"
            aria-label={d.searchPlaceholder}
            placeholder={d.searchPlaceholder}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-[18px] text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={d.searchSubmitAria}
            className="flex h-full w-14 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="size-[18px]" aria-hidden="true" />
            {d.home}
          </Link>
          <Link
            href="/products"
            className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-border px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {d.catalog}
          </Link>
        </div>

        <div className="mt-10 border-t border-border pt-7">
          <p className="mb-3.5 text-[13px] text-muted-foreground">
            {d.popularHeading}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link
              href="/products"
              className={`${PILL_BASE} border-border bg-card text-foreground hover:border-primary hover:text-primary`}
            >
              {d.popular.smartphones}
            </Link>
            <Link
              href="/products"
              className={`${PILL_BASE} border-border bg-card text-foreground hover:border-primary hover:text-primary`}
            >
              {d.popular.laptops}
            </Link>
            <Link
              href="/products"
              className={`${PILL_BASE} border-border bg-card text-foreground hover:border-primary hover:text-primary`}
            >
              {d.popular.audio}
            </Link>
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
