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
import { DeliverySettingsView } from "./delivery-settings-view";

const t = dict.deliverySettings;
const f = dict.deliverySettingsForm;

function settingsResponse() {
  return {
    data: {
      senderCityRef: null,
      senderCityName: null,
      senderWarehouseRef: null,
      defaultWeightKg: 0.5,
      npEnabled: true,
      pickupEnabled: true,
      courierEnabled: false,
      otherEnabled: true,
      courierCityName: null,
      courierPrice: "0.00",
      courierFreeFrom: null,
      updatedAt: null,
    },
  };
}

function point(id: string, isActive: boolean) {
  return {
    id,
    name: `Точка ${id}`,
    city: "Київ",
    address: "вул. Хрещатик, 1",
    phone: null,
    workingHours: null,
    mapUrl: null,
    isActive,
    sortOrder: 0,
    ordersCount: 0,
  };
}

const ADMIN = { auth: { isOwner: true } };

describe("DeliverySettingsView (TASK-644)", () => {
  it("refuses a session without settings:delivery and asks for nothing (ДН-1.10)", () => {
    let requests = 0;
    server.use(
      http.get("*/api/admin/delivery-settings", () => {
        requests += 1;
        return HttpResponse.json(settingsResponse());
      }),
      http.get("*/api/admin/pickup-points", () => {
        requests += 1;
        return HttpResponse.json({ data: [] });
      }),
    );

    renderWithProviders(<DeliverySettingsView />, {
      auth: { permissions: ["settings:search"] },
    });

    expect(
      screen.getByRole("heading", { level: 2, name: t.heading }),
    ).toBeInTheDocument();
    const refusal = screen.getByRole("alert");
    expect(refusal).toHaveTextContent(t.noAccessTitle);
    expect(refusal).toHaveTextContent(t.noAccessHint);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it("shows the skeleton while the settings load (ДН-1.9)", () => {
    server.use(
      http.get("*/api/admin/delivery-settings", async () => {
        await delay("infinite");
        return HttpResponse.json(settingsResponse());
      }),
      http.get("*/api/admin/pickup-points", () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    renderWithProviders(<DeliverySettingsView />, ADMIN);

    expect(screen.getByText(t.subheading)).toBeInTheDocument();
    expect(
      screen.getByTestId("delivery-settings-skeleton"),
    ).toBeInTheDocument();
  });

  it("renders the form for a manager holding settings:delivery, with the active points counted", async () => {
    server.use(
      http.get("*/api/admin/delivery-settings", () =>
        HttpResponse.json(settingsResponse()),
      ),
      http.get("*/api/admin/pickup-points", () =>
        HttpResponse.json({
          data: [point("a", true), point("b", false), point("c", true)],
        }),
      ),
    );

    renderWithProviders(<DeliverySettingsView />, {
      auth: { permissions: ["settings:delivery"] },
    });

    expect(
      await screen.findByRole("switch", { name: f.npTitle }),
    ).toBeChecked();
    expect(await screen.findByText(f.previewPickup(2))).toBeInTheDocument();
  });

  it("warns when pickup is on but no point is active, and drops pickup from the preview (ДН-1.7, TASK-645)", async () => {
    let points = [point("a", true), point("b", false)];
    server.use(
      http.get("*/api/admin/delivery-settings", () =>
        HttpResponse.json(settingsResponse()),
      ),
      http.get("*/api/admin/pickup-points", () =>
        HttpResponse.json({ data: points }),
      ),
      http.put("*/api/admin/pickup-points/:id", async ({ request, params }) => {
        const body = (await request.json()) as { isActive: boolean };
        points = points.map((p) =>
          p.id === params.id ? { ...p, isActive: body.isActive } : p,
        );
        return HttpResponse.json({
          data: points.find((p) => p.id === params.id),
        });
      }),
    );

    renderWithProviders(<DeliverySettingsView />, ADMIN);

    const preview = await screen.findByTestId("delivery-preview");
    expect(await within(preview).findByText(f.pickupTitle)).toBeInTheDocument();
    expect(screen.queryByText(f.pickupNoActive)).not.toBeInTheDocument();

    // Deactivate the only active point from its «⋯» menu.
    const pt = dict.pickupPoints;
    await userEvent.click(
      await screen.findByRole("button", { name: pt.rowActionsAria("Точка a") }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: pt.deactivate }),
    );

    // The list is refetched; the warning and the preview follow it.
    expect(await screen.findByText(f.pickupNoActive)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(preview).queryByText(f.pickupTitle),
      ).not.toBeInTheDocument(),
    );
  });

  it("offers «Повторити» when the settings fail to load, and refetches", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/delivery-settings", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json(settingsResponse());
      }),
      http.get("*/api/admin/pickup-points", () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    renderWithProviders(<DeliverySettingsView />, ADMIN);

    expect(await screen.findByRole("alert")).toHaveTextContent(t.loadError);
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.retry }),
    );

    expect(
      await screen.findByRole("switch", { name: f.npTitle }),
    ).toBeInTheDocument();
  });
});
