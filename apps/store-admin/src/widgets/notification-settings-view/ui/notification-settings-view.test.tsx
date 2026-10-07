import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { NotificationSettingsView } from "./notification-settings-view";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const t = dict.notificationSettings;
const GET = "*/api/admin/notifications/telegram";
const ADMIN = { auth: { isOwner: true } };

const PRIVATE_CHAT = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Олексій Б.",
  kind: "PRIVATE",
  createdAt: "2026-10-01T09:00:00.000Z",
  connectedBy: {
    id: "u-1",
    email: "owner@store.com",
    firstName: "Олексій",
    lastName: "Бідяк",
  },
};
const GROUP_CHAT = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Магазин — замовлення",
  kind: "GROUP",
  createdAt: "2026-10-02T09:00:00.000Z",
  connectedBy: {
    id: "u-2",
    email: "olena@store.com",
    firstName: "Олена",
    lastName: "Коваль",
  },
};

function okChannel(bindings: unknown[] = [PRIVATE_CHAT, GROUP_CHAT]) {
  return {
    data: {
      state: "ok",
      botUsername: "casestore_bot",
      checkedAt: "2026-10-07T06:40:00.000Z",
      bindings,
    },
  };
}

function serveChannel(body: Record<string, unknown>) {
  server.use(http.get(GET, () => HttpResponse.json(body)));
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("NotificationSettingsView (TASK-676)", () => {
  it("refuses a session without settings:notifications and asks for nothing (ДН-7.12)", () => {
    let requests = 0;
    server.use(
      http.get(GET, () => {
        requests += 1;
        return HttpResponse.json(okChannel());
      }),
    );

    renderWithProviders(<NotificationSettingsView />, {
      auth: { permissions: ["orders:read"] },
    });

    expect(
      screen.getByRole("heading", { level: 2, name: t.heading }),
    ).toBeInTheDocument();
    const refusal = screen.getByRole("alert");
    expect(refusal).toHaveTextContent(t.noAccessTitle);
    expect(refusal).toHaveTextContent(t.noAccessHint);
    expect(screen.queryByText(t.subheading)).not.toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it("shows the skeleton while the channel loads", () => {
    server.use(
      http.get(GET, async () => {
        await delay("infinite");
        return HttpResponse.json(okChannel());
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    expect(screen.getByText(t.subheading)).toBeInTheDocument();
    expect(
      screen.getByTestId("notification-settings-skeleton"),
    ).toBeInTheDocument();
  });

  it("offers «Повторити» when the channel fails to load", async () => {
    server.use(
      http.get(GET, () =>
        HttpResponse.json(
          { error: "Internal Server Error", message: "boom", statusCode: 500 },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    // Not `findByRole("alert")`: the LiveAnnouncer's assertive region is one
    // too, and it is mounted first.
    const alert = (await screen.findByText(t.loadError)).closest(
      "[role='alert']",
    ) as HTMLElement;
    expect(alert).toHaveAttribute("data-slot", "error-state");
    expect(
      within(alert).getByRole("button", { name: dict.canon.retry }),
    ).toBeInTheDocument();
  });

  it("says the bot works and lists the chats with who connected them (ДН-7.1)", async () => {
    serveChannel(okChannel());

    renderWithProviders(<NotificationSettingsView />, {
      auth: { permissions: ["settings:notifications"] },
    });

    expect(
      await screen.findByText(t.okTitle("casestore_bot")),
    ).toBeInTheDocument();
    expect(screen.getByText(t.stateOk)).toBeInTheDocument();
    expect(screen.getByText(t.chatsCount(2))).toBeInTheDocument();

    const rows = screen.getAllByTestId("telegram-chat-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Олексій Б.");
    expect(rows[0]).toHaveTextContent(
      t.chatMeta(t.kindPrivate, "01.10.2026", "Олексій Б."),
    );
    expect(rows[1]).toHaveTextContent(
      t.chatMeta(t.kindGroup, "02.10.2026", "Олена К."),
    );
    // The mockup's order — who, then when — without a gendered verb.
    expect(rows[0]).toHaveTextContent(
      "Особистий чат · підключено: Олексій Б., 01.10.2026",
    );

    expect(screen.getByRole("button", { name: t.connect })).toBeEnabled();
    expect(screen.getByRole("button", { name: t.sendTest })).toBeEnabled();
    expect(screen.queryByText(t.lockedHint)).not.toBeInTheDocument();
    // The aside: what arrives in Telegram.
    expect(
      screen.getByRole("heading", { name: t.eventsTitle }),
    ).toBeInTheDocument();
  });

  it("says the bot is not answering, keeps Telegram's words and locks the actions (ДН-7.10)", async () => {
    serveChannel({
      data: {
        state: "failed",
        reason: "Telegram getMe failed (401): Unauthorized",
        checkedAt: "2026-10-07T06:40:00.000Z",
        bindings: [PRIVATE_CHAT],
      },
    });

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    expect(await screen.findByText(t.failedTitle)).toBeInTheDocument();
    expect(screen.getByText(t.stateFailed)).toBeInTheDocument();
    expect(
      screen.getByText("Telegram getMe failed (401): Unauthorized"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.connect })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.sendTest })).toBeDisabled();
    expect(screen.getByText(t.lockedHint)).toBeInTheDocument();
    // A chat can still be let go while the bot is down.
    expect(
      screen.getByRole("button", { name: t.disconnectAria("Олексій Б.") }),
    ).toBeEnabled();
  });

  it("says the bot is not configured and shows the empty state (ДН-7.11)", async () => {
    serveChannel({ data: { state: "unconfigured", bindings: [] } });

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    expect(await screen.findByText(t.unconfiguredTitle)).toBeInTheDocument();
    expect(screen.getByText(t.stateUnconfigured)).toBeInTheDocument();
    expect(screen.getByText(t.unconfiguredText)).toBeInTheDocument();
    expect(screen.getByText(t.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.connect })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.sendTest })).toBeDisabled();
    expect(screen.getByText(t.lockedHint)).toBeInTheDocument();
  });

  it("shows the empty state and disables only the test with a working bot and no chats (ДН-7.9)", async () => {
    serveChannel(okChannel([]));

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    expect(await screen.findByText(t.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.emptyText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.connect })).toBeEnabled();
    expect(screen.getByRole("button", { name: t.sendTest })).toBeDisabled();
    expect(screen.queryByText(t.lockedHint)).not.toBeInTheDocument();
  });

  it("shows the test result on each chat and sums it up (ДН-7.7)", async () => {
    serveChannel(okChannel());
    server.use(
      http.post(`${GET}/test`, () =>
        HttpResponse.json({
          data: {
            results: [
              { bindingId: PRIVATE_CHAT.id, ok: true },
              {
                bindingId: GROUP_CHAT.id,
                ok: false,
                error: "бота видалено з групи",
              },
            ],
          },
        }),
      ),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.sendTest }),
    );

    const rows = await screen.findAllByTestId("telegram-chat-row");
    expect(
      await within(rows[0]).findByText(t.testDelivered),
    ).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(t.testFailed("бота видалено з групи")),
    ).toBeInTheDocument();

    const summary = screen.getByTestId("telegram-test-summary");
    expect(summary).toHaveTextContent(t.testSummary(1, 2));
    expect(summary).toHaveTextContent(
      t.testFailedGroupHint("Магазин — замовлення", "бота видалено з групи"),
    );
    // Announced for a screen reader, not only drawn.
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        t.testSummary(1, 2),
      ),
    );
  });

  it("keeps the advice for a chat the test found gone, after it leaves the list", async () => {
    let gone = false;
    server.use(
      http.get(GET, () =>
        HttpResponse.json(
          okChannel(gone ? [PRIVATE_CHAT] : [PRIVATE_CHAT, GROUP_CHAT]),
        ),
      ),
      http.post(`${GET}/test`, () => {
        gone = true;
        return HttpResponse.json({
          data: {
            results: [
              { bindingId: PRIVATE_CHAT.id, ok: true },
              {
                bindingId: GROUP_CHAT.id,
                ok: false,
                error: "bot was kicked",
                revoked: true,
              },
            ],
          },
        });
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.sendTest }),
    );

    await waitFor(() =>
      expect(screen.getAllByTestId("telegram-chat-row")).toHaveLength(1),
    );
    expect(screen.getByTestId("telegram-test-summary")).toHaveTextContent(
      t.testRevokedHint("Магазин — замовлення", "bot was kicked"),
    );
  });

  it("stamps the test result with its time and drops it once the bot stops answering", async () => {
    let botDown = false;
    server.use(
      http.get(GET, () =>
        HttpResponse.json(
          botDown
            ? {
                data: {
                  state: "failed",
                  reason: "Unauthorized",
                  checkedAt: "2026-10-07T07:00:00.000Z",
                  bindings: [PRIVATE_CHAT],
                },
              }
            : okChannel(),
        ),
      ),
      http.post(`${GET}/test`, () => {
        // The group is gone; the API disconnects it and re-reads the channel —
        // by then the bot itself has stopped answering.
        botDown = true;
        return HttpResponse.json({
          data: {
            results: [
              { bindingId: PRIVATE_CHAT.id, ok: true },
              {
                bindingId: GROUP_CHAT.id,
                ok: false,
                error: "bot was kicked",
                revoked: true,
              },
            ],
          },
        });
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.sendTest }),
    );

    // The re-read says the bot is down: a «Доставлено» from before must not
    // stay on screen next to «Не відповідає».
    expect(await screen.findByText(t.stateFailed)).toBeInTheDocument();
    expect(
      screen.queryByTestId("telegram-test-summary"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(t.testDelivered)).not.toBeInTheDocument();
  });

  it("says when the test ran", async () => {
    serveChannel(okChannel());
    server.use(
      http.post(`${GET}/test`, () =>
        HttpResponse.json({
          data: { results: [{ bindingId: PRIVATE_CHAT.id, ok: true }] },
        }),
      ),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.sendTest }),
    );

    expect(
      await screen.findByTestId("telegram-test-summary"),
    ).toHaveTextContent(new RegExp(`${t.testAt("")}\\d{1,2}:\\d{2}`));
  });

  it("says why the test was not sent when the API refuses it", async () => {
    serveChannel(okChannel());
    server.use(
      http.post(`${GET}/test`, () =>
        HttpResponse.json(
          { error: "Conflict", message: "not ok", statusCode: 409 },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.sendTest }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(t.toastTestConflict),
    );
  });

  it("asks before disconnecting a chat, naming it, then drops it (ДН-7.8)", async () => {
    let revoked: string | null = null;
    server.use(
      http.get(GET, () =>
        HttpResponse.json(
          okChannel(revoked ? [PRIVATE_CHAT] : [PRIVATE_CHAT, GROUP_CHAT]),
        ),
      ),
      http.delete(`${GET}/bindings/:id`, ({ params }) => {
        revoked = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", {
        name: t.disconnectAria("Магазин — замовлення"),
      }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(t.disconnectTitle("Магазин — замовлення"));
    expect(dialog).toHaveTextContent(t.disconnectGroupText);
    expect(dialog).toHaveTextContent(
      t.disconnectOthersOne("Олексій Б.", false),
    );
    // ДН-7.8's wording: the person who stays, in their own Telegram.
    expect(dialog).toHaveTextContent(
      "Олексій Б. і далі отримуватиме їх у свій Telegram.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.disconnect }),
    );

    await waitFor(() => expect(revoked).toBe(GROUP_CHAT.id));
    await waitFor(() =>
      expect(screen.getAllByTestId("telegram-chat-row")).toHaveLength(1),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      t.toastDisconnected("Магазин — замовлення"),
    );
  });

  it("does nothing when the disconnect is cancelled", async () => {
    let deletes = 0;
    serveChannel(okChannel());
    server.use(
      http.delete(`${GET}/bindings/:id`, () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", {
        name: t.disconnectAria("Олексій Б."),
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(deletes).toBe(0);
  });
});

describe("NotificationSettingsView — «Підключити Telegram» (ДН-7.3…7.5)", () => {
  const LINK = {
    deepLink: "https://t.me/casestore_bot?start=tok123",
    groupDeepLink: "https://t.me/casestore_bot?startgroup=tok123",
    expiresAt: "2099-10-07T09:15:00.000Z",
  };

  it("issues the link on click, shows it with a QR code per tab, and flips to «Підключено» when the chat appears", async () => {
    let linkRequests = 0;
    let started = false;
    server.use(
      http.get(GET, () =>
        HttpResponse.json(
          okChannel(started ? [PRIVATE_CHAT, GROUP_CHAT] : [PRIVATE_CHAT]),
        ),
      ),
      http.post(`${GET}/link`, () => {
        linkRequests += 1;
        return HttpResponse.json({ data: LINK });
      }),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    const connect = await screen.findByRole("button", { name: t.connect });
    expect(linkRequests).toBe(0);
    await userEvent.click(connect);

    const dialog = await screen.findByRole("dialog", { name: t.dialogTitle });
    const open = await within(dialog).findByRole("link", {
      name: new RegExp(t.openPrivate),
    });
    expect(open).toHaveAttribute("href", LINK.deepLink);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(within(dialog).getByRole("img", { name: t.qrLabel })).toBeVisible();
    expect(within(dialog).getByText(t.waiting)).toBeInTheDocument();
    expect(linkRequests).toBe(1);

    // The group tab carries the add-to-group link of the same token.
    await userEvent.click(
      within(dialog).getByRole("tab", { name: t.tabGroup }),
    );
    expect(
      await within(dialog).findByRole("link", {
        name: new RegExp(t.openGroup),
      }),
    ).toHaveAttribute("href", LINK.groupDeepLink);

    // «Старт» pressed in the group: the next poll sees a chat that was not
    // there when the dialog opened.
    started = true;
    expect(
      await within(dialog).findByTestId(
        "telegram-connect-done",
        {},
        { timeout: 6000 },
      ),
    ).toHaveTextContent(t.doneTitle("Магазин — замовлення", t.doneKindGroup));
    await userEvent.click(within(dialog).getByRole("button", { name: t.done }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("telegram-chat-row")).toHaveLength(2);
  }, 15000);

  it("keeps the page and the open dialog when a poll fails, and still notices the chat after", async () => {
    let failing = false;
    let started = false;
    let failedPolls = 0;
    server.use(
      http.get(GET, () => {
        if (failing) {
          failedPolls += 1;
          return HttpResponse.json(
            {
              error: "Internal Server Error",
              message: "boom",
              statusCode: 500,
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          okChannel(started ? [PRIVATE_CHAT, GROUP_CHAT] : [PRIVATE_CHAT]),
        );
      }),
      http.post(`${GET}/link`, () => HttpResponse.json({ data: LINK })),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.connect }),
    );
    const dialog = await screen.findByRole("dialog", { name: t.dialogTitle });
    const open = await within(dialog).findByRole("link", {
      name: new RegExp(t.openPrivate),
    });
    open.focus();

    // A background poll fails: the last good channel is still in hand, so
    // neither the page nor the dialog may give way to the error page.
    failing = true;
    await waitFor(() => expect(failedPolls).toBeGreaterThan(0), {
      timeout: 6000,
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("telegram-chat-row")).toHaveLength(1),
    );
    expect(screen.queryByText(t.loadError)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: t.dialogTitle })).toBe(dialog);
    expect(open).toHaveFocus();
    // …but the kept data is not passed off as fresh: the bot card says the
    // re-read failed, and the dialog stops promising it is watching.
    expect(
      await screen.findByTestId("notification-stale-notice"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("telegram-connect-waiting"),
    ).toHaveTextContent(t.waitingPollFailing);

    // The network is back and «Старт» was pressed: the next poll answers.
    failing = false;
    started = true;
    expect(
      await within(dialog).findByTestId(
        "telegram-connect-done",
        {},
        { timeout: 6000 },
      ),
    ).toHaveTextContent(t.doneTitle("Магазин — замовлення", t.doneKindGroup));
    expect(
      screen.queryByTestId("notification-stale-notice"),
    ).not.toBeInTheDocument();
  }, 20000);

  it("says the bot is not answering when the link is refused (409), instead of closing", async () => {
    serveChannel(okChannel());
    server.use(
      http.post(`${GET}/link`, () =>
        HttpResponse.json(
          { error: "Conflict", message: "not ok", statusCode: 409 },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<NotificationSettingsView />, ADMIN);

    await userEvent.click(
      await screen.findByRole("button", { name: t.connect }),
    );

    const dialog = await screen.findByRole("dialog", { name: t.dialogTitle });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      t.linkConflict,
    );
    expect(
      within(dialog).queryByRole("link", { name: new RegExp(t.openPrivate) }),
    ).not.toBeInTheDocument();
  });
});
