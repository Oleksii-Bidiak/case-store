import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { OrderEntity } from "@/entities/order";
import { ReturnCreateAction } from "./return-create-action";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const d = dict.returns;
const ORDER_ID = "order-uuid-12345678";
const WRITER = {
  permissions: ["orders:read", "returns:read", "returns:write"],
};

function makeOrder(status = "DELIVERED") {
  return {
    id: ORDER_ID,
    status,
    items: [
      { id: "line-1", productName: "Чохол", quantity: 3 },
      { id: "line-2", productName: "Скло", quantity: 1 },
      { id: "line-3", productName: "Кабель", quantity: 2 },
    ],
  } as unknown as Pick<OrderEntity, "id" | "items" | "status">;
}

/** Earlier requests on the order: line-2 fully claimed, line-3 refused. */
function stubClaims() {
  server.use(
    http.get("*/api/admin/orders/:orderId/returns", () =>
      HttpResponse.json({
        data: [
          {
            id: "rma-old",
            status: "REQUESTED",
            items: [{ orderItemId: "line-1", quantity: 1 }],
          },
          {
            id: "rma-old-2",
            status: "APPROVED",
            items: [{ orderItemId: "line-2", quantity: 1 }],
          },
          // REJECTED frees its units — the line is returnable again.
          {
            id: "rma-old-3",
            status: "REJECTED",
            items: [{ orderItemId: "line-3", quantity: 2 }],
          },
        ],
      }),
    ),
  );
}

function stubCreate(respond: () => Response): {
  bodies: Array<Record<string, unknown>>;
} {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.post("*/api/admin/orders/:orderId/returns", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return { bodies };
}

/** Any order-status write — this feature must never send one. */
function countStatusWrites(): { count: number } {
  const counter = { count: 0 };
  server.use(
    http.patch("*/api/admin/orders/:orderId/status", () => {
      counter.count += 1;
      return HttpResponse.json({ data: {} });
    }),
  );
  return counter;
}

async function openDialog() {
  await userEvent.click(
    await screen.findByRole("button", { name: d.createAction }),
  );
  return screen.findByRole("dialog");
}

beforeEach(() => {
  stubClaims();
});

describe("ReturnCreateAction — who sees it (TASK-1963)", () => {
  it("is offered on a DELIVERED order to an operator who may file returns", async () => {
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });

    expect(
      await screen.findByRole("button", { name: d.createAction }),
    ).toBeInTheDocument();
  });

  it("is offered on a SHIPPED order too", () => {
    renderWithProviders(<ReturnCreateAction order={makeOrder("SHIPPED")} />, {
      auth: WRITER,
    });

    expect(
      screen.getByRole("button", { name: d.createAction }),
    ).toBeInTheDocument();
  });

  it.each(["PENDING", "PROCESSING", "CANCELLED", "REFUNDED"])(
    "is absent on a %s order, where the server would refuse it",
    (status) => {
      const { container } = renderWithProviders(
        <ReturnCreateAction order={makeOrder(status)} />,
        { auth: WRITER },
      );

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("is absent without returns:write", () => {
    const { container } = renderWithProviders(
      <ReturnCreateAction order={makeOrder()} />,
      { auth: { permissions: ["orders:read", "returns:read"] } },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("is absent without orders:read", () => {
    const { container } = renderWithProviders(
      <ReturnCreateAction order={makeOrder()} />,
      { auth: { permissions: ["returns:read", "returns:write"] } },
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReturnCreateAction — the dialog (TASK-1963)", () => {
  it("bounds each line by what is still returnable and greys out a claimed one", async () => {
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    const caseQty = await within(dialog).findByRole("spinbutton", {
      name: d.createQuantityAria("Чохол"),
    });
    await waitFor(() => expect(caseQty).toHaveAttribute("max", "2"));
    expect(
      within(dialog).getByText(d.createRemaining(2, 3)),
    ).toBeInTheDocument();
    // REJECTED gave its units back.
    expect(
      within(dialog).getByRole("spinbutton", {
        name: d.createQuantityAria("Кабель"),
      }),
    ).toHaveAttribute("max", "2");
    // The fully claimed line is listed, marked, and has no quantity field.
    expect(within(dialog).getByText("Скло")).toBeInTheDocument();
    expect(
      within(dialog).getByText(d.createAlreadyClaimed),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("spinbutton", {
        name: d.createQuantityAria("Скло"),
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps submit disabled with a visible hint until a line is picked", async () => {
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    const submit = within(dialog).getByRole("button", { name: d.createSubmit });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText(d.createNothingSelected)).toBeVisible();
    expect(submit).toHaveAccessibleDescription(d.createNothingSelected);

    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: d.createIncrease("Чохол"),
      }),
    );

    expect(submit).toBeEnabled();
    expect(
      within(dialog).queryByText(d.createNothingSelected),
    ).not.toBeInTheDocument();
  });

  it("labels the comment as the operator's and says the buyer will see it", async () => {
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    const comment = within(dialog).getByRole("textbox", {
      name: d.reasonOperator,
    });
    expect(comment).toHaveAccessibleDescription(d.createCommentHint);
  });

  it("files the picked lines with the wish and comment, then links to the request — the order status is not touched", async () => {
    const post = stubCreate(() =>
      HttpResponse.json(
        { data: { id: "rma-new-0001", orderId: ORDER_ID } },
        { status: 201 },
      ),
    );
    const statusWrites = countStatusWrites();
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    const increase = await within(dialog).findByRole("button", {
      name: d.createIncrease("Чохол"),
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("spinbutton", {
          name: d.createQuantityAria("Чохол"),
        }),
      ).toHaveAttribute("max", "2"),
    );
    await userEvent.click(increase);
    await userEvent.click(increase);
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Ремонт" }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: d.reasonOperator }),
      "  Не заряджає  ",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.createSubmit }),
    );

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toEqual({
      items: [{ orderItemId: "line-1", quantity: 2 }],
      requestedOutcome: "REPAIR",
      reason: "Не заряджає",
    });

    const link = await screen.findByRole("link", {
      name: d.createOpenReturn("#RMA-NEW-"),
    });
    expect(link).toHaveAttribute("href", "/returns/rma-new-0001");
    expect(screen.getByText(d.createDone)).toBeInTheDocument();
    expect(statusWrites.count).toBe(0);
  });

  it("sends no wish when the operator leaves «Не сказав»", async () => {
    const post = stubCreate(() =>
      HttpResponse.json({ data: { id: "rma-new-0002" } }, { status: 201 }),
    );
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: d.createIncrease("Кабель"),
      }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.createSubmit }),
    );

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toEqual({
      items: [{ orderItemId: "line-3", quantity: 1 }],
    });
  });

  it("explains a refusal for units somebody else claimed meanwhile", async () => {
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
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: d.createIncrease("Кабель"),
      }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.createSubmit }),
    );

    // AD-RET-18: the second tab is told the line is taken and how much is left
    // — not «Спробуйте ще раз», which can never succeed.
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(d.refusalQuantityExceeded(0));
    expect(alert).toHaveTextContent(/вже заявлено/);
    expect(alert).not.toHaveTextContent(/Спробуйте ще раз/);
    expect(alert).not.toHaveTextContent("remain returnable");
  });

  it("names an order that can no longer be returned (TASK-1966)", async () => {
    stubCreate(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "RETURN_ORDER_NOT_RETURNABLE",
          message:
            "Only shipped or delivered orders can be returned — cancel the order instead",
        },
        { status: 400 },
      ),
    );
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: d.createIncrease("Кабель"),
      }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.createSubmit }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      d.refusalOrderNotReturnable,
    );
  });

  it("keeps «try again» for a failure that may pass on retry", async () => {
    stubCreate(() =>
      HttpResponse.json(
        { statusCode: 500, error: "Internal Server Error", message: "boom" },
        { status: 500 },
      ),
    );
    renderWithProviders(<ReturnCreateAction order={makeOrder()} />, {
      auth: WRITER,
    });
    const dialog = await openDialog();

    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: d.createIncrease("Кабель"),
      }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.createSubmit }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      d.createFailed,
    );
  });

  it("opens from the outside in controlled mode", async () => {
    renderWithProviders(
      <ReturnCreateAction order={makeOrder()} open onOpenChange={jest.fn()} />,
      { auth: WRITER },
    );

    expect(
      await screen.findByRole("dialog", { name: d.createTitle("#ORDER-UU") }),
    ).toBeInTheDocument();
  });
});
