"use client";

import { toast } from "sonner";
import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";
import {
  BlogInstagramIcon,
  BlogTelegramIcon,
  BlogYoutubeIcon,
} from "./blog-icons";

// Icon per social channel, paired with dict.blog.newsletter.socials by index.
const SOCIAL_ICONS = [
  BlogTelegramIcon,
  BlogInstagramIcon,
  BlogYoutubeIcon,
] as const;

// Shared visual style for both the real-link and stub-button variants, so the
// honest-affordance swap is a zero visual diff (only the click behavior differs).
const SOCIAL_ITEM_CLASS =
  "inline-flex h-[46px] items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-background px-[18px] text-sm font-semibold text-foreground no-underline transition-[border-color,transform,color] hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * BlogNewsletter — the "не пропускай нові статті" block. Wired to the real
 * newsletter backend (TASK-188) via the reusable NewsletterSubscribeForm feature
 * (TASK-237); `source="blog"` tags the opt-in origin. The social channels have no
 * real URLs yet (href "#"); such placeholders render an honest "coming soon"
 * toast button, and a real href renders as a real link with no component change
 * (TASK-267 / F-18).
 */
export function BlogNewsletter() {
  const { heading, subtitle, socials, socialSoon } = dict.blog.newsletter;

  return (
    <section className="mt-11 flex flex-wrap items-center justify-between gap-9 rounded-[20px] border border-border bg-card px-10 py-[34px] shadow-[var(--shadow-card)]">
      <div className="max-w-[520px]">
        <h2 className="mb-2 font-display text-[23px] font-bold tracking-[-0.02em] text-foreground">
          {heading}
        </h2>
        <p className="text-[15px] text-muted-foreground">{subtitle}</p>
        <NewsletterSubscribeForm source="blog" className="mt-5 max-w-md" />
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
                  className={`${SOCIAL_ITEM_CLASS} cursor-pointer`}
                >
                  <Icon width={19} height={19} />
                  {social.label}
                </button>
              ) : (
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ITEM_CLASS}
                >
                  <Icon width={19} height={19} />
                  {social.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
