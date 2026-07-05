"use client";

import { dict, STICKY_ASIDE_TOP, STICKY_HEADER_OFFSET } from "@/shared/config";
import { BLOG_ARTICLE_SECTIONS } from "../model/posts";

/**
 * BlogArticleToc — the sticky "Зміст" panel. Smooth-scrolls to each `<h2 id>`
 * with a fixed-header offset. Hidden below the two-column breakpoint (the
 * mockup drops the TOC on narrow viewports). Client Component.
 */
export function BlogArticleToc() {
  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y =
      el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <aside
      className={`hidden self-start lg:sticky ${STICKY_ASIDE_TOP} lg:block`}
    >
      <div className="rounded-2xl border border-border bg-card p-[18px] shadow-[var(--shadow-card)]">
        <p className="mb-3 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
          {dict.blog.article.tocHeading}
        </p>
        {BLOG_ARTICLE_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => go(section.id)}
            className="block w-full cursor-pointer rounded-lg bg-transparent px-2.5 py-2 text-left text-[13.5px] leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {section.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
