"use client";

import { Send, Camera, MessageCircle } from "lucide-react";
import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";

/** The shop's social channels, as «Контакти магазину» stores them. */
export type NewsletterContact = Pick<
  SiteContactSettingsEntity,
  "telegramLink" | "instagramLink" | "viberLink"
>;

// The channels «Контакти магазину» (TASK-345) has fields for — the same three,
// icons and names the footer uses. lucide dropped brand marks, so the icons are
// neutral stand-ins.
const SOCIAL_CHANNELS = [
  { key: "telegramLink", icon: Send, label: "Telegram" },
  { key: "instagramLink", icon: Camera, label: "Instagram" },
  { key: "viberLink", icon: MessageCircle, label: "Viber" },
] as const;

const SOCIAL_ITEM_CLASS =
  "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface NewsletterProps {
  /**
   * The shop's contact settings, fetched by the home page. A channel without a
   * link is left out; with none, the social row is not rendered at all.
   */
  contact?: NewsletterContact | null;
}

/**
 * Newsletter — the "−10% on your first order" block with the shop's social
 * channels next to the subscribe form.
 *
 * TASK-741: the channels used to be four dictionary placeholders (`href: "#"`)
 * that answered a click with a «незабаром» toast, while the owner's real links
 * sat in «Контакти магазину» unused. They now come from there, and a channel
 * the owner has not filled in simply is not shown.
 */
export function Newsletter({ contact }: NewsletterProps = {}) {
  const { heading, subtitle } = dict.home.newsletter;
  const channels = SOCIAL_CHANNELS.flatMap((channel) => {
    const href = contact?.[channel.key];
    return href ? [{ ...channel, href }] : [];
  });

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
        {channels.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2.5">
            {channels.map(({ key, href, icon: Icon, label }) => (
              <li key={key}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ITEM_CLASS}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
