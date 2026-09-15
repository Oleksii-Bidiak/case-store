import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { OrderAccessLinkCard } from "./order-access-link-card";

/**
 * The buyer's link to a phone order (TASK-484).
 *
 * Everything pinned here follows from ONE fact: the server keeps only the
 * SHA-256 of the access token, so this panel can never display the link the
 * customer is currently holding — it can only mint a new one and, in doing so,
 * retire the old. The tests therefore guard the three things an operator can get
 * burned by: that the card does not pretend to know the current link, that the
 * freshly-minted one is visible and copyable while it is still on screen, and
 * that a clipboard the browser refuses to write to is reported rather than
 * silently assumed to have worked.
 */

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";
const FIRST_URL = "https://shop.example.com/orders/guest/" + "a".repeat(64);
const SECOND_URL = "https://shop.example.com/orders/guest/" + "b".repeat(64);

/** Answer the issue endpoint with the given links, in order, one per call. */
function issueReturns(...urls: string[]): void {
  let call = 0;
  server.use(
    http.post("*/api/admin/orders/:orderId/access-link", () => {
      const url = urls[Math.min(call, urls.length - 1)];
      call += 1;
      return HttpResponse.json(
        { data: { url, issuedAt: "2026-09-14T10:15:30.000Z" } },
        { status: 201 },
      );
    }),
  );
}

function issueFails(status: number): void {
  server.use(
    http.post("*/api/admin/orders/:orderId/access-link", () =>
      HttpResponse.json({ message: "nope" }, { status }),
    ),
  );
}

/**
 * Render the card for an operator who may actually issue links.
 *
 * `renderWithProviders` signs the viewer in holding NO permissions, and this
 * panel is hidden without `orders:write` — so every behavioural test below has
 * to say that it is testing the operator who has it. The gate itself is tested
 * separately.
 */
function renderCard(permissions: string[] = ["orders:write"]) {
  return renderWithProviders(<OrderAccessLinkCard orderId={ORDER_ID} />, {
    auth: { permissions },
  });
}

/**
 * Install a clipboard jsdom does not ship.
 *
 * `navigator.clipboard` is undefined in jsdom exactly as it is on an insecure
 * origin, which is the failure mode `CopyButton` exists to report — so each test
 * states which of the two worlds it is in rather than inheriting one.
 */
function withClipboard(writeText: jest.Mock): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("OrderAccessLinkCard — who may issue", () => {
  it("is absent for an operator without orders:write", () => {
    // Issuing is all this panel does — there is no read half to fall back to —
    // and the endpoint requires the permission. Left visible, the button would
    // 403 on every press, which reads as a broken page rather than a permission
    // the viewer does not hold.
    const { container } = renderCard(["orders:read"]);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("OrderAccessLinkCard — before anything is issued", () => {
  it("says the previous link cannot be shown, and shows no link", () => {
    renderCard();

    // The honest statement of what hashing at rest costs. Without it an operator
    // reads the empty panel as "this order has no link" and mints a second one
    // over a working first.
    expect(
      screen.getByText(/Показати попереднє посилання неможливо/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/orders\/guest\//)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    ).toBeEnabled();
  });
});

describe("OrderAccessLinkCard — issuing a link", () => {
  it("shows the new link, when it was issued, and that it is shown once", async () => {
    const user = userEvent.setup();
    issueReturns(FIRST_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );

    expect(await screen.findByText(FIRST_URL)).toBeInTheDocument();
    expect(screen.getByText(/Видано 14\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Скопіюйте посилання зараз/i)).toBeInTheDocument();
  });

  it("renders the link as selectable text, not only behind the copy button", async () => {
    const user = userEvent.setup();
    issueReturns(FIRST_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );

    // The manual fallback for a browser that refuses `navigator.clipboard` — on
    // a staging box over plain HTTP that is every browser.
    const link = await screen.findByLabelText(
      "Посилання на замовлення для покупця",
    );
    expect(link).toHaveTextContent(FIRST_URL);
    expect(link).toHaveClass("select-all");
  });

  it("replaces the shown link when a second one is issued", async () => {
    const user = userEvent.setup();
    issueReturns(FIRST_URL, SECOND_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );
    expect(await screen.findByText(FIRST_URL)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );

    // Rotation is the whole contract: the first one stopped working server-side,
    // so leaving it on screen would invite the operator to send a dead link.
    expect(await screen.findByText(SECOND_URL)).toBeInTheDocument();
    expect(screen.queryByText(FIRST_URL)).not.toBeInTheDocument();
  });
});

describe("OrderAccessLinkCard — copying", () => {
  it("puts the link on the clipboard and confirms it", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    withClipboard(writeText);
    issueReturns(FIRST_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Скопіювати посилання на замовлення",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(FIRST_URL);
    // Twice on purpose: the visible button label, and the `aria-live` region
    // that announces the change to a screen-reader user who cannot see it.
    await waitFor(() =>
      expect(screen.getAllByText("Скопійовано")).toHaveLength(2),
    );
  });

  it("says so when the browser refuses, instead of claiming success", async () => {
    const user = userEvent.setup();
    // No `navigator.clipboard` at all — an insecure origin, i.e. the admin panel
    // opened over plain HTTP. An operator told «Скопійовано» here would paste an
    // empty clipboard into the customer's chat.
    //
    // Removed AFTER `userEvent.setup()`, which installs a working stub of its
    // own: set up first and this test would be asserting user-event's clipboard,
    // not the browser's refusal.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    issueReturns(FIRST_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Скопіювати посилання на замовлення",
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("Не вдалося скопіювати")).toHaveLength(2),
    );
    expect(screen.queryByText("Скопійовано")).not.toBeInTheDocument();
    // …and the value is still on screen to be selected by hand.
    expect(screen.getByText(FIRST_URL)).toBeInTheDocument();
  });

  it("reports a rejected write the same way", async () => {
    const user = userEvent.setup();
    withClipboard(jest.fn().mockRejectedValue(new Error("denied")));
    issueReturns(FIRST_URL);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Скопіювати посилання на замовлення",
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("Не вдалося скопіювати")).toHaveLength(2),
    );
  });
});

describe("OrderAccessLinkCard — when issuing fails", () => {
  it("names the deployment defect on a 400 rather than blaming the operator", async () => {
    const user = userEvent.setup();
    issueFails(400);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );

    // 400 from this endpoint means one thing only: STORE_CLIENT_URL is unset.
    expect(
      await screen.findByText(/Адресу вітрини не налаштовано/i),
    ).toBeInTheDocument();
  });

  it("shows a retryable error otherwise, and no link", async () => {
    const user = userEvent.setup();
    issueFails(500);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Видати нове посилання" }),
    );

    expect(
      await screen.findByText(/Не вдалося створити посилання/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/orders\/guest\//)).not.toBeInTheDocument(),
    );
  });
});
