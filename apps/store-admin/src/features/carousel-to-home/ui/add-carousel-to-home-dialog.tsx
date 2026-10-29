"use client";

/**
 * «Додати на головну» (plan 186, TASK-664 — mockup ДН-4.12). Closes the trap
 * «створив, опублікував, не видно»: a published carousel shows on the homepage
 * only once a block points at it, and this is the shortcut that puts it there
 * without leaving the carousel list.
 *
 * Two ways, the same two the «Головна» screen offers:
 * - «Окремим рядком» → `POST /admin/home-blocks` — a new CAROUSEL block at the
 *   chosen `position` (an index into the WHOLE page order), live at once;
 * - «Вкладкою в блоці» → `PUT /admin/home-blocks/:id` — the block's COMPLETE tab
 *   list with this carousel appended last (the update replaces the list).
 *
 * The choices are an OVERLAY over computed defaults, not seeded copies
 * (forms.md): `null` = «the default for the blocks as they are now», so a
 * background refetch of the blocks shows through until the operator picks.
 * They reset when the dialog opens for another carousel (render-time guard).
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminHomeBlockControllerFindAllQueryKey,
  homeBlockLabel,
  useAdminHomeBlockControllerCreate,
  useAdminHomeBlockControllerFindAll,
  useAdminHomeBlockControllerUpdate,
} from "@/entities/home-block";
import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioCard,
  RadioCardGroup,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import {
  defaultPosition,
  positionOptions,
  tabTargets,
  tabsAfterAppend,
  type AddToHomeMode,
} from "../model/add-to-home";

const t = dict.carouselToHome;

/** What the dialog needs to know about the carousel — the list row has it. */
export interface CarouselToHomeTarget {
  id: string;
  title: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
}

export interface AddCarouselToHomeDialogProps {
  /** The carousel to place; `null` closes the dialog. */
  carousel: CarouselToHomeTarget | null;
  onOpenChange: (open: boolean) => void;
}

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AddCarouselToHomeDialog({
  carousel,
  onOpenChange,
}: AddCarouselToHomeDialogProps) {
  const queryClient = useQueryClient();
  const blocksQuery = useAdminHomeBlockControllerFindAll({
    query: { enabled: carousel !== null },
  });
  const create = useAdminHomeBlockControllerCreate();
  const update = useAdminHomeBlockControllerUpdate();

  const [mode, setMode] = useState<AddToHomeMode | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [tabBlockId, setTabBlockId] = useState<string | null>(null);

  // forms.md Rule 1a: a new carousel starts from the defaults again.
  const carouselId = carousel?.id ?? null;
  const [choicesFor, setChoicesFor] = useState<string | null>(carouselId);
  if (carouselId !== choicesFor) {
    setChoicesFor(carouselId);
    setMode(null);
    setPosition(null);
    setTabBlockId(null);
  }

  const blocks = blocksQuery.data?.data ?? [];
  const targets = tabTargets(blocks);
  const positions = positionOptions(blocks);

  const effectiveMode: AddToHomeMode =
    mode === "tab" && targets.length > 0 ? "tab" : "block";
  const effectivePosition = position ?? defaultPosition(blocks);
  const tabBlock =
    targets.find((block) => block.id === tabBlockId) ?? targets[0];

  const isPending = create.isPending || update.isPending;
  const ready = blocksQuery.isSuccess;

  const handleSubmit = async () => {
    if (!carousel || !ready) return;
    try {
      if (effectiveMode === "tab" && tabBlock) {
        await update.mutateAsync({
          id: tabBlock.id,
          data: { tabs: tabsAfterAppend(tabBlock, carousel.id) },
        });
      } else {
        await create.mutateAsync({
          data: {
            type: "CAROUSEL",
            carouselId: carousel.id,
            // Live at once: the whole point is that the carousel shows up.
            status: "PUBLISHED",
            position: effectivePosition,
          },
        });
      }
    } catch {
      toast.error(t.toastFailed);
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: getAdminHomeBlockControllerFindAllQueryKey(),
    });
    toast.success(t.toastAdded(carousel.title));
    onOpenChange(false);
  };

  return (
    <Dialog open={carousel !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title(carousel?.title ?? "")}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        {blocksQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t.loading}</p>
        ) : blocksQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t.loadError}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <RadioCardGroup
              aria-label={t.modeLabel}
              value={effectiveMode}
              onValueChange={(value) => setMode(value as AddToHomeMode)}
            >
              <RadioCard
                value="block"
                title={t.asBlock}
                description={t.asBlockHint(carousel?.title ?? "")}
              />
              <RadioCard
                value="tab"
                title={t.asTab}
                disabled={targets.length === 0}
                description={
                  targets.length > 0
                    ? t.asTabHint(
                        targets
                          .map((block) => `«${homeBlockLabel(block)}»`)
                          .join(", "),
                      )
                    : t.asTabNone
                }
              />
            </RadioCardGroup>

            {effectiveMode === "block" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="carousel-to-home-position">
                  {t.positionLabel}
                </Label>
                <select
                  id="carousel-to-home-position"
                  aria-describedby="carousel-to-home-hint"
                  className={SELECT_CLASS}
                  value={String(effectivePosition)}
                  onChange={(event) => setPosition(Number(event.target.value))}
                >
                  {positions.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p
                  id="carousel-to-home-hint"
                  className="text-xs text-muted-foreground"
                >
                  {t.hint}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="carousel-to-home-block">
                  {t.tabBlockLabel}
                </Label>
                <select
                  id="carousel-to-home-block"
                  aria-describedby="carousel-to-home-hint"
                  className={SELECT_CLASS}
                  value={tabBlock?.id ?? ""}
                  onChange={(event) => setTabBlockId(event.target.value)}
                >
                  {targets.map((block) => (
                    <option key={block.id} value={block.id}>
                      {homeBlockLabel(block)}
                    </option>
                  ))}
                </select>
                <p
                  id="carousel-to-home-hint"
                  className="text-xs text-muted-foreground"
                >
                  {t.hint}
                </p>
              </div>
            )}

            {carousel && carousel.status !== "PUBLISHED" ? (
              <Callout variant="warning">{t.notPublished}</Callout>
            ) : null}
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
          <Button
            type="button"
            disabled={!ready || isPending}
            onClick={() => void handleSubmit()}
          >
            {t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
