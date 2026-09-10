import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductAddonDeltaPanel } from "./product-addon-delta-panel";

const d = dict.products.addonDeltas;

const warranty = {
  addonServiceId: "svc-warranty",
  name: "Гарантія",
  description: null,
  price: "499.00",
  source: "template" as const,
};
const insurance = {
  addonServiceId: "svc-insurance",
  name: "Страхування",
  description: null,
  price: "1299.00",
  source: "override" as const,
};
const tradeIn = {
  addonServiceId: "svc-tradein",
  name: "Trade-in",
  description: null,
  price: "0.00",
  source: "add" as const,
};

const catalog = [
  {
    id: "svc-setup",
    name: "Налаштування",
    description: null,
    price: "299.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

function arrange(options: { resolved?: unknown[]; deltas?: unknown[] }) {
  const { resolved = [], deltas = [] } = options;

  server.use(
    http.get("*/api/addon-services/resolved-for-product/:productId", () =>
      HttpResponse.json({ data: resolved }),
    ),
    http.get("*/api/addon-services/deltas/product/:productId", () =>
      HttpResponse.json({ data: deltas }),
    ),
    http.get("*/api/addon-services/admin/active", () =>
      HttpResponse.json({ data: catalog }),
    ),
  );
}

describe("ProductAddonDeltaPanel (TASK-174)", () => {
  it("renders a badge per entry reflecting where its value came from", async () => {
    arrange({ resolved: [warranty, insurance, tradeIn] });

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);

    expect(await screen.findByText(d.badgeTemplate)).toBeInTheDocument();
    expect(screen.getByText(d.badgeOverridden)).toBeInTheDocument();
    expect(screen.getByText(d.badgeExclusive)).toBeInTheDocument();
    // The overridden price, not the catalog one.
    expect(screen.getByText("1299.00")).toBeInTheDocument();
  });

  it("PUTs a REMOVE delta when suppressing an inherited service", async () => {
    arrange({ resolved: [warranty] });
    let call: { addonServiceId?: string; body?: unknown } | null = null;
    server.use(
      http.put(
        "*/api/addon-services/deltas/product/:productId/:addonServiceId",
        async ({ params, request }) => {
          call = {
            addonServiceId: params.addonServiceId as string,
            body: await request.json(),
          };
          return HttpResponse.json({ data: {} });
        },
      ),
    );

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);
    await userEvent.click(
      await screen.findByRole("button", { name: d.actionRemove }),
    );

    await waitFor(() =>
      expect(call).toEqual({
        addonServiceId: "svc-warranty",
        body: { type: "REMOVE" },
      }),
    );
  });

  /** Type a price into the entry named `name` and hit save; returns the PUT body. */
  async function typeOwnPrice(name: string, value: string) {
    const sent: { addonServiceId?: string; body?: unknown } = {};
    server.use(
      http.put(
        "*/api/addon-services/deltas/product/:productId/:addonServiceId",
        async ({ params, request }) => {
          sent.addonServiceId = params.addonServiceId as string;
          sent.body = await request.json();
          return HttpResponse.json({ data: {} });
        },
      ),
    );

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);
    await userEvent.click(
      await screen.findByRole("button", { name: d.actionOwnPrice }),
    );

    const input = await screen.findByLabelText(d.ownPriceLabel(name));
    await userEvent.clear(input);
    await userEvent.type(input, value);
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.save }),
    );

    return sent;
  }

  it("PUTs an OVERRIDE delta with the typed price for an INHERITED service", async () => {
    arrange({ resolved: [warranty] });

    const sent = await typeOwnPrice("Гарантія", "350");

    await waitFor(() =>
      expect(sent).toEqual({
        addonServiceId: "svc-warranty",
        body: { type: "OVERRIDE", price: 350 },
      }),
    );
  });

  // TASK-404: one delta row per (product, add-on) pair, so an OVERRIDE here
  // would REPLACE the ADD row and the service would vanish from the product.
  it("PUTs an ADD delta with the typed price for a product-EXCLUSIVE service", async () => {
    arrange({ resolved: [tradeIn] });

    const sent = await typeOwnPrice("Trade-in", "250");

    await waitFor(() =>
      expect(sent).toEqual({
        addonServiceId: "svc-tradein",
        body: { type: "ADD", price: 250 },
      }),
    );
  });

  it("keeps OVERRIDE for an entry that already carries one", async () => {
    arrange({ resolved: [insurance] });

    const sent = await typeOwnPrice("Страхування", "1500");

    await waitFor(() =>
      expect(sent).toEqual({
        addonServiceId: "svc-insurance",
        body: { type: "OVERRIDE", price: 1500 },
      }),
    );
  });

  it("PUTs an ADD delta for a product-exclusive service picked from the catalog", async () => {
    arrange({ resolved: [warranty] });
    let call: { addonServiceId?: string; body?: unknown } | null = null;
    server.use(
      http.put(
        "*/api/addon-services/deltas/product/:productId/:addonServiceId",
        async ({ params, request }) => {
          call = {
            addonServiceId: params.addonServiceId as string,
            body: await request.json(),
          };
          return HttpResponse.json({ data: {} });
        },
      ),
    );

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);

    await userEvent.click(
      await screen.findByRole("combobox", { name: d.addPickerAria }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Налаштування" }),
    );
    await userEvent.click(screen.getByRole("button", { name: d.actionAdd }));

    await waitFor(() =>
      expect(call).toEqual({
        addonServiceId: "svc-setup",
        body: { type: "ADD" },
      }),
    );
  });

  it("lists REMOVEd services separately and DELETEs the delta to revert them", async () => {
    arrange({
      resolved: [],
      deltas: [
        {
          id: "d1",
          productId: "p1",
          addonServiceId: "svc-warranty",
          type: "REMOVE",
          price: null,
          addonServiceName: "Гарантія",
        },
      ],
    });
    let cleared: string | null = null;
    server.use(
      http.delete(
        "*/api/addon-services/deltas/product/:productId/:addonServiceId",
        ({ params }) => {
          cleared = params.addonServiceId as string;
          return HttpResponse.json({ data: null });
        },
      ),
    );

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);

    expect(await screen.findByText(d.removedHeading)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: d.actionRevert }));

    await waitFor(() => expect(cleared).toBe("svc-warranty"));
  });

  it("shows the empty state when nothing resolves for the product", async () => {
    arrange({ resolved: [] });

    renderWithProviders(<ProductAddonDeltaPanel productId="p1" />);

    expect(await screen.findByText(d.emptyResolved)).toBeInTheDocument();
  });
});
