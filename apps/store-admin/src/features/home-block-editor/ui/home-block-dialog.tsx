"use client";

/**
 * «Додати блок» and its edit twin (plan 186, TASK-662 — mockups ДН-4.5, ДН-4.6).
 *
 * Create: the type («Карусель» — one carousel; «Вкладки» — a title and an ordered
 * list of carousel tabs), where it goes (`position`, an index into the WHOLE page
 * order) and «Показ» (at once / draft / from a moment) → `POST /admin/home-blocks`.
 *
 * Edit: the same fields of the block's own type, nothing else — «Замінити карусель…»
 * for a CAROUSEL block, «Редагувати вкладки…» for TABS → `PUT /admin/home-blocks/:id`
 * (the tab list is replaced whole). Show/hide stays on the row's switch.
 *
 * The same carousel twice on the page is ALLOWED and only warned about (the owner's
 * call: a duplicate is sometimes the point). Inside one TABS block a carousel can be
 * a tab only once (`@@unique([homeBlockId, carouselId])`), so the «Додати вкладку»
 * select leaves out the tabs already chosen.
 *
 * State is seeded once per opening (forms.md Rule 1a render-time guard keyed by the
 * target), so a background refetch of the blocks never overwrites what is being typed.
 *
 * Picking a carousel reads `GET /admin/carousels`, which wants `carousels:read`. A
 * session with `home:write` alone gets a sentence saying so instead of a 403.
 */

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import {
  getAdminHomeBlockControllerFindAllQueryKey,
  homeBlockLabel,
  useAdminHomeBlockControllerCreate,
  useAdminHomeBlockControllerUpdate,
  type HomeBlockEntity,
} from "@/entities/home-block";
import {
  useAdminCarouselControllerFindAll,
  type CarouselEntity,
} from "@/entities/carousel";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
  RadioCard,
  RadioCardGroup,
  SegmentedControl,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  MAX_TABS,
  carouselElsewhere,
  defaultPosition,
  draftFromBlock,
  emptyDraft,
  moveTab,
  positionOptions,
  toCreateDto,
  toUpdateDto,
  validateDraft,
  type BlockShow,
  type CreatableBlockType,
  type HomeBlockDraft,
  type HomeBlockDraftErrors,
} from "../model/home-block-form";

const t = dict.homeBlockDialog;
const c = dict.carousels;

/** Open the dialog to add a block, or to edit one CAROUSEL / TABS block. */
export type HomeBlockDialogTarget =
  { mode: "create" } | { mode: "edit"; block: HomeBlockEntity };

export interface HomeBlockDialogProps {
  /** `null` closes the dialog. */
  target: HomeBlockDialogTarget | null;
  /** The whole page, in any order — the same list the screen draws. */
  blocks: readonly HomeBlockEntity[];
  onOpenChange: (open: boolean) => void;
}

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** «Хіти продажів · автоматично» / «Категорія» / «Вибрані вручну» + its status. */
function carouselLine(carousel: CarouselEntity): string {
  const source =
    carousel.source === "MANUAL" || carousel.source === "CATEGORY"
      ? c.sourceLabels[carousel.source]
      : c.sourceAuto(c.sourceLabels[carousel.source]);
  return `${source} · ${c.statusLabels[carousel.status].toLowerCase()}`;
}

function targetKey(target: HomeBlockDialogTarget | null): string | null {
  if (!target) return null;
  return target.mode === "create" ? "create" : `edit:${target.block.id}`;
}

export function HomeBlockDialog({
  target,
  blocks,
  onOpenChange,
}: HomeBlockDialogProps) {
  const open = target !== null;
  const editing = target?.mode === "edit" ? target.block : null;

  const [draft, setDraft] = useState<HomeBlockDraft>(() =>
    editing ? draftFromBlock(editing) : emptyDraft(defaultPosition(blocks)),
  );
  const [errors, setErrors] = useState<HomeBlockDraftErrors>({});
  const [newTab, setNewTab] = useState("");

  // forms.md Rule 1a: seed once per opening, never from a background refetch.
  const key = targetKey(target);
  const [seededFor, setSeededFor] = useState<string | null>(key);
  if (key !== seededFor) {
    setSeededFor(key);
    if (target) {
      setDraft(
        target.mode === "edit"
          ? draftFromBlock(target.block)
          : emptyDraft(defaultPosition(blocks)),
      );
      setErrors({});
      setNewTab("");
    }
  }

  const { can } = useAuth();
  const canReadCarousels = can(PERM.carouselsRead) || can(PERM.carouselsWrite);
  const carouselsQuery = useAdminCarouselControllerFindAll(undefined, {
    query: { enabled: open && canReadCarousels },
  });
  const carousels = carouselsQuery.data?.data ?? [];
  const byId = new Map(carousels.map((carousel) => [carousel.id, carousel]));

  const queryClient = useQueryClient();
  const create = useAdminHomeBlockControllerCreate();
  const update = useAdminHomeBlockControllerUpdate();
  const isPending = create.isPending || update.isPending;

  const ids = {
    carousel: useId(),
    carouselError: useId(),
    title: useId(),
    titleHint: useId(),
    titleError: useId(),
    tabs: useId(),
    tabsError: useId(),
    newTab: useId(),
    position: useId(),
    show: useId(),
    scheduledAt: useId(),
    scheduledAtHint: useId(),
    scheduledAtError: useId(),
  };

  const patch = (next: Partial<HomeBlockDraft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const mode = editing ? "edit" : "create";
  const type: CreatableBlockType = draft.type;

  const nameOf = (id: string) => byId.get(id)?.title ?? id;

  const blockName = (saved: HomeBlockDraft) =>
    saved.type === "TABS"
      ? saved.title.trim()
      : saved.carouselId
        ? nameOf(saved.carouselId)
        : "";

  const handleSubmit = async () => {
    const found = validateDraft(draft, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: toUpdateDto(draft) });
      } else {
        await create.mutateAsync({ data: toCreateDto(draft) });
      }
    } catch {
      toast.error(t.toastFailed);
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: getAdminHomeBlockControllerFindAllQueryKey(),
    });
    toast.success(
      editing ? t.toastSaved(blockName(draft)) : t.toastAdded(blockName(draft)),
    );
    onOpenChange(false);
  };

  const title = !editing
    ? t.addTitle
    : editing.type === "TABS"
      ? t.editTabsTitle(homeBlockLabel(editing))
      : t.replaceTitle(homeBlockLabel(editing));

  const chosenElsewhere =
    type === "CAROUSEL" && draft.carouselId
      ? carouselElsewhere(blocks, draft.carouselId, editing?.id)
      : [];

  const carouselsState = !canReadCarousels ? (
    <Callout variant="warning">{t.carouselsForbidden}</Callout>
  ) : carouselsQuery.isLoading ? (
    <p className="text-sm text-muted-foreground">{t.carouselsLoading}</p>
  ) : carouselsQuery.isError ? (
    <p role="alert" className="text-sm text-destructive">
      {t.carouselsLoadError}
    </p>
  ) : carousels.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t.noCarousels}</p>
  ) : null;

  const tabChoices = carousels.filter(
    (carousel) => !draft.tabs.includes(carousel.id),
  );

  const addTab = () => {
    if (!newTab || draft.tabs.includes(newTab)) return;
    patch({ tabs: [...draft.tabs, newTab] });
    setNewTab("");
  };

  const showOptions: { value: BlockShow; label: string }[] = [
    { value: "now", label: t.showNow },
    { value: "draft", label: t.showDraft },
    { value: "schedule", label: t.showScheduled },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editing ? t.editDescription : t.addDescription}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {!editing && (
            <RadioCardGroup
              aria-label={t.typeLabel}
              value={type}
              onValueChange={(value) => {
                patch({ type: value as CreatableBlockType });
                setErrors({});
              }}
              className="sm:grid-cols-2"
            >
              <RadioCard
                value="CAROUSEL"
                title={t.typeCarousel}
                description={t.typeCarouselHint}
              />
              <RadioCard
                value="TABS"
                title={t.typeTabs}
                description={t.typeTabsHint}
              />
            </RadioCardGroup>
          )}

          {type === "CAROUSEL" ? (
            <fieldset className="flex min-w-0 flex-col gap-1.5">
              <legend
                id={ids.carousel}
                className="mb-1.5 text-sm font-medium text-foreground"
              >
                {t.carouselLabel}
                <span aria-hidden="true"> *</span>
              </legend>
              {carouselsState ?? (
                <RadioCardGroup
                  aria-labelledby={ids.carousel}
                  aria-describedby={
                    errors.carouselId ? ids.carouselError : undefined
                  }
                  aria-required
                  value={draft.carouselId ?? ""}
                  onValueChange={(value) => patch({ carouselId: value })}
                  className="max-h-72 overflow-y-auto p-0.5"
                >
                  {carousels.map((carousel) => {
                    const where = carouselElsewhere(
                      blocks,
                      carousel.id,
                      editing?.id,
                    );
                    return (
                      <RadioCard
                        key={carousel.id}
                        value={carousel.id}
                        title={carousel.title}
                        description={`${carouselLine(carousel)} — ${
                          where.length > 0 ? where.join(", ") : t.notOnHome
                        }`}
                      />
                    );
                  })}
                </RadioCardGroup>
              )}
              <FieldError id={ids.carouselError}>
                {errors.carouselId}
              </FieldError>
              {chosenElsewhere.length > 0 && draft.carouselId ? (
                <Callout variant="warning">
                  {t.duplicateWarning(
                    nameOf(draft.carouselId),
                    chosenElsewhere.join(", "),
                  )}
                </Callout>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t.carouselHint}
                </p>
              )}
            </fieldset>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.title}>
                  {t.titleLabel}
                  <span aria-hidden="true"> *</span>
                </Label>
                <Input
                  id={ids.title}
                  value={draft.title}
                  onChange={(event) => patch({ title: event.target.value })}
                  required
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={cn(
                    ids.titleHint,
                    errors.title && ids.titleError,
                  )}
                />
                <p id={ids.titleHint} className="text-xs text-muted-foreground">
                  {t.titleHint}
                </p>
                <FieldError id={ids.titleError}>{errors.title}</FieldError>
              </div>

              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend
                  id={ids.tabs}
                  className="mb-1.5 text-sm font-medium text-foreground"
                >
                  {t.tabsLabel}
                  <span aria-hidden="true"> *</span>
                </legend>
                {carouselsState ?? (
                  <>
                    {draft.tabs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t.tabsEmpty}
                      </p>
                    ) : (
                      <ol
                        aria-labelledby={ids.tabs}
                        className="flex flex-col rounded-md border border-border"
                      >
                        {draft.tabs.map((id, index) => {
                          const name = nameOf(id);
                          const carousel = byId.get(id);
                          const where = carouselElsewhere(
                            blocks,
                            id,
                            editing?.id,
                          );
                          return (
                            <li
                              key={id}
                              className="flex items-center gap-2 border-t border-border px-2.5 py-2 text-sm first:border-t-0"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-flex w-5 justify-center text-xs text-muted-foreground"
                              >
                                {index + 1}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-foreground">
                                  {name}
                                </span>
                                {carousel ? (
                                  <span className="text-xs text-muted-foreground">
                                    {where.length > 0
                                      ? `${carouselLine(carousel)} · ${t.alsoOnHome(where.join(", "))}`
                                      : carouselLine(carousel)}
                                  </span>
                                ) : null}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 md:size-8"
                                aria-label={t.tabUp(name)}
                                disabled={index === 0}
                                onClick={() =>
                                  patch({
                                    tabs: moveTab(draft.tabs, index, -1),
                                  })
                                }
                              >
                                <ArrowUpIcon aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 md:size-8"
                                aria-label={t.tabDown(name)}
                                disabled={index === draft.tabs.length - 1}
                                onClick={() =>
                                  patch({ tabs: moveTab(draft.tabs, index, 1) })
                                }
                              >
                                <ArrowDownIcon aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 md:size-8"
                                aria-label={t.tabRemove(name)}
                                onClick={() =>
                                  patch({
                                    tabs: draft.tabs.filter(
                                      (tab) => tab !== id,
                                    ),
                                  })
                                }
                              >
                                <XIcon aria-hidden="true" />
                              </Button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {draft.tabs.length < MAX_TABS && tabChoices.length > 0 ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Label htmlFor={ids.newTab}>{t.newTabLabel}</Label>
                          <select
                            id={ids.newTab}
                            className={SELECT_CLASS}
                            value={newTab}
                            onChange={(event) => setNewTab(event.target.value)}
                          >
                            <option value="">{t.newTabPlaceholder}</option>
                            {tabChoices.map((carousel) => (
                              <option key={carousel.id} value={carousel.id}>
                                {carousel.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!newTab}
                          onClick={addTab}
                          className="max-md:min-h-11"
                        >
                          <PlusIcon aria-hidden="true" />
                          {t.addTab}
                        </Button>
                      </div>
                    ) : null}
                    <FieldError id={ids.tabsError}>{errors.tabs}</FieldError>
                    <p className="text-xs text-muted-foreground">
                      {t.tabsHint}
                    </p>
                  </>
                )}
              </fieldset>
            </>
          )}

          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.position}>{t.positionLabel}</Label>
                <select
                  id={ids.position}
                  className={SELECT_CLASS}
                  value={String(draft.position)}
                  onChange={(event) =>
                    patch({ position: Number(event.target.value) })
                  }
                >
                  {positionOptions(blocks).map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span id={ids.show} className="text-sm font-medium">
                  {t.showLabel}
                </span>
                <SegmentedControl<BlockShow>
                  aria-labelledby={ids.show}
                  value={draft.show}
                  onValueChange={(show) => patch({ show })}
                  options={showOptions}
                />
              </div>
            </div>
          )}

          {!editing && draft.show === "draft" && (
            <p className="text-xs text-muted-foreground">{t.draftHint}</p>
          )}

          {!editing && draft.show === "schedule" && (
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor={ids.scheduledAt}>
                {t.scheduledAtLabel}
                <span aria-hidden="true"> *</span>
              </Label>
              <Input
                id={ids.scheduledAt}
                type="datetime-local"
                value={draft.scheduledAt}
                onChange={(event) => patch({ scheduledAt: event.target.value })}
                required
                aria-invalid={errors.scheduledAt ? true : undefined}
                aria-describedby={cn(
                  ids.scheduledAtHint,
                  errors.scheduledAt && ids.scheduledAtError,
                )}
              />
              <p
                id={ids.scheduledAtHint}
                className="text-xs text-muted-foreground"
              >
                {t.scheduledAtHint}
              </p>
              <FieldError id={ids.scheduledAtError}>
                {errors.scheduledAt}
              </FieldError>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" disabled={isPending || !canReadCarousels}>
              {editing
                ? t.submitSave
                : draft.show === "schedule"
                  ? t.submitSchedule
                  : t.submitAdd}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
