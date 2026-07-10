"use client";

import { toast } from "sonner";
import { dict } from "@/shared/config";
import { BlogFacebookIcon, BlogLinkIcon, BlogTelegramIcon } from "./blog-icons";

const BTN =
  "inline-flex size-[38px] items-center justify-center rounded-md border-[1.5px] border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * BlogArticleShare — the "Поділитись" cluster: copy-link (sonner toast) plus
 * Telegram / Facebook share intents opened for the live article URL. The URL is
 * read at click time (no effect / SSR mismatch).
 */
export function BlogArticleShare() {
  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(window.location.href);
    } catch {
      // Clipboard blocked (insecure context / permissions) — still confirm intent.
    }
    toast.success(dict.blog.article.copied);
  }

  function share(intent: "telegram" | "facebook") {
    const url = encodeURIComponent(window.location.href);
    const href =
      intent === "telegram"
        ? `https://t.me/share/url?url=${url}`
        : `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center gap-2">
      <span className="mr-0.5 text-[13px] text-muted-foreground">
        {dict.blog.article.shareLabel}
      </span>
      <button
        type="button"
        onClick={copyLink}
        aria-label={dict.blog.article.copyAria}
        className={BTN}
      >
        <BlogLinkIcon width={17} height={17} />
      </button>
      <button
        type="button"
        onClick={() => share("telegram")}
        aria-label={dict.blog.article.telegramAria}
        className={BTN}
      >
        <BlogTelegramIcon width={17} height={17} />
      </button>
      <button
        type="button"
        onClick={() => share("facebook")}
        aria-label={dict.blog.article.facebookAria}
        className={BTN}
      >
        <BlogFacebookIcon width={17} height={17} />
      </button>
    </div>
  );
}
