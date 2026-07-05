import { Send, Camera, PlayCircle, MessageCircle } from "lucide-react";
import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";

// Icon per social channel, paired with dict.home.newsletter.socials by index.
// lucide dropped brand marks, so these are neutral stand-ins (Telegram,
// Instagram, YouTube, Viber).
const SOCIAL_ICONS = [Send, Camera, PlayCircle, MessageCircle] as const;

/**
 * Newsletter — the "−10% on your first order" block with social channel links.
 * Static Server Component. The social links have no real URLs yet, so they
 * point at "#" (see dict.home.newsletter.socials — TODO once channels exist).
 */
export function Newsletter() {
  const { heading, subtitle, socials } = dict.home.newsletter;

  return (
    <section className="mx-auto w-full max-w-7xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)] sm:p-10">
        <div className="max-w-xl">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {heading}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <NewsletterSubscribeForm source="home" className="mt-5 max-w-md" />
        </div>
        <ul className="flex flex-wrap items-center gap-2.5">
          {socials.map((social, i) => {
            const Icon = SOCIAL_ICONS[i];
            return (
              <li key={social.label}>
                <a
                  href={social.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {social.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
