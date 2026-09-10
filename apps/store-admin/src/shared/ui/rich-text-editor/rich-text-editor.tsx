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
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

export interface RichTextEditorProps {
  /** Current HTML value (Tiptap output). */
  value: string;
  /** Called with the new HTML on every edit. */
  onChange: (html: string) => void;
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
 *   edits; Rule 2b's id-keyed reset is a different sub-case).
 *
 * Always import the default export from `./index` (dynamic, ssr:false) — Tiptap
 * touches the DOM on init and must not render on the server.
 */
export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
}: RichTextEditorProps) {
  // The last `value` this component has seen from the outside — either seeded
  // into the document or recognised as the echo of our own `onChange`.
  const lastSeededRef = React.useRef<string | null>(null);
  // Flips on the first real edit made inside the editor; from then on external
  // values are never written over the admin's work. It lives exactly as long as
  // this editor instance, i.e. as long as the form that mounts it.
  const hasLocalEditsRef = React.useRef(false);

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

  // Keep the editor editable state in sync with `disabled`. The second argument
  // is NOT cosmetic: `setEditable()` emits an `update` event by default even
  // though the document did not change, and that event ran `onChange` with the
  // editor's own (still empty) HTML on the very first commit — overwriting the
  // value the form had just seeded and leaving `content` as "<p></p>" to save.
  // That was the other half of TASK-399's data loss.
  React.useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

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
                  disabled={disabled || !editor}
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
