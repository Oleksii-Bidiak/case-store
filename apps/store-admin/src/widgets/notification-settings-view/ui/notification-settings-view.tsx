"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import {
  getGetTelegramNotificationChannelQueryKey,
  TelegramChannelStateValue,
  useCreateTelegramConnectLink,
  useGetTelegramNotificationChannel,
  type TelegramShopBindingDto,
} from "@/entities/notification";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import { ErrorState, LiveAnnouncer } from "@/shared/ui";
import { BotStatusCard } from "./bot-status-card";
import { ConnectTelegramDialog } from "./connect-telegram-dialog";
import { NotificationEventsAside } from "./notification-events-aside";
import {
  NotificationSettingsHeading,
  NotificationSettingsLead,
  NotificationSettingsSkeleton,
} from "./notification-settings-skeleton";
import { ShopChatsCard } from "./shop-chats-card";

/**
 * How often the open connect dialog re-reads the channel to notice the chat in
 * which «Старт» was pressed. Three seconds: the person is looking at the
 * dialog, and the GET is one indexed read.
 */
export const CONNECT_POLL_MS = 3_000;

/**
 * /settings/notifications (TASK-676, mockup Д-н2 SettingsNotifications ДН-7).
 *
 * The heading is always drawn; below it, one of: the refusal (ДН-7.12) for a
 * session without `settings:notifications` — rendered by `PermissionGate`,
 * which also keeps every request below from being sent as a guaranteed 403 —
 * the skeleton, a load failure with «Повторити», or the page.
 */
export function NotificationSettingsView() {
  const t = dict.notificationSettings;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <NotificationSettingsHeading />
        <PermissionGate permission={PERM.settingsNotifications} fallback={null}>
          <NotificationSettingsLead />
        </PermissionGate>
      </div>
      <PermissionGate
        permission={PERM.settingsNotifications}
        title={t.noAccessTitle}
        hint={t.noAccessHint}
      >
        <LiveAnnouncer>
          <NotificationSettingsContent />
        </LiveAnnouncer>
      </PermissionGate>
    </div>
  );
}

/** The chats known when the connect dialog opened — anything else is new. */
interface ConnectSession {
  knownIds: ReadonlySet<string>;
}

function NotificationSettingsContent() {
  const queryClient = useQueryClient();
  const [connectSession, setConnectSession] = useState<ConnectSession | null>(
    null,
  );

  const channelQuery = useGetTelegramNotificationChannel({
    query: {
      // While the connect dialog is open, poll until the new chat shows up —
      // then stop: the dialog has its answer.
      refetchInterval: (query) => {
        if (!connectSession) return false;
        const bindings = query.state.data?.data.bindings ?? [];
        return bindings.some(
          (binding) => !connectSession.knownIds.has(binding.id),
        )
          ? false
          : CONNECT_POLL_MS;
      },
      // The person is in Telegram — possibly in another tab of this browser.
      refetchIntervalInBackground: connectSession !== null,
    },
  });

  const createLink = useCreateTelegramConnectLink({
    mutation: {
      onError: (error) => {
        // 409: the bot stopped answering since the page loaded. Re-read the
        // channel so the card above the dialog says so too.
        if (apiErrorStatus(error) === 409) {
          void queryClient.invalidateQueries({
            queryKey: getGetTelegramNotificationChannelQueryKey(),
          });
        }
      },
    },
  });
  const { mutate: issueLink, reset: resetLink } = createLink;
  const reissueLink = useCallback(() => issueLink(), [issueLink]);

  // The error page replaces the page only when there is nothing to show. A
  // failed BACKGROUND refetch — a poll while the connect dialog is open —
  // leaves `isError` true with the last good data still in hand; swapping the
  // page for ErrorState then would unmount the open dialog mid-connect. The
  // stale data is SAID to be stale instead (the bot card's notice, the
  // dialog's waiting line); the next successful poll clears the error.
  const channel = channelQuery.data?.data;
  const refreshFailed = channelQuery.isError && channel !== undefined;
  if (!channel) {
    return channelQuery.isError ? (
      <ErrorState
        message={dict.notificationSettings.loadError}
        onRetry={() => void channelQuery.refetch()}
        isRetrying={channelQuery.isFetching}
      />
    ) : (
      <NotificationSettingsSkeleton />
    );
  }

  const connected: TelegramShopBindingDto | null = connectSession
    ? (channel.bindings.find(
        (binding) => !connectSession.knownIds.has(binding.id),
      ) ?? null)
    : null;

  // The link is issued by the click — its 15 minutes start when the owner
  // asks, not when the page happened to load.
  const openConnect = () => {
    setConnectSession({
      knownIds: new Set(channel.bindings.map((binding) => binding.id)),
    });
    issueLink();
  };

  const closeConnect = () => {
    setConnectSession(null);
    resetLink();
  };

  const linkError = createLink.isError
    ? apiErrorStatus(createLink.error) === 409
      ? "conflict"
      : "other"
    : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <BotStatusCard
          channel={channel}
          fetchedAt={channelQuery.dataUpdatedAt}
          refreshFailedAt={refreshFailed ? channelQuery.errorUpdatedAt : null}
        />
        <ShopChatsCard channel={channel} onConnect={openConnect} />
      </div>
      <NotificationEventsAside />

      <ConnectTelegramDialog
        open={connectSession !== null}
        onOpenChange={(open) => {
          if (!open) closeConnect();
        }}
        botUsername={channel.botUsername}
        link={createLink.data?.data}
        linkError={linkError}
        onRetry={reissueLink}
        isRetrying={createLink.isPending}
        onExpired={reissueLink}
        connected={connected}
        pollFailing={refreshFailed}
        botOk={channel.state === TelegramChannelStateValue.ok}
      />
    </div>
  );
}
