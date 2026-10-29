"use client";

import * as React from "react";
import Link from "next/link";
import { LockIcon, PencilIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";
import { RichTextPreview } from "./rich-text-preview";

const t = dict.readOnlyView;

/**
 * The read-only template of an `[id]/edit` page (plan 186, TASK-667,
 * ReadOnlyTemplate РО-1…РО-5): what a session WITHOUT the section's `:write`
 * sees on the same route — the form's own sections in the form's order, the
 * values as TEXT (never disabled inputs: they are hard to read and promise
 * that something can be changed), «Не задано» with its consequence for an
 * empty value, and one line saying why nothing changes here and whom to ask.
 * No save bar, no «Видалити». A session WITH `:write` gets the normal form at
 * once — there is no separate «view mode» for it.
 *
 * The parts compose:
 *
 *   <ReadOnlyNotice>{notice}</ReadOnlyNotice>
 *   <ReadOnlyLayout aside={preview}>
 *     <ReadOnlySection title="Текст">
 *       <ReadOnlyField label="Заголовок">{title}</ReadOnlyField>
 *       <ReadOnlyField label="Опис для Google" emptyConsequence="…">{d}</ReadOnlyField>
 *     </ReadOnlySection>
 *   </ReadOnlyLayout>
 *
 * Value variants (РО-5) go inside a `ReadOnlyField`: plain text, `ReadOnlyLink`
 * (opens), `ReadOnlyRelation` (a name, linked when the viewer may open it),
 * `ReadOnlyImage`, `ReadOnlySwatch`, `ReadOnlyBool` (words, not a tick),
 * `ReadOnlyTags`, `ReadOnlyRichText`, and the shared `Badge` for a status.
 */

/**
 * True when a field has nothing to show — the cue for «Не задано». `0` is a
 * value; `false`, `null`, a blank string and an empty array are not.
 */
export function isReadOnlyEmpty(value: React.ReactNode): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isReadOnlyEmpty);
  return false;
}

export interface ReadOnlyNoticeProps {
  /** The one line: «Ви можете переглядати, але не змінювати. …». */
  children: React.ReactNode;
  /**
   * «Редагувати» — pass it ONLY for a session holding the right (a link or a
   * click). Without it the notice is the line alone, which is the edit pages'
   * case: whoever may edit is shown the form itself, never this view.
   */
  edit?: { href: string } | { onClick: () => void };
  className?: string;
}

/**
 * The line above the values (РО-1 «ro-b»): a lock, why nothing here can be
 * changed and whom to ask. Page content, not a live region — it is there when
 * the page renders and must not interrupt a screen reader.
 */
export function ReadOnlyNotice({
  children,
  edit,
  className,
}: ReadOnlyNoticeProps) {
  return (
    <div
      data-slot="read-only-notice"
      className={cn(
        "flex flex-wrap items-start gap-2.5 rounded-md border bg-muted px-3 py-2.5 text-sm text-foreground",
        className,
      )}
    >
      <LockIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <p className="min-w-0 flex-1">{children}</p>
      {edit ? (
        "href" in edit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={edit.href}>
              <PencilIcon aria-hidden="true" />
              {dict.common.edit}
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={edit.onClick}
          >
            <PencilIcon aria-hidden="true" />
            {dict.common.edit}
          </Button>
        )
      ) : null}
    </div>
  );
}

export interface ReadOnlyLayoutProps {
  children: React.ReactNode;
  /** The side column the form has (a preview, facts) — kept as it is. */
  aside?: React.ReactNode;
  className?: string;
}

// The forms' own fixed+fluid split (brand, device model): 360 px side column.
const LAYOUT_GRID =
  "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6";

/** The sections, and the form's side column beside them from `lg` up. */
export function ReadOnlyLayout({
  children,
  aside,
  className,
}: ReadOnlyLayoutProps) {
  if (!aside) {
    return (
      <div className={cn("flex max-w-3xl min-w-0 flex-col gap-4", className)}>
        {children}
      </div>
    );
  }
  return (
    <div className={cn(LAYOUT_GRID, className)}>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
        {aside}
      </aside>
    </div>
  );
}

export interface ReadOnlySectionProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  /** The form section's own title — the same words, so people talk about the same places. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Children are NOT `ReadOnlyField`s (a rich text body, a list): render them
   * as they are instead of inside the label/value list.
   */
  bare?: boolean;
}

/** One titled block — the form's `FormSectionCard` chrome, holding values. */
export function ReadOnlySection({
  title,
  description,
  bare = false,
  className,
  children,
  ...props
}: ReadOnlySectionProps) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      data-slot="read-only-section"
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {bare ? children : <ReadOnlyFields>{children}</ReadOnlyFields>}
    </section>
  );
}

/** The label/value list on its own — for a section drawn by someone else. */
export function ReadOnlyFields({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className={cn("flex flex-col gap-3 text-sm", className)}>{children}</dl>
  );
}

// Label left at 180 px (РО-1), above the value below `sm` (РО-2, 390 px).
const FIELD_GRID =
  "grid grid-cols-1 gap-0.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-x-4";

export interface ReadOnlyFieldProps {
  label: React.ReactNode;
  /** The value. Plain text, or one of the `ReadOnly*` value parts. */
  children?: React.ReactNode;
  /**
   * Force «Не задано» (or not). By default it follows `isReadOnlyEmpty` on
   * the children — set it when the child is an element (`<ReadOnlyTags
   * tags={[]}/>`) that cannot be seen to be empty from outside.
   */
  empty?: boolean;
  /** What an empty value means on the site: «Google візьме початок тексту». */
  emptyConsequence?: string;
  /** A slug, a code — monospace and broken anywhere. */
  mono?: boolean;
  /** Keep the text's own line breaks (a multi-line answer, a description). */
  multiline?: boolean;
}

/** A label and its value as text — one row of the list (РО-5 «text»/«empty»). */
export function ReadOnlyField({
  label,
  children,
  empty,
  emptyConsequence,
  mono = false,
  multiline = false,
}: ReadOnlyFieldProps) {
  const isEmpty = empty ?? isReadOnlyEmpty(children);
  return (
    <div data-slot="read-only-field" className={FIELD_GRID}>
      <dt className="text-muted-foreground max-sm:text-xs max-sm:font-medium max-sm:tracking-wide max-sm:uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-foreground",
          mono && !isEmpty && "font-mono break-all",
          multiline && "whitespace-pre-line",
        )}
      >
        {isEmpty ? <ReadOnlyEmpty consequence={emptyConsequence} /> : children}
      </dd>
    </div>
  );
}

/** «Не задано» / «Не задано — <наслідок>», muted and italic. */
export function ReadOnlyEmpty({ consequence }: { consequence?: string }) {
  return (
    <span className="text-muted-foreground italic">
      {consequence ? t.notSetWith(consequence) : t.notSet}
    </span>
  );
}

const LINK_CLASS =
  "rounded-xs font-medium break-words text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export interface ReadOnlyLinkProps {
  href: string;
  children: React.ReactNode;
  /** A storefront or third-party address: opens in a new tab and says so. */
  external?: boolean;
}

/** A value that is an address — clickable, not copied out by hand (РО-5 «link»). */
export function ReadOnlyLink({
  href,
  children,
  external = false,
}: ReadOnlyLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {children}
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> {t.opensInNewTab}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={LINK_CLASS}>
      {children}
    </Link>
  );
}

/**
 * Another record by its name (РО-5 «relation») — linked to its admin page when
 * the viewer may open it (`href`), plain text when not: a link that ends in a
 * 403 is worse than none.
 */
export function ReadOnlyRelation({
  href,
  children,
}: {
  href?: string | null;
  children: React.ReactNode;
}) {
  return href ? <ReadOnlyLink href={href}>{children}</ReadOnlyLink> : children;
}

export interface ReadOnlyImageProps {
  src: string;
  alt: string;
  /** One muted line beside the thumbnail — the file, its size. */
  caption?: React.ReactNode;
}

/** A picture as a thumbnail, not its URL (РО-5 «image»). */
export function ReadOnlyImage({ src, alt, caption }: ReadOnlyImageProps) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-15 w-33 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      </span>
      {caption ? (
        <span className="min-w-0 text-xs break-all text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A colour as its sample AND its name — the colour is never the only signal
 * (РО-5 «swatch»). `dotClassName` takes token classes (`bg-primary`, `bg-sale`),
 * the same ones `SwatchPicker` paints with.
 */
export function ReadOnlySwatch({
  dotClassName,
  children,
}: {
  dotClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {dotClassName ? (
        <span
          aria-hidden="true"
          className={cn("size-4 shrink-0 rounded-full", dotClassName)}
        />
      ) : null}
      {children}
    </span>
  );
}

/** A yes/no in the words the form's switch means — «Показується», not a tick (РО-5 «bool»). */
export function ReadOnlyBool({
  value,
  on,
  off,
}: {
  value: boolean;
  on: string;
  off: string;
}) {
  return <>{value ? on : off}</>;
}

/** Tags as chips (РО-5 «tags»). Pass `empty` to the field when there are none. */
export function ReadOnlyTags({ tags }: { tags: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-full bg-muted px-2 py-px text-xs text-foreground"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** Formatted text as the site shows it, not its HTML (РО-5 «rich text»). */
export function ReadOnlyRichText({ html }: { html: string }) {
  return <RichTextPreview html={html} />;
}
