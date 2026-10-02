"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
// Own slice — see the note in product-image-gallery.tsx on the barrel cycle.
import type { ProductImageEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ProductThumb,
} from "@/shared/ui";
import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  TAP_SLOP_PX,
  TAP_ZOOM,
  distance,
  escapeAction,
  frameViewport,
  isDoubleTap,
  isSwipe,
  isZoomed,
  midpoint,
  minimapRect,
  nextZoomStep,
  panBy,
  pinchView,
  prevZoomStep,
  resolveLightboxKey,
  settlePinch,
  zoomAt,
  zoomPercent,
  containSize,
  type PinchStart,
  type Point,
  type Size,
  type Tap,
  type Viewport,
  type ZoomView,
} from "../lib/lightbox-zoom";

/** Coerce the generated `alt` field (typed loosely as an object) to a string. */
function altOf(image: ProductImageEntity, fallback: string): string {
  const raw: unknown = image.alt;
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

/**
 * A mouse event this soon (ms) after a touch ended is the browser's
 * compatibility emulation of that touch — the touch handlers already acted on
 * it, so the mouse handlers must not act a second time.
 */
const TOUCH_MOUSE_GUARD_MS = 800;

/** A double-click this soon (ms) after a click-zoom is the zoom gesture itself. */
const CLICK_ZOOM_DBLCLICK_GUARD_MS = 500;

/** Zoom of one photo, with the geometry it was computed against. */
interface ZoomState {
  imageId: string;
  view: ZoomView;
  viewport: Viewport;
  content: Size;
}

type TouchGesture =
  | { mode: "none" }
  | {
      mode: "single";
      start: Point;
      startView: ZoomView;
      moved: boolean;
    }
  | { mode: "pinch"; pinch: PinchStart };

interface MouseDrag {
  start: Point;
  startView: ZoomView;
  moved: boolean;
}

const touchPoints = (list: React.TouchList | undefined): Point[] =>
  Array.from(list ?? [], (touch) => ({
    x: touch.clientX ?? 0,
    y: touch.clientY ?? 0,
  }));

/** Shared look of the round frosted controls (close, arrows). */
const ROUND_CONTROL =
  "grid size-12 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-elevated backdrop-blur-sm transition-colors duration-200 ease-out hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ZOOM_BUTTON =
  "grid size-11 place-items-center rounded-full text-foreground transition-colors duration-150 ease-out hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";

export interface ProductLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: ProductImageEntity[];
  activeIndex: number;
  /** Wrap-around step (±1) — shared with the gallery. */
  onStep: (delta: number) => void;
  onSelect: (index: number) => void;
  altFallback: string;
  failed: Record<string, boolean>;
  onImageError: (id: string) => void;
  /** Product gradient (pickProductGradient) behind letterboxed thumbnails. */
  gradient: string;
  /** Where focus returns on close — the gallery's zoom trigger. */
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * ProductLightbox — the full-screen gallery photo viewer (TASK-416, TASK-521).
 *
 * Unzoomed it steps through the photos (arrow buttons from `sm`, ← / → keys,
 * swipe). The photo zooms with the toolbar (100 → 150 → 250 → 400 %), a click
 * or a double tap (straight to 250 % at the pointer), a pinch, or «+» / «−».
 * Zoomed, a drag or one finger pans, the arrows hide, ← / → pan instead of
 * stepping, a minimap shows the visible part, and Escape resets the zoom
 * before a second Escape closes the dialog. Switching the photo (thumbnail,
 * arrow, swipe) always resets the zoom: the zoom is stored together with the
 * image id it belongs to, so a different photo simply reads as 100 %.
 *
 * Layout follows the «ЦІЛЬ · TASK-521» mockup: counter top-left, the zoom
 * toolbar and «Закрити» top-right from `sm`; on phones the toolbar sits in the
 * footer above the thumbnail strip (thumb reach), and there are no arrows.
 * The photo stays `object-contain` (TASK-518) at every zoom level.
 */
export function ProductLightbox({
  open,
  onOpenChange,
  images,
  activeIndex,
  onStep,
  onSelect,
  altFallback,
  failed,
  onImageError,
  gradient,
  returnFocusRef,
}: ProductLightboxProps) {
  const [zoom, setZoomState] = useState<ZoomState | null>(null);
  // Natural photo sizes, recorded on load — the letterboxed content box (and so
  // how far a zoomed photo may pan, and the minimap's shape) depends on them.
  const [natural, setNatural] = useState<Record<string, Size>>({});
  // True while a finger or the mouse is driving the transform: the eased
  // transition would make the photo lag behind the pointer.
  const [gesturing, setGesturing] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  // Mirror of `zoom` for event handlers: a burst of touchmove events can fire
  // before React re-renders, and each one must build on the latest view.
  const zoomRef = useRef<ZoomState | null>(null);
  const touchRef = useRef<TouchGesture>({ mode: "none" });
  const lastTapRef = useRef<Tap | null>(null);
  const lastTouchEndRef = useRef(Number.NEGATIVE_INFINITY);
  const clickZoomAtRef = useRef(Number.NEGATIVE_INFINITY);
  const dragRef = useRef<MouseDrag | null>(null);
  const dragMovedRef = useRef(false);
  const detachDragRef = useRef<(() => void) | null>(null);

  const image = images[activeIndex] ?? images[0];
  const imageFailed = !image || Boolean(failed[image.id]);
  const canStep = images.length > 1;
  const canZoom = !imageFailed;

  const view: ZoomView =
    image && zoom?.imageId === image.id ? zoom.view : IDENTITY_VIEW;
  const zoomed = isZoomed(view);

  const setZoom = (next: ZoomState | null) => {
    zoomRef.current = next;
    setZoomState(next);
  };

  /** Latest view of the CURRENT photo (identity for any other). */
  const currentView = (): ZoomView =>
    image && zoomRef.current?.imageId === image.id
      ? zoomRef.current.view
      : IDENTITY_VIEW;

  /**
   * Geometry measured now: the frame centre (the transform origin), the
   * letterboxed photo size inside the frame, and the visible stage as edge
   * offsets from that centre — a zoomed photo may fill the whole stage.
   */
  const measure = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    const frame: Size = { w: rect?.width ?? 0, h: rect?.height ?? 0 };
    const content = containSize(image ? natural[image.id] : undefined, frame);
    const centre: Point = {
      x: (rect?.left ?? 0) + frame.w / 2,
      y: (rect?.top ?? 0) + frame.h / 2,
    };
    const stage = stageRef.current?.getBoundingClientRect();
    const viewport: Viewport =
      stage && stage.width > 0 && stage.height > 0
        ? {
            left: stage.left - centre.x,
            top: stage.top - centre.y,
            right: stage.right - centre.x,
            bottom: stage.bottom - centre.y,
          }
        : frameViewport(frame);
    return { viewport, content, centre };
  };

  /** Client coordinates → coordinates relative to the frame centre. */
  const toFrame = (point: Point, centre: Point): Point => ({
    x: point.x - centre.x,
    y: point.y - centre.y,
  });

  const commit = (next: ZoomView, viewport: Viewport, content: Size) => {
    if (!image) return;
    setZoom(
      isZoomed(next)
        ? { imageId: image.id, view: next, viewport, content }
        : null,
    );
  };

  /** Zoom to `scale` around a client point (or the frame centre). */
  const zoomTo = (scale: number, client?: Point) => {
    if (!canZoom) return;
    const { viewport, content, centre } = measure();
    const point = client ? toFrame(client, centre) : { x: 0, y: 0 };
    commit(
      zoomAt(currentView(), scale, point, viewport, content),
      viewport,
      content,
    );
  };

  const resetZoom = () => setZoom(null);

  const zoomIn = () => zoomTo(nextZoomStep(currentView().scale));
  const zoomOut = () => {
    if (!isZoomed(currentView())) return;
    zoomTo(prevZoomStep(currentView().scale));
  };

  const pan = (delta: Point) => {
    const { viewport, content } = measure();
    commit(panBy(currentView(), delta, viewport, content), viewport, content);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetZoom();
      touchRef.current = { mode: "none" };
    }
    onOpenChange(next);
  };

  // --- keyboard -------------------------------------------------------------

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const action = resolveLightboxKey(event.key, {
      zoomed: isZoomed(currentView()),
      canStep,
      canZoom,
      modified: event.ctrlKey || event.metaKey || event.altKey,
    });
    if (!action) return;
    event.preventDefault();
    if (action.type === "step") onStep(action.delta);
    else if (action.type === "pan") pan(action.delta);
    else if (action.type === "zoomIn") zoomIn();
    else if (action.type === "zoomOut") zoomOut();
    else resetZoom();
  };

  // --- mouse: click to zoom, drag to pan, double-click to reset ---------------

  const fromTouch = (timeStamp: number) =>
    timeStamp - lastTouchEndRef.current < TOUCH_MOUSE_GUARD_MS;

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0 || fromTouch(event.timeStamp)) return;
    const startView = currentView();
    if (!isZoomed(startView)) return;
    // Stop the browser's own image drag and text selection.
    event.preventDefault();
    dragRef.current = {
      start: { x: event.clientX, y: event.clientY },
      startView,
      moved: false,
    };
    dragMovedRef.current = false;
    setGesturing(true);

    const onMove = (move: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = {
        x: move.clientX - drag.start.x,
        y: move.clientY - drag.start.y,
      };
      if (Math.hypot(delta.x, delta.y) > 3) drag.moved = true;
      const { viewport, content } = measure();
      commit(
        panBy(drag.startView, delta, viewport, content),
        viewport,
        content,
      );
    };
    const onUp = () => {
      dragMovedRef.current = dragRef.current?.moved ?? false;
      dragRef.current = null;
      setGesturing(false);
      detach();
    };
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      detachDragRef.current = null;
    };
    detachDragRef.current?.();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    detachDragRef.current = detach;
  };

  // A drag that ends while the lightbox unmounts must not leak listeners.
  useEffect(() => () => detachDragRef.current?.(), []);

  const handleClick = (event: React.MouseEvent) => {
    if (fromTouch(event.timeStamp)) return;
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (!canZoom || isZoomed(currentView())) return;
    clickZoomAtRef.current = event.timeStamp;
    zoomTo(TAP_ZOOM, { x: event.clientX, y: event.clientY });
  };

  const handleDoubleClick = (event: React.MouseEvent) => {
    if (fromTouch(event.timeStamp)) return;
    // The first click of this double-click is what zoomed in — keep it.
    if (
      event.timeStamp - clickZoomAtRef.current <
      CLICK_ZOOM_DBLCLICK_GUARD_MS
    ) {
      return;
    }
    if (isZoomed(currentView())) resetZoom();
  };

  // --- touch: swipe, pinch, one-finger pan, double tap --------------------------
  //
  // One set of handlers on purpose (the TASK-521 note): unzoomed, one finger
  // swipes between photos; zoomed, the same finger pans and swiping is off
  // until the zoom is reset. The stage is `touch-none`, so the browser's own
  // pinch-zoom, double-tap zoom and scroll never compete with these.

  const startPinch = (a: Point, b: Point) => {
    const { centre } = measure();
    touchRef.current = {
      mode: "pinch",
      pinch: {
        view: currentView(),
        distance: distance(a, b),
        midpoint: toFrame(midpoint(a, b), centre),
      },
    };
    setGesturing(true);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const active = touchPoints(event.touches);
    const touches = active.length ? active : touchPoints(event.changedTouches);
    if (touches.length >= 2) {
      if (canZoom) startPinch(touches[0], touches[1]);
      return;
    }
    if (touches.length !== 1 || touchRef.current.mode === "pinch") return;
    const startView = currentView();
    touchRef.current = {
      mode: "single",
      start: touches[0],
      startView,
      moved: false,
    };
    if (isZoomed(startView)) setGesturing(true);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const gesture = touchRef.current;
    const active = touchPoints(event.touches);
    const touches = active.length ? active : touchPoints(event.changedTouches);
    if (gesture.mode === "pinch" && touches.length >= 2) {
      const { viewport, content, centre } = measure();
      commit(
        pinchView(
          gesture.pinch,
          distance(touches[0], touches[1]),
          toFrame(midpoint(touches[0], touches[1]), centre),
          viewport,
          content,
        ),
        viewport,
        content,
      );
      return;
    }
    if (gesture.mode !== "single" || touches.length === 0) return;
    const delta = {
      x: touches[0].x - gesture.start.x,
      y: touches[0].y - gesture.start.y,
    };
    if (Math.hypot(delta.x, delta.y) > TAP_SLOP_PX) gesture.moved = true;
    if (isZoomed(gesture.startView)) {
      const { viewport, content } = measure();
      commit(
        panBy(gesture.startView, delta, viewport, content),
        viewport,
        content,
      );
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    lastTouchEndRef.current = event.timeStamp;
    const gesture = touchRef.current;
    const remaining = touchPoints(event.touches);

    if (gesture.mode === "pinch") {
      if (remaining.length >= 2) return;
      const settled = settlePinch(currentView());
      const { viewport, content } = measure();
      commit(settled, viewport, content);
      // The finger still down carries on as a pan — never as a tap or swipe.
      touchRef.current =
        remaining.length === 1
          ? {
              mode: "single",
              start: remaining[0],
              startView: settled,
              moved: true,
            }
          : { mode: "none" };
      if (remaining.length === 0) setGesturing(false);
      return;
    }

    if (gesture.mode !== "single") return;
    touchRef.current = { mode: "none" };
    setGesturing(false);
    const end = touchPoints(event.changedTouches)[0] ?? gesture.start;
    const delta = { x: end.x - gesture.start.x, y: end.y - gesture.start.y };
    const moved = gesture.moved || Math.hypot(delta.x, delta.y) > TAP_SLOP_PX;

    if (moved) {
      // Swipe between photos — only unzoomed, and only a mostly horizontal one.
      if (
        !isZoomed(gesture.startView) &&
        canStep &&
        isSwipe(delta.x) &&
        Math.abs(delta.x) > Math.abs(delta.y)
      ) {
        onStep(delta.x < 0 ? 1 : -1);
      }
      lastTapRef.current = null;
      return;
    }

    const tap: Tap = { at: event.timeStamp, point: end };
    if (canZoom && isDoubleTap(lastTapRef.current, tap)) {
      lastTapRef.current = null;
      if (isZoomed(currentView())) resetZoom();
      else zoomTo(TAP_ZOOM, end);
    } else {
      lastTapRef.current = tap;
    }
  };

  const handleTouchCancel = () => {
    touchRef.current = { mode: "none" };
    setGesturing(false);
    const settled = settlePinch(currentView());
    const { viewport, content } = measure();
    commit(settled, viewport, content);
  };

  // --- effects ------------------------------------------------------------------

  // A resize changes the frame the zoom was clamped against — start over
  // rather than show a photo dragged past its edges.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setZoom(null);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Zooming in unmounts the arrows; if one of them had focus it would drop to
  // <body>, out of reach of the dialog's key handler. Pull it back to the
  // dialog itself (Radix gives the content tabIndex -1).
  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (content && !content.contains(document.activeElement)) {
      content.focus();
    }
  }, [open, zoomed, activeIndex]);

  // Keep the active thumbnail in view when the photo changes by arrow or swipe
  // (6+ photos scroll horizontally). Instant, not smooth: no motion to opt out.
  useEffect(() => {
    if (!open) return;
    const active = stripRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [open, activeIndex]);

  if (!image) return null;

  const percent = zoomPercent(view.scale);
  const mini =
    zoomed && zoom ? minimapRect(view, zoom.viewport, zoom.content) : null;
  const naturalSize = natural[image.id];

  const zoomToolbar = canZoom && (
    <div
      role="toolbar"
      aria-label={dict.product.lightboxZoomToolbar}
      // Phones: in the footer, above the thumbnails. From `sm`: lifted to the
      // top-right corner beside «Закрити» (the content box is the fixed
      // dialog, the footer itself is not positioned).
      className="flex items-center gap-0.5 rounded-full border border-border bg-background/80 p-0.5 shadow-elevated backdrop-blur-sm sm:absolute sm:top-4 sm:right-18 sm:z-20"
    >
      <button
        type="button"
        onClick={zoomOut}
        aria-label={dict.product.lightboxZoomOut}
        aria-disabled={!zoomed}
        className={ZOOM_BUTTON}
      >
        <ZoomOut aria-hidden="true" className="size-5" />
      </button>
      <output
        aria-live="polite"
        className="min-w-13 text-center font-mono text-sm font-semibold tabular-nums"
      >
        {dict.product.lightboxZoomValue(percent)}
      </output>
      <button
        type="button"
        onClick={zoomIn}
        aria-label={dict.product.lightboxZoomIn}
        aria-disabled={view.scale >= MAX_ZOOM}
        className={ZOOM_BUTTON}
      >
        <ZoomIn aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={resetZoom}
        aria-label={dict.product.lightboxZoomReset}
        aria-disabled={!zoomed}
        className={ZOOM_BUTTON}
      >
        <RotateCcw aria-hidden="true" className="size-5" />
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={contentRef}
        onKeyDown={handleKeyDown}
        // Escape on a zoomed photo resets the zoom; the next one closes.
        onEscapeKeyDown={(event) => {
          if (escapeAction(isZoomed(currentView())) === "reset") {
            event.preventDefault();
            resetZoom();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        // The primitive's built-in close is a bare 16px icon — fine inside a
        // padded card, far below the 44px touch target on a full-bleed photo.
        showCloseButton={false}
        className="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{dict.product.lightboxTitle(altFallback)}</DialogTitle>
        </DialogHeader>

        {/* Top bar: counter left, «Закрити» right (the toolbar joins it from
            `sm`). It floats over the photo, so a zoomed photo runs under it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-3 sm:p-4">
          {canStep ? (
            <p
              role="status"
              className="pointer-events-auto rounded-full bg-background/80 px-3 py-1.5 font-mono text-sm tabular-nums text-muted-foreground backdrop-blur-sm"
            >
              {dict.product.lightboxCounter(activeIndex + 1, images.length)}
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <DialogClose className={cn(ROUND_CONTROL, "pointer-events-auto")}>
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{dict.common.close}</span>
          </DialogClose>
        </div>

        <div className="flex h-dvh flex-col">
          <div
            ref={stageRef}
            data-testid="lightbox-stage"
            className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            {/* Untransformed frame — the geometry every zoom is computed
                against. Clears the top bar, and from `sm` the arrows. */}
            <div
              ref={frameRef}
              data-testid="lightbox-frame"
              onMouseDown={handleMouseDown}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              className={cn(
                "absolute inset-x-3 top-18 bottom-3 sm:inset-x-22 sm:top-20 sm:bottom-4",
                canZoom &&
                  (zoomed
                    ? gesturing
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : "cursor-zoom-in"),
              )}
            >
              <div
                data-testid="lightbox-zoom-layer"
                className={cn(
                  "absolute inset-0 will-change-transform",
                  !gesturing &&
                    "transition-transform duration-200 ease-out motion-reduce:transition-none",
                )}
                style={{
                  transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                }}
              >
                {imageFailed ? (
                  <ProductThumb
                    name={altFallback}
                    className="size-full rounded-card"
                    initialClassName="text-7xl"
                  />
                ) : (
                  <Image
                    src={image.url}
                    alt={altOf(image, altFallback)}
                    fill
                    // Zoomed, ask the srcset for a denser file so 250–400 %
                    // stays sharp; unzoomed, one viewport's worth is enough.
                    sizes={zoomed ? "300vw" : "100vw"}
                    draggable={false}
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      const id = image.id;
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        setNatural((prev) =>
                          prev[id]
                            ? prev
                            : {
                                ...prev,
                                [id]: {
                                  w: img.naturalWidth,
                                  h: img.naturalHeight,
                                },
                              },
                        );
                      }
                    }}
                    onError={() => onImageError(image.id)}
                    // Never crop in the lightbox: this is the one place a
                    // shopper expects to see the whole product, edges included.
                    className="size-full object-contain"
                  />
                )}
              </div>
            </div>

            {canStep && !zoomed && (
              <>
                <button
                  type="button"
                  onClick={() => onStep(-1)}
                  aria-label={dict.product.lightboxPrev}
                  className={cn(
                    ROUND_CONTROL,
                    "absolute top-1/2 left-4 z-10 hidden -translate-y-1/2 sm:grid",
                  )}
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => onStep(1)}
                  aria-label={dict.product.lightboxNext}
                  className={cn(
                    ROUND_CONTROL,
                    "absolute top-1/2 right-4 z-10 hidden -translate-y-1/2 sm:grid",
                  )}
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </button>
              </>
            )}

            {/* Minimap — where the zoomed view sits on the whole photo. Pure
                orientation aid, so hidden from assistive tech. */}
            {mini && !imageFailed && (
              <div
                aria-hidden="true"
                data-testid="lightbox-minimap"
                className="pointer-events-none absolute right-3 bottom-3 z-10 w-18 overflow-hidden rounded-lg border border-border bg-muted shadow-card sm:right-4 sm:bottom-4 sm:w-22"
                style={{
                  aspectRatio: naturalSize
                    ? `${naturalSize.w} / ${naturalSize.h}`
                    : "1 / 1",
                }}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="88px"
                  className="object-contain"
                />
                <span
                  className="absolute rounded-sm border-2 border-primary bg-primary/10"
                  style={{
                    left: `${mini.left * 100}%`,
                    top: `${mini.top * 100}%`,
                    width: `${mini.width * 100}%`,
                    height: `${mini.height * 100}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2.5 border-t border-border bg-background px-4 pt-3 pb-4">
            {zoomToolbar}

            {canStep && (
              <ul
                ref={stripRef}
                aria-label={dict.product.lightboxThumbnails}
                className="flex max-w-full gap-2 overflow-x-auto p-1"
              >
                {images.map((thumb, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <li key={thumb.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelect(index)}
                        aria-label={dict.product.showImageAria(index + 1)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "block size-14 overflow-hidden rounded-lg border-2 bg-gradient-to-br transition-opacity duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:size-16",
                          gradient,
                          isActive
                            ? "border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                            : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        {failed[thumb.id] ? (
                          <ProductThumb
                            name={`${altFallback} ${index + 1}`}
                            className="size-full"
                            initialClassName="text-lg"
                          />
                        ) : (
                          // Decorative: the button carries the name.
                          <Image
                            src={thumb.url}
                            alt=""
                            width={64}
                            height={64}
                            onError={() => onImageError(thumb.id)}
                            className="size-full object-contain"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* The visible hint is also the dialog's description. Touch and
                pointer copy differ; the hidden one is display:none, so only
                the matching one is read out. */}
            <DialogDescription className="text-center text-xs text-muted-foreground">
              <span className="pointer-coarse:hidden">
                {zoomed
                  ? dict.product.lightboxHintPointerZoomed
                  : dict.product.lightboxHintPointer(canStep)}
              </span>
              <span className="hidden pointer-coarse:inline">
                {zoomed
                  ? dict.product.lightboxHintTouchZoomed
                  : dict.product.lightboxHintTouch(canStep)}
              </span>
            </DialogDescription>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
