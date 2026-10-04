"use client";

import * as React from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Textarea } from "@/shared/ui/textarea";
import { dict } from "@/shared/config";
import { ImageSourceMenuItems } from "./image-actions";

const t = dict.richTextEditor;

/** The panel's buttons — the toolbar's own 28px text-button look. */
const PANEL_BUTTON =
  "inline-flex h-7 items-center justify-center rounded-sm px-2 text-xs whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground";

/**
 * One picture inside the text (wave 198, РЕ2/РЕ3/РЕ7).
 *
 * What it ADDS over a bare `<img>`, all of it editor chrome that never reaches
 * the saved HTML (that is still `ImageNode.renderHTML` — `src` and `alt`):
 *
 * - «Без опису» on a picture with NO alt at all. `alt=""` is a deliberate
 *   «decorative» and gets no marker — the two are different statements.
 * - When the picture is selected: an outline and a small panel above it —
 *   «Опис…», «Замінити…», «Прибрати». On a phone the panel stops floating and
 *   wraps above the picture (РЕ7).
 *
 * NOT here, and why: size S/M/L/full, alignment with text wrap and a caption
 * (РЕ2/РЕ4). The API's sanitizer keeps `img[src, alt]` only — a class, a
 * data-attribute or a `<figure>` would be stripped on the next save, silently.
 * They wait for the sanitizer and the storefront (TASK-1071 tail).
 *
 * The `<img>` is the drag handle: Tiptap only lets a React node view be dragged
 * from an element marked `data-drag-handle`, and moving a picture within the
 * text worked before this view existed.
 */
export function ImageNodeView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const src = node.attrs.src as string;
  const alt = node.attrs.alt as string | null;
  const editable = editor.isEditable;

  const replaceTarget = () => {
    const pos = getPos();
    return typeof pos === "number"
      ? ({ kind: "replace", pos } as const)
      : ({ kind: "insert" } as const);
  };

  return (
    <NodeViewWrapper
      className="relative my-3 w-fit max-w-full"
      data-slot="rich-text-image"
    >
      {selected && editable && (
        <div
          contentEditable={false}
          role="toolbar"
          aria-label={t.imagePanelAria}
          className={cn(
            "not-prose z-10 mb-2 flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
            "sm:absolute sm:bottom-full sm:left-0 sm:w-max",
          )}
        >
          <ImageAltPopover
            alt={alt}
            onApply={(next) => updateAttributes({ alt: next })}
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className={PANEL_BUTTON}>
              {t.replace}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ImageSourceMenuItems target={replaceTarget()} />
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            title={t.remove}
            aria-label={t.remove}
            onClick={() => deleteNode()}
            className={cn(
              PANEL_BUTTON,
              "w-7 px-0 text-destructive hover:text-destructive",
            )}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        data-drag-handle=""
        className={cn(
          "my-0 block max-w-full rounded-md",
          selected && "outline-2 outline-offset-2 outline-primary",
        )}
      />

      {alt === null && editable && (
        <span
          contentEditable={false}
          className="not-prose pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-warning bg-background px-2 py-0.5 text-xs font-semibold text-foreground shadow-xs"
        >
          {/* White on the warning fill is ~3:1 — the colour goes to the icon and
              the border, the words stay on the page background. */}
          <TriangleAlert className="size-3 text-warning" aria-hidden="true" />
          {t.noAlt}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/**
 * «Опис…»: the alt text of THIS occurrence, or «Декоративна» (РЕ3).
 *
 * Local draft state seeded when the popover OPENS — from the node, which is
 * already in memory, not from anything asynchronous — and written back only on
 * «Застосувати». An emptied field means "no description yet" (`null`, which
 * keeps the marker), never a silent «decorative».
 */
function ImageAltPopover({
  alt,
  onApply,
}: {
  alt: string | null;
  onApply: (alt: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [decorative, setDecorative] = React.useState(false);
  const id = React.useId();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(alt ?? "");
          setDecorative(alt === "");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger className={PANEL_BUTTON}>{t.altEdit}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-alt`}>{t.altLabel}</Label>
          <Textarea
            id={`${id}-alt`}
            value={draft}
            rows={2}
            disabled={decorative}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setDraft(event.target.value)}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t.altHint}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-decorative`}
            checked={decorative}
            onCheckedChange={(checked) => setDecorative(checked === true)}
          />
          <Label htmlFor={`${id}-decorative`} className="font-normal">
            {t.altDecorative}
          </Label>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply(decorative ? "" : draft.trim() || null);
              setOpen(false);
            }}
          >
            {t.apply}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
