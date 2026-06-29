"use client";

import dynamic from "next/dynamic";

import type { RichTextEditorProps } from "./rich-text-editor";

export type { RichTextEditorProps } from "./rich-text-editor";

/**
 * SSR-safe RichTextEditor. Tiptap touches the DOM on init, so the underlying
 * component is loaded with `ssr: false`. Import this default everywhere — never
 * the raw component directly.
 */
export const RichTextEditor = dynamic<RichTextEditorProps>(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => null,
  },
);

export default RichTextEditor;
