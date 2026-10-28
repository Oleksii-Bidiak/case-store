import {
  carouselHomePlacements,
  describeHomePlacement,
  homeBlockLabel,
  sortHomeBlocks,
  type CreateHomeBlockDto,
  type HomeBlockEntity,
  type UpdateHomeBlockDto,
} from "@/entities/home-block";
import { fromKyivDateTimeLocal } from "@/shared/lib";
import { dict } from "@/shared/config";

const t = dict.homeBlockDialog;
const e = t.errors;

/**
 * The «Додати блок» / edit dialog's state and the pure rules over it (plan 186,
 * TASK-662, ДН-4.5–4.6). Only CAROUSEL and TABS blocks can be created or edited;
 * the six singleton blocks are placed, hidden and scheduled, never authored.
 */

/** The API's cap on tabs per block (`MAX_HOME_BLOCK_TABS`, CreateHomeBlockDto). */
export const MAX_TABS = 20;

export type CreatableBlockType = "CAROUSEL" | "TABS";

/** «Показ»: live at once, a hidden draft, or live from a moment on. */
export type BlockShow = "now" | "draft" | "schedule";

export interface HomeBlockDraft {
  type: CreatableBlockType;
  /** CAROUSEL — the carousel the block shows. */
  carouselId: string | null;
  /** TABS — the heading over the tabs. */
  title: string;
  /** TABS — carousel ids in tab order. */
  tabs: string[];
  /** Create only — a 0-based index into the WHOLE page order. */
  position: number;
  /** Create only. */
  show: BlockShow;
  /** `datetime-local` value (Kyiv wall clock); meaningful with `show: "schedule"`. */
  scheduledAt: string;
}

export type HomeBlockDraftErrors = Partial<
  Record<"carouselId" | "title" | "tabs" | "scheduledAt", string>
>;

export function emptyDraft(position: number): HomeBlockDraft {
  return {
    type: "CAROUSEL",
    carouselId: null,
    title: "",
    tabs: [],
    position,
    show: "now",
    scheduledAt: "",
  };
}

/** The edit dialog starts from the block as it stands. */
export function draftFromBlock(block: HomeBlockEntity): HomeBlockDraft {
  return {
    type: block.type === "TABS" ? "TABS" : "CAROUSEL",
    carouselId: block.carousel?.id ?? null,
    title: block.title ?? "",
    tabs: [...block.tabs]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tab) => tab.carousel.id),
    position: block.sortOrder,
    show: "now",
    scheduledAt: "",
  };
}

export interface PositionOption {
  value: number;
  label: string;
}

/**
 * «Куди поставити»: the very top, or right after any block — hidden ones count too,
 * because `position` indexes the WHOLE page order.
 */
export function positionOptions(
  blocks: readonly HomeBlockEntity[],
): PositionOption[] {
  return [
    { value: 0, label: dict.carouselToHome.positionFirst },
    ...sortHomeBlocks(blocks).map((block, index) => ({
      value: index + 1,
      label: dict.carouselToHome.positionAfter(homeBlockLabel(block)),
    })),
  ];
}

/**
 * Where a new block goes unless the operator says otherwise: right after the last
 * carousel-bearing block (rails sit together, as on the page today), else at the end.
 */
export function defaultPosition(blocks: readonly HomeBlockEntity[]): number {
  const sorted = sortHomeBlocks(blocks);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const type = sorted[index].type;
    if (type === "CAROUSEL" || type === "TABS") return index + 1;
  }
  return sorted.length;
}

/**
 * Where a carousel already stands on the homepage, in words — ignoring the block
 * being edited (re-picking its own carousel is not a duplicate). `[]` = nowhere.
 */
export function carouselElsewhere(
  blocks: readonly HomeBlockEntity[],
  carouselId: string,
  editingBlockId?: string,
): string[] {
  return carouselHomePlacements(blocks, carouselId)
    .filter((placement) => placement.block.id !== editingBlockId)
    .map((placement) => describeHomePlacement(placement).where);
}

/** Validate before sending. `now` is injected so the past-date rule is testable. */
export function validateDraft(
  draft: HomeBlockDraft,
  mode: "create" | "edit",
  now: Date = new Date(),
): HomeBlockDraftErrors {
  const errors: HomeBlockDraftErrors = {};
  if (draft.type === "CAROUSEL") {
    if (!draft.carouselId) errors.carouselId = e.carouselRequired;
  } else {
    if (draft.title.trim() === "") errors.title = e.titleRequired;
    if (draft.tabs.length === 0) errors.tabs = e.tabsRequired;
    else if (draft.tabs.length > MAX_TABS)
      errors.tabs = e.tabsTooMany(MAX_TABS);
  }
  if (mode === "create" && draft.show === "schedule") {
    const error = scheduleError(draft.scheduledAt, now);
    if (error) errors.scheduledAt = error;
  }
  return errors;
}

/** The «Показати з» rule, shared with the row's «Запланувати показ…». */
export function scheduleError(value: string, now: Date = new Date()) {
  const at = fromKyivDateTimeLocal(value);
  if (!at) return e.scheduledAtRequired;
  if (at.getTime() <= now.getTime()) return e.scheduledAtPast;
  return null;
}

/** `POST /admin/home-blocks` — only the fields of the chosen type (400 otherwise). */
export function toCreateDto(draft: HomeBlockDraft): CreateHomeBlockDto {
  const status =
    draft.show === "now"
      ? ("PUBLISHED" as const)
      : draft.show === "draft"
        ? ("DRAFT" as const)
        : ("SCHEDULED" as const);
  const scheduledAt =
    draft.show === "schedule"
      ? fromKyivDateTimeLocal(draft.scheduledAt)?.toISOString()
      : undefined;
  const base = {
    status,
    position: draft.position,
    ...(scheduledAt ? { scheduledAt } : {}),
  };
  return draft.type === "CAROUSEL"
    ? { ...base, type: "CAROUSEL", carouselId: draft.carouselId ?? undefined }
    : {
        ...base,
        type: "TABS",
        title: draft.title.trim(),
        tabs: draft.tabs,
      };
}

/** `PUT /admin/home-blocks/:id` — the content only; show/hide lives on the switch. */
export function toUpdateDto(draft: HomeBlockDraft): UpdateHomeBlockDto {
  return draft.type === "CAROUSEL"
    ? { carouselId: draft.carouselId ?? undefined }
    : { title: draft.title.trim(), tabs: draft.tabs };
}

/** Move a tab one place up (-1) or down (+1); out of range is a no-op. */
export function moveTab(tabs: string[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= tabs.length) return tabs;
  const next = [...tabs];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
