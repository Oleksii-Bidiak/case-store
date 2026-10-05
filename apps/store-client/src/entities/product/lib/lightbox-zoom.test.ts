import {
  IDENTITY_VIEW,
  KEYBOARD_PAN_STEP_PX,
  MAX_ZOOM,
  SWIPE_THRESHOLD_PX,
  ZOOM_STEPS,
  clampView,
  containSize,
  escapeAction,
  frameViewport,
  isDoubleTap,
  isSwipe,
  isZoomed,
  minimapRect,
  nextZoomStep,
  panBy,
  pinchView,
  prevZoomStep,
  resolveLightboxKey,
  settlePinch,
  zoomAt,
  zoomPercent,
  type Viewport,
} from "./lightbox-zoom";

/** A 400×400 frame showing a square photo edge to edge. */
const FRAME = { w: 400, h: 400 };
const SQUARE = { w: 400, h: 400 };
const VIEW_FRAME = frameViewport(FRAME);

describe("zoom steps (TASK-521)", () => {
  it("steps «+» through 100 → 150 → 250 → 400 % and stops at the top", () => {
    expect(ZOOM_STEPS).toEqual([1, 1.5, 2.5, 4]);
    expect(nextZoomStep(1)).toBe(1.5);
    expect(nextZoomStep(1.5)).toBe(2.5);
    expect(nextZoomStep(2.5)).toBe(4);
    expect(nextZoomStep(4)).toBe(MAX_ZOOM);
  });

  it("steps «−» back down and stops at 100 %", () => {
    expect(prevZoomStep(4)).toBe(2.5);
    expect(prevZoomStep(2.5)).toBe(1.5);
    expect(prevZoomStep(1.5)).toBe(1);
    expect(prevZoomStep(1)).toBe(1);
  });

  it("snaps an in-between pinch scale to the neighbouring stops", () => {
    expect(nextZoomStep(1.8)).toBe(2.5);
    expect(prevZoomStep(1.8)).toBe(1.5);
  });

  it("formats the toolbar percentage and tells a zoomed view apart", () => {
    expect(zoomPercent(1.5)).toBe(150);
    expect(zoomPercent(2.5)).toBe(250);
    expect(isZoomed(IDENTITY_VIEW)).toBe(false);
    expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
  });
});

describe("containSize", () => {
  it("letterboxes a wide photo inside the frame (object-contain)", () => {
    const size = containSize({ w: 1200, h: 400 }, FRAME);
    expect(size.w).toBeCloseTo(400);
    expect(size.h).toBeCloseTo(400 / 3);
  });

  it("falls back to the whole frame while the photo size is unknown", () => {
    expect(containSize(undefined, FRAME)).toEqual(FRAME);
  });
});

describe("zoomAt — zooming into the pointer", () => {
  it("keeps the content point under the pointer where it is", () => {
    const point = { x: 100, y: -50 };
    const view = zoomAt(IDENTITY_VIEW, 2.5, point, VIEW_FRAME, SQUARE);
    // The content point under the pointer before the zoom...
    const before = { x: point.x / 1, y: point.y / 1 };
    // ...maps back to the same screen point after it: x + s·c.
    expect(view.x + view.scale * before.x).toBeCloseTo(point.x);
    expect(view.y + view.scale * before.y).toBeCloseTo(point.y);
    expect(view.scale).toBe(2.5);
  });

  it("zooms around the centre for the toolbar buttons", () => {
    expect(
      zoomAt(IDENTITY_VIEW, 1.5, { x: 0, y: 0 }, VIEW_FRAME, SQUARE),
    ).toEqual({ scale: 1.5, x: 0, y: 0 });
  });

  it("returns to the identity view when zoomed out to 100 %", () => {
    expect(
      zoomAt(
        { scale: 2.5, x: 120, y: -80 },
        1,
        { x: 0, y: 0 },
        VIEW_FRAME,
        SQUARE,
      ),
    ).toEqual(IDENTITY_VIEW);
  });

  it("never zooms past 400 %", () => {
    expect(
      zoomAt(IDENTITY_VIEW, 9, { x: 0, y: 0 }, VIEW_FRAME, SQUARE).scale,
    ).toBe(4);
  });
});

describe("clampView / panBy — dragging a zoomed photo", () => {
  it("stops the photo edge at the viewport edge", () => {
    // At 250 % a 400px photo is 1000px wide: 300px may hang over each side.
    const view = panBy(
      { scale: 2.5, x: 0, y: 0 },
      { x: 10_000, y: -10_000 },
      VIEW_FRAME,
      SQUARE,
    );
    expect(view).toEqual({ scale: 2.5, x: 300, y: -300 });
  });

  it("keeps a letterboxed photo centred on the axis where it still fits", () => {
    const wide = containSize({ w: 1200, h: 400 }, FRAME); // 400 × 133
    const view = panBy(
      { scale: 1.5, x: 0, y: 0 },
      { x: 0, y: 500 },
      VIEW_FRAME,
      wide,
    );
    // 133 × 1.5 = 200 < 400 — it may move inside the frame but not out of it.
    expect(view.y).toBeCloseTo(100);
  });

  it("lets a zoomed photo use the whole stage, not just the padded frame", () => {
    // Stage 88px wider on each side and 80px taller above the frame.
    const stage: Viewport = { left: -288, top: -280, right: 288, bottom: 216 };
    const view = clampView({ scale: 2.5, x: 10_000, y: 0 }, stage, SQUARE);
    // 1000px photo, 576px stage: the left photo edge stops at the stage edge.
    expect(view.x).toBe(-288 + 500);
  });

  it("allows the natural position at 100 % even with an off-centre stage", () => {
    const stage: Viewport = { left: -288, top: -280, right: 288, bottom: 216 };
    expect(clampView(IDENTITY_VIEW, stage, SQUARE)).toEqual(IDENTITY_VIEW);
  });
});

describe("pinch", () => {
  const start = {
    view: IDENTITY_VIEW,
    distance: 100,
    midpoint: { x: 0, y: 0 },
  };

  it("scales with the finger spread around the midpoint", () => {
    expect(pinchView(start, 250, { x: 0, y: 0 }, VIEW_FRAME, SQUARE)).toEqual({
      scale: 2.5,
      x: 0,
      y: 0,
    });
  });

  it("clamps the spread to 100–400 %", () => {
    expect(pinchView(start, 50, { x: 0, y: 0 }, VIEW_FRAME, SQUARE).scale).toBe(
      1,
    );
    expect(
      pinchView(start, 900, { x: 0, y: 0 }, VIEW_FRAME, SQUARE).scale,
    ).toBe(4);
  });

  it("snaps a release just above 100 % back to the unzoomed photo", () => {
    expect(settlePinch({ scale: 1.03, x: 4, y: 2 })).toEqual(IDENTITY_VIEW);
    expect(settlePinch({ scale: 1.6, x: 4, y: 2 })).toEqual({
      scale: 1.6,
      x: 4,
      y: 2,
    });
  });
});

describe("swipe and double tap", () => {
  it("treats only a long enough horizontal travel as a swipe", () => {
    expect(isSwipe(SWIPE_THRESHOLD_PX)).toBe(true);
    expect(isSwipe(-SWIPE_THRESHOLD_PX - 1)).toBe(true);
    expect(isSwipe(SWIPE_THRESHOLD_PX - 1)).toBe(false);
  });

  it("recognises two quick taps at the same spot", () => {
    const first = { at: 1000, point: { x: 100, y: 100 } };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { at: 1200, point: { x: 110, y: 104 } })).toBe(
      true,
    );
    expect(isDoubleTap(first, { at: 1500, point: { x: 100, y: 100 } })).toBe(
      false,
    );
    expect(isDoubleTap(first, { at: 1100, point: { x: 300, y: 100 } })).toBe(
      false,
    );
  });
});

describe("minimapRect", () => {
  it("covers the whole photo when nothing hangs outside the viewport", () => {
    expect(minimapRect(IDENTITY_VIEW, VIEW_FRAME, SQUARE)).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });

  it("shows the centred 40 % of the photo at 250 %", () => {
    const rect = minimapRect({ scale: 2.5, x: 0, y: 0 }, VIEW_FRAME, SQUARE);
    expect(rect.left).toBeCloseTo(0.3);
    expect(rect.top).toBeCloseTo(0.3);
    expect(rect.width).toBeCloseTo(0.4);
    expect(rect.height).toBeCloseTo(0.4);
  });

  it("follows the pan to the photo's left edge", () => {
    const rect = minimapRect({ scale: 2.5, x: 300, y: 0 }, VIEW_FRAME, SQUARE);
    expect(rect.left).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(0.4);
  });
});

describe("resolveLightboxKey — keyboard (TASK-521)", () => {
  const unzoomed = { zoomed: false, canStep: true, canZoom: true };
  const zoomed = { zoomed: true, canStep: true, canZoom: true };

  it("steps through the photos with ← / → when not zoomed", () => {
    expect(resolveLightboxKey("ArrowRight", unzoomed)).toEqual({
      type: "step",
      delta: 1,
    });
    expect(resolveLightboxKey("ArrowLeft", unzoomed)).toEqual({
      type: "step",
      delta: -1,
    });
    expect(resolveLightboxKey("ArrowUp", unzoomed)).toBeNull();
  });

  it("pans with all four arrows when zoomed, and never steps", () => {
    const step = KEYBOARD_PAN_STEP_PX;
    expect(resolveLightboxKey("ArrowRight", zoomed)).toEqual({
      type: "pan",
      delta: { x: -step, y: 0 },
    });
    expect(resolveLightboxKey("ArrowLeft", zoomed)).toEqual({
      type: "pan",
      delta: { x: step, y: 0 },
    });
    expect(resolveLightboxKey("ArrowDown", zoomed)).toEqual({
      type: "pan",
      delta: { x: 0, y: -step },
    });
    expect(resolveLightboxKey("ArrowUp", zoomed)).toEqual({
      type: "pan",
      delta: { x: 0, y: step },
    });
  });

  it("does nothing with ← / → on a single photo", () => {
    expect(
      resolveLightboxKey("ArrowRight", { ...unzoomed, canStep: false }),
    ).toBeNull();
  });

  it("mirrors the toolbar with «+», «=», «−» and «0»", () => {
    expect(resolveLightboxKey("+", unzoomed)).toEqual({ type: "zoomIn" });
    expect(resolveLightboxKey("=", unzoomed)).toEqual({ type: "zoomIn" });
    expect(resolveLightboxKey("-", zoomed)).toEqual({ type: "zoomOut" });
    expect(resolveLightboxKey("0", zoomed)).toEqual({ type: "reset" });
    expect(resolveLightboxKey("0", unzoomed)).toBeNull();
  });

  it("leaves modified keys (Ctrl + = page zoom) and a failed photo alone", () => {
    expect(resolveLightboxKey("+", { ...unzoomed, modified: true })).toBeNull();
    expect(
      resolveLightboxKey("ArrowRight", { ...unzoomed, modified: true }),
    ).toBeNull();
    expect(resolveLightboxKey("+", { ...unzoomed, canZoom: false })).toBeNull();
  });
});

describe("escapeAction", () => {
  it("resets a zoomed photo first and closes only an unzoomed one", () => {
    expect(escapeAction(true)).toBe("reset");
    expect(escapeAction(false)).toBe("close");
  });
});
