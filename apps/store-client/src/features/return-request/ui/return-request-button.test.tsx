import { http, HttpResponse } from "msw";
import {
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

function renderButton() {
  return renderWithProviders(
    <>
      <ReturnRequestButton
        orderId={ORDER_ID}
        orderNumber="#ORDER-1"
        items={items}
      />
      <Toaster />
    </>,
    { auth: { isAuthenticated: true, accessToken: "token" } },
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("button", {
      name: dict.returnRequest.triggerAria("#ORDER-1"),
    }),
  );
  return screen.findByText(dict.returnRequest.dialogTitle);
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

  it("disables a line with nothing left rather than hiding the product", async () => {
    const user = userEvent.setup();
    stubExistingReturns([
      { status: "RECEIVED", items: [{ orderItemId: "line-2", quantity: 1 }] },
    ]);

    renderButton();
    await open(user);

    expect(
      await screen.findByLabelText(dict.returnRequest.quantityAria("Скло")),
    ).toBeDisabled();
    expect(
      screen.getByText(dict.returnRequest.nothingLeft),
    ).toBeInTheDocument();
  });

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
    expect(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    ).toBeDisabled();
    expect(post.bodies).toHaveLength(0);
  });

  // A 400 here means "those units are no longer returnable", which is a
  // different instruction from "try again" — retrying the same numbers cannot
  // work, and saying so is the difference between a stuck customer and a
  // reloaded page.
  it("tells the customer to reload when the server says the units are gone", async () => {
    const user = userEvent.setup();
    stubCreate(() =>
      HttpResponse.json({ message: "already returned" }, { status: 400 }),
    );

    renderButton();
    await open(user);

    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );

    expect(
      await screen.findByText(dict.returnRequest.conflict),
    ).toBeInTheDocument();
  });

  // Anything that is not a 400 is "the shop, not your request" — the same
  // numbers may well work a minute later, so the instruction is the opposite of
  // the one above. A form that swallows a 500 leaves the customer believing the
  // return was filed.
  it("says «try again» when the request fails for any other reason", async () => {
    const user = userEvent.setup();
    stubCreate(() => HttpResponse.json({}, { status: 500 }));

    renderButton();
    await open(user);

    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );

    expect(
      await screen.findByText(dict.returnRequest.error),
    ).toBeInTheDocument();
    // The dialog stays open on failure: closing it would throw away the lines
    // and the reason the customer just typed.
    expect(
      screen.getByText(dict.returnRequest.dialogTitle),
    ).toBeInTheDocument();
  });
});
