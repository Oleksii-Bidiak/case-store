"use client";

import { useEffect, useRef, useState } from "react";

/** Whether a drag carries files from the desktop (not text, not a link). */
function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  // `DOMStringList` in older engines, a frozen array in current ones.
  return Array.from(types as ArrayLike<string>).includes("Files");
}

export interface PageFileDropState {
  /** A file drag is over the window right now. */
  isDragging: boolean;
  /**
   * How many files the drag carries, when the browser says (it reports the
   * count through `items` on `dragenter`/`dragover`, never the files
   * themselves). `0` = unknown.
   */
  count: number;
}

/**
 * Turn the WHOLE WINDOW into a drop target for files (wave 198, media library
 * МТ3: «скинути можна будь-куди»).
 *
 * The old zone was a box in the middle of the page, and a file let go one
 * centimetre outside it made the browser navigate to the image — leaving the
 * admin, and with it any half-typed alt text. Listening on `window` means there
 * is no "outside" any more.
 *
 * ── Why a depth counter ───────────────────────────────────────────────────
 * `dragenter`/`dragleave` fire for EVERY element the cursor crosses, so a plain
 * boolean flickers off each time the cursor moves from a card onto its badge.
 * Counting enters minus leaves is the standard way to know the drag is still
 * somewhere over the page.
 *
 * ── Only file drags ───────────────────────────────────────────────────────
 * Selecting text and dragging it, or dragging a link, must not paint an upload
 * overlay over the screen; `dataTransfer.types` says which kind of drag this is
 * before anything is dropped.
 *
 * `enabled: false` (an operator without `media:write`) registers nothing — the
 * browser keeps its own behaviour, as it did before.
 */
export function usePageFileDrop({
  enabled,
  onFiles,
}: {
  enabled: boolean;
  onFiles: (files: File[]) => void;
}): PageFileDropState {
  const [state, setState] = useState<PageFileDropState>({
    isDragging: false,
    count: 0,
  });

  // Current without re-subscribing the window listeners on every render.
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;

    const reset = () => {
      depth = 0;
      setState({ isDragging: false, count: 0 });
    };

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setState({
        isDragging: true,
        count: event.dataTransfer?.items?.length ?? 0,
      });
    };

    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // Without this the browser refuses the drop (and then opens the file).
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setState({ isDragging: false, count: 0 });
    };

    const onDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0 && !carriesFiles(event)) return;
      event.preventDefault();
      reset();
      if (files.length > 0) onFilesRef.current(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    // A drag cancelled with Esc ends with `dragend` on the source — which is
    // outside this document for a desktop file — so a drop or a leave is the
    // only reliable end. `blur` covers the window losing focus mid-drag.
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", reset);
    };
  }, [enabled]);

  return enabled ? state : { isDragging: false, count: 0 };
}
