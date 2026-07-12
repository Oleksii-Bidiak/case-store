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
  depthClampFor,
  flattenTree,
  getProjection,
  projectionToInsertionPoint,
  removeChildrenOf,
  toNested,
  toReorderGroups,
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
  /** Fired on a drop that actually changes the tree. `next` is the new flat state. */
  onMove: (groups: ReorderGroupDto[], next: TreeItem[]) => void;
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

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    setOffsetLeft(0);
    const item = byId.get(id);
    if (item && announcements?.grabbed) {
      announcePolite(announcements.grabbed(item));
    }
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);

  const reset = () => {
    setActiveId(null);
    setOffsetLeft(0);
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
    onMove(groups, next);
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
  renderRow: (props: SortableTreeRowRenderProps) => ReactNode;
}

function SortableTreeRow({
  item,
  level,
  index,
  disabled,
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
