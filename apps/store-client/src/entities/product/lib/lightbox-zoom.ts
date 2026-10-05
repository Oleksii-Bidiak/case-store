/**
 * Pure zoom / pan / gesture math for the product gallery lightbox (TASK-521).
 *
 * Kept free of React and the DOM so every rule the lightbox follows — the zoom
 * steps, zooming into the pointer, how far a zoomed photo may be dragged, what
 * a key does in which state — is unit-tested in the node project.
 *
 * Coordinate model: the photo frame is an untransformed box; inside it a layer
 * is transformed with `translate(x, y) scale(s)` around the frame's CENTRE.
 * Points are therefore expressed relative to the frame centre. Zooming "into
 * the pointer" keeps the content point under the pointer fixed — the same
 * visual result as `transform-origin: <pointer>`, without the jump a moving
 * origin causes on the next zoom step or drag.
 */

/** Discrete zoom stops of the «−» / «+» buttons: 100 → 150 → 250 → 400 %. */
export const ZOOM_STEPS = [1, 1.5, 2.5, 4] as const;

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Scale a click on the photo (or a double tap) zooms straight to. */
export const TAP_ZOOM = 2.5;

/** Distance (px) one arrow-key press pans a zoomed photo. */
export const KEYBOARD_PAN_STEP_PX = 80;

/**
 * Horizontal travel (px) a touch must cover before the lightbox treats it as a
 * swipe rather than a tap or a vertical scroll (TASK-416).
 */
export const SWIPE_THRESHOLD_PX = 48;

/** A touch that moved less than this (px) is a tap, not a drag. */
export const TAP_SLOP_PX = 10;

/** Two taps closer than this in time (ms) and space (px) are a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE_PX = 32;

/** Pinches that end below this scale snap back to 100 %. */
export const ZOOM_SNAP_EPSILON = 0.05;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Current zoom of the lightbox photo. `x`/`y` are the layer's offset in px. */
export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY_VIEW: ZoomView = { scale: 1, x: 0, y: 0 };

const EPSILON = 1e-3;

export function clampScale(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function isZoomed(view: ZoomView): boolean {
  return view.scale > MIN_ZOOM + EPSILON;
}

/** Next «+» stop strictly above `scale` (stays at the maximum). */
export function nextZoomStep(scale: number): number {
  return ZOOM_STEPS.find((step) => step > scale + EPSILON) ?? MAX_ZOOM;
}

/** Previous «−» stop strictly below `scale` (stays at 100 %). */
export function prevZoomStep(scale: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] < scale - EPSILON) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}

/** Rounded percentage shown (and announced) by the zoom toolbar. */
export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

/**
 * Rendered size of a photo drawn `object-contain` inside `frame`. Unknown
 * natural dimensions (not loaded yet) fall back to the whole frame.
 */
export function containSize(natural: Size | undefined, frame: Size): Size {
  if (!natural || natural.w <= 0 || natural.h <= 0) return frame;
  const ratio = Math.min(frame.w / natural.w, frame.h / natural.h);
  return { w: natural.w * ratio, h: natural.h * ratio };
}

/**
 * The visible area (the lightbox stage), as edge offsets from the FRAME centre.
 * The stage is larger than the frame — the frame keeps clear of the top bar
 * and the arrows at 100 %, but a zoomed photo may use the whole stage.
 */
export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Viewport equal to the frame itself — handy when nothing surrounds it. */
export function frameViewport(frame: Size): Viewport {
  return {
    left: -frame.w / 2,
    top: -frame.h / 2,
    right: frame.w / 2,
    bottom: frame.h / 2,
  };
}

/**
 * Keep the photo where it makes sense on each axis. With the scaled photo
 * LARGER than the viewport, its edges may not be dragged inside the viewport
 * edges (it always covers it); SMALLER, it may not leave the viewport. Both are
 * the same rule — offset between `start + half` and `end − half`, in whichever
 * order those come — and at 100 % the natural position (0) is always allowed.
 */
export function clampView(
  view: ZoomView,
  viewport: Viewport,
  content: Size,
): ZoomView {
  const clampAxis = (
    value: number,
    start: number,
    end: number,
    contentLen: number,
  ) => {
    const half = (view.scale * contentLen) / 2;
    const a = start + half;
    const b = end - half;
    // `+ 0` folds a `-0` into `0`, so a centred view compares equal to identity.
    return Math.min(Math.max(a, b), Math.max(Math.min(a, b), value)) + 0;
  };
  return {
    scale: view.scale,
    x: clampAxis(view.x, viewport.left, viewport.right, content.w),
    y: clampAxis(view.y, viewport.top, viewport.bottom, content.h),
  };
}

/**
 * Zoom to `scale` keeping the content point under `point` (relative to the
 * frame centre) where it is, then clamp. `point = {0,0}` zooms around the
 * frame centre — the toolbar buttons do that.
 */
export function zoomAt(
  view: ZoomView,
  scale: number,
  point: Point,
  viewport: Viewport,
  content: Size,
): ZoomView {
  const next = clampScale(scale);
  if (next <= MIN_ZOOM + EPSILON) return IDENTITY_VIEW;
  const ratio = next / view.scale;
  return clampView(
    {
      scale: next,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    },
    viewport,
    content,
  );
}

/** Drag a zoomed view by `delta` px, clamped. */
export function panBy(
  view: ZoomView,
  delta: Point,
  viewport: Viewport,
  content: Size,
): ZoomView {
  return clampView(
    { scale: view.scale, x: view.x + delta.x, y: view.y + delta.y },
    viewport,
    content,
  );
}

/** Snapshot taken when a two-finger pinch starts. */
export interface PinchStart {
  view: ZoomView;
  distance: number;
  midpoint: Point;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * View while pinching: the scale follows the finger spread, and the content
 * point that was under the starting midpoint follows the current midpoint (so
 * a pinch can also pan). Not snapped — {@link settlePinch} does that on release.
 */
export function pinchView(
  start: PinchStart,
  currentDistance: number,
  currentMidpoint: Point,
  viewport: Viewport,
  content: Size,
): ZoomView {
  if (start.distance <= 0) return start.view;
  const scale = clampScale(
    (start.view.scale * currentDistance) / start.distance,
  );
  const ratio = scale / start.view.scale;
  return clampView(
    {
      scale,
      x: currentMidpoint.x - (start.midpoint.x - start.view.x) * ratio,
      y: currentMidpoint.y - (start.midpoint.y - start.view.y) * ratio,
    },
    viewport,
    content,
  );
}

/** A pinch released just above 100 % snaps back to the unzoomed photo. */
export function settlePinch(view: ZoomView): ZoomView {
  return view.scale < MIN_ZOOM + ZOOM_SNAP_EPSILON ? IDENTITY_VIEW : view;
}

/** Whether a horizontal touch travel counts as a swipe between photos. */
export function isSwipe(deltaX: number): boolean {
  return Math.abs(deltaX) >= SWIPE_THRESHOLD_PX;
}

export interface Tap {
  at: number;
  point: Point;
}

/** Whether `next` completes a double tap started by `prev`. */
export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  if (!prev) return false;
  return (
    next.at - prev.at <= DOUBLE_TAP_MS &&
    distance(prev.point, next.point) <= DOUBLE_TAP_DISTANCE_PX
  );
}

/**
 * Visible part of the photo as fractions of the photo itself (0…1), for the
 * minimap's viewport rectangle.
 */
export interface MinimapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function minimapRect(
  view: ZoomView,
  viewport: Viewport,
  content: Size,
): MinimapRect {
  const axis = (offset: number, start: number, end: number, len: number) => {
    const scaled = view.scale * len;
    if (scaled <= 0 || end <= start) return { start: 0, len: 1 };
    // Viewport edges in photo fractions: 0 = photo start edge, 1 = end edge.
    const from = Math.max(0, (start - offset) / scaled + 0.5);
    const to = Math.min(1, (end - offset) / scaled + 0.5);
    return { start: Math.min(from, 1), len: Math.max(0, to - from) };
  };
  const h = axis(view.x, viewport.left, viewport.right, content.w);
  const v = axis(view.y, viewport.top, viewport.bottom, content.h);
  return { left: h.start, top: v.start, width: h.len, height: v.len };
}

/** What a key press inside the lightbox does. */
export type LightboxKeyAction =
  | { type: "step"; delta: 1 | -1 }
  | { type: "pan"; delta: Point }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "reset" };

export interface LightboxKeyContext {
  zoomed: boolean;
  /** More than one photo — arrows may step between them. */
  canStep: boolean;
  /** A photo is on screen (not the failed-load placeholder) — zoom applies. */
  canZoom: boolean;
  /** Ctrl / Meta / Alt held — leave the key to the browser (Ctrl + = page zoom). */
  modified?: boolean;
}

/**
 * Map a `KeyboardEvent.key` to a lightbox action. Unzoomed, ← / → step through
 * the photos; zoomed, all four arrows pan instead. «+» / «=», «−» and «0»
 * mirror the toolbar. Escape is NOT handled here — see {@link escapeAction}.
 */
export function resolveLightboxKey(
  key: string,
  ctx: LightboxKeyContext,
): LightboxKeyAction | null {
  if (ctx.modified) return null;
  const pan = (x: number, y: number): LightboxKeyAction => ({
    type: "pan",
    delta: { x: x * KEYBOARD_PAN_STEP_PX, y: y * KEYBOARD_PAN_STEP_PX },
  });

  if (ctx.zoomed) {
    // → reveals what lies to the right, so the photo moves left.
    if (key === "ArrowRight") return pan(-1, 0);
    if (key === "ArrowLeft") return pan(1, 0);
    if (key === "ArrowDown") return pan(0, -1);
    if (key === "ArrowUp") return pan(0, 1);
  } else if (ctx.canStep) {
    if (key === "ArrowRight") return { type: "step", delta: 1 };
    if (key === "ArrowLeft") return { type: "step", delta: -1 };
  }

  if (!ctx.canZoom) return null;
  if (key === "+" || key === "=") return { type: "zoomIn" };
  if (key === "-") return { type: "zoomOut" };
  if (key === "0" && ctx.zoomed) return { type: "reset" };
  return null;
}

/** Escape on a zoomed photo resets the zoom; on an unzoomed one it closes. */
export function escapeAction(zoomed: boolean): "reset" | "close" {
  return zoomed ? "reset" : "close";
}
