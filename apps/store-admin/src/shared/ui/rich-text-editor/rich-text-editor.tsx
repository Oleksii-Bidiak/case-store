"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  RemoveFormatting,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

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

interface ToolbarButton {
  icon: LucideIcon;
  label: string;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

/**
 * Toolbar actions. All commands come from StarterKit (v3 bundles Underline),
 * so no extra extensions are needed.
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
 * Markup the SERVER keeps but THIS editor's schema throws away (TASK-467).
 *
 * Derived by subtracting the Tiptap schema configured above from the shared
 * server-side allow-list in
 * `apps/store-api/src/common/sanitize/sanitize-rich-text.ts`
 * (`RICH_TEXT_POLICY.allowedTags`). Today that difference is exactly:
 *
 *   allow-list                    this schema
 *   h1, h4 ...................... `heading: { levels: [2, 3] }` → demoted to <p>
 *   img ......................... no Image extension           → dropped
 *   table/thead/tbody/tr/th/td .. no Table extensions          → dropped
 *
 * (`a` is on the allow-list too, and is fine: StarterKit v3 bundles Link.)
 *
 * This is not a hypothetical: the supplier catalogue import writes vendor HTML
 * straight into the same `description` column via `ProductService.create/update`
 * → `sanitizeRichText()`, so a real product description legitimately contains
 * tables and images. Seeding such a document is harmless — the `setContent`
 * below passes `emitUpdate: false` — but `editor.getHTML()` is ALREADY the
 * truncated document, so the operator's first keystroke would fire `onUpdate`,
 * push the truncated HTML into the form and save it. Silent, irreversible, and
 * never chosen by anyone.
 *
 * WHEN EITHER SIDE MOVES, THIS TABLE IS THE THING TO UPDATE — nothing else in
 * this file hardcodes the schema. Widening the editor to actually render these
 * (Image/Table extensions, more heading levels) is deliberately deferred to
 * TASK-492, because it also invalidates the documented reason
 * `../rich-text-preview/rich-text-preview.tsx` renders without a client-side
 * sanitizer. Until then: warn, and protect.
 *
 * Detection is by TAG PRESENCE, never by whole-document comparison. Tiptap
 * always reformats what it round-trips (attribute order, `<b>` → `<strong>`,
 * self-closing tags), so an equality check would fire on ordinary content — and
 * a false banner on every product would be worse than the bug it warns about.
 * One probe per construct is enough: `<thead>` cannot occur without `<table>`.
 * Probing the OUTPUT too (not just the input) keeps this self-correcting: the
 * day the Table extension lands, tables survive the round-trip and the banner
 * stops appearing on its own.
 */
const LOSSY_CONSTRUCTS: ReadonlyArray<{ probe: RegExp; label: string }> = [
  { probe: /<table[\s>]/i, label: dict.contentPreview.unsupportedTables },
  { probe: /<img[\s/>]/i, label: dict.contentPreview.unsupportedImages },
  { probe: /<h1[\s>]/i, label: dict.contentPreview.unsupportedHeadings },
  { probe: /<h4[\s>]/i, label: dict.contentPreview.unsupportedHeadings },
];

/**
 * Human-readable list of the constructs present in `input` but gone from
 * `rendered` (the editor's own HTML after seeding), or `""` when nothing was
 * lost. A string rather than an array on purpose: `useState` bails out of a
 * re-render on an equal string, so ordinary content — the overwhelming majority
 * — costs no extra render pass, and the banner needs the joined form anyway.
 *
 * `h1` and `h4` share one label, hence the de-duplication.
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-48 px-3 py-2 outline-none",
          "focus:outline-none",
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
              return (
                <button
                  key={button.label}
                  type="button"
                  title={button.label}
                  aria-label={button.label}
                  aria-pressed={active}
                  disabled={!editable || !editor}
                  onClick={() => editor && button.run(editor)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                    active && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

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
