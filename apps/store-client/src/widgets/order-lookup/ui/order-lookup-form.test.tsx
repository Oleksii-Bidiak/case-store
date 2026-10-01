import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib/format";
import { statusBadgeStyle, type PublicOrderEntity } from "@/entities/order";
import { OrderLookupForm } from "./order-lookup-form";

const d = dict.orderLookup;

const order: PublicOrderEntity = {
  number: "94F5F971",
  createdAt: "2026-09-10T09:00:00.000Z",
  status: "SHIPPED",
  paymentStatus: "PENDING",
  paymentMethod: "ON_DELIVERY",
  items: [
    {
      productName: "Чохол MagSafe",
      quantity: 2,
      price: "299.00",
      lineTotal: "598.00",
      addons: [],
    },
  ],
  subtotal: "598.00",
  discount: "0.00",
  shippingCost: "70.00",
  addonsTotal: "0.00",
  total: "668.00",
  delivery: { city: "Київ", warehouse: "Відділення №12" },
  trackingNumber: "20450000000001",
};

/** Capture what the form actually PUTs on the wire. */
function respondWith(
  body: PublicOrderEntity[],
  captured?: { current: unknown },
) {
  server.use(
    http.post("*/api/orders/lookup", async ({ request }) => {
      if (captured) captured.current = await request.json();
      return HttpResponse.json({ data: body });
    }),
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: d.fieldNumber }),
    "#94F5F971",
  );
  // The phone field carries the same mask checkout uses — type the 9-digit
  // local part, the way a shopper does.
  await user.type(
    screen.getByRole("textbox", { name: d.fieldPhone }),
    "501112233",
  );
  await user.click(screen.getByRole("button", { name: d.submit }));
}

describe("OrderLookupForm (TASK-483)", () => {
  it("sends the number stripped of '#', spaces and case", async () => {
    const captured: { current: unknown } = { current: null };
    respondWith([order], captured);
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    await screen.findByText(`#${order.number}`);
    expect(captured.current).toMatchObject({ number: "94f5f971" });
  });

  it("renders the order: statuses, lines, total, branch and ТТН", async () => {
    respondWith([order]);
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(`#${order.number}`)).toBeInTheDocument();
    expect(
      screen.getByText("Чохол MagSafe", { exact: false }),
    ).toBeInTheDocument();
    // Compare on whitespace-stripped text — Intl (uk-UA) puts a narrow no-break
    // space in the amount, the same reason `cart-summary.test.tsx` does this.
    const total = formatMoney(order.total).replace(/\s/g, "");
    expect(
      screen.getAllByText(
        (_, el) => el?.textContent?.replace(/\s/g, "") === total,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Відділення №12")).toBeInTheDocument();
    expect(screen.getByText(order.trackingNumber!)).toBeInTheDocument();
  });

  it("never shows a street address, and says why", async () => {
    respondWith([order]);
    const user = userEvent.setup();

    const { container } = renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    await screen.findByText(`#${order.number}`);
    // The API sends no street, so there is nothing to render — this asserts the
    // page does not invent one from the city either.
    expect(container.textContent).not.toContain("вул.");
    expect(screen.getByText(d.privacyNote)).toBeInTheDocument();
  });

  it("lists every match when an 8-character number collides", async () => {
    respondWith([order, { ...order, number: "94F5F971" }]);
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(d.resultsMultiple(2))).toBeInTheDocument();
  });

  it("shows one neutral message on 404 — it must not hint which half was wrong", async () => {
    server.use(
      http.post(
        "*/api/orders/lookup",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.notFound)).toBeInTheDocument();
  });

  it("words 429 differently — that one is about the request, not the order", async () => {
    server.use(
      http.post(
        "*/api/orders/lookup",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.rateLimited)).toBeInTheDocument();
  });

  it("paints PARTIALLY_REFUNDED from the shared status map (TASK-802)", async () => {
    respondWith([{ ...order, paymentStatus: "PARTIALLY_REFUNDED" }]);
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await fillAndSubmit(user);

    const label = await screen.findByText(
      dict.order.paymentLabel("PARTIALLY_REFUNDED"),
    );
    const badge = label.closest('[data-slot="badge"]');
    expect(badge).toHaveAttribute(
      "data-variant",
      statusBadgeStyle("PARTIALLY_REFUNDED").variant,
    );
    // §2 (TASK-868): muted, not destructive.
    expect(badge).toHaveAttribute("data-variant", "tint-muted");
  });

  // TASK-868: a <dl> may hold only dt/dd groups. The two delivery sentences
  // used to be bare <p>s inside it.
  it.each([
    ["no city", { city: null, warehouse: null }, d.deliveryUnknown],
    ["a courier", { city: "Київ", warehouse: null }, d.deliveryCourier],
  ] as const)(
    "keeps the delivery list valid with %s",
    async (_case, delivery, sentence) => {
      respondWith([{ ...order, delivery: { ...delivery } }]);
      const user = userEvent.setup();

      renderWithProviders(<OrderLookupForm />);
      await fillAndSubmit(user);

      const text = await screen.findByText(sentence);
      expect(text.tagName).toBe("DD");
      expect(text.previousElementSibling).toHaveTextContent(d.deliveryHeading);
      expect(text.previousElementSibling).toHaveClass("sr-only");
      for (const dl of document.querySelectorAll("dl")) {
        expect(dl.querySelector("p")).toBeNull();
      }
    },
  );

  describe("focus and announcement (TASK-626)", () => {
    it("moves focus to the result and announces it", async () => {
      respondWith([order]);
      const user = userEvent.setup();

      renderWithProviders(<OrderLookupForm />);
      await fillAndSubmit(user);

      const region = await screen.findByRole("region", {
        name: d.resultsRegionAria,
      });
      expect(region).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent(
        d.resultsAnnounce(1),
      );
    });

    it("keeps ONE live region across the swap, so the change is what gets read", async () => {
      respondWith([order]);
      const user = userEvent.setup();

      renderWithProviders(<OrderLookupForm />);
      const before = screen.getByRole("status");
      expect(before).toBeEmptyDOMElement();

      await fillAndSubmit(user);
      await screen.findByRole("region", { name: d.resultsRegionAria });

      expect(screen.getByRole("status")).toBe(before);
    });

    it("returns focus to the number field on «search again»", async () => {
      respondWith([order]);
      const user = userEvent.setup();

      renderWithProviders(<OrderLookupForm />);
      await fillAndSubmit(user);
      await user.click(
        await screen.findByRole("button", { name: d.searchAgain }),
      );

      expect(
        screen.getByRole("textbox", { name: d.fieldNumber }),
      ).toHaveFocus();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("leaves focus alone on an error — the form stays and the alert speaks", async () => {
      server.use(
        http.post(
          "*/api/orders/lookup",
          () => new HttpResponse(null, { status: 404 }),
        ),
      );
      const user = userEvent.setup();

      renderWithProviders(<OrderLookupForm />);
      await fillAndSubmit(user);

      expect(await screen.findByText(d.errors.notFound)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: d.submit })).toHaveFocus();
    });
  });

  it("refuses a number shorter than 8 characters before any request is made", async () => {
    let called = false;
    server.use(
      http.post("*/api/orders/lookup", () => {
        called = true;
        return HttpResponse.json({ data: [] });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<OrderLookupForm />);
    await user.type(
      screen.getByRole("textbox", { name: d.fieldNumber }),
      "94F5",
    );
    await user.type(
      screen.getByRole("textbox", { name: d.fieldPhone }),
      "501112233",
    );
    await user.click(screen.getByRole("button", { name: d.submit }));

    expect(
      await screen.findByText(d.errors.numberRequired),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
