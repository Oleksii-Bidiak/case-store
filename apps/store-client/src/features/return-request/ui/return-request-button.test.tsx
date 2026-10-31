import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { ReturnRequestButton } from "./return-request-button";
import type { OrderLine } from "../model/returnable-units";
import type { ReturnRequestSource } from "../model/use-return-request-source";

const ORDER_ID = "order-1";

const items: OrderLine[] = [
  { id: "line-1", productName: "Чохол", quantity: 3 },
  { id: "line-2", productName: "Скло", quantity: 1 },
];

/** Serve "what has already been returned on this order". */
function stubExistingReturns(
  rows: Array<{
    status: string;
    items: Array<{ orderItemId: string; quantity: number }>;
  }>,
) {
  server.use(
    http.get("*/api/orders/:orderId/returns", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

/** Stub the create call, capturing what the form actually sent. */
function stubCreate(respond: () => Response): {
  bodies: Array<Record<string, unknown>>;
} {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.post("*/api/orders/:orderId/returns", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return { bodies };
}

function renderButton(
  source: ReturnRequestSource = { kind: "account", orderId: ORDER_ID },
) {
  return renderWithProviders(
    <>
      <ReturnRequestButton
        source={source}
        orderNumber="#ORDER-1"
        items={items}
      />
      <Toaster />
    </>,
    source.kind === "account"
      ? { auth: { isAuthenticated: true, accessToken: "token" } }
      : {},
  );
}

/** Choose one unit of «Чохол» — the smallest valid request. */
async function chooseOne(user: ReturnType<typeof userEvent.setup>) {
  const quantity = await screen.findByLabelText(
    dict.returnRequest.quantityAria("Чохол"),
  );
  await user.clear(quantity);
  await user.type(quantity, "1");
}

const submitButton = () =>
  screen.getByRole("button", { name: dict.returnRequest.submit });

/** Make the browser report itself online or offline. */
function setOnline(online: boolean) {
  jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

/** The browser's «connection is back» signal. */
function goOnline() {
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("button", {
      name: dict.returnRequest.triggerAria("#ORDER-1"),
    }),
  );
  const title = await screen.findByText(dict.returnRequest.dialogTitle);
  // TASK-631: the fields wait for the "already returned" ledger. Every suite
  // below types into «Чохол», which always has something left in these stubs.
  await waitFor(() =>
    expect(
      screen.getByLabelText(dict.returnRequest.quantityAria("Чохол")),
    ).toBeEnabled(),
  );
  return title;
};

describe("ReturnRequestButton (TASK-373)", () => {
  beforeEach(() => stubExistingReturns([]));

  it("sends only the lines the customer chose", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "return-1" } }, { status: 201 }),
    );

    renderButton();
    await open(user);

    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.type(
      screen.getByLabelText(dict.returnRequest.reason),
      "не підійшов",
    );
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toEqual({
      reason: "не підійшов",
      items: [{ orderItemId: "line-1", quantity: 2 }],
    });

    // Confirmed in words and the dialog dismissed — a form that just closes
    // leaves the customer unsure whether anything was filed at all.
    expect(
      await screen.findByText(dict.returnRequest.success),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(dict.returnRequest.dialogTitle),
      ).not.toBeInTheDocument(),
    );
  });

  // The server caps the SUM of live claims across requests, not one request, so
  // the form has to ask what is already claimed. Without this the obvious input
  // — the full quantity — is the one the server refuses.
  it("offers only what earlier returns left, and says so", async () => {
    const user = userEvent.setup();
    stubExistingReturns([
      { status: "REQUESTED", items: [{ orderItemId: "line-1", quantity: 2 }] },
    ]);

    renderButton();
    await open(user);

    expect(
      await screen.findByText(dict.returnRequest.remainingOf(1, 3)),
    ).toBeInTheDocument();
  });

  it("caps a typed quantity at what remains", async () => {
    const user = userEvent.setup();
    stubExistingReturns([
      { status: "APPROVED", items: [{ orderItemId: "line-1", quantity: 2 }] },
    ]);
    const post = stubCreate(() =>
      HttpResponse.json({ data: {} }, { status: 201 }),
    );

    renderButton();
    await open(user);

    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toMatchObject({
      items: [{ orderItemId: "line-1", quantity: 1 }],
    });
  });

  // TASK-631 — the race in the row: the dialog opens, the customer types 3
  // before the ledger lands, the ledger says one unit is already claimed. The
  // form used to keep showing 3 while sending 2 and toasting «готово».
  it("does not take a quantity before it knows what is left, so what is shown is what is sent", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const ledgerArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/orders/:orderId/returns", async () => {
        await ledgerArrived;
        return HttpResponse.json({
          data: [
            {
              status: "REQUESTED",
              items: [{ orderItemId: "line-1", quantity: 1 }],
            },
          ],
        });
      }),
    );
    const post = stubCreate(() =>
      HttpResponse.json({ data: {} }, { status: 201 }),
    );

    renderButton();
    await user.click(
      screen.getByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    );
    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );

    // Before the answer: the field refuses input instead of accepting a number
    // the server may not honour.
    expect(quantity).toBeDisabled();
    await user.type(quantity, "3");
    expect(quantity).toHaveValue(0);

    release();
    await waitFor(() => expect(quantity).toBeEnabled());
    await user.clear(quantity);
    await user.type(quantity, "3");

    // Shown: the clamped 2. Sent: the same 2.
    expect(quantity).toHaveValue(2);
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );
    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toMatchObject({
      items: [{ orderItemId: "line-1", quantity: 2 }],
    });
  });

  // SF-ACC-29: a fully claimed line used to show a greyed-out «0» field. It now
  // says why in words — and offers no field at all.
  it.each([
    ["RECEIVED", dict.returnRequest.nothingLeft],
    ["REFUNDED", dict.returnRequest.nothingLeft],
    ["REQUESTED", dict.returnRequest.alreadyClaimed],
    ["APPROVED", dict.returnRequest.alreadyClaimed],
  ])(
    "labels a line fully claimed by a %s return «%s», without a quantity field",
    async (status, label) => {
      const user = userEvent.setup();
      stubExistingReturns([
        { status, items: [{ orderItemId: "line-2", quantity: 1 }] },
      ]);

      renderButton();
      await open(user);

      const row = (await screen.findByText("Скло")).closest("li");
      expect(row).toHaveTextContent(label);
      expect(
        screen.queryByLabelText(dict.returnRequest.quantityAria("Скло")),
      ).not.toBeInTheDocument();
      expect(row?.querySelector("input")).toBeNull();
    },
  );

  it("will not submit an empty request, and says why", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: {} }, { status: 201 }),
    );

    renderButton();
    await open(user);

    expect(
      await screen.findByText(dict.returnRequest.nothingSelected),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(post.bodies).toHaveLength(0);
  });

  // SF-ACC-29 — why QA did not see the hint, even after a hard reload. It WAS
  // rendered, but as the first child of DialogFooter, whose phone layout is
  // `flex-col-reverse`: drawn BELOW both buttons, at the bottom edge of a dialog
  // that could not scroll, in 12px muted type and tied to nothing. The hint now
  // sits outside the footer (above the buttons), and the disabled button is
  // described by it, so a screen reader reads the reason with the button.
  it("shows the «choose a line» hint above the buttons and ties it to the disabled submit", async () => {
    const user = userEvent.setup();
    stubExistingReturns([
      { status: "REQUESTED", items: [{ orderItemId: "line-1", quantity: 3 }] },
      { status: "REQUESTED", items: [{ orderItemId: "line-2", quantity: 1 }] },
    ]);

    renderButton();
    await user.click(
      screen.getByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    );
    // Everything is claimed: nothing to choose, nothing to send.
    await waitFor(() =>
      expect(
        screen.getAllByText(dict.returnRequest.alreadyClaimed),
      ).toHaveLength(2),
    );

    const hint = screen.getByText(dict.returnRequest.nothingSelected);
    expect(hint.closest('[data-slot="dialog-footer"]')).toBeNull();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAccessibleDescription(
      dict.returnRequest.nothingSelected,
    );
    // The dialog scrolls instead of pushing its footer off a phone screen.
    expect(screen.getByRole("dialog")).toHaveClass("overflow-y-auto");
  });

  it("drops the hint and its description once a line is chosen", async () => {
    const user = userEvent.setup();

    renderButton();
    await open(user);
    await chooseOne(user);

    expect(
      screen.queryByText(dict.returnRequest.nothingSelected),
    ).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).not.toHaveAttribute("aria-describedby");
  });

  // TASK-2044: what the customer would like. Optional — nothing chosen sends
  // nothing (the first suite pins the exact body), a choice is sent as is.
  it("sends the chosen outcome as requestedOutcome", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "return-1" } }, { status: 201 }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);

    const group = screen.getByRole("group", {
      name: dict.returnRequest.outcomeLegend,
    });
    expect(
      screen.getByRole("radio", { name: dict.returnRequest.outcomeAny }),
    ).toBeChecked();
    expect(group).toContainElement(
      screen.getByRole("radio", {
        name: dict.returnRequest.outcomeLabels.REPAIR,
      }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: dict.returnRequest.outcomeLabels.REPAIR,
      }),
    );
    await user.click(submitButton());

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toEqual({
      requestedOutcome: "REPAIR",
      items: [{ orderItemId: "line-1", quantity: 1 }],
    });
  });

  // RETURN_QUANTITY_EXCEEDED: the units are already in another live request.
  // «Try again» would loop; the form says so and reloads what is left.
  it("says the item is already claimed and reloads what is left", async () => {
    const user = userEvent.setup();
    let ledgerCalls = 0;
    server.use(
      http.get("*/api/orders/:orderId/returns", () => {
        ledgerCalls += 1;
        return HttpResponse.json({
          data:
            ledgerCalls === 1
              ? []
              : [
                  {
                    status: "REQUESTED",
                    items: [{ orderItemId: "line-1", quantity: 3 }],
                  },
                ],
        });
      }),
    );
    stubCreate(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "RETURN_QUANTITY_EXCEEDED",
          message: "Cannot return 1 of that item — 0 remain returnable",
        },
        { status: 400 },
      ),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    await user.click(submitButton());

    expect(
      await screen.findByText(dict.returnRequest.errors.quantityExceeded),
    ).toBeInTheDocument();
    // The ledger is asked again and the line now reads «Уже заявлено».
    const row = (await screen.findByText("Чохол")).closest("li");
    await waitFor(() =>
      expect(row).toHaveTextContent(dict.returnRequest.alreadyClaimed),
    );
    expect(screen.queryByText(/remain returnable/)).not.toBeInTheDocument();
  });

  // SF-ACC-31: the rate limit, a 500, a 400 with no known code — the same
  // numbers may well work a minute later. The dialog stays open with every
  // choice in place: closing it would throw away what the customer typed.
  it.each([
    ["the rate limit", 429],
    ["a server error", 500],
    ["an unknown 400", 400],
  ])(
    "says «try again» on %s and keeps everything entered",
    async (_label, status) => {
      const user = userEvent.setup();
      stubCreate(() => HttpResponse.json({ statusCode: status }, { status }));

      renderButton();
      await open(user);
      await chooseOne(user);
      await user.click(
        screen.getByRole("radio", {
          name: dict.returnRequest.outcomeLabels.REFUND,
        }),
      );
      await user.type(screen.getByLabelText(dict.returnRequest.reason), "брак");
      await user.click(submitButton());

      expect(
        await screen.findByText(dict.returnRequest.error),
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.returnRequest.dialogTitle),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(dict.returnRequest.quantityAria("Чохол")),
      ).toHaveValue(1);
      expect(screen.getByLabelText(dict.returnRequest.reason)).toHaveValue(
        "брак",
      );
      expect(
        screen.getByRole("radio", {
          name: dict.returnRequest.outcomeLabels.REFUND,
        }),
      ).toBeChecked();
    },
  );
});

describe("ReturnRequestButton offline (TASK-1964)", () => {
  beforeEach(() => stubExistingReturns([]));
  afterEach(() => jest.restoreAllMocks());

  it("waits for the connection instead of failing, then sends once by itself", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "return-1" } }, { status: 201 }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    await user.type(screen.getByLabelText(dict.returnRequest.reason), "брак");

    setOnline(false);
    await user.click(submitButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      dict.returnRequest.offline,
    );
    // Nothing went out, nothing was lost.
    expect(post.bodies).toHaveLength(0);
    expect(
      screen.getByLabelText(dict.returnRequest.quantityAria("Чохол")),
    ).toHaveValue(1);
    expect(screen.getByLabelText(dict.returnRequest.reason)).toHaveValue(
      "брак",
    );

    setOnline(true);
    goOnline();

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toEqual({
      reason: "брак",
      items: [{ orderItemId: "line-1", quantity: 1 }],
    });
    expect(
      await screen.findByText(dict.returnRequest.success),
    ).toBeInTheDocument();

    // Once: a second `online` does not file it again.
    goOnline();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post.bodies).toHaveLength(1);
  });

  it("treats a connection lost mid-request the same way", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/orders/:orderId/returns", async ({ request }) => {
        attempts += 1;
        if (attempts === 1) {
          // A real drop: the request fails AND the browser now knows it is
          // offline — which is what makes a later `online` event possible.
          setOnline(false);
          return HttpResponse.error();
        }
        bodies.push(await request.json());
        return HttpResponse.json({ data: { id: "return-1" } }, { status: 201 });
      }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    await user.click(submitButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      dict.returnRequest.offline,
    );
    expect(
      screen.queryByText(dict.returnRequest.error),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.returnRequest.dialogTitle),
    ).toBeInTheDocument();

    setOnline(true);
    goOnline();
    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  // The browser is online but the API cannot be reached — store-api down or
  // restarting behind Caddy, whose 502 carries no CORS header, so axios sees
  // ERR_NETWORK. No `online` event will ever come: promising an automatic send
  // here would be a promise nobody keeps (SF-ACC-31).
  it("says the send failed when the API is unreachable but the browser is online", async () => {
    const user = userEvent.setup();
    setOnline(true);
    let attempts = 0;
    server.use(
      http.post("*/api/orders/:orderId/returns", () => {
        attempts += 1;
        return HttpResponse.error();
      }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    await user.type(screen.getByLabelText(dict.returnRequest.reason), "брак");
    await user.click(submitButton());

    expect(
      await screen.findByText(dict.returnRequest.error),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      dict.returnRequest.offline,
    );
    // The dialog stays open with everything typed, ready for a manual retry.
    expect(
      screen.getByText(dict.returnRequest.dialogTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.returnRequest.quantityAria("Чохол")),
    ).toHaveValue(1);
    expect(screen.getByLabelText(dict.returnRequest.reason)).toHaveValue(
      "брак",
    );
    expect(attempts).toBe(1);
    expect(submitButton()).toBeEnabled();
  });

  it("cancels the automatic send when the dialog is closed", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "return-1" } }, { status: 201 }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    setOnline(false);
    await user.click(submitButton());
    await screen.findByText(dict.returnRequest.offline);

    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.cancel }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(dict.returnRequest.dialogTitle),
      ).not.toBeInTheDocument(),
    );

    setOnline(true);
    goOnline();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post.bodies).toHaveLength(0);
  });

  // Clearing every quantity withdraws the request: the «we will send it»
  // promise must go, and a later `online` must not file whatever the
  // customer types next without them pressing «Надіслати» again.
  it("ends the wait when the customer clears every quantity", async () => {
    const user = userEvent.setup();
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "return-1" } }, { status: 201 }),
    );

    renderButton();
    await open(user);
    await chooseOne(user);
    setOnline(false);
    await user.click(submitButton());
    expect(await screen.findByRole("status")).toHaveTextContent(
      dict.returnRequest.offline,
    );

    const quantity = screen.getByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await waitFor(() =>
      expect(screen.getByRole("status")).not.toHaveTextContent(
        dict.returnRequest.offline,
      ),
    );

    // Typing a line back in is a new, unsent request.
    await user.type(quantity, "1");
    setOnline(true);
    goOnline();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post.bodies).toHaveLength(0);
    expect(screen.getByRole("status")).not.toHaveTextContent(
      dict.returnRequest.offline,
    );
  });

  // The live region is mounted up front so the offline text is announced when
  // it appears. `display: none` (e.g. `empty:hidden`) would take the empty
  // region out of the accessibility tree, and the announcement with it.
  it("keeps the empty status region in the accessibility tree", async () => {
    const user = userEvent.setup();
    renderButton();
    await open(user);

    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    const classes = status.className.split(/\s+/);
    expect(classes).not.toContain("hidden");
    expect(classes.some((name) => name.endsWith(":hidden"))).toBe(false);
  });
});

// TASK-1964: the same dialog on a guest order — keyed by the access token, no
// session. The account path above is unchanged.
describe("ReturnRequestButton on a guest order", () => {
  it("reads and files through the guest-token endpoints", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/orders/guest/:token/returns", ({ params }) =>
        params.token === "guest-token"
          ? HttpResponse.json({
              data: [
                {
                  status: "REQUESTED",
                  items: [{ orderItemId: "line-2", quantity: 1 }],
                },
              ],
            })
          : HttpResponse.json({}, { status: 404 }),
      ),
    );
    const bodies: unknown[] = [];
    const tokens: unknown[] = [];
    server.use(
      http.post(
        "*/api/orders/guest/:token/returns",
        async ({ request, params }) => {
          tokens.push(params.token);
          bodies.push(await request.json());
          return HttpResponse.json(
            { data: { id: "return-1" } },
            { status: 201 },
          );
        },
      ),
    );
    // The account endpoint must not be asked.
    const accountCalls: string[] = [];
    server.use(
      http.get("*/api/orders/:orderId/returns", ({ request }) => {
        accountCalls.push(request.url);
        return HttpResponse.json({ data: [] });
      }),
    );

    renderButton({ kind: "guest", token: "guest-token" });
    await open(user);

    const row = (await screen.findByText("Скло")).closest("li");
    expect(row).toHaveTextContent(dict.returnRequest.alreadyClaimed);

    await chooseOne(user);
    await user.click(
      screen.getByRole("radio", {
        name: dict.returnRequest.outcomeLabels.REPLACEMENT,
      }),
    );
    await user.click(submitButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(tokens).toEqual(["guest-token"]);
    expect(bodies[0]).toEqual({
      requestedOutcome: "REPLACEMENT",
      items: [{ orderItemId: "line-1", quantity: 1 }],
    });
    expect(
      await screen.findByText(dict.returnRequest.success),
    ).toBeInTheDocument();
    expect(accountCalls).toHaveLength(0);
  });
});
