import Link from "next/link";

/**
 * HeroBanner — static, server-rendered hero section for the homepage.
 * No data fetching or interactivity, so it stays a Server Component.
 */
export function HeroBanner() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="bg-primary text-primary-foreground"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 py-16 sm:py-24">
        <h1
          id="hero-heading"
          className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl"
        >
          Premium mobile accessories, delivered fast
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          Cases, chargers, screen protectors and more — everything your phone
          needs, all in one place.
        </p>
        <Link
          href="/products"
          className="mt-2 inline-flex items-center rounded-lg bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          Shop Now
        </Link>
      </div>
    </section>
  );
}
