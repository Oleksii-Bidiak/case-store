"use client";

/**
 * Entity-agnostic sortable tree/list primitive (plan 158 §3.2 / §4 / §8).
 *
 * POINTER ONLY. dnd-kit is registered with a `PointerSensor` and nothing else:
 * no `KeyboardSensor`, no vendored `sortableTreeKeyboardCoordinates`. The
 * keyboard model (§7.2) is owned by the consuming widget and runs through the
 * SAME pure reducer this component uses on drop (`shared/lib/sortable-tree`), so
 * the two paths cannot drift.
 *
 * `maxDepth: 1` collapses the primitive into a flat sortable list: the depth
 * clamp becomes 0 (depth projection unreachable) and `restrictToVerticalAxis` is
 * applied — this is why there is ONE primitive and no separate `sortable-list`
 * (banners / blog-categories / device-brands reuse it as-is).
 *
 * dnd-kit's OWN a11y layer is disabled (§3.2): all announcements are no-ops, the
 * `screenReaderInstructions` are empty, and its unconditionally-rendered
 * `LiveRegion` + `HiddenText` markup is portalled into a DETACHED node, so the
 * document contains EXACTLY the two `shared/ui/live-announcer` regions and no
 * `aria-describedby` pointing at a dnd-kit instructions node. `useSortable()`'s
 * `attributes` are sanitized (`role`, `aria-roledescription`, `aria-describedby`
 * dropped) and — together with `listeners` — spread on the GRIP HANDLE button
 * only, never on the row, so the row's other buttons stay independently
 * clickable.
 *
 * ── The drop hint (TASK-423) ────────────────────────────────────────────────
 * The depth projection used to be computed at DROP time only, so during a
 * pointer drag the one question a nested tree raises — "will this land INSIDE
 * the row above, or next to it?" — had no answer on screen. Both outcomes looked
 * identical until the PATCH had already fired. The projection now runs on every
 * `onDragMove` and paints the answer: an insertion LINE for a reorder (indented
 * to the projected depth, so a sideways drag visibly changes level) and a FRAME
 * around the row that would become the new parent for a nest.
 *
 * It is delivered through the `style` the consumer already spreads on its row —
 * not through a new render prop — so all four consuming widgets get it without
 * changing a line. The decision itself lives in {@link resolveDropHint}, which is
 * pure and reads the SAME `getProjection` the drop path reads; a hint that could
 * disagree with the drop would be worse than no hint at all.
 */

import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { ReorderGroupDto } from "@/shared/api";
import {
  MAX_TREE_LEVELS,
  applyMove,
  arrayMove,
  depthClampFor,
  flattenTree,
  getProjection,
  projectionToInsertionPoint,
  removeChildrenOf,
  toNested,
  toReorderGroups,
  type FlattenedItem,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import { useAnnouncer } from "@/shared/ui/live-announcer";

export const DEFAULT_INDENTATION_WIDTH = 24;

/** Pointer activation constraint — mandated by §3.2 (a 4 px slop before a drag starts). */
export const POINTER_ACTIVATION_CONSTRAINT = { distance: 4 } as const;

/** dnd-kit's built-in a11y layer, fully disabled (§3.2). */
export const DISABLED_DND_ANNOUNCEMENTS = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
} as const;

/** `restrictToVerticalAxis` ONLY in flat mode — in a tree, `delta.x` IS the reparent signal. */
export function resolveModifiers(maxDepth: number): Modifier[] {
  return maxDepth === 1 ? [restrictToVerticalAxis] : [];
}

/**
 * Drop `role`, `aria-roledescription` and `aria-describedby` from
 * `useSortable().attributes` before they reach the DOM (§3.2): the row semantics
 * come from the widget's authored `treegrid` ARIA, and the description comes from
 * our own instructions node — dnd-kit's English defaults must not leak in.
 */
export const DROPPED_SORTABLE_ATTRIBUTES = [
  "role",
  "aria-roledescription",
  "aria-describedby",
] as const;

export function sanitizeSortableAttributes(
  // `object`, not `Record<string, unknown>`: dnd-kit's `DraggableAttributes` has
  // no index signature, and a direct cast to a Record is a TS2352 error.
  attributes: object,
): HTMLAttributes<HTMLElement> {
  const dropped: readonly string[] = DROPPED_SORTABLE_ATTRIBUTES;
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !dropped.includes(key)),
  ) as HTMLAttributes<HTMLElement>;
}

/**
 * What the pointer would do if it let go right now.
 *
 * `nest` and the two line modes are the SAME projection read two ways, which is
 * the point: the hint cannot promise one thing and the drop do another.
 */
export type DropHintMode = "nest" | "before" | "after";

export interface DropHint {
  /** The row the hint is painted on. */
  anchorId: string;
  mode: DropHintMode;
  /** 0-based projected depth — the insertion line's indent. */
  depth: number;
}

/**
 * Where the drop would land, from the live projection (TASK-423).
 *
 * `items` is the DRAG list — the flattened tree with the dragged node's children
 * removed, exactly what `handleDragEnd` reconstructs — so this reads the same
 * geometry the drop reducer will.
 *
 * The distinction the operator needs is "does the row above become my PARENT, or
 * my SIBLING?", and that is precisely `projection.depth > previous.depth`: the
 * vendored `getProjection` resolves `parentId` to `previous.id` in that case and
 * to `previous.parentId` otherwise. Anchoring on `previous` rather than on the
 * `over` row matters — dnd-kit's `over` is whichever row the pointer is inside,
 * and after the array move the node lands BELOW it or above it depending on
 * direction, so hinting on `over` would point at the wrong row half the time.
 */
export function resolveDropHint(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  offsetLeft: number,
  indentationWidth: number,
  maxDepthClamp: number,
): DropHint | null {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (overIndex === -1 || activeIndex === -1) return null;

  const projection = getProjection(
    items,
    activeId,
    overId,
    offsetLeft,
    indentationWidth,
    maxDepthClamp,
  );

  const moved = arrayMove(items, activeIndex, overIndex);
  const previous = moved[overIndex - 1];

  // Dropped at the very top: there is no row above to hang a line under, so the
  // line goes on the TOP edge of the row that will follow.
  if (!previous) {
    const next = moved[overIndex + 1];
    return {
      anchorId: next ? next.id : overId,
      mode: "before",
      depth: projection.depth,
    };
  }

  return {
    anchorId: previous.id,
    mode: projection.depth > previous.depth ? "nest" : "after",
    depth: projection.depth,
  };
}

/**
 * The hint's CSS. Design tokens only — `var(--color-primary)` is the panel's
 * accent in both themes, and there is no Tailwind class that can carry a
 * computed indent.
 *
 * The line is a background gradient rather than a border or a box-shadow
 * because the hint is painted on a `<tr>` in every consumer: with
 * `border-collapse: collapse` a row's own border is shared with its neighbour
 * (so a border-bottom would move the table by a pixel) and box-shadows on
 * collapsed rows are unreliable across engines. A background gradient clips to
 * the row's border box in all of them, and the colour stop is what indents the
 * line to the projected depth.
 */
export function dropHintStyle(
  hint: DropHint,
  indentationWidth: number,
): CSSProperties {
  if (hint.mode === "nest") {
    return {
      outline: "2px solid var(--color-primary)",
      outlineOffset: "-2px",
    };
  }
  const indent = Math.max(0, hint.depth) * indentationWidth;
  return {
    backgroundImage: `linear-gradient(to right, transparent ${indent}px, var(--color-primary) ${indent}px)`,
    backgroundSize: "100% 2px",
    backgroundRepeat: "no-repeat",
    backgroundPosition: hint.mode === "before" ? "left top" : "left bottom",
  };
}

export interface SortableTreeHandleProps extends HTMLAttributes<HTMLElement> {
  ref: (node: HTMLElement | null) => void;
}

export interface SortableTreeRowRenderProps {
  item: TreeItem;
  /** 1-based level (root = 1). Always 1 when `maxDepth === 1`. */
  level: number;
  /** Index among the rendered rows. */
  index: number;
  /** This row is the one currently being dragged. */
  isDragging: boolean;
  /** Spread on the row element. */
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  /** Spread on the GRIP HANDLE `<button>` — never on the row. */
  handleProps: SortableTreeHandleProps;
}

export interface SortableTreeAnnouncements {
  grabbed: (item: TreeItem) => string;
  dropped: (item: TreeItem) => string;
  droppedNoop: (item: TreeItem) => string;
  cancelled: (item: TreeItem) => string;
}

export interface SortableTreeProps {
  /** Flat, ordered, VISIBLE rows. Array order within a bucket IS sibling order. */
  items: TreeItem[];
  /** 1-based structural cap. `1` ⇒ flat sortable list. */
  maxDepth?: number;
  renderRow: (props: SortableTreeRowRenderProps) => ReactNode;
  /**
   * Fired on a drop that actually changes the tree. `next` is the new flat state
   * of the items THIS component was given (i.e. the VISIBLE rows), and
   * `movingId` is the dragged node — a consumer that renders a partially
   * collapsed tree needs it to re-derive the same move against its FULL tree
   * (the visible list under-counts a collapsed subtree's height).
   */
  onMove: (
    groups: ReorderGroupDto[],
    next: TreeItem[],
    movingId: string,
  ) => void;
  announcements?: Partial<SortableTreeAnnouncements>;
  /** Disables dragging entirely (e.g. while a search filter is active, §3.11). */
  disabled?: boolean;
  indentationWidth?: number;
  children?: ReactNode;
}

export function SortableTree({
  items,
  maxDepth = MAX_TREE_LEVELS,
  renderRow,
  onMove,
  announcements,
  disabled = false,
  indentationWidth = DEFAULT_INDENTATION_WIDTH,
  children,
}: SortableTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [overId, setOverId] = useState<string | null>(null);
  const { announcePolite } = useAnnouncer();

  // dnd-kit unconditionally renders its own LiveRegion + HiddenText. Portal them
  // into a detached node so they never reach the document (§3.2).
  const [a11ySink] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: POINTER_ACTIVATION_CONSTRAINT,
    }),
  );

  /** Rows actually rendered: while dragging, the active node's subtree collapses. */
  const rows = useMemo(() => {
    const flattened = flattenTree(toNested(items));
    return activeId ? removeChildrenOf(flattened, [activeId]) : flattened;
  }, [items, activeId]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  /** Where a release right now would put the row — recomputed on every move. */
  const dropHint = useMemo(() => {
    if (!activeId || !overId) return null;
    const dragList = removeChildrenOf(flattenTree(toNested(items)), [activeId]);
    return resolveDropHint(
      dragList,
      activeId,
      overId,
      offsetLeft,
      indentationWidth,
      depthClampFor(items, activeId, maxDepth),
    );
  }, [activeId, indentationWidth, items, maxDepth, offsetLeft, overId]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    setOffsetLeft(0);
    setOverId(null);
    const item = byId.get(id);
    if (item && announcements?.grabbed) {
      announcePolite(announcements.grabbed(item));
    }
  };

  // `over` rides along on the move event rather than coming from a separate
  // `onDragOver`: the hint is a function of BOTH the row under the pointer and
  // the horizontal offset, and reading them from two events can paint a frame
  // one frame out of step with the indent that justifies it.
  const handleDragMove = ({ delta, over }: DragMoveEvent) => {
    setOffsetLeft(delta.x);
    setOverId(over ? String(over.id) : null);
  };

  const reset = () => {
    setActiveId(null);
    setOffsetLeft(0);
    setOverId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const item = byId.get(id);
    reset();
    if (!over || !item) return;

    const dragList = removeChildrenOf(flattenTree(toNested(items)), [id]);
    const projection = getProjection(
      dragList,
      id,
      String(over.id),
      offsetLeft,
      indentationWidth,
      depthClampFor(items, id, maxDepth),
    );
    const point = projectionToInsertionPoint(
      dragList,
      id,
      String(over.id),
      projection,
    );
    const next = applyMove(items, id, point, maxDepth);

    if (!next) {
      if (announcements?.droppedNoop) {
        announcePolite(announcements.droppedNoop(item));
      }
      return;
    }

    const groups = toReorderGroups(items, next);
    if (groups.length === 0) {
      if (announcements?.droppedNoop) {
        announcePolite(announcements.droppedNoop(item));
      }
      return;
    }

    if (announcements?.dropped) announcePolite(announcements.dropped(item));
    onMove(groups, next, id);
  };

  const handleDragCancel = () => {
    const item = activeId ? byId.get(activeId) : undefined;
    reset();
    if (item && announcements?.cancelled) {
      announcePolite(announcements.cancelled(item));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      modifiers={resolveModifiers(maxDepth)}
      accessibility={{
        announcements: DISABLED_DND_ANNOUNCEMENTS,
        screenReaderInstructions: { draggable: "" },
        ...(a11ySink ? { container: a11ySink } : {}),
      }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {rows.map((row, index) => {
          const item = byId.get(row.id);
          if (!item) return null;
          return (
            <SortableTreeRow
              key={row.id}
              item={item}
              level={maxDepth === 1 ? 1 : row.depth + 1}
              index={index}
              disabled={disabled || item.disabled === true}
              hint={dropHint?.anchorId === row.id ? dropHint : null}
              indentationWidth={indentationWidth}
              renderRow={renderRow}
            />
          );
        })}
      </SortableContext>
      {children}
    </DndContext>
  );
}

interface SortableTreeRowProps {
  item: TreeItem;
  level: number;
  index: number;
  disabled: boolean;
  /** Set only on the ONE row the live drop hint is anchored to. */
  hint: DropHint | null;
  indentationWidth: number;
  renderRow: (props: SortableTreeRowRenderProps) => ReactNode;
}

function SortableTreeRow({
  item,
  level,
  index,
  disabled,
  hint,
  indentationWidth,
  renderRow,
}: SortableTreeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition ?? undefined,
    ...(hint ? dropHintStyle(hint, indentationWidth) : {}),
  };

  const handleProps: SortableTreeHandleProps = {
    ...sanitizeSortableAttributes(attributes),
    ...listeners,
    ref: setActivatorNodeRef,
  };

  return (
    <>
      {renderRow({
        item,
        level,
        index,
        isDragging,
        setNodeRef,
        style,
        handleProps,
      })}
    </>
  );
}
