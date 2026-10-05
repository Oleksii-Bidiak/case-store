import { MessageCircle } from "lucide-react";
import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { BlogInstagramIcon, BlogTelegramIcon } from "./blog-icons";

/** The shop's social channels, as «Контакти магазину» stores them. */
export type BlogNewsletterContact = Pick<
  SiteContactSettingsEntity,
  "telegramLink" | "instagramLink" | "viberLink"
>;

// The channels «Контакти магазину» (TASK-345) has fields for — the same three
// the home newsletter and the footer show. There is no YouTube field, so there
// is no YouTube button (owner decision on TASK-741). Viber has no brand mark in
// the blog icon set; the footer's neutral `MessageCircle` stands in.
const SOCIAL_CHANNELS = [
  { key: "telegramLink", icon: BlogTelegramIcon, label: "Telegram" },
  { key: "instagramLink", icon: BlogInstagramIcon, label: "Instagram" },
  { key: "viberLink", icon: MessageCircle, label: "Viber" },
] as const;

const SOCIAL_ITEM_CLASS =
  "inline-flex h-[46px] items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-background px-[18px] text-sm font-semibold text-foreground no-underline transition-[border-color,transform,color] hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0";

interface BlogNewsletterProps {
  /**
   * The shop's contact settings, fetched by the /blog page. A channel without a
   * link is left out; with none, the social row is not rendered at all.
   */
  contact?: BlogNewsletterContact | null;
}

/**
 * BlogNewsletter — the "не пропускай нові статті" block. Wired to the real
 * newsletter backend (TASK-188) via the reusable NewsletterSubscribeForm feature
 * (TASK-237); `source="blog"` tags the opt-in origin.
 *
 * TASK-873: the channels used to be three dictionary placeholders (`href: "#"`)
 * that answered a click with a «скоро запрацюють» toast. They now are the
 * owner's real links from «Контакти магазину», exactly as on the home page
 * (TASK-741), and a channel the owner has not filled in simply is not shown.
 */
export function BlogNewsletter({ contact }: BlogNewsletterProps = {}) {
  const { heading, subtitle } = dict.blog.newsletter;
  const channels = SOCIAL_CHANNELS.flatMap((channel) => {
    const href = contact?.[channel.key];
    return href ? [{ ...channel, href }] : [];
  });

  return (
    <section className="mt-11 flex flex-wrap items-center justify-between gap-9 rounded-card border border-border bg-card px-10 py-[34px] shadow-card">
      <div className="max-w-[520px]">
        <h2 className="mb-2 font-display text-2xl font-bold tracking-tight text-foreground">
          {heading}
        </h2>
        <p className="text-[15px] text-muted-foreground">{subtitle}</p>
        <NewsletterSubscribeForm source="blog" className="mt-5 max-w-md" />
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
                <Icon width={19} height={19} aria-hidden="true" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
