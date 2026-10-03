import Link from "next/link";
import type { ReactNode } from "react";

interface CardHeaderLinkProps {
  href: string;
  /** The words only — the «→» is drawn here, hidden from screen readers. */
  children: ReactNode;
}

/**
 * «Усі … →» in the top-right corner of a card (wave 198, Dashboard П1): the
 * way from a five-row preview into the whole list. Primary-coloured text, no
 * button chrome — it is navigation, not an action. The arrow is decoration, so
 * the link is announced as its words.
 */
export function CardHeaderLink({ href, children }: CardHeaderLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium whitespace-nowrap text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
