import { act, renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  CONNECT_LINK_TTL_MS,
  ConnectTelegramDialog,
  type ConnectTelegramDialogProps,
} from "./connect-telegram-dialog";

function link(token: string, expiresAt: string) {
  return {
    deepLink: `https://t.me/casestore_bot?start=${token}`,
    groupDeepLink: `https://t.me/casestore_bot?startgroup=${token}`,
    expiresAt,
  };
}

function props(
  overrides: Partial<ConnectTelegramDialogProps>,
): ConnectTelegramDialogProps {
  return {
    open: true,
    onOpenChange: () => {},
    botUsername: "casestore_bot",
    link: undefined,
    linkError: null,
    onRetry: () => {},
    isRetrying: false,
    onExpired: () => {},
    connected: null,
    pollFailing: false,
    botOk: true,
    ...overrides,
  };
}

describe("ConnectTelegramDialog — re-issuing an expired link (TASK-676)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("re-issues the link once, 15 minutes after it arrived", () => {
    const onExpired = jest.fn();
    const first = link("tok1", "2099-10-07T09:15:00.000Z");
    const { rerender } = renderWithProviders(
      <ConnectTelegramDialog {...props({ link: first, onExpired })} />,
    );

    act(() => jest.advanceTimersByTime(CONNECT_LINK_TTL_MS - 1));
    expect(onExpired).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onExpired).toHaveBeenCalledTimes(1);

    // The same link stays on screen (the new one is still on its way): no
    // second request for it.
    act(() => jest.advanceTimersByTime(CONNECT_LINK_TTL_MS * 2));
    expect(onExpired).toHaveBeenCalledTimes(1);

    // The new link starts its own 15 minutes.
    rerender(
      <ConnectTelegramDialog
        {...props({
          link: link("tok2", "2099-10-07T09:30:00.000Z"),
          onExpired,
        })}
      />,
    );
    act(() => jest.advanceTimersByTime(CONNECT_LINK_TTL_MS - 1));
    expect(onExpired).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    expect(onExpired).toHaveBeenCalledTimes(2);
  });

  it("does not re-issue at once when the browser clock runs ahead of the server's", () => {
    const onExpired = jest.fn();
    // By this browser's clock the link is long expired — by the server's it
    // has just been issued.
    renderWithProviders(
      <ConnectTelegramDialog
        {...props({
          link: link("tok1", "2000-01-01T00:15:00.000Z"),
          onExpired,
        })}
      />,
    );

    act(() => jest.advanceTimersByTime(60_000));
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe("ConnectTelegramDialog — the waiting line stays honest (TASK-676 review)", () => {
  const t = dict.notificationSettings;
  const ready = link("tok1", "2099-10-07T09:15:00.000Z");

  it("waits for «Старт» while the poll answers", () => {
    renderWithProviders(<ConnectTelegramDialog {...props({ link: ready })} />);
    expect(screen.getByTestId("telegram-connect-waiting")).toHaveTextContent(
      t.waiting,
    );
  });

  it("says checking has stalled when the poll keeps failing", () => {
    renderWithProviders(
      <ConnectTelegramDialog {...props({ link: ready, pollFailing: true })} />,
    );
    const line = screen.getByTestId("telegram-connect-waiting");
    expect(line).toHaveTextContent(t.waitingPollFailing);
    expect(line).not.toHaveTextContent(t.waiting);
  });

  it("says the bot stopped answering instead of waiting for a «Старт» that cannot work", () => {
    renderWithProviders(
      <ConnectTelegramDialog {...props({ link: ready, botOk: false })} />,
    );
    expect(screen.getByTestId("telegram-connect-waiting")).toHaveTextContent(
      t.waitingBotDown,
    );
  });
});
