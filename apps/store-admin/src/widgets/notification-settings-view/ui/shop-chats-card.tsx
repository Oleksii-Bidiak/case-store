"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  CheckIcon,
  LoaderCircleIcon,
  PlusIcon,
  SendIcon,
  TriangleAlertIcon,
  UnplugIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import {
  TelegramChannelStateValue,
  TelegramChatKind,
  getGetTelegramNotificationChannelQueryKey,
  useRevokeTelegramBinding,
  useSendTelegramTestMessage,
  type TelegramChannelStatusDto,
  type TelegramShopBindingDto,
  type TelegramTestResultDto,
} from "@/entities/notification";
import { dict } from "@/shared/config";
import { apiErrorStatus, cn, formatTime } from "@/shared/lib";
import { Button, useAnnouncer, useConfirmDialog } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import {
  chatLabel,
  chatMeta,
  testAdvice,
  testResultText,
} from "../model/chat-labels";

/** The outcome of the last «Надіслати тестове», kept until the next one. */
interface TestRun {
  /** By binding id — read by each chat row. */
  results: ReadonlyMap<string, TelegramTestResultDto>;
  delivered: number;
  total: number;
  /**
   * What to do about each chat the test did not reach, worded at the moment
   * of the answer: a chat Telegram reported as gone is disconnected by the API
   * and vanishes from the list, and its advice must not vanish with it.
   */
  advice: readonly string[];
  /** When the answer came — a «Доставлено» with no time reads as «now». */
  at: number;
}

interface ShopChatsCardProps {
  channel: TelegramChannelStatusDto;
  onConnect: () => void;
}

/**
 * «Куди надходять сповіщення» (ДН-7.1 / 7.2 / 7.7 / 7.8 / 7.9 / 7.10).
 *
 * The chats every shop notification goes to, who connected each one and when,
 * and the two actions. «Надіслати тестове» shows the answer PER CHAT, inline
 * on its row, plus a summary — a «бота видалено з групи» must not hide behind
 * a green toast. Both actions are disabled, with the reason under them, while
 * the bot is not answering; «Відключити» stays available, because a chat can
 * be let go whatever the bot's state.
 */
export function ShopChatsCard({ channel, onConnect }: ShopChatsCardProps) {
  const t = dict.notificationSettings;
  const queryClient = useQueryClient();
  const { announcePolite } = useAnnouncer();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [testRun, setTestRun] = useState<TestRun | null>(null);

  const bindings = channel.bindings;
  const botOk = channel.state === TelegramChannelStateValue.ok;
  const lockedHintId = "notification-chats-locked-hint";

  // Render-time guard (forms.md): a test result says the bot reached the chats
  // THEN. Once the bot stops answering, a green «Доставлено» left on a row
  // would contradict the card above it — drop the whole run.
  if (testRun && !botOk) setTestRun(null);

  const invalidateChannel = () =>
    queryClient.invalidateQueries({
      queryKey: getGetTelegramNotificationChannelQueryKey(),
    });

  const sendTest = useSendTelegramTestMessage({
    mutation: {
      onSuccess: (response) => {
        const results = response.data.results;
        const byId = new Map(bindings.map((binding) => [binding.id, binding]));
        const advice = results
          .filter((result) => !result.ok)
          .map((result) => {
            const binding = byId.get(result.bindingId);
            const label = binding ? chatLabel(binding) : t.kindPrivate;
            return testAdvice(
              result,
              binding ?? { kind: TelegramChatKind.PRIVATE },
              label,
            );
          });
        const delivered = results.filter((result) => result.ok).length;
        setTestRun({
          results: new Map(results.map((result) => [result.bindingId, result])),
          delivered,
          total: results.length,
          advice,
          at: Date.now(),
        });
        announcePolite(t.testSummary(delivered, results.length));
        // A chat Telegram called gone was disconnected by the API just now.
        if (results.some((result) => result.revoked)) void invalidateChannel();
      },
      onError: (error) => {
        if (apiErrorStatus(error) === 409) {
          toast.error(t.toastTestConflict);
          void invalidateChannel();
          return;
        }
        toast.error(t.toastTestFailed);
      },
    },
  });

  const revoke = useRevokeTelegramBinding();

  async function disconnect(binding: TelegramShopBindingDto) {
    const label = chatLabel(binding);
    const others = bindings.filter((other) => other.id !== binding.id);
    const isGroup = binding.kind === TelegramChatKind.GROUP;
    const othersText =
      others.length === 0
        ? t.disconnectLast
        : others.length === 1
          ? t.disconnectOthersOne(
              chatLabel(others[0]),
              others[0].kind === TelegramChatKind.GROUP,
            )
          : t.disconnectOthersMany(others.length);
    const confirmed = await confirm({
      title: t.disconnectTitle(label),
      description: [
        isGroup ? t.disconnectGroupText : t.disconnectPrivateText,
        othersText,
        isGroup ? t.disconnectAgainGroup : t.disconnectAgainPrivate,
      ].join(" "),
      confirmLabel: t.disconnect,
      destructive: true,
    });
    if (!confirmed) return;
    revoke.mutate(
      { id: binding.id },
      {
        onSuccess: () => {
          toast.success(t.toastDisconnected(label));
          void invalidateChannel();
        },
        onError: () => {
          toast.error(t.toastDisconnectFailed);
          void invalidateChannel();
        },
      },
    );
  }

  return (
    <section
      aria-labelledby="notification-chats-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="notification-chats-title"
          className="text-sm font-semibold text-foreground"
        >
          {t.chatsTitle}
        </h3>
        {bindings.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t.chatsCount(bindings.length)}
          </span>
        ) : null}
      </div>

      {bindings.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {bindings.map((binding) => (
            <ChatRow
              key={binding.id}
              binding={binding}
              result={testRun?.results.get(binding.id)}
              isRevoking={
                revoke.isPending && revoke.variables?.id === binding.id
              }
              onDisconnect={() => void disconnect(binding)}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">
          <BellIcon aria-hidden="true" className="size-6" />
          <p className="font-medium text-foreground">{t.emptyTitle}</p>
          <p>{t.emptyText}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          onClick={onConnect}
          disabled={!botOk}
          aria-describedby={botOk ? undefined : lockedHintId}
        >
          <PlusIcon aria-hidden="true" />
          {t.connect}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => sendTest.mutate()}
          disabled={!botOk || bindings.length === 0 || sendTest.isPending}
          aria-describedby={botOk ? undefined : lockedHintId}
        >
          {sendTest.isPending ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <SendIcon aria-hidden="true" />
          )}
          {t.sendTest}
        </Button>
      </div>

      {testRun ? (
        <div
          data-testid="telegram-test-summary"
          className="flex flex-col gap-1.5 rounded-md border px-3 py-2.5"
        >
          <p className="text-sm font-medium text-foreground">
            {t.testSummary(testRun.delivered, testRun.total)}
            <span className="font-normal text-muted-foreground">
              {" · "}
              {t.testAt(formatTime(testRun.at))}
            </span>
          </p>
          {testRun.advice.length > 0 ? (
            testRun.advice.map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              {t.testAllDeliveredHint}
            </p>
          )}
        </div>
      ) : null}

      {!botOk ? (
        <p id={lockedHintId} className="text-xs text-muted-foreground">
          {t.lockedHint}
        </p>
      ) : null}

      {confirmDialog}
    </section>
  );
}

function ChatRow({
  binding,
  result,
  isRevoking,
  onDisconnect,
}: {
  binding: TelegramShopBindingDto;
  result: TelegramTestResultDto | undefined;
  isRevoking: boolean;
  onDisconnect: () => void;
}) {
  const t = dict.notificationSettings;
  const label = chatLabel(binding);
  const Avatar = binding.kind === TelegramChatKind.GROUP ? UsersIcon : UserIcon;
  return (
    <li
      data-testid="telegram-chat-row"
      className="flex items-center gap-3 px-3 py-2.5"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
      >
        <Avatar className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium break-words text-foreground">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{chatMeta(binding)}</p>
        {result ? (
          <p
            className={cn(
              "flex items-start gap-1.5 text-sm",
              result.ok ? "text-success" : "text-destructive",
            )}
          >
            {result.ok ? (
              <CheckIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            ) : (
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            )}
            {testResultText(result)}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={onDisconnect}
        disabled={isRevoking}
        aria-label={t.disconnectAria(label)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive max-md:size-11 max-md:px-0"
      >
        <UnplugIcon aria-hidden="true" />
        <span className="max-md:sr-only">{t.disconnect}</span>
      </Button>
    </li>
  );
}
