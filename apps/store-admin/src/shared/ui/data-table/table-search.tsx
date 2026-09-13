"use client";

/**
 * TableSearch — the ONE search box every admin table uses (TASK-423).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The owner audited the panel as a CRM and found the tables disagreed with each
 * other: five searched as you type, eight only on Enter (a submit button the
 * operator had to find), three filtered in memory, three offered no search at
 * all. Same product, four different idioms — so "how do I search here?" had a
 * different answer on every screen.
 *
 * Search-as-you-type with a 300 ms debounce is the answer for all of them, and
 * it was already the answer on five of them (users, orders, brands,
 * addon-services, subscribers). This component is that behaviour, extracted, so
 * a reworded placeholder or a changed delay lands everywhere at once.
 *
 * ── Focus must survive the URL round-trip ───────────────────────────────────
 * In `url` mode a keystroke ends in `router.replace`, which re-renders the tree
 * and hands a NEW `value` back down. Seeding `useState` from it and remounting
 * on change (a `key` prop) destroys DOM focus on every keystroke — the exact bug
 * TASK-117 removed from the storefront. The field therefore stays mounted and
 * re-seeds only on a GENUINE external change, told apart from this component's
 * own echo by `lastPushedRef` (docs/conventions/forms.md rule 1b). The reference
 * implementation is
 * `apps/store-client/src/features/product-filters/ui/search-input.tsx`.
 *
 * ── `local` mode is not a shortcut ──────────────────────────────────────────
 * Three tables (banners, device brands, blog categories) are UNPAGINATED and
 * drag-reorderable, and their search hides ROWS rather than narrowing a query:
 * the reorder payload must name every row in the bucket, so a filtered view
 * locks dragging instead of sending a partial ordering. Those tables pass
 * `mode="local"` and keep the needle in their own state — a URL param would
 * imply a server-side narrowing that never happens.
 *
 * The mode picks between two THIN WRAPPERS rather than branching inside one
 * component, and that is deliberate: `useUrlParams` calls `useRouter`, which
 * throws outside an app router. A local-only search must not need one — it has no
 * URL to write — and three of these views are tested without a router mock
 * precisely because they never had one.
 */

import * as React from "react";
import { SearchIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { Input } from "../input";

const t = dict.common.table;

/** The one debounce every admin table searches at. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Trim, and map an empty string onto the URL-absent shape. */
function normalise(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export interface TableSearchProps {
  /**
   * The COMMITTED value: the URL param in `url` mode, the parent's own state in
   * `local` mode. Never the in-progress keystrokes — those live here.
   */
  value: string;
  /** `url` (default) writes to the query string; `local` filters in memory. */
  mode?: "url" | "local";
  /** `url` mode: the query-param this box owns. Default `search`. */
  param?: string;
  /** `local` mode: receives the debounced, trimmed needle (`undefined` = empty). */
  onChange?: (value: string | undefined) => void;
  /** DOM id — pass one when two search boxes can share a document. */
  id?: string;
  placeholder?: string;
  /** Accessible name. Defaults to the shared «Пошук» label. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function TableSearch({
  mode = "url",
  param = "search",
  onChange,
  ...rest
}: TableSearchProps) {
  return mode === "local" ? (
    <LocalTableSearch onChange={onChange} {...rest} />
  ) : (
    <UrlTableSearch param={param} {...rest} />
  );
}

type FieldProps = Omit<TableSearchProps, "mode" | "param" | "onChange">;

/** Writes the needle into the query string, and resets the page with it. */
function UrlTableSearch({ param, ...rest }: FieldProps & { param: string }) {
  const updateParams = useUrlParams();
  const commit = React.useCallback(
    (next: string | undefined) => {
      // A narrowed list has different pages; staying on page 7 of the old one
      // would show rows that belong to neither result set.
      updateParams({ [param]: next, page: undefined });
    },
    [param, updateParams],
  );
  return <SearchField commit={commit} {...rest} />;
}

/** Hands the needle to the parent. Touches no router — see the header. */
function LocalTableSearch({
  onChange,
  ...rest
}: FieldProps & { onChange?: (value: string | undefined) => void }) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const commit = React.useCallback((next: string | undefined) => {
    onChangeRef.current?.(next);
  }, []);
  return <SearchField commit={commit} {...rest} />;
}

interface SearchFieldProps extends FieldProps {
  commit: (next: string | undefined) => void;
}

function SearchField({
  value,
  commit,
  id,
  placeholder = t.searchPlaceholder,
  label = t.searchLabel,
  disabled = false,
  className,
}: SearchFieldProps) {
  const [text, setText] = React.useState(value);

  // The last value THIS component committed. Compared against an incoming
  // `value` to tell our own echo apart from a real external change (a cleared
  // filter, browser back/forward, a pasted link).
  const lastPushedRef = React.useRef<string | undefined>(normalise(value));

  // The only place a commit is decided, and the comparison against
  // `lastPushedRef` deliberately happens HERE — at FIRE time — rather than at
  // the keystroke that schedules the debounce. `lastPushedRef` advances only
  // when a send actually fires, so a keystroke-time guard reads a ref that the
  // still-pending timer has not updated yet: emptying the box mid-window
  // compared equal to it (`undefined` vs the not-yet-written `undefined`), the
  // empty commit was SKIPPED, and the surviving timer then wrote the abandoned
  // term. Typing "s", "sa", "s", "" inside one 300 ms window left an empty box
  // over a list filtered by "s" — and the re-seed effect below cannot correct
  // that, because by then the URL and the ref agree.
  const send = React.useCallback(
    (next: string | undefined) => {
      // Nothing to change — a trailing space, a term typed and retyped inside
      // one window, or an Escape on a box that never committed anything.
      // Skipping costs nothing; committing costs a navigation and the page.
      if (next === lastPushedRef.current) return;
      lastPushedRef.current = next;
      commit(next);
    },
    [commit],
  );

  const debouncedSend = useDebouncedCallback(send, SEARCH_DEBOUNCE_MS);

  React.useEffect(() => {
    const next = normalise(value);
    if (next !== lastPushedRef.current) {
      setText(value);
      lastPushedRef.current = next;
    }
  }, [value]);

  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8"
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          // Scheduled UNCONDITIONALLY: every keystroke must replace the pending
          // timer, and `send` decides at fire time whether the needle actually
          // changed. A guard here skipped the reschedule instead, which left the
          // previous keystroke's timer standing and let it commit a term the
          // operator had already deleted — see the note on `send`.
          debouncedSend(normalise(raw));
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Escape clears NOW rather than in 300 ms: it is an explicit command,
          // not typing, and a delayed clear reads as a dropped keypress.
          event.preventDefault();
          // …and clearing NOW is only half of it: the keystrokes just before
          // Escape are still in flight, and a debounce that is not cancelled
          // fires ~300 ms later with the term the operator cancelled. It then
          // re-writes `?search=` AND advances `lastPushedRef` to it, so the
          // re-seed effect above finds URL and ref in agreement and leaves the
          // box empty over a filtered list — no chip, no other on-screen cause.
          // On the `mode="local"` tables the resurrected needle also re-locks
          // drag reordering, since a filtered view cannot send a full ordering.
          debouncedSend.cancel();
          setText("");
          // `send` no-ops when there is nothing committed to clear, so Escape in
          // a box that never reached the URL is silent rather than a navigation.
          send(undefined);
        }}
      />
    </div>
  );
}
