import { Table, TableView } from "@tiptap/extension-table";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Tiptap's `Table` node plus a table CAPTION (TASK-548).
 *
 * The server's `sanitizeRichText()` keeps `<caption>`, and the catalogue import
 * writes vendor HTML through it, so a stored table can carry one nobody typed
 * here. prosemirror-tables has no caption node — `table` holds `tableRow+` and
 * nothing else — and handed a `<caption>` it does something worse than drop
 * it: the caption's text lands as a new FIRST ROW with a phantom empty cell,
 * and the operator's first keystroke saves that restructured table.
 *
 * So the caption lives on the table node as a plain-text attribute instead:
 *
 * - parsing reads the text of the table's own `<caption>` into `caption`, and
 *   an `ignore` rule keeps the element itself out of the row parser;
 * - `getHTML()` writes it back as the table's first child — where HTML
 *   requires it — so the round trip is lossless for the text;
 * - {@link CaptionedTableView} shows it above the grid, not editable: the
 *   editor has no caption-authoring UI (yet), and a caption the operator could
 *   type into but that never reached the document would lie.
 *
 * Inline formatting inside a caption (`<b>` …) is flattened to its text: an
 * attribute holds a string, not marks. The words survive; the bold does not.
 */

/** Text of a table's own (direct-child) `<caption>`, or `null` for none/empty. */
function captionText(table: HTMLElement): string | null {
  const caption = Array.from(table.children).find(
    (child) => child.tagName === "CAPTION",
  );
  const text = caption?.textContent?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/**
 * The editing surface's table view: Tiptap's own (colgroup kept in sync with
 * the columns) plus the caption drawn above the grid. `contenteditable=false`
 * and outside `contentDOM`, so ProseMirror neither edits it nor re-parses it —
 * `TableView.ignoreMutation` already ignores everything outside the tbody.
 */
export class CaptionedTableView extends TableView {
  private captionEl: HTMLTableCaptionElement | null = null;

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.syncCaption(node);
  }

  update(node: ProseMirrorNode): boolean {
    if (!super.update(node)) return false;
    this.syncCaption(node);
    return true;
  }

  private syncCaption(node: ProseMirrorNode): void {
    const text = node.attrs.caption as string | null;
    if (!text) {
      this.captionEl?.remove();
      this.captionEl = null;
      return;
    }
    if (!this.captionEl) {
      this.captionEl = document.createElement("caption");
      this.captionEl.setAttribute("contenteditable", "false");
      this.table.insertBefore(this.captionEl, this.table.firstChild);
    }
    this.captionEl.textContent = text;
  }
}

export const CaptionedTable = Table.extend({
  addOptions() {
    return {
      ...this.parent!(),
      View: CaptionedTableView,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => captionText(element),
        // Written by `renderHTML` below as an element, never as an attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      ...(this.parent?.() ?? []),
      // The caption's text is already on the table node; its element must not
      // reach the row parser, which would turn it into a row (see above).
      { tag: "caption", ignore: true },
    ];
  },

  renderHTML(props) {
    const spec = this.parent!(props) as unknown as unknown[];
    const caption = props.node.attrs.caption as string | null;
    if (!caption) return spec as unknown as DOMOutputSpec;
    // Tiptap renders `['table', attrs, colgroup, ['tbody', 0]]` — or that
    // inside a `div.tableWrapper` when `renderWrapper` is on, which this editor
    // never turns on. `<caption>` must be the table's first child.
    const [tag, attrs, ...children] = spec;
    return [tag, attrs, ["caption", {}, caption], ...children] as DOMOutputSpec;
  },
});
