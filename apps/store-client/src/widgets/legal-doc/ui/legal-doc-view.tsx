import Link from "next/link";
import type { PageEntity } from "@/shared/api/generated/models";
import { sanitizeHtml } from "@/shared/lib/sanitize-html";
import { dict } from "@/shared/config";
import { extractDocSections, formatLegalDate } from "../model/extract-sections";
import { LegalDocActions } from "./legal-doc-actions";
import { LegalDocToc } from "./legal-doc-toc";
import { LegalChatIcon, LegalClockIcon, LegalFileIcon } from "./legal-icons";

/** A link to another published static page (for the "інші документи" grid). */
export interface LegalOtherDoc {
  slug: string;
  title: string;
}

/**
 * LegalDocView — the Legal.dc.html template for admin-authored static/legal
 * pages served at `/legal/[slug]`. Renders the sanitized `page.content` inside a
 * document card with a numbered heading counter, a sticky scroll-spy TOC built
 * from the content's `<h2>`s, a contact CTA, and links to the other pages.
 */
export function LegalDocView({
  page,
  otherDocs,
}: {
  page: PageEntity;
  otherDocs: LegalOtherDoc[];
}) {
  // Sanitize admin HTML, then inject heading ids for the TOC.
  const { html, sections } = extractDocSections(sanitizeHtml(page.content));
  const hasToc = sections.length > 0;

  return (
    <>
      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[18px] flex flex-wrap items-center gap-[9px] text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.legal.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <Link href="/legal" className="transition-colors hover:text-foreground">
          {dict.legal.breadcrumbHub}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">{page.title}</span>
      </nav>

      {/* Document head */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-[12.5px] font-bold tracking-[0.04em] text-primary"
            style={{
              background:
                "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
            }}
          >
            {dict.legal.badge}
          </span>
          <h1 className="mt-3.5 mb-2.5 font-display text-[34px] font-bold leading-[1.12] tracking-[-0.025em] text-foreground">
            {page.title}
          </h1>
          <p className="m-0 inline-flex items-center gap-[7px] text-[13.5px] text-muted-foreground">
            <LegalClockIcon width={15} height={15} />
            {dict.legal.updatedPrefix} {formatLegalDate(page.updatedAt)}
          </p>
        </div>
        <LegalDocActions />
      </div>

      {/* TOC + document body */}
      <div
        className={
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent
          hasToc ? "grid items-start gap-9 lg:grid-cols-[264px_1fr]" : ""
        }
      >
        {hasToc && <LegalDocToc sections={sections} />}

        <article className="min-w-0 rounded-[18px] border border-border bg-card px-11 py-9 shadow-card">
          <div
            className="legal-doc-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Contact CTA */}
          <div className="mt-9 flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-muted px-[22px] py-5">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex size-[42px] items-center justify-center rounded-xl bg-card text-primary">
                <LegalChatIcon width={22} height={22} />
              </span>
              <div>
                <b className="block font-display text-[14.5px] text-foreground">
                  {dict.legal.contactHeading}
                </b>
                <span className="text-[13.5px] text-muted-foreground">
                  {dict.legal.contactSubtitle}
                </span>
              </div>
            </div>
            <Link
              href={dict.legal.contactHref}
              className="inline-flex h-[42px] items-center rounded-[11px] bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
            >
              {dict.legal.contactCta}
            </Link>
          </div>
        </article>
      </div>

      {/* Other legal documents */}
      {otherDocs.length > 0 && (
        <section className="mt-11 print:hidden">
          <h2 className="mb-4 font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
            {dict.legal.otherHeading}
          </h2>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {otherDocs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/legal/${doc.slug}`}
                className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-[18px] py-4 no-underline shadow-card transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-md text-primary"
                  style={{
                    background:
                      "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
                  }}
                >
                  <LegalFileIcon width={19} height={19} />
                </span>
                <span className="text-sm leading-[1.3] font-semibold text-foreground">
                  {doc.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
