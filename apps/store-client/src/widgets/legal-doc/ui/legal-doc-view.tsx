import Link from "next/link";
import type { PageEntity } from "@/shared/api/generated/models";
import { sanitizeHtml } from "@/shared/lib/sanitize-html";
import { dict, H1_CLASS, H2_CLASS } from "@/shared/config";
import { Button } from "@/shared/ui";
import { extractDocSections, formatLegalDate } from "../model/extract-sections";
import { LEGAL_DOC_HUB, type DocHub } from "../model/doc-hub";
import { LegalDocActions } from "./legal-doc-actions";
import { LegalDocToc } from "./legal-doc-toc";
import { LegalChatIcon, LegalClockIcon, LegalFileIcon } from "./legal-icons";

/** A link to another published static page (for the "інші документи" grid). */
export interface LegalOtherDoc {
  slug: string;
  title: string;
}

/**
 * LegalDocView — the Legal.dc.html template for admin-authored `Page` rows.
 * Renders the sanitized `page.content` inside a document card with a numbered
 * heading counter, a sticky scroll-spy TOC built from the content's `<h2>`s
 * (collapsed into one disclosure row below `lg`, TASK-878), a contact CTA, and links to the sibling documents.
 *
 * Serves BOTH page surfaces (TASK-435): legal documents at `/legal/[slug]` and
 * help pages at `/info/[slug]`. Everything but the chrome is identical, so the
 * differing parts arrive in `hub` (breadcrumb target + label, badge, sibling
 * grid heading, and the prefix of the sibling links). It defaults to the legal
 * hub, so the original call site is unchanged.
 */
export function LegalDocView({
  page,
  otherDocs,
  hub = LEGAL_DOC_HUB,
}: {
  page: PageEntity;
  otherDocs: LegalOtherDoc[];
  hub?: DocHub;
}) {
  // Sanitize admin HTML, then inject heading ids for the TOC.
  const { html, sections } = extractDocSections(sanitizeHtml(page.content));
  const hasToc = sections.length > 0;

  return (
    <>
      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[18px] flex flex-wrap items-center gap-[9px] text-sm text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.legal.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <Link
          href={hub.href}
          className="transition-colors hover:text-foreground"
        >
          {hub.label}
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
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-xs font-bold tracking-[0.04em] text-primary"
            style={{
              background:
                "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
            }}
          >
            {hub.badge}
          </span>
          <h1 className={`mt-3.5 mb-2.5 ${H1_CLASS} text-foreground`}>
            {page.title}
          </h1>
          <p className="m-0 inline-flex items-center gap-[7px] text-sm text-muted-foreground">
            <LegalClockIcon width={15} height={15} />
            {dict.legal.updatedPrefix} {formatLegalDate(page.updatedAt)}
          </p>
        </div>
        <LegalDocActions />
      </div>

      {/* TOC + document body. Below lg the TOC is one disclosure row above the
          article, so the rows sit closer (gap-4); from lg it is the side column. */}
      <div
        className={
          hasToc
            ? // eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent
              "grid items-start gap-4 lg:grid-cols-[264px_1fr] lg:gap-9"
            : ""
        }
      >
        {hasToc && <LegalDocToc sections={sections} />}

        {/* Phone padding px-4 py-6 leaves ≥320px of text at 390 (TASK-878). */}
        <article className="min-w-0 rounded-card border border-border bg-card px-4 py-6 shadow-card sm:px-11 sm:py-9">
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
                <b className="block font-display text-sm text-foreground">
                  {dict.legal.contactHeading}
                </b>
                <span className="text-sm text-muted-foreground">
                  {dict.legal.contactSubtitle}
                </span>
              </div>
            </div>
            {/* The document's one primary action, as in Legal.dc.html
                (TASK-865); on Button so it gets the focus ring it lacked. */}
            <Button
              asChild
              className="h-11 rounded-menu px-5 font-semibold no-underline"
            >
              <Link href={dict.legal.contactHref}>{dict.legal.contactCta}</Link>
            </Button>
          </div>
        </article>
      </div>

      {/* Other legal documents */}
      {otherDocs.length > 0 && (
        <section className="mt-11 print:hidden">
          <h2 className={`mb-4 ${H2_CLASS} text-foreground`}>
            {hub.otherHeading}
          </h2>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {otherDocs.map((doc) => (
              <Link
                key={doc.slug}
                href={`${hub.href}/${doc.slug}`}
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
