"use client";

import { useId, useState } from "react";
import {
  ClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  Loader2Icon,
  LockIcon,
} from "lucide-react";
import {
  useAdminPreviewTokenControllerCreate,
  type CreatePreviewTokenDto,
  type PreviewTokenEntity,
} from "@/shared/api";
import {
  Button,
  Callout,
  CopyButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { previewUrl } from "../model/preview-url";

const t = dict.sitePreview;

export interface SitePreviewButtonProps {
  /** What the link opens: `{ type: "home" }` or `{ type, id }`. */
  target: CreatePreviewTokenDto;
  /**
   * The public address when the thing is ALREADY visible on the site. Given, the
   * button is a plain «Відкрити на сайті ↗» link — no token, nothing to share.
   */
  liveHref?: string | null;
  /** One line under the popover's title: what the link shows. */
  description: string;
  /** Asked when the button is pressed: does the form hold unsaved edits? */
  hasUnsavedChanges?: () => boolean;
  /**
   * The page's save, for «Зберегти й подивитись». Resolves `true` when it
   * landed; without it the unsaved-changes step offers only the saved state.
   */
  onSave?: () => Promise<boolean>;
}

type Phase =
  "unsaved" | "saving" | "saveFailed" | "issuing" | "ready" | "failed";

/**
 * «Подивитись на сайті» (TASK-670, SitePreview ДП-1…ДП-10) — one control for the
 * product, page and post forms and for «Головна».
 *
 * The owner's rule: what the storefront already shows opens there as a plain
 * link; what it does not (hidden, draft, scheduled — and «Головна» always, which
 * may carry scheduled blocks) gets a signed 24-hour link in a popover, to open or
 * to copy and send. A preview shows what is SAVED, so with unsaved edits the
 * popover first asks: look at the saved state, or save and then look.
 *
 * A FRESH link is issued every time the popover opens, never a remembered one:
 * «Відкликати всі прев'ю» may have run in another tab since, and a link shown
 * here must be one that still opens. Issuing is cheap — the token is signed, not
 * stored.
 */
export function SitePreviewButton({
  target,
  liveHref,
  description,
  hasUnsavedChanges,
  onSave,
}: SitePreviewButtonProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("issuing");
  const [current, setCurrent] = useState<PreviewTokenEntity | null>(null);
  const create = useAdminPreviewTokenControllerCreate();

  if (liveHref) {
    return (
      <Button asChild variant="outline" className="max-md:min-h-11">
        <a href={liveHref} target="_blank" rel="noopener noreferrer">
          {t.openOnSite}
          <ExternalLinkIcon aria-hidden="true" />
        </a>
      </Button>
    );
  }

  const issue = async () => {
    setPhase("issuing");
    try {
      const response = await create.mutateAsync({ data: target });
      setCurrent(response.data);
      setPhase("ready");
    } catch {
      setPhase("failed");
    }
  };

  const saveAndIssue = async () => {
    if (!onSave) return;
    setPhase("saving");
    let saved = false;
    try {
      saved = await onSave();
    } catch {
      saved = false;
    }
    if (saved) {
      await issue();
    } else {
      setPhase("saveFailed");
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    if (hasUnsavedChanges?.()) {
      setPhase("unsaved");
    } else {
      void issue();
    }
  };

  const link = current && phase === "ready" ? previewUrl(current.token) : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="max-md:min-h-11 data-[state=open]:bg-secondary"
        >
          <EyeIcon aria-hidden="true" />
          {t.viewOnSite}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        className="flex w-105 max-w-(--radix-popover-content-available-width) flex-col gap-3 p-4"
      >
        {phase === "unsaved" || phase === "saving" || phase === "saveFailed" ? (
          <>
            <p id={titleId} className="text-base font-semibold text-foreground">
              {t.dirtyTitle}
            </p>
            <p className="text-sm text-muted-foreground">{t.dirtyBody}</p>
            {phase === "saveFailed" ? (
              <p role="alert" className="text-sm text-destructive">
                {t.saveFailed}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:min-h-11"
                disabled={phase === "saving"}
                onClick={() => void issue()}
              >
                {t.viewSaved}
              </Button>
              {onSave ? (
                <Button
                  type="button"
                  size="sm"
                  className="max-md:min-h-11"
                  disabled={phase === "saving"}
                  onClick={() => void saveAndIssue()}
                >
                  {phase === "saving" ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {phase === "saving" ? t.saving : t.saveAndView}
                </Button>
              ) : null}
            </div>
          </>
        ) : phase === "failed" ? (
          <>
            <p id={titleId} className="text-base font-semibold text-foreground">
              {t.viewOnSite}
            </p>
            <p role="alert" className="text-sm text-destructive">
              {t.issueFailed}
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:min-h-11"
                onClick={() => void issue()}
              >
                {t.retry}
              </Button>
            </div>
          </>
        ) : link && current ? (
          <>
            <p id={titleId} className="text-base font-semibold text-foreground">
              {t.readyTitle}
            </p>
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={link}
                aria-label={t.linkLabel}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 font-mono text-xs md:text-xs"
              />
              <CopyButton
                value={link}
                label={t.copy}
                copiedLabel={t.copied}
                failedLabel={t.copyFailed}
                ariaLabel={t.copyAria}
              />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
              {t.validUntil(formatDateTime(current.expiresAt))}
            </p>
            <Callout
              icon={
                <LockIcon
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              }
              className="text-xs"
            >
              {t.warning}
            </Callout>
            <div className="flex justify-end">
              <Button asChild size="sm" className="max-md:min-h-11">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden="true" />
                  {t.openPreview}
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p
            id={titleId}
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2Icon
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            {t.issuing}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
