import type { SVGProps } from "react";

// Inline SVG glyphs copied from the Claude Design "Legal.dc.html" mockup so the
// page renders pixel-identically. All glyphs inherit `currentColor`.

/** Clock — "чинна редакція від …" line. */
export function LegalClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Printer — "Завантажити PDF" button. */
export function LegalPrinterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 9V3h12v6" />
      <rect x="6" y="13" width="12" height="8" />
      <path d="M6 17H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

/** Speech bubble — "Залишились питання?" contact box. */
export function LegalChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

/** Document — "інші правові документи" cards + default hub tile icon. */
export function LegalFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

// ── Per-document hub tile icons (LegalHub.dc.html), keyed by document type. ──

function glyph(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

/** Shield-check — privacy / warranty. */
export function LegalShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...glyph(props)}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** Cookie — cookie policy. */
export function LegalCookieIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...glyph(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8.5h.01M15 9h.01M9.5 15h.01M14.5 14.5h.01M12 12h.01" />
    </svg>
  );
}

/** Circular arrow — returns / exchange. */
export function LegalReturnsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...glyph(props)}>
      <path d="M3 9a9 9 0 1 1 1 6" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

/** File with lines — terms of use. */
export function LegalTermsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...glyph(props)}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

/** Contract sheet — public offer. */
export function LegalOfferIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...glyph(props)}>
      <path d="M4 4h16v4H4z" />
      <path d="M6 8v12h12V8M9 12h6M9 16h4" />
    </svg>
  );
}

/** Arrow-right — hub tile affordance. */
export function LegalArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
