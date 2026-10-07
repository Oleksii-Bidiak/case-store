import { http, HttpResponse } from "msw";
import { ThemeProvider } from "next-themes";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AccountSettingsSection } from "./account-settings-section";

const d = dict.account.dashboard;
const t = dict.theme;
const tg = dict.telegramNotifications;
const EMAIL = "oleksii@example.com";
const STATUS = "*/api/users/me/notifications/telegram";

/**
 * A real next-themes provider, not a mocked `useTheme` (same call as the
 * control's own test): what this section owes the visitor is that a choice made
 * HERE actually lands on the document and in localStorage, which a mock fakes.
 */
function renderSettings() {
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <AccountSettingsSection email={EMAIL} telegramPollIntervalMs={30} />
    </ThemeProvider>,
    { auth: { isAuthenticated: true } },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("AccountSettingsSection", () => {
  it("puts the theme control in the appearance card, not a claim about it", () => {
    renderSettings();

    expect(
      screen.getByRole("heading", { name: d.appearanceHeading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: t.groupAria }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of [t.light, t.system, t.dark]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("no longer tells the visitor the theme adapts on its own", () => {
    // The regression this section shipped with (TASK-505): after TASK-412 added
    // a manual switch, the card still promised the theme "автоматично
    // підлаштовується" under the visitor. Any copy making that promise again
    // fails here.
    renderSettings();

    expect(screen.getByText(d.appearanceNote)).toBeInTheDocument();
    expect(screen.queryByText(/автоматично/i)).not.toBeInTheDocument();
  });

  it("changes the theme from the account page", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("radio", { name: t.dark }));

    expect(screen.getByRole("radio", { name: t.dark })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // …and back, so the page is proven to drive the switch in both directions.
    await user.click(screen.getByRole("radio", { name: t.light }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("still renders the notification toggles it owns", () => {
    renderSettings();

    expect(
      screen.getByRole("heading", { name: d.notificationsHeading }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(d.notifs.length);
    expect(
      screen.getByRole("heading", { name: tg.account.topicsHeading }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-679 — «Куди надсилати сповіщення про замовлення». Every Telegram state
 * says what it is; the e-mail row is always there and always on.
 */
describe("AccountSettingsSection — Telegram channel (TASK-679)", () => {
  function serveStatus(state: {
    available: boolean;
    connected: boolean;
    label?: string;
  }) {
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          data: {
            ...state,
            botUsername: state.available ? "casestore_bot" : undefined,
          },
        }),
      ),
    );
  }

  const row = () => screen.getByTestId("telegram-channel-row");

  it("always names the e-mail as the channel the confirmation goes to", async () => {
    serveStatus({ available: true, connected: false });
    renderSettings();

    expect(
      screen.getByRole("heading", { name: tg.account.blockTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(tg.account.mailSub(EMAIL))).toBeInTheDocument();
    expect(screen.getByText(tg.account.mailAlways)).toBeInTheDocument();
  });

  it("off: offers «Підключити» next to the «in addition to e-mail» line", async () => {
    serveStatus({ available: true, connected: false });
    renderSettings();

    expect(await within(row()).findByText(tg.account.off)).toBeInTheDocument();
    expect(
      within(row()).getByRole("button", { name: tg.connectAccount }),
    ).toBeInTheDocument();
  });

  it("wait: after «Підключити» the row waits and the panel opens under it", async () => {
    serveStatus({ available: true, connected: false });
    server.use(
      http.post(`${STATUS}/link`, () =>
        HttpResponse.json({
          data: {
            deepLink: "https://t.me/casestore_bot?start=abc",
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await within(row()).findByRole("button", { name: tg.connectAccount }),
    );

    expect(
      await within(row()).findByText(tg.account.waiting),
    ).toBeInTheDocument();
    expect(within(row()).getByRole("status")).toBeInTheDocument();
    expect(
      within(row()).queryByRole("button", { name: tg.connectAccount }),
    ).not.toBeInTheDocument();
  });

  it("on: names the chat, shows «Підключено», and «Відключити» revokes it", async () => {
    let connected = true;
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          data: {
            available: true,
            connected,
            label: connected ? "@oleksii_p" : undefined,
            botUsername: "casestore_bot",
          },
        }),
      ),
      http.delete(STATUS, () => {
        connected = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderSettings();

    expect(
      await within(row()).findByText(tg.account.on("@oleksii_p")),
    ).toBeInTheDocument();
    expect(
      within(row()).getByText(tg.account.connectedPill),
    ).toBeInTheDocument();

    await user.click(
      within(row()).getByRole("button", { name: tg.account.disconnect }),
    );

    expect(await within(row()).findByText(tg.account.off)).toBeInTheDocument();
    const connectButton = within(row()).getByRole("button", {
      name: tg.connectAccount,
    });
    // «Відключити» unmounted itself — the focus is handed on, not dropped.
    await waitFor(() => expect(connectButton).toHaveFocus());
    expect(
      within(row()).queryByText(tg.account.connectedPill),
    ).not.toBeInTheDocument();
  });

  it("waiting → on: the focus lands on the «connected» line, not on <body>", async () => {
    let connected = false;
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          data: {
            available: true,
            connected,
            label: connected ? "@oleksii_p" : undefined,
            botUsername: "casestore_bot",
          },
        }),
      ),
      http.post(`${STATUS}/link`, () =>
        HttpResponse.json({
          data: {
            deepLink: "https://t.me/casestore_bot?start=abc",
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await within(row()).findByRole("button", { name: tg.connectAccount }),
    );
    await user.click(
      await within(row()).findByRole("button", { name: tg.pressedStart }),
    );

    connected = true;
    const line = await within(row()).findByText(tg.account.on("@oleksii_p"));
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("a 409 on the link says «unavailable» once — the row, not a second alert", async () => {
    let available = true;
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          data: {
            available,
            connected: false,
            botUsername: available ? "casestore_bot" : undefined,
          },
        }),
      ),
      http.post(`${STATUS}/link`, () => {
        available = false;
        return HttpResponse.json(
          { error: "TELEGRAM_UNAVAILABLE", message: "x", statusCode: 409 },
          { status: 409 },
        );
      }),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await within(row()).findByRole("button", { name: tg.connectAccount }),
    );

    await waitFor(() => expect(row()).toHaveAttribute("data-phase", "na"));
    expect(within(row()).getByText(tg.account.na)).toBeInTheDocument();
    expect(within(row()).queryByText(tg.linkConflict)).not.toBeInTheDocument();
    expect(within(row()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("na: the bot is not available — says so, offers no button", async () => {
    serveStatus({ available: false, connected: false });
    renderSettings();

    expect(await within(row()).findByText(tg.account.na)).toBeInTheDocument();
    expect(within(row()).queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(row()).toHaveAttribute("data-phase", "na"));
  });

  it("a failed status read is said, never shown as «off»", async () => {
    server.use(http.get(STATUS, () => HttpResponse.json({}, { status: 500 })));
    renderSettings();

    expect(
      await within(row()).findByText(tg.account.statusError),
    ).toBeInTheDocument();
    expect(
      within(row()).queryByRole("button", { name: tg.connectAccount }),
    ).not.toBeInTheDocument();
  });
});
