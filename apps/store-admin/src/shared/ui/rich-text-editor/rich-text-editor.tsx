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
 * Controlled component: the `value` prop is the single source of truth. The
 * editor re-syncs from `value` only when it differs from its own HTML and the
 * editor is NOT focused — so a background refetch (form reset) updates the
 * content without clobbering an in-progress edit (docs/conventions/forms.md).
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
      onChange(e.getHTML());
    },
  });

  // Keep the editor editable state in sync with `disabled`.
  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Re-sync external value → editor when it diverges and the editor isn't
  // focused. Guards against clobbering active typing (forms.md sync guard).
  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
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
