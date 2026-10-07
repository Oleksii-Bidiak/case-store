"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  CircleCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import {
  TelegramChatKind,
  type TelegramConnectLinkDto,
  type TelegramShopBindingDto,
} from "@/entities/notification";
import { dict } from "@/shared/config";
import { formatTime } from "@/shared/lib";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { chatLabel } from "../model/chat-labels";

/** Which link the dialog shows: the private-chat one or the add-to-group one. */
type ConnectTarget = "private" | "group";

export interface ConnectTelegramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bot username without the @ — named in the private-chat steps. */
  botUsername: string | undefined;
  /** The current one-time link; `undefined` while it is being issued. */
  link: TelegramConnectLinkDto | undefined;
  /** Issuing the link failed; `conflict` = the API said the bot is not ok (409). */
  linkError: "conflict" | "other" | null;
  /** Ask for a link again — «Повторити» after a failure. */
  onRetry: () => void;
  isRetrying: boolean;
  /**
   * Called when the link's 15 minutes run out while the dialog is still open:
   * the owner expects the code on screen to work, so the caller issues a new one.
   */
  onExpired: () => void;
  /** The chat that appeared since the dialog opened — switches to ДН-7.5. */
  connected: TelegramShopBindingDto | null;
}

/**
 * «Підключити Telegram» (ДН-7.3 / 7.4 / 7.5 / 7.6).
 *
 * Two tabs over the SAME one-time token — `deepLink` connects the private chat
 * in which «Старт» is pressed, `groupDeepLink` makes Telegram ask which group
 * to add the bot to. The caller polls the channel while this is open and hands
 * back the chat that was not there when it opened; the dialog then says which
 * chat got connected instead of closing silently.
 *
 * On a phone the dialog is full-screen (the shared `DialogContent` below `md`)
 * and the QR code is hidden — nobody scans the screen they are holding.
 */
export function ConnectTelegramDialog(props: ConnectTelegramDialogProps) {
  const { open, onOpenChange, connected } = props;
  const t = dict.notificationSettings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>{t.dialogTitle}</DialogTitle>
          <DialogDescription>{t.dialogDescription}</DialogDescription>
        </DialogHeader>

        {connected ? (
          <ConnectedState binding={connected} />
        ) : (
          <ConnectSteps {...props} />
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {connected ? t.done : dict.common.cancel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectedState({ binding }: { binding: TelegramShopBindingDto }) {
  const t = dict.notificationSettings;
  const kind =
    binding.kind === TelegramChatKind.GROUP
      ? t.doneKindGroup
      : t.doneKindPrivate;
  return (
    <div
      role="status"
      data-testid="telegram-connect-done"
      className="flex flex-col items-center gap-2 p-4 text-center"
    >
      <CircleCheckIcon aria-hidden="true" className="size-6 text-success" />
      <p className="text-base font-semibold text-foreground">
        {t.doneTitle(chatLabel(binding), kind)}
      </p>
      <p className="text-sm text-muted-foreground">{t.doneText}</p>
    </div>
  );
}

function ConnectSteps({
  botUsername,
  link,
  linkError,
  onRetry,
  isRetrying,
  onExpired,
}: ConnectTelegramDialogProps) {
  const t = dict.notificationSettings;
  const [target, setTarget] = useState<ConnectTarget>("private");

  // Re-issue the link when its 15 minutes run out with the dialog still open.
  // A timer is the external system here; the effect only schedules the call.
  const expiresAt = link?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    const id = setTimeout(onExpired, Math.max(ms, 0));
    return () => clearTimeout(id);
  }, [expiresAt, onExpired]);

  if (linkError) {
    return (
      <ErrorState
        message={linkError === "conflict" ? t.linkConflict : t.linkError}
        onRetry={linkError === "conflict" ? undefined : onRetry}
        isRetrying={isRetrying}
      />
    );
  }

  return (
    <>
      <Tabs
        value={target}
        onValueChange={(value) => setTarget(value as ConnectTarget)}
        className="gap-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="private">
            <UserIcon aria-hidden="true" />
            {t.tabPrivate}
          </TabsTrigger>
          <TabsTrigger value="group">
            <UsersIcon aria-hidden="true" />
            {t.tabGroup}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="private">
          <LinkPanel
            href={link?.deepLink}
            expiresAt={link?.expiresAt}
            openLabel={t.openPrivate}
            steps={[
              t.privateStep1,
              t.privateStep2(botUsername ?? ""),
              t.privateStep3,
            ]}
          />
        </TabsContent>
        <TabsContent value="group">
          <LinkPanel
            href={link?.groupDeepLink}
            expiresAt={link?.expiresAt}
            openLabel={t.openGroup}
            steps={[t.groupStep1, t.groupStep2, t.groupStep3]}
          />
        </TabsContent>
      </Tabs>

      <div
        role="status"
        className="flex items-center gap-2.5 rounded-md bg-muted px-3 py-2.5 text-sm text-foreground"
      >
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
        <span>{link ? t.waiting : t.linkLoading}</span>
      </div>
    </>
  );
}

function LinkPanel({
  href,
  expiresAt,
  openLabel,
  steps,
}: {
  href: string | undefined;
  expiresAt: string | undefined;
  openLabel: string;
  steps: readonly string[];
}) {
  const t = dict.notificationSettings;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* The code sits on the theme-independent `code-*` pair: an inverted
          (light-on-dark) QR is one many phone cameras will not read. */}
      <div
        data-testid="telegram-connect-qr"
        className="hidden size-42 shrink-0 items-center justify-center rounded-lg border bg-code-surface p-2.5 text-code-ink md:flex"
      >
        {href ? (
          <QRCodeSVG
            value={href}
            size={146}
            marginSize={0}
            fgColor="currentColor"
            bgColor="transparent"
            role="img"
            aria-label={t.qrLabel}
          />
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {href ? (
          <Button asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon aria-hidden="true" />
              {openLabel}
              <span className="sr-only"> {t.opensInNewTab}</span>
            </a>
          </Button>
        ) : (
          <Button type="button" disabled>
            <ExternalLinkIcon aria-hidden="true" />
            {openLabel}
          </Button>
        )}
        {expiresAt ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ClockIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {t.expiry(formatTime(expiresAt))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
