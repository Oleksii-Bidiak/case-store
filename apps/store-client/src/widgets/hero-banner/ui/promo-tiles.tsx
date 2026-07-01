import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";

type Accent = "sale" | "primary" | "success";

// Maps each tile's accent to token-based styles + the shared Badge variant.
// Badge's `default` variant is the primary colour, so it doubles as the
// "primary" pill — no bespoke badge component needed.
const ACCENTS: Record<
  Accent,
  { surface: string; badge: "sale" | "success" | "default"; cta: string }
> = {
  sale: {
    surface: "bg-sale/10 border-sale/25",
    badge: "sale",
    cta: "text-sale",
  },
  primary: {
    surface: "bg-primary/10 border-primary/25",
    badge: "default",
    cta: "text-primary",
  },
  success: {
    surface: "bg-success/10 border-success/25",
    badge: "success",
    cta: "text-success",
  },
};

/**
 * PromoTiles — three static promo cards under the hero (sale / instalments /
 * trade-in). Presentational Server Component; copy comes from the dictionary.
 * The instalments and trade-in tiles have no destination page yet, so their
 * CTAs point at "#" (see dict.home.promoTiles — TODO once pages exist).
 */
export function PromoTiles() {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {dict.home.promoTiles.map((tile) => {
        const accent = ACCENTS[tile.accent];
        return (
          <Link
            key={tile.title}
            href={tile.href}
            className={`group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${accent.surface}`}
          >
            <Badge variant={accent.badge} className="w-fit">
              {tile.badge}
            </Badge>
            <h3 className="mt-3 font-display text-lg font-bold text-foreground">
              {tile.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{tile.text}</p>
            <span
              className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${accent.cta}`}
            >
              {tile.cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
