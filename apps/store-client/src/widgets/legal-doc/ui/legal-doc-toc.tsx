"use client";

import { useEffect, useState } from "react";
import { dict } from "@/shared/config";
import type { DocSection } from "../model/extract-sections";

// Offset that clears the sticky site header when scroll-spying / scrolling.
const HEADER_OFFSET = 96;

/**
 * LegalDocToc — the sticky "Зміст документа" panel with scroll-spy. Highlights
 * the section currently in view and smooth-scrolls to a section on click. The
 * section elements live in the sibling document body (ids injected by
 * `extractDocSections`); this component only references them by id.
 */
export function LegalDocToc({ sections }: { sections: DocSection[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;

    function spy() {
      raf = 0;
      const threshold = window.scrollY + HEADER_OFFSET + 14;
      let idx = 0;
      sections.forEach((section, i) => {
        const el = document.getElementById(section.id);
        if (
          el &&
          el.getBoundingClientRect().top + window.scrollY - 1 <= threshold
        ) {
          idx = i;
        }
      });
      setActive(idx);
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(spy);
    }

    // Defer the initial sync to rAF (not the effect body).
    raf = requestAnimationFrame(spy);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sections]);

  function go(section: DocSection, i: number) {
    const el = document.getElementById(section.id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActive(i);
  }

  return (
    <aside className="lg:sticky lg:top-6 print:hidden">
      <p className="mb-3 pl-3.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {dict.legal.tocHeading}
      </p>
      <nav
        aria-label={dict.legal.tocAria}
        className="flex flex-col gap-0.5 border-l border-border"
      >
        {sections.map((section, i) => {
          const on = i === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => go(section, i)}
              aria-current={on ? "true" : undefined}
              className={`-ml-px flex w-full cursor-pointer items-center gap-2.5 rounded-r-lg border-l-2 px-3.5 py-2.5 text-left text-[13.5px] leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on
                  ? "border-primary font-semibold text-primary [background:color-mix(in_oklab,var(--color-primary)_7%,transparent)]"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="min-w-[18px] font-mono text-xs opacity-70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
