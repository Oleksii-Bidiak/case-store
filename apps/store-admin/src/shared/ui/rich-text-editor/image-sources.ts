"use client";

import * as React from "react";
import type { RichTextImage } from "./rich-text-editor";

/**
 * Where pictures for the text can come from, supplied from ABOVE `shared`
 * (wave 198, TASK-1071).
 *
 * The editor may not import the media library (`shared` → `entities`/`features`
 * is an upward import), so it learns what is available from whoever sits in its
 * `imagePicker` slot — in this app, `MediaPickerEditorButton`. Every source is
 * optional and the menu offers only those that exist; «За посиланням…» needs
 * nothing and is the editor's own.
 */
export interface RichTextImageSources {
  /**
   * Open the media library. The editor passes the callback that puts the
   * chosen picture where it belongs (at the caret, or in place of a selected
   * picture).
   */
  openLibrary?: (onPick: (image: RichTextImage) => void) => void;
  /**
   * Upload one file into the media library and resolve to the picture to put
   * in the text. Reject with an `Error` whose message the operator can act on.
   * `onProgress` takes 0–100.
   */
  upload?: (
    file: File,
    onProgress: (percent: number) => void,
  ) => Promise<RichTextImage>;
}

type Register = (sources: RichTextImageSources | null) => void;

/** Provided by `RichTextEditor` around its toolbar slot. */
export const RichTextImageSourcesContext = React.createContext<Register | null>(
  null,
);

/**
 * Tell the surrounding editor what this component can supply.
 *
 * WHY A CONTEXT AND NOT A SECOND SLOT ARGUMENT. Every form writes the slot as
 * `imagePicker={(insert) => <MediaPickerEditorButton insert={insert} />}`; a
 * new argument would reach none of them without editing all three forms. The
 * component in the slot registering itself works with the call sites as they
 * are.
 *
 * The registered functions read the LATEST props through a ref, so a parent
 * re-render does not re-register (which would flash the menu items), and only
 * a change in WHICH sources exist does.
 */
export function useRichTextImageSources(sources: RichTextImageSources | null) {
  const register = React.useContext(RichTextImageSourcesContext);
  const latest = React.useRef(sources);
  React.useEffect(() => {
    latest.current = sources;
  });

  const hasLibrary = Boolean(sources?.openLibrary);
  const hasUpload = Boolean(sources?.upload);

  React.useEffect(() => {
    if (!register) return;
    register({
      openLibrary: hasLibrary
        ? (onPick) => latest.current?.openLibrary?.(onPick)
        : undefined,
      upload: hasUpload
        ? (file, onProgress) => {
            const upload = latest.current?.upload;
            return upload
              ? upload(file, onProgress)
              : Promise.reject(new Error("upload is no longer available"));
          }
        : undefined,
    });
    return () => register(null);
  }, [register, hasLibrary, hasUpload]);
}
