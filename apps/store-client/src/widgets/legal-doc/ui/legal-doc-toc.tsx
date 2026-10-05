"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { dict, STICKY_ASIDE_TOP, STICKY_HEADER_OFFSET } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import type { DocSection } from "../model/extract-sections";

/**
 * LegalDocToc — the "Зміст документа" panel with scroll-spy. Highlights the
 * section currently in view and smooth-scrolls to a section on click. The
 * section elements live in the sibling document body (ids injected by
 * `extractDocSections`); this component only references them by id.
 *
 * From `lg` it is the sticky side column. Below `lg` (TASK-878, the «ЦІЛЬ» block
 * of Legal.dc.html) it collapses into one disclosure row «Зміст документа · N
 * розділів» above the article, so a phone reader reaches the text without
 * scrolling past the whole list; picking a section folds the row again.
 */
export function LegalDocToc({ sections }: { sections: DocSection[] }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  useEffect(() => {
    let raf = 0;

    function spy() {
      raf = 0;
      const threshold = window.scrollY + STICKY_HEADER_OFFSET + 14;
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
    // Below lg the list sits in the collapsed row — fold it back after a jump.
    setOpen(false);
    const el = document.getElementById(section.id);
    if (!el) return;
    const y =
      el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActive(i);
  }

  return (
    <aside className={`lg:sticky ${STICKY_ASIDE_TOP} print:hidden`}>
      <div className="rounded-cta border border-border bg-card lg:border-0 lg:bg-transparent">
        {/* Disclosure row — below lg only. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-cta px-4 py-3 text-left text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          {dict.legal.tocToggle(sections.length)}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>

        <p className="mb-3 hidden pl-3.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase lg:block">
          {dict.legal.tocHeading}
        </p>
        <nav
          id={listId}
          aria-label={dict.legal.tocAria}
          className={cn(
            "flex-col gap-0.5 border-l border-border lg:mx-0 lg:mb-0 lg:flex",
            open ? "mx-4 mb-4 flex" : "hidden",
          )}
        >
          {sections.map((section, i) => {
            const on = i === active;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => go(section, i)}
                aria-current={on ? "true" : undefined}
                className={`-ml-px flex w-full items-center gap-2.5 rounded-r-lg border-l-2 px-3.5 py-2.5 text-left text-sm leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  on
                    ? "border-primary font-semibold text-primary bg-primary/7"
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
      </div>
    </aside>
  );
}
