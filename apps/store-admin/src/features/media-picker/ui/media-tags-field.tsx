"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  formatMediaTags,
  isValidMediaTagList,
  parseMediaTags,
} from "@/entities/media";
import { Label } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

export interface MediaTagsFieldProps {
  id: string;
  disabled?: boolean;
  /** The tags as the SERVER currently has them. */
  value: readonly string[];
  /** Receives the whole new list after a chip was added or removed. */
  onCommit: (tags: string[]) => void;
  /** Called instead of `onCommit` when the list would break the API's caps. */
  onInvalid: () => void;
  /** Rendered next to the label — the «Збережено ✓» marker. */
  status?: ReactNode;
}

/** Same tag, any case — the API collapses «Банер» and «банер» into one. */
const sameList = (a: readonly string[], b: readonly string[]) =>
  formatMediaTags(a) === formatMediaTags(b);

/**
 * The asset's tags as chips (wave 198, МТ5).
 *
 * A comma or Enter turns what was typed into a chip and saves the list at
 * once; × on a chip (or Backspace in an empty box) removes one. The old field
 * was one comma-separated string, which meant a typo in the third tag had to be
 * found by eye inside a line of text.
 *
 * ── Seeded from async data, so guarded (`docs/conventions/forms.md` 1b) ────
 * The chips are local state, because a save round-trips: between the click and
 * the server's answer the list on screen must already be the new one, or the
 * chip just added would vanish and reappear. A new `value` from the server is
 * taken only when it differs from what THIS field last sent — its own echo
 * changes nothing, a genuine external change (another tab) re-seeds.
 *
 * Validation happens BEFORE the request, with the same caps as the DTO (20
 * tags, 50 characters each), because the API's 400 would otherwise reach the
 * operator as a bare «Не вдалося зберегти».
 */
export function MediaTagsField({
  id,
  disabled = false,
  value,
  onCommit,
  onInvalid,
  status,
}: MediaTagsFieldProps) {
  const [tags, setTags] = useState<string[]>(() => [...value]);
  const [draft, setDraft] = useState("");
  const lastPushedRef = useRef<readonly string[]>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sameList(value, lastPushedRef.current)) {
      setTags([...value]);
      lastPushedRef.current = value;
    }
  }, [value]);

  const commit = (next: string[]): boolean => {
    if (sameList(next, tags)) return true;
    if (!isValidMediaTagList(next)) {
      onInvalid();
      return false;
    }
    setTags(next);
    lastPushedRef.current = next;
    onCommit(next);
    return true;
  };

  /** Turn `parts` into chips; `true` when they were accepted (or were dupes). */
  const add = (parts: string[]): boolean =>
    commit(parseMediaTags(formatMediaTags([...tags, ...parts])));

  const remove = (tag: string) => {
    commit(tags.filter((one) => one !== tag));
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{t.tagsLabel}</Label>
        {status}
      </div>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 shadow-xs transition-shadow",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled
            ? "cursor-not-allowed bg-disabled text-disabled-foreground"
            : "bg-transparent dark:bg-input/30",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                aria-label={t.tagRemoveAria(tag)}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(tag);
                }}
                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={t.tagsPlaceholder}
          aria-describedby={`${id}-hint`}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw.includes(",")) {
              setDraft(raw);
              return;
            }
            // Everything before the last comma is finished; the rest is still
            // being typed. A rejected list keeps the text so nothing is lost.
            const parts = raw.split(",");
            const rest = parts.pop() ?? "";
            setDraft(add(parts) ? rest.trimStart() : raw);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Never let Enter reach a surrounding form.
              event.preventDefault();
              if (draft.trim() && add([draft])) setDraft("");
            } else if (
              event.key === "Backspace" &&
              draft === "" &&
              tags.length > 0
            ) {
              event.preventDefault();
              commit(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim() && add([draft])) setDraft("");
          }}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t.tagsHint}
      </p>
    </div>
  );
}
