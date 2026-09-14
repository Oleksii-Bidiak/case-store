"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/shared/ui";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";

/**
 * How long the field waits before saving what was typed.
 *
 * Deliberately its own constant rather than the admin tables' `SEARCH_DEBOUNCE_MS`:
 * that number is tuned for a keystroke that only narrows a list, and the two are
 * free to diverge. Same 300 ms today because an operator typing an alt sentence
 * pauses about that often, and a longer wait makes the «Збережено» marker feel
 * disconnected from the typing that earned it.
 */
const SAVE_DEBOUNCE_MS = 300;

export interface MediaMetadataFieldProps {
  id: string;
  label: string;
  hint: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** The value as the SERVER currently has it. */
  value: string;
  /**
   * The canonical form of some raw text — what the server will echo back once
   * it has stored it. Trimming for alt text; parse-then-reformat for the tag
   * list, which collapses «Банер, банер» to one tag.
   *
   * Getting this wrong is not cosmetic: the guard below compares an incoming
   * `value` against it to tell this field's own echo apart from a real external
   * change, so a normaliser that does not match the server turns every
   * successful save into a "the value changed underneath us" re-seed — mid-word,
   * under the operator's cursor.
   */
  normalise: (raw: string) => string;
  /** Receives the debounced, normalised text. Fires only on a real change. */
  onCommit: (next: string) => void;
}

/**
 * A metadata field that saves itself — the alt text and the tag list of one
 * media asset.
 *
 * ── The value arrives asynchronously, so the seed needs a guard ─────────────
 * `docs/conventions/forms.md` rule 1b. This is a text input an operator types
 * into while `GET /admin/media/:id` can answer again at any moment (the save
 * itself writes the server's response back into the cache), so it must stay
 * MOUNTED and re-seed only on a genuine EXTERNAL change — told apart from this
 * field's own echo by `lastPushedRef`. A `key`-remount keyed to the value would
 * destroy focus on every keystroke, which is the exact bug TASK-117 removed from
 * the storefront; seeding `useState` with no guard at all would leave the box
 * showing an edit the server never took.
 *
 * ── The commit decision happens at FIRE time, not at the keystroke ──────────
 * `lastPushedRef` advances only when a send actually fires. A guard at
 * keystroke-time reads a ref the still-pending timer has not updated yet, so
 * clearing the box inside one debounce window compares equal to it, the empty
 * commit is skipped, and the surviving timer writes back the text the operator
 * just deleted. `TableSearch` carries the same note for the same reason — it is
 * the same shape of bug, not a coincidence.
 */
export function MediaMetadataField({
  id,
  label,
  hint,
  placeholder,
  maxLength,
  disabled = false,
  value,
  normalise,
  onCommit,
}: MediaMetadataFieldProps) {
  const [text, setText] = useState(value);

  /** The last value THIS field committed, in the server's own spelling. */
  const lastPushedRef = useRef(normalise(value));

  const onCommitRef = useRef(onCommit);
  const normaliseRef = useRef(normalise);
  useEffect(() => {
    onCommitRef.current = onCommit;
    normaliseRef.current = normalise;
  });

  const send = (raw: string) => {
    const next = normaliseRef.current(raw);
    // Nothing to change — a trailing space, a word typed and retyped inside one
    // window. Skipping costs nothing; committing costs a request.
    if (next === lastPushedRef.current) return;
    lastPushedRef.current = next;
    onCommitRef.current(next);
  };

  const debouncedSend = useDebouncedCallback(send, SAVE_DEBOUNCE_MS);

  useEffect(() => {
    const next = normaliseRef.current(value);
    if (next !== lastPushedRef.current) {
      setText(value);
      lastPushedRef.current = next;
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={text}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          // Scheduled unconditionally: every keystroke must replace the pending
          // timer, and `send` decides at fire time whether anything changed.
          debouncedSend(raw);
        }}
        onBlur={(event) => {
          // Leaving the field is an explicit "I am done here" — waiting out the
          // debounce would let a click straight onto «Видалити» race the save.
          debouncedSend.cancel();
          send(event.target.value);
        }}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
