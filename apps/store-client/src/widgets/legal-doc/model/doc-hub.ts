import { dict } from "@/shared/config";

/**
 * Which hub a document page belongs to (TASK-435).
 *
 * `LegalDocView` renders an admin-authored `Page` row, and there are now two
 * surfaces that do that: legal documents at `/legal/<slug>` and help pages at
 * `/info/<slug>`. The document chrome — breadcrumb target, badge, the heading
 * above the "other documents" grid and the prefix of those links — is the only
 * thing that differs between them, so it is passed in rather than duplicated
 * into a second near-identical widget.
 */
export interface DocHub {
  /** Route of the hub this document belongs to (`/legal` or `/info`). */
  href: string;
  /** Breadcrumb label for that hub. */
  label: string;
  /** Small badge printed above the document title. */
  badge: string;
  /** Heading of the sibling-documents grid at the bottom. */
  otherHeading: string;
}

/** Legal documents — `/legal/<slug>`. The original, default behaviour. */
export const LEGAL_DOC_HUB: DocHub = {
  href: "/legal",
  label: dict.legal.breadcrumbHub,
  badge: dict.legal.badge,
  otherHeading: dict.legal.otherHeading,
};

/** Help / reference pages — `/info/<slug>`, the CMS half of the Info surface. */
export const INFO_DOC_HUB: DocHub = {
  href: "/info",
  label: dict.info.docBreadcrumbHub,
  badge: dict.info.docBadge,
  otherHeading: dict.info.docOtherHeading,
};
