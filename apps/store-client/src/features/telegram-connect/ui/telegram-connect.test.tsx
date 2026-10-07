import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  useTelegramConnect,
  type TelegramConnectTarget,
} from "../model/use-telegram-connect";
import { TelegramConnect } from "./telegram-connect";

const t = dict.telegramNotifications;
const DEEP_LINK = `https://t.me/casestore_bot?start=${"a".repeat(43)}`;
const ME_STATUS = "*/api/users/me/notifications/telegram";
const ME_LINK = "*/api/users/me/notifications/telegram/link";
const GUEST_STATUS = "*/api/orders/guest/:token/notifications/telegram";
const GUEST_LINK = "*/api/orders/guest/:token/notifications/telegram/link";

function Harness({ target }: { target: TelegramConnectTarget }) {
  const connect = useTelegramConnect(target, { pollIntervalMs: 30 });
  return (
    <>
      <span data-testid="phase">{connect.phase}</span>
      <TelegramConnect
        connect={connect}
        variant={target.kind === "me" ? "account" : "guest"}
      />
    </>
  );
}

/** The status the server reports; flip `connected` mid-test to simulate «Старт». */
function serveStatus(
  url: string,
  state: { available: boolean; connected: boolean; label?: string },
) {
  const reads = { count: 0 };
  server.use(
    http.get(url, () => {
      reads.count += 1;
      return HttpResponse.json({
        data: {
          ...state,
          botUsername: state.available ? "casestore_bot" : undefined,
        },
      });
    }),
  );
  return reads;
}

function serveLink(url: string, status = 200) {
  const calls: string[] = [];
  server.use(
    http.post(url, ({ request }) => {
      calls.push(request.url);
      if (status !== 200) {
        return HttpResponse.json(
          { error: "TELEGRAM_UNAVAILABLE", message: "x", statusCode: status },
          { status },
        );
      }
      return HttpResponse.json({
        data: {
          deepLink: DEEP_LINK,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      });
    }),
  );
  return calls;
}

/**
 * TASK-679 — the connect flow both hosts share. The only thing it may hold
 * itself is «waiting»; connected / available always come from the status read.
 */
describe("TelegramConnect (TASK-679)", () => {
  it("goes idle → waiting with the link → connected, by polling the status", async () => {
    const state = { available: true, connected: false, label: "@olena" };
    serveStatus(ME_STATUS, state);
    const calls = serveLink(ME_LINK);
    const user = userEvent.setup();
    renderWithProviders(<Harness target={{ kind: "me" }} />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );

    const panel = await screen.findByTestId("telegram-connect-waiting");
    expect(panel).toHaveAttribute("role", "status");
    const open = await screen.findByRole("link", {
      name: new RegExp(t.openTelegram),
    });
    expect(open).toHaveAttribute("href", DEEP_LINK);
    expect(open).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("img", { name: t.qrLabel })).toBeInTheDocument();
    expect(panel).toHaveTextContent("@casestore_bot");
    expect(screen.getByText(t.oneTimeHint)).toBeInTheDocument();
    expect(calls).toHaveLength(1);

    // «Старт» pressed on the phone — the next poll sees it.
    state.connected = true;
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("on"),
    );
    expect(
      screen.queryByTestId("telegram-connect-waiting"),
    ).not.toBeInTheDocument();
  });

  it("«Я натиснув «Старт»» reads the status right away", async () => {
    const reads = serveStatus(ME_STATUS, {
      available: true,
      connected: false,
    });
    serveLink(ME_LINK);
    const user = userEvent.setup();
    // No polling here, so every read after the click is the button's.
    function Slow() {
      const connect = useTelegramConnect(
        { kind: "me" },
        { pollIntervalMs: 60_000 },
      );
      return <TelegramConnect connect={connect} variant="account" />;
    }
    renderWithProviders(<Slow />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );
    await screen.findByRole("link", { name: new RegExp(t.openTelegram) });
    const before = reads.count;
    await user.click(screen.getByRole("button", { name: t.pressedStart }));

    await waitFor(() => expect(reads.count).toBe(before + 1));
  });

  it("says the bot is unavailable when the link call answers 409", async () => {
    serveStatus(ME_STATUS, { available: true, connected: false });
    serveLink(ME_LINK, 409);
    const user = userEvent.setup();
    renderWithProviders(<Harness target={{ kind: "me" }} />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(t.linkConflict);
    expect(
      screen.queryByTestId("telegram-connect-waiting"),
    ).not.toBeInTheDocument();
  });

  it("cancel closes the panel, gives the focus back and reuses the fresh link", async () => {
    serveStatus(ME_STATUS, { available: true, connected: false });
    const calls = serveLink(ME_LINK);
    const user = userEvent.setup();
    renderWithProviders(<Harness target={{ kind: "me" }} />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );
    await screen.findByRole("link", { name: new RegExp(t.openTelegram) });
    await user.click(screen.getByRole("button", { name: t.cancel }));

    const again = await screen.findByRole("button", {
      name: t.connectAccount,
    });
    expect(
      screen.queryByTestId("telegram-connect-waiting"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(again).toHaveFocus());

    // Within the link's life the same link is shown again — no second token.
    await user.click(again);
    expect(
      await screen.findByRole("link", { name: new RegExp(t.openTelegram) }),
    ).toHaveAttribute("href", DEEP_LINK);
    expect(calls).toHaveLength(1);
  });

  it("mints a new link after connect → disconnect, never re-showing the spent one", async () => {
    const state = { available: true, connected: false };
    serveStatus(ME_STATUS, state);
    let minted = 0;
    server.use(
      http.post(ME_LINK, () => {
        minted += 1;
        return HttpResponse.json({
          data: {
            deepLink: `https://t.me/casestore_bot?start=tok${minted}`,
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          },
        });
      }),
    );
    function WithReread() {
      const connect = useTelegramConnect(
        { kind: "me" },
        { pollIntervalMs: 30 },
      );
      return (
        <>
          <span data-testid="phase">{connect.phase}</span>
          <button type="button" onClick={connect.retryStatus}>
            reread
          </button>
          <TelegramConnect connect={connect} variant="account" />
        </>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(<WithReread />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );
    expect(
      await screen.findByRole("link", { name: new RegExp(t.openTelegram) }),
    ).toHaveAttribute("href", "https://t.me/casestore_bot?start=tok1");

    // «Старт» spends tok1; then the chat is disconnected (well inside the
    // link-reuse window).
    state.connected = true;
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("on"),
    );
    state.connected = false;
    await user.click(screen.getByRole("button", { name: "reread" }));
    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );

    expect(
      await screen.findByRole("link", { name: new RegExp(t.openTelegram) }),
    ).toHaveAttribute("href", "https://t.me/casestore_bot?start=tok2");
    expect(minted).toBe(2);
  });

  it("says so while waiting when the status read fails, instead of waiting in silence", async () => {
    let failing = false;
    server.use(
      http.get(ME_STATUS, () =>
        failing
          ? HttpResponse.json(
              { error: "Too Many Requests", message: "x", statusCode: 429 },
              { status: 429 },
            )
          : HttpResponse.json({
              data: {
                available: true,
                connected: false,
                botUsername: "casestore_bot",
              },
            }),
      ),
    );
    serveLink(ME_LINK);
    const user = userEvent.setup();
    renderWithProviders(<Harness target={{ kind: "me" }} />);

    await user.click(
      await screen.findByRole("button", { name: t.connectAccount }),
    );
    await screen.findByRole("link", { name: new RegExp(t.openTelegram) });
    expect(
      screen.queryByTestId("telegram-connect-poll-failing"),
    ).not.toBeInTheDocument();

    failing = true;
    expect(
      await screen.findByTestId("telegram-connect-poll-failing"),
    ).toHaveTextContent(t.pollFailing);
    // Still waiting — the panel stays, the poll keeps trying.
    expect(screen.getByTestId("phase")).toHaveTextContent("waiting");

    failing = false;
    await waitFor(() =>
      expect(
        screen.queryByTestId("telegram-connect-poll-failing"),
      ).not.toBeInTheDocument(),
    );
  });

  it("asks the guest routes with the order token", async () => {
    serveStatus(GUEST_STATUS, { available: true, connected: false });
    const calls = serveLink(GUEST_LINK);
    const user = userEvent.setup();
    renderWithProviders(
      <Harness target={{ kind: "guest", token: "tok-123" }} />,
    );

    await user.click(
      await screen.findByRole("button", { name: t.connectGuest }),
    );

    await screen.findByRole("link", { name: new RegExp(t.openTelegram) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(
      "/api/orders/guest/tok-123/notifications/telegram/link",
    );
  });
});
