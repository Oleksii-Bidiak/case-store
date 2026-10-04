"use client";

import dynamic from "next/dynamic";

import type { RichTextEditorProps } from "./rich-text-editor";

export type { RichTextEditorProps, RichTextImage } from "./rich-text-editor";
// Wave 198 (РЕ1): what the toolbar slot uses to offer pictures. Import these
// from their own modules (`./image-sources`, `./image-actions`) where a test
// mocks this barrel.
export {
  useRichTextImageSources,
  type RichTextImageSources,
} from "./image-sources";
export { RichTextImageMenu } from "./image-actions";

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
