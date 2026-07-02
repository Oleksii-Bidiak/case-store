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

/**
 * BlogNewsletter — the "не пропускай нові статті" block with social channel
 * links. Static. The links have no real URLs yet (href "#", see TASK-170 /
 * TASK-166 for the real signup + social destinations).
 */
export function BlogNewsletter() {
  const { heading, subtitle, socials } = dict.blog.newsletter;

  return (
    <section className="mt-11 flex flex-wrap items-center justify-between gap-9 rounded-[20px] border border-border bg-card px-10 py-[34px] shadow-[var(--shadow-card)]">
      <div className="max-w-[520px]">
        <h2 className="mb-2 font-display text-[23px] font-bold tracking-[-0.02em] text-foreground">
          {heading}
        </h2>
        <p className="text-[15px] text-muted-foreground">{subtitle}</p>
      </div>
      <ul className="flex flex-wrap items-center gap-2.5">
        {socials.map((social, i) => {
          const Icon = SOCIAL_ICONS[i];
          return (
            <li key={social.label}>
              <a
                href={social.href}
                className="inline-flex h-[46px] items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-background px-[18px] text-sm font-semibold text-foreground no-underline transition-[border-color,transform,color] hover:-translate-y-0.5 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon width={19} height={19} />
                {social.label}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
