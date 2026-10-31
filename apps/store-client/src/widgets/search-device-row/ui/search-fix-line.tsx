"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  SEARCH_DEVICE_FOCUS,
  exactSearchHref,
  useSearchPageModel,
} from "@/features/search";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

interface SearchFixLineProps {
  /** The query from the URL (`?q=`) as the server saw it. */
  query: string;
}

/**
 * «Шукаємо як iPhone 15 Pro · шукати точно «iphone 15 про»» (TASK-2069, Д3-2
 * §3.2) — the line under the h1 when the query had to be READ to find the
 * model (Cyrillic, transliteration or a typo). It says what the page assumed
 * and gives the one way out: the same query as typed, with recognition off
 * (`?exact=1`), so the model row, the alternatives and the device block go
 * away and the category filter is reset. A link, not a button — it navigates.
 * Client-only like the row: nothing until the model list is there.
 */
export function SearchFixLine({ query }: SearchFixLineProps) {
  const searchParams = useSearchParams();
  const { query: q, match } = useSearchPageModel(query);
  if (!match || !match.corrected) return null;

  const copy = dict.searchDevice.fix;
  const fixTo = match.productWord
    ? copy.productFor(
        dict.searchDevice.productWords[match.productWord],
        match.model.name,
      )
    : match.model.name;

  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {copy.lead} <b className="font-bold text-foreground">{fixTo}</b>
      <span aria-hidden="true"> · </span>
      <Link
        href={exactSearchHref(q, searchParams)}
        className={cn(
          "rounded-sm font-semibold text-foreground underline underline-offset-3 transition-colors duration-150 hover:text-primary motion-reduce:transition-none",
          SEARCH_DEVICE_FOCUS,
        )}
      >
        {copy.exact(q)}
      </Link>
    </p>
  );
}
