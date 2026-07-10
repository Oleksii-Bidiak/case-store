"use client";

import { dict } from "@/shared/config";
import { LegalPrinterIcon } from "./legal-icons";

/**
 * LegalDocActions — the "Завантажити PDF" button. Opens the browser print
 * dialog (users save-as-PDF from there). Hidden when printing.
 */
export function LegalDocActions() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-[42px] items-center gap-2 rounded-[11px] border-[1.5px] border-border bg-card px-[18px] text-[13.5px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      <LegalPrinterIcon width={16} height={16} />
      {dict.legal.print}
    </button>
  );
}
