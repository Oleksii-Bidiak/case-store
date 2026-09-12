"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Link2,
  Link2Off,
  Table as TableIcon,
  Trash2,
  RemoveFormatting,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export interface RichTextEditorProps {
  /** Current HTML value (Tiptap output). */
  value: string;
  /** Called with the new HTML on every edit. */
  onChange: (html: string) => void;
  /**
   * Identity of the entity being edited — pass the same id the parent form keys
   * its `reset()` / `values` on (forms.md Rule 2b). When it changes, the
   * "the admin has edited here" latch is cleared so the next entity's content
   * can be seeded. Omit it only where one mount edits exactly one entity.
   */
  resetKey?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * URI schemes this editor will attach to a link, deliberately identical to the
 * server's `allowedSchemes` in `sanitize-rich-text.ts` (TASK-434).
 *
 * Tiptap's own default is WIDER than ours — it also passes `ftp`, `ftps`,
 * `tel`, `callto`, `sms`, `cid`, `xmpp` — and the `protocols` option ADDS to
 * that list rather than replacing it, so configuring `protocols` alone narrows
 * nothing. A `tel:` link therefore looks accepted in the editor and comes back
 * from the first save as `<a>` with no href at all, because sanitize-html drops
 * the attribute it cannot allow. Rejecting it here means the operator is told
 * at the moment they type it, which is the only moment they can fix it.
 *
 * Schemeless (relative) hrefs — `/legal/offer`, `#specs` — are ALLOWED, because
 * the sanitizer keeps them too: they are how a description links to another
 * page of this same storefront. Protocol-relative `//evil.tld` is not: the
 * server sets `allowProtocolRelative: false`.
 */
const SERVER_ALLOWED_SCHEMES = ["http", "https", "mailto"] as const;

/**
 * Characters a browser strips from a URL before resolving it — the classic
 * `java\tscript:` / `java\nscript:` obfuscation. They are removed BEFORE the
 * scheme is read, exactly as Tiptap and sanitize-html do, so the check cannot
 * be walked around by padding the scheme.
 */
const URI_IGNORED_CHARS = /[\s\x00-\x20\x7f]/g;
const URI_SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Would the server's `sanitizeRichText()` keep this href? */
function isServerSafeHref(url: string): boolean {
  const normalized = url.replace(URI_IGNORED_CHARS, "");
  if (!normalized) return false;
  const scheme = URI_SCHEME.exec(normalized)?.[1]?.toLowerCase();
  if (!scheme) {
    // Relative — but not protocol-relative, which the server refuses.
    return !normalized.startsWith("//");
  }
  return (SERVER_ALLOWED_SCHEMES as readonly string[]).includes(scheme);
}

/** Non-command toolbar actions, i.e. the ones that open UI instead of editing. */
interface ToolbarActions {
  openLinkEditor: () => void;
}

interface ToolbarButton {
  /** Icon-only button. Mutually exclusive with {@link ToolbarButton.short}. */
  icon?: LucideIcon;
  /**
   * Short visible text for actions no icon says clearly. "Add row" and "delete
   * row" have no icon pair in lucide that a person can tell apart at 16px —
   * three near-identical grid glyphs in a row is worse than two words.
   */
  short?: string;
  /** `aria-label` + tooltip; also the React key, so it must be unique. */
  label: string;
  run: (editor: Editor, actions: ToolbarActions) => void;
  isActive?: (editor: Editor) => boolean;
  /**
   * Extra precondition beyond the editor being editable — table row/column
   * commands are meaningless (and no-ops) outside a table. Default: always on.
   */
  isEnabled?: (editor: Editor) => boolean;
}

/** Table row/column commands only apply with the caret inside a table. */
const inTable = (e: Editor) => e.isActive("table");

/**
 * Toolbar actions. Marks, headings, lists, blocks and links all come from
 * StarterKit (v3 bundles Underline AND Link); tables come from TableKit.
 */
const TOOLBAR_GROUPS: ToolbarButton[][] = [
  [
    {
      icon: Bold,
      label: "Жирний",
      run: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Курсив",
      run: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
    },
    {
      icon: UnderlineIcon,
      label: "Підкреслення",
      run: (e) => e.chain().focus().toggleUnderline().run(),
      isActive: (e) => e.isActive("underline"),
    },
    {
      icon: Strikethrough,
      label: "Закреслення",
      run: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive("strike"),
    },
  ],
  [
    {
      icon: Heading1,
      label: "Заголовок 1",
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: (e) => e.isActive("heading", { level: 1 }),
    },
    {
      icon: Heading2,
      label: "Заголовок 2",
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (e) => e.isActive("heading", { level: 2 }),
    },
    {
      icon: Heading3,
      label: "Заголовок 3",
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: (e) => e.isActive("heading", { level: 3 }),
    },
    {
      icon: Heading4,
      label: "Заголовок 4",
      run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
      isActive: (e) => e.isActive("heading", { level: 4 }),
    },
  ],
  [
    {
      icon: List,
      label: "Маркований список",
      run: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Нумерований список",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive("orderedList"),
    },
  ],
  [
    {
      icon: Link2,
      label: "Посилання",
      // The only toolbar action that cannot be a command: it needs a URL from
      // the operator first, so it opens the inline editor below the toolbar.
      run: (_editor, actions) => actions.openLinkEditor(),
      isActive: (e) => e.isActive("link"),
    },
    {
      icon: Link2Off,
      label: "Зняти посилання",
      run: (e) => e.chain().focus().extendMarkRange("link").unsetLink().run(),
      isEnabled: (e) => e.isActive("link"),
    },
  ],
  [
    {
      icon: TableIcon,
      label: "Вставити таблицю",
      run: (e) =>
        e
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      short: "+ рядок",
      label: "Додати рядок",
      run: (e) => e.chain().focus().addRowAfter().run(),
      isEnabled: inTable,
    },
    {
      short: "− рядок",
      label: "Видалити рядок",
      run: (e) => e.chain().focus().deleteRow().run(),
      isEnabled: inTable,
    },
    {
      short: "+ стовпець",
      label: "Додати стовпець",
      run: (e) => e.chain().focus().addColumnAfter().run(),
      isEnabled: inTable,
    },
    {
      short: "− стовпець",
      label: "Видалити стовпець",
      run: (e) => e.chain().focus().deleteColumn().run(),
      isEnabled: inTable,
    },
    {
      icon: Trash2,
      label: "Видалити таблицю",
      run: (e) => e.chain().focus().deleteTable().run(),
      isEnabled: inTable,
    },
  ],
  [
    {
      icon: Quote,
      label: "Цитата",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive("blockquote"),
    },
    {
      icon: Code,
      label: "Блок коду",
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
      isActive: (e) => e.isActive("codeBlock"),
    },
    {
      icon: Minus,
      label: "Горизонтальна лінія",
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      icon: RemoveFormatting,
      label: "Очистити форматування",
      run: (e) => e.chain().focus().clearNodes().unsetAllMarks().run(),
    },
  ],
];

/**
 * Table styling for the editing surface (TASK-434).
 *
 * Kept as its own constant because it is one of THREE hand-kept copies of the
 * same rules — the other two are `PROSE` in `../rich-text-preview` and
 * `RICH_TEXT_PROSE` in the storefront's `shared/ui/rich-text.tsx`. They are
 * copies rather than one import on purpose: the storefront and the admin panel
 * are separate apps (FSD forbids importing across them), and the editor must
 * not pull the preview module into the Tiptap chunk. If you change one, change
 * all three — a table that looks right while editing and wrong once published
 * is the failure this comment exists to prevent.
 *
 * `table-fixed` + `w-full` is what keeps a wide table from overflowing on a
 * narrow screen: column widths stop depending on content, so cells wrap
 * instead of pushing the page sideways. A scroll container would need a
 * wrapper element around the table, and the server's allow-list has no tag to
 * put it in — `sanitizeRichText()` would strip it on the next save.
 */
const TABLE_PROSE = [
  "[&_table]:my-4 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2",
  "[&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:break-words",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
  "[&_td]:align-top [&_td]:text-foreground [&_td]:break-words",
  // Tiptap wraps every cell's content in a paragraph; the prose paragraph
  // spacing around it would push each cell twice as tall as its text.
  "[&_th_p]:my-0 [&_td_p]:my-0",
].join(" ");

/**
 * Markup the SERVER keeps but THIS editor's schema throws away (TASK-467).
 *
 * Derived by subtracting the Tiptap schema configured above from the shared
 * server-side allow-list in
 * `apps/store-api/src/common/sanitize/sanitize-rich-text.ts`
 * (`RICH_TEXT_POLICY.allowedTags`). After TASK-434 that difference is exactly
 * one tag:
 *
 *   allow-list                    this schema
 *   img ......................... no Image extension → dropped
 *
 * Everything else the server keeps, this editor can now represent:
 *
 *   h1…h4 ....................... `heading: { levels: [1, 2, 3, 4] }`
 *   a ........................... Link (bundled by StarterKit v3)
 *   table/tr/th/td .............. TableKit
 *   thead/tbody ................. parsed away, re-emitted as <tbody> — the
 *                                 ProseMirror table model has no separate
 *                                 header SECTION, only header CELLS, so a
 *                                 `<thead><tr><th>` round-trips as
 *                                 `<tbody><tr><th>`: same cells, same text,
 *                                 no loss to warn about.
 *
 * `img` is not an oversight either: rendering images means uploading them, and
 * the shared upload endpoint (`POST /api/admin/uploads/content`, TASK-424) is
 * not merged. Adding an Image extension that can only take a pasted URL would
 * trade a loud warning for a half-feature, so the warning stays until the
 * endpoint lands.
 *
 * This is not a hypothetical: the supplier catalogue import writes vendor HTML
 * straight into the same `description` column via `ProductService.create/update`
 * → `sanitizeRichText()`, so a real product description may legitimately carry
 * an `<img>` the operator never typed. Seeding such a document is harmless — the `setContent` below passes
 * `emitUpdate: false` — but `editor.getHTML()` is ALREADY the truncated
 * document, so the operator's first keystroke would fire `onUpdate`, push the
 * truncated HTML into the form and save it. Silent, irreversible, and never
 * chosen by anyone.
 *
 * WHEN EITHER SIDE MOVES, THIS TABLE IS THE THING TO UPDATE — nothing else in
 * this file hardcodes the schema.
 *
 * Detection is by TAG PRESENCE, never by whole-document comparison. Tiptap
 * always reformats what it round-trips (attribute order, `<b>` → `<strong>`,
 * self-closing tags), so an equality check would fire on ordinary content — and
 * a false banner on every product would be worse than the bug it warns about.
 * Probing the OUTPUT too (not just the input) keeps this self-correcting: the
 * `table`, `h1` and `h4` probes removed here would have gone quiet on their
 * own the moment TableKit and the wider heading levels landed, list or no
 * list. The list is trimmed anyway, so the next reader is not left wondering
 * which of these the editor actually loses.
 */
const LOSSY_CONSTRUCTS: ReadonlyArray<{ probe: RegExp; label: string }> = [
  { probe: /<img[\s/>]/i, label: dict.contentPreview.unsupportedImages },
];

/**
 * Human-readable list of the constructs present in `input` but gone from
 * `rendered` (the editor's own HTML after seeding), or `""` when nothing was
 * lost. A string rather than an array on purpose: `useState` bails out of a
 * re-render on an equal string, so ordinary content — the overwhelming majority
 * — costs no extra render pass, and the banner needs the joined form anyway.
 *
 * The de-duplication survives a one-entry list on purpose: probes are per TAG
 * and labels are per CONCEPT, so two probes sharing a label (as `h1`/`h4` did
 * until TASK-434) is the normal case whenever this list grows again.
 */
function detectDroppedConstructs(input: string, rendered: string): string {
  const dropped: string[] = [];
  for (const { probe, label } of LOSSY_CONSTRUCTS) {
    if (dropped.includes(label)) continue;
    if (probe.test(input) && !probe.test(rendered)) dropped.push(label);
  }
  return dropped.join(", ");
}

/**
 * Headless Tiptap rich-text editor styled to match the admin's Input/Textarea.
 *
 * Controlled component: the `value` prop is the single source of truth.
 *
 * Tiptap's own `content` option is captured ONCE, when `useEditor` builds the
 * instance inside an effect — and the three admin forms seed their content a
 * beat later (`reset()` in a parent effect for pages/blog posts, RHF's `values`
 * prop for products). On a client-side navigation the `ssr:false` chunk is
 * already cached, so the editor is born with `content: ""`, stays visually
 * empty until a full reload, and saving from that state wipes the stored text
 * (TASK-399). The `useEffect` below is therefore the real seeding path, written
 * as the forms.md Rule 1b guard (`lastPushedRef`) applied to a non-input
 * control:
 *
 * - a `value` we have not seeded yet that differs from the document is a
 *   genuine external change → push it in unconditionally. Focus is NOT a veto:
 *   an editor the admin merely clicked into still has to receive the server
 *   text, and the old `!editor.isFocused` short-circuit dropped that seed for
 *   good, because nothing re-triggers the effect afterwards.
 * - a `value` equal to the editor's own HTML is our own `onChange` echo →
 *   record it and leave the document (and the caret) alone.
 * - once the admin has actually edited here, later external values are recorded
 *   but never applied — losing typed work is worse than showing stale server
 *   text (forms.md Rule 2: a background refetch must not discard in-progress
 *   edits).
 *
 * That latch is per ENTITY, not per mount, which is Rule 2b's other half: were
 * this instance ever reused across a client-side navigation from one entity's
 * edit page straight into another's, a latch left standing from the first would
 * refuse the second's content for good, and the next keystroke would save that
 * stale document under the new entity. No route does that today — every path
 * into the three edit forms goes through a list route or a different component,
 * so React unmounts — but the guard must not depend on a fact about routing
 * that lives nowhere near this file. `resetKey` carries the entity id and
 * clears both refs when it changes, from an effect declared ahead of the
 * seeding one so the clear always lands first.
 *
 * Seeding has a second failure mode, unrelated to timing: the incoming HTML may
 * contain markup this editor's schema cannot represent, in which case the seed
 * silently truncates the document (TASK-467). That is detected right after each
 * seeding `setContent` and answered with a banner + a read-only latch — see
 * {@link LOSSY_CONSTRUCTS} above for the full reasoning and the maintenance
 * rule.
 *
 * Always import the default export from `./index` (dynamic, ssr:false) — Tiptap
 * touches the DOM on init and must not render on the server.
 */
export function RichTextEditor({
  value,
  onChange,
  resetKey,
  disabled = false,
  placeholder,
  className,
}: RichTextEditorProps) {
  // The last `value` this component has seen from the outside — either seeded
  // into the document or recognised as the echo of our own `onChange`.
  const lastSeededRef = React.useRef<string | null>(null);
  // Flips on the first real edit made inside the editor; from then on external
  // values are never written over the admin's work. Scoped to one entity —
  // `resetKey` clears it, see the block comment above.
  const hasLocalEditsRef = React.useRef(false);
  const lastResetKeyRef = React.useRef(resetKey);
  // TASK-467 truncation latch. `droppedConstructs` is the verdict of the last
  // seeding round-trip (see `detectDroppedConstructs`): non-empty means the
  // document on screen is NOT the document on the server, so the editor stays
  // read-only until the operator explicitly consents via the banner. Both are
  // scoped to one entity, exactly like `hasLocalEditsRef` — `resetKey` clears
  // them so the next entity gets its own verdict (forms.md Rule 2b).
  const [droppedConstructs, setDroppedConstructs] = React.useState("");
  const [editAnyway, setEditAnyway] = React.useState(false);

  // The inline URL editor: `null` is closed, a string is the draft being typed
  // (so "" is open-and-empty, which is how a link is removed).
  const [linkDraft, setLinkDraft] = React.useState<string | null>(null);
  const [linkRejected, setLinkRejected] = React.useState(false);
  const linkInputRef = React.useRef<HTMLInputElement>(null);
  const linkEditorOpen = linkDraft !== null;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // h1…h4 is the server allow-list, verbatim (`sanitize-rich-text.ts`).
        // Narrower would mean silently demoting stored headings to <p> on the
        // next save — see {@link LOSSY_CONSTRUCTS}.
        heading: { levels: [1, 2, 3, 4] },
        // Link ships INSIDE StarterKit v3, so it must be configured through
        // this option and not registered again as a separate extension:
        // ProseMirror would then hold two marks named "link" and Tiptap warns
        // about the duplicate on every mount.
        link: {
          // The editor is an editing surface; a click belongs to the caret.
          openOnClick: false,
          // Typing or pasting `https://…` turns into a link on the spot.
          autolink: true,
          protocols: [...SERVER_ALLOWED_SCHEMES],
          defaultProtocol: "https",
          // Tiptap's own validation is a floor, not a ceiling (see
          // {@link SERVER_ALLOWED_SCHEMES}); ours is the server's list.
          isAllowedUri: (url, ctx) =>
            ctx.defaultValidate(url) && isServerSafeHref(url),
        },
      }),
      // `resizable: false` deliberately. Column widths would be stored as a
      // `colwidth` attribute, which is not on the server's allow-list and is
      // stripped on save — the operator would drag a column, see it move, and
      // find it back at default width after a reload. Not offering the handle
      // is more honest than offering one that forgets.
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    // Selection-only transactions must re-render this component: "зняти
    // посилання" and every table action are enabled by WHERE THE CARET IS, and
    // moving the caret changes no document, fires no `onUpdate` and therefore
    // reaches no parent re-render. Without this the buttons (and the existing
    // `isActive` highlights, stale since TASK-399) answer for a caret position
    // the operator left several clicks ago.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-48 px-3 py-2 outline-none",
          "focus:outline-none",
          // Tables are invisible without these: `prose` gives a table no cell
          // borders, and an unbordered grid of empty cells cannot be edited by
          // eye. `.tableWrapper` and `.selectedCell` are prosemirror-tables'
          // own class names, not ours.
          TABLE_PROSE,
          "[&_.tableWrapper]:max-w-full [&_.tableWrapper]:overflow-x-auto",
          "[&_.selectedCell]:bg-accent",
        ),
        "aria-label": placeholder ?? "Текстовий редактор",
      },
    },
    onUpdate: ({ editor: e }) => {
      // Programmatic seeding below passes `emitUpdate: false` (a `preventUpdate`
      // transaction meta), so reaching this callback means a human edited the
      // document.
      hasLocalEditsRef.current = true;
      onChange(e.getHTML());
    },
  });

  // ——— Inline link editor (TASK-434) ————————————————————————————————————
  //
  // A small row under the toolbar rather than a modal dialog, and deliberately
  // NOT a <form>: this component is mounted INSIDE the page's RHF form, and a
  // nested <form> is invalid HTML — React would hoist it out and Enter would
  // submit the outer form, saving the entity instead of applying the link.
  // Enter and Escape are therefore handled on the input itself.

  const openLinkEditor = React.useCallback(() => {
    if (!editor) return;
    // Editing an existing link starts from its current href, so the operator
    // fixes a typo instead of retyping the URL.
    setLinkDraft(
      (editor.getAttributes("link").href as string | undefined) ?? "",
    );
    setLinkRejected(false);
  }, [editor]);

  const closeLinkEditor = React.useCallback(
    (restoreFocus: boolean) => {
      setLinkDraft(null);
      setLinkRejected(false);
      if (restoreFocus) editor?.commands.focus();
    },
    [editor],
  );

  const applyLink = React.useCallback(() => {
    if (!editor) return;
    const href = (linkDraft ?? "").trim();

    // An emptied field means "this should not be a link" — the same thing the
    // «зняти посилання» button does, reachable without leaving the keyboard.
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      closeLinkEditor(false);
      return;
    }

    if (!isServerSafeHref(href)) {
      setLinkRejected(true);
      return;
    }

    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing is selected and the caret is not in a link: there is no text to
      // turn into one, so insert the URL as its own linked text. Without this
      // the button would appear to do nothing at all.
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "text",
            text: href,
            marks: [{ type: "link", attrs: { href } }],
          },
        ])
        .run();
    } else {
      // `extendMarkRange` makes editing work from a caret anywhere inside an
      // existing link, not just from a full selection of its text.
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    closeLinkEditor(false);
  }, [editor, linkDraft, closeLinkEditor]);

  // Move focus into the field as it opens — the button that opened it is about
  // to be one tab stop away from a control the operator cannot see.
  React.useEffect(() => {
    if (linkEditorOpen) linkInputRef.current?.focus();
  }, [linkEditorOpen]);

  // The document Tiptap is showing is missing markup the server stored, and the
  // operator has not yet said "I know, let me edit anyway" (TASK-467).
  const truncated = droppedConstructs !== "";
  const lockedByTruncation = truncated && !editAnyway;
  // The two locks COMPOSE — they never override each other. `disabled` is the
  // caller's word and always wins: a disabled editor stays disabled even after
  // the operator consents, and the consent button is not offered at all.
  const editable = !disabled && !lockedByTruncation;

  // Keep the editor editable state in sync with `disabled` and the truncation
  // latch. The second argument is NOT cosmetic: `setEditable()` emits an
  // `update` event by default even though the document did not change, and that
  // event ran `onChange` with the editor's own (still empty) HTML on the very
  // first commit — overwriting the value the form had just seeded and leaving
  // `content` as "<p></p>" to save. That was the other half of TASK-399's data
  // loss, and it would land again here: the truncation latch flips this flag on
  // the commit right after seeding, i.e. at exactly the same moment.
  React.useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // A different entity is on screen: forget the latch and the last value we
  // saw, so the seeding effect below treats the incoming content as new.
  //
  // Declared BEFORE that effect on purpose. React flushes a component's effects
  // in declaration order within the same commit, so when `resetKey` and `value`
  // change together this clears the latch first and the seed then lands on the
  // same commit; putting it after would let the seed run against the previous
  // entity's latch and refuse the content for good.
  React.useEffect(() => {
    if (resetKey === lastResetKeyRef.current) return;
    lastResetKeyRef.current = resetKey;
    hasLocalEditsRef.current = false;
    lastSeededRef.current = null;
    // A verdict (and a consent) belongs to the entity it was reached about — a
    // new entity gets a fresh one, or B would inherit A's banner and A's
    // "edit anyway" (TASK-467).
    setDroppedConstructs("");
    setEditAnyway(false);
    // A half-typed URL belongs to the document it was being typed into.
    setLinkDraft(null);
    setLinkRejected(false);
  }, [resetKey]);

  // Seed / re-sync external value → editor (see the block comment above).
  React.useEffect(() => {
    if (!editor) return;
    const next = value ?? "";

    // Nothing changed on the outside since the last time we looked.
    if (next === lastSeededRef.current) return;

    // Our own `onChange` echo (or an already-identical document): record it and
    // keep the caret where the admin left it.
    if (next === editor.getHTML()) {
      lastSeededRef.current = next;
      return;
    }

    // A genuine external change. Never overwrite edits made in this editor.
    lastSeededRef.current = next;
    if (hasLocalEditsRef.current) return;

    editor.commands.setContent(next, { emitUpdate: false });

    // TASK-467: the document is now whatever Tiptap's schema could keep of
    // `next`. Diff the two by tag presence and latch the verdict. `setContent`
    // is synchronous, so `getHTML()` here is already the post-seed document.
    //
    // This verdict cannot be derived during render — it needs the document
    // AFTER seeding, and seeding is this effect — so it is state set from an
    // effect by necessity, not by preference. `setState` bails out on an equal
    // string, which is why the verdict is stored joined rather than as an array:
    // ordinary content (the overwhelming majority) costs no extra render pass.
    //
    // The consent is cleared alongside: it was given about the previous
    // document, and this is a different one. In practice this only reaches a
    // consenting operator who had not yet typed anything — one keystroke sets
    // `hasLocalEditsRef` and the effect returns above, long before here.
    setDroppedConstructs(detectDroppedConstructs(next, editor.getHTML()));
    setEditAnyway(false);
  }, [editor, value]);

  const showPlaceholder = Boolean(placeholder) && editor?.isEmpty;

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
      data-slot="rich-text-editor"
    >
      {/*
        `role="status"` (polite), not `alert`: the banner appears a beat after
        mount, when the seed lands, so an assertive interruption would fight the
        operator's own navigation. The live region is mounted UNCONDITIONALLY
        and stays empty while the document is intact — a region that appears
        together with its text is frequently not announced at all, since screen
        readers watch for content inserted into a region they already know.
      */}
      <div role="status" data-slot="rich-text-editor-truncation-warning">
        {truncated && (
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-warning/40 bg-warning/10 px-3 py-2">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-medium">
                {dict.contentPreview.unsupportedTitle}
              </span>{" "}
              {dict.contentPreview.unsupportedBody(droppedConstructs)}
            </p>
            {/*
              No consent button while `disabled`: the caller's word outranks the
              latch, so offering a way past it would be a lie.
            */}
            {!disabled && !editAnyway && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditAnyway(true)}
              >
                {dict.contentPreview.unsupportedEditAnyway}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
        {TOOLBAR_GROUPS.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && (
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            )}
            {group.map((button) => {
              const Icon = button.icon;
              const active = editor
                ? (button.isActive?.(editor) ?? false)
                : false;
              // `isEnabled` is a precondition on top of the global locks, never
              // instead of them: a table action stays disabled while the
              // editor is disabled even with the caret inside a table.
              const applicable = editor
                ? (button.isEnabled?.(editor) ?? true)
                : false;
              return (
                <button
                  key={button.label}
                  type="button"
                  title={button.label}
                  aria-label={button.label}
                  // Only the toggles are toggles. "Insert table" and "add row"
                  // do a thing and are done; announcing them as permanently
                  // "not pressed" is noise a screen-reader user has to sit
                  // through on every button in the strip.
                  aria-pressed={button.isActive ? active : undefined}
                  disabled={!editable || !editor || !applicable}
                  onClick={() =>
                    editor && button.run(editor, { openLinkEditor })
                  }
                  className={cn(
                    "inline-flex h-7 items-center justify-center rounded-sm text-muted-foreground transition-colors",
                    Icon ? "w-7" : "px-2 text-xs whitespace-nowrap",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                    active && "bg-accent text-accent-foreground",
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : button.short}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/*
        The URL field, shown only while it is being used. `role="group"` with a
        name, so a screen reader announces what this strip of controls is for
        when focus lands in it from the toolbar button above.
      */}
      {editable && linkEditorOpen && (
        <div
          role="group"
          aria-label="Редагування посилання"
          data-slot="rich-text-editor-link"
          className="flex flex-wrap items-center gap-2 border-b border-input px-3 py-2"
        >
          <Input
            ref={linkInputRef}
            type="text"
            inputMode="url"
            value={linkDraft ?? ""}
            aria-label="Адреса посилання"
            aria-invalid={linkRejected || undefined}
            aria-describedby={
              linkRejected ? "rich-text-editor-link-error" : undefined
            }
            placeholder="https://example.com"
            className="h-8 w-64 max-w-full"
            onChange={(event) => {
              setLinkDraft(event.target.value);
              // The complaint is about what WAS submitted; the moment it is
              // being retyped it is stale.
              setLinkRejected(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Never let Enter reach the surrounding page form.
                event.preventDefault();
                applyLink();
              } else if (event.key === "Escape") {
                event.preventDefault();
                // …and never let Escape reach a dialog that may be wrapping
                // this form: it closes the URL field, nothing else.
                event.stopPropagation();
                closeLinkEditor(true);
              }
            }}
          />
          <Button type="button" size="sm" onClick={applyLink}>
            Застосувати
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => closeLinkEditor(true)}
          >
            Скасувати
          </Button>
          {/*
            Mounted empty from the moment the field opens, for the same reason
            as the truncation banner above: a live region inserted together
            with its text is frequently not announced at all. The rejection can
            only happen after the field is already on screen, so the region is
            always older than the message it carries.
          */}
          <p
            id="rich-text-editor-link-error"
            role="alert"
            className="w-full text-xs text-destructive"
          >
            {linkRejected
              ? "Дозволені лише посилання http://, https://, mailto: або адреса всередині сайту (/example)."
              : ""}
          </p>
        </div>
      )}

      <div className="relative">
        {showPlaceholder && (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default RichTextEditor;
