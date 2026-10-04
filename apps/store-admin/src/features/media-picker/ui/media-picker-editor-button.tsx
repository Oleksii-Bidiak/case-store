"use client";

import { useState } from "react";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
// Deep imports, not the slice barrel: the form tests mock
// `@/shared/ui/rich-text-editor` wholesale, and this button must still render
// inside their stub.
import { RichTextImageMenu } from "@/shared/ui/rich-text-editor/image-actions";
import { useRichTextImageSources } from "@/shared/ui/rich-text-editor/image-sources";
import type { RichTextImage } from "@/shared/ui/rich-text-editor/rich-text-editor";
import { dict } from "@/shared/config";
import { useEditorImageUpload } from "../model/use-editor-image-upload";
import { MediaPicker } from "./media-picker";

const t = dict.mediaPicker;

export interface MediaPickerEditorButtonProps {
  /** The editor's own insert callback, handed to the slot by `RichTextEditor`. */
  insert: (image: RichTextImage) => void;
}

/**
 * The media library inside the rich-text editor (TASK-547; wave 198 РЕ1–РЕ6).
 *
 * WHY IT EXISTS AS ITS OWN COMPONENT. `RichTextEditor` lives in `shared/ui` and
 * may not import `@/entities/media` or this feature — so it takes the image
 * control as a SLOT. Three forms fill that slot (product, page, article) with
 * exactly `<MediaPickerEditorButton insert={insert} />`, and since wave 198 this
 * component is where all of the editor's library features come from:
 *
 * - it renders «Зображення ▾» (`RichTextImageMenu`, the editor's own menu);
 * - it REGISTERS with the editor what this operator may use:
 *   `media:read` → «З медіатеки…» (the picker, opened from the menu),
 *   `media:write` → «Завантажити з комп’ютера…» and drop/paste uploads into the
 *   library (`useEditorImageUpload`);
 * - the picker dialog itself, with no trigger of its own.
 *
 * Holding neither key renders NOTHING — the toolbar such an operator had
 * before, unchanged (the picker's own rule since TASK-441).
 *
 * The alt text comes along with the picture: an image dropped into an article
 * body with no alt is an accessibility defect, and asking the operator to
 * retype per article the description the library already holds is how it
 * stays one.
 */
export function MediaPickerEditorButton({
  insert,
}: MediaPickerEditorButtonProps) {
  const { can } = useAuth();
  const canRead = can(PERM.mediaRead);
  const canWrite = can(PERM.mediaWrite);

  /** Where the next library pick goes; `null` = the dialog is closed. */
  const [pickInto, setPickInto] = useState<{
    place: (image: RichTextImage) => void;
  } | null>(null);

  const upload = useEditorImageUpload();

  useRichTextImageSources(
    canRead || canWrite
      ? {
          openLibrary: canRead ? (place) => setPickInto({ place }) : undefined,
          upload: canWrite ? upload : undefined,
        }
      : null,
  );

  if (!canRead && !canWrite) return null;

  return (
    <>
      <RichTextImageMenu label={t.editorInsert} />
      <MediaPicker
        open={pickInto !== null}
        onOpenChange={(open) => {
          if (!open) setPickInto(null);
        }}
        onPick={(asset) =>
          (pickInto?.place ?? insert)({ src: asset.url, alt: asset.alt })
        }
      />
    </>
  );
}
