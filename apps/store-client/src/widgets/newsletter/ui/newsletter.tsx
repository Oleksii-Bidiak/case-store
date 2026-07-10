"use client";

import { Send, Camera, PlayCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";

// Icon per social channel, paired with dict.home.newsletter.socials by index.
// lucide dropped brand marks, so these are neutral stand-ins (Telegram,
// Instagram, YouTube, Viber).
const SOCIAL_ICONS = [Send, Camera, PlayCircle, MessageCircle] as const;

// Shared visual style for both the real-link and stub-button variants, so the
// honest-affordance swap is a zero visual diff (only the click behavior differs).
const SOCIAL_ITEM_CLASS =
  "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Newsletter — the "−10% on your first order" block with social channel links.
 * The channels have no real URLs yet (href "#" in dict.home.newsletter.socials);
 * such placeholders render an honest "coming soon" toast button instead of a
 * dead anchor. The moment a real href is configured, it renders as a real link
 * with no component change (TASK-267 / F-18).
 */
export function Newsletter() {
  const { heading, subtitle, socials, socialSoon } = dict.home.newsletter;

  return (
    <section className="mx-auto w-full max-w-7xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl border border-border bg-card p-8 shadow-card sm:p-10">
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
            const isStub = !social.href || social.href === "#";
            return (
              <li key={social.label}>
                {isStub ? (
                  <button
                    type="button"
                    onClick={() => toast(socialSoon)}
                    className={SOCIAL_ITEM_CLASS}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {social.label}
                  </button>
                ) : (
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={SOCIAL_ITEM_CLASS}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {social.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
