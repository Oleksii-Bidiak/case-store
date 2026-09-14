import { Node, mergeAttributes } from "@tiptap/react";

/**
 * The `<img>` node for the admin editor (TASK-547).
 *
 * ── Why this is ours and not `@tiptap/extension-image` ─────────────────────
 * The official extension carries a third attribute, `title`, which the server's
 * allow-list does not keep (`sanitize-rich-text.ts` → `img: ['src', 'alt']`).
 * A `title` typed here would survive the editor, survive the form, and then be
 * dropped on save with nothing said — the exact class of silent loss the
 * TASK-467 banner existed to warn about, only in the other direction. Declaring
 * the node ourselves makes the editor's schema EXACTLY the server's allow-list,
 * which is also what lets that banner go: there is no longer any `<img>`
 * attribute one side keeps and the other throws away.
 *
 * It costs one dependency less, too, but that is the lesser reason. If the
 * server's list ever grows (a `width`, say), this file and
 * `sanitize-rich-text.ts` are the two places that must change together.
 *
 * ── Block, not inline ──────────────────────────────────────────────────────
 * Matching `@tiptap/extension-image`'s default. Vendor HTML from the catalogue
 * import routinely writes `<p>текст <img …></p>`; with a block node ProseMirror
 * lifts the image out and splits the paragraph around it, so the picture and
 * both halves of the text survive — the image simply stops sitting inside the
 * sentence. Nothing is lost, and an image floated mid-paragraph is not something
 * this editor offers to create anyway.
 *
 * ── No `src` validation here ───────────────────────────────────────────────
 * Unlike links, which are checked against the server's scheme list before they
 * are applied: a link's href is typed by hand, while every `src` that reaches
 * this node comes either from the media library (our own storage) or from
 * already-stored content the server sanitised on the way in. The server checks
 * `img` schemes on every save regardless (`http`, `https`, `data`).
 */
export const ImageNode = Node.create({
  name: "image",
  group: "block",
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      // `null`, not `""`: an empty alt is a real statement in HTML ("decorative,
      // skip me"), so it must be distinguishable from "no alt at all". Tiptap
      // omits a null attribute when serialising and keeps an empty one.
      alt: { default: null },
    };
  },

  parseHTML() {
    // `img[src]` and not bare `img`: a src-less image is not content, and
    // keeping it would round-trip as `<img>` — markup the storefront renders as
    // a broken-image icon.
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});
