import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Where a picture that is still uploading will land (wave 198, РЕ6).
 *
 * ── Why a decoration and not a node ────────────────────────────────────────
 * A placeholder NODE would be part of the document, so `getHTML()` — what the
 * form saves — would carry it, and a save pressed mid-upload would store markup
 * the server strips (or worse, keeps as an empty block). A widget DECORATION is
 * drawn by the view only: the document, and therefore `onChange`, never sees
 * it. ProseMirror maps its position through every edit, which is what lets the
 * operator keep typing above it while the file uploads (the hint under the bar
 * says exactly that) and still have the picture land in the right place.
 *
 * The widget's DOM is built here, once, and kept by id so progress can be
 * written straight into it — re-creating the decoration on every progress tick
 * would re-render it 50 times a second for nothing.
 */

export const imageUploadPlaceholderKey = new PluginKey<DecorationSet>(
  "imageUploadPlaceholder",
);

type PlaceholderMeta =
  | { add: { id: string; pos: number; element: HTMLElement } }
  | { remove: { id: string } };

export const ImageUploadPlaceholder = Extension.create({
  name: "imageUploadPlaceholder",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: imageUploadPlaceholderKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(imageUploadPlaceholderKey) as
              PlaceholderMeta | undefined;
            if (meta && "add" in meta) {
              const { id, pos, element } = meta.add;
              next = next.add(tr.doc, [
                Decoration.widget(pos, () => element, { id, side: -1 }),
              ]);
            } else if (meta && "remove" in meta) {
              next = next.remove(
                next.find(
                  undefined,
                  undefined,
                  (spec) => spec.id === meta.remove.id,
                ),
              );
            }
            return next;
          },
        },
        props: {
          decorations: (state) => imageUploadPlaceholderKey.getState(state),
        },
      }),
    ];
  },
});

/** Where the placeholder `id` currently sits, or `null` once it is gone. */
export function findPlaceholder(state: EditorState, id: string): number | null {
  const set = imageUploadPlaceholderKey.getState(state);
  const found = set?.find(undefined, undefined, (spec) => spec.id === id);
  return found && found.length > 0 ? found[0].from : null;
}

export interface PlaceholderCopy {
  label: string;
  hint: string;
}

/**
 * The bar drawn in place of the picture: «Завантажуємо name · 2,4 МБ · 64%»,
 * a progress bar, and the hint that typing may go on.
 *
 * Plain DOM, because a widget decoration is DOM — the classes are the app's
 * tokens like everywhere else, written as strings Tailwind scans. `role=status`
 * so the label change is announced without stealing focus from the text.
 */
export function createPlaceholderElement(copy: PlaceholderCopy) {
  const root = document.createElement("div");
  root.contentEditable = "false";
  root.dataset.slot = "rich-text-upload-placeholder";
  root.className =
    "not-prose my-3 flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted p-3";

  const label = document.createElement("p");
  label.setAttribute("role", "status");
  label.className = "m-0 text-sm text-foreground";
  label.textContent = copy.label;

  const track = document.createElement("div");
  track.className = "h-1.5 w-full overflow-hidden rounded-full bg-background";
  const bar = document.createElement("div");
  bar.className =
    "h-full rounded-full bg-primary transition-all motion-reduce:transition-none";
  bar.style.width = "2%";
  track.append(bar);

  const hint = document.createElement("p");
  hint.className = "m-0 text-xs text-muted-foreground";
  hint.textContent = copy.hint;

  root.append(label, track, hint);

  return {
    element: root,
    update(nextLabel: string, percent: number | null) {
      label.textContent = nextLabel;
      if (percent !== null) bar.style.width = `${Math.max(2, percent)}%`;
    },
  };
}
