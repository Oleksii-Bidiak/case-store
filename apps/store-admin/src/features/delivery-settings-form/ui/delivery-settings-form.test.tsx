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
import type { DeliverySettingDto } from "@/entities/delivery";
import { DeliverySettingsForm } from "./delivery-settings-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.deliverySettingsForm;

function makeSettings(
  overrides: Partial<DeliverySettingDto> = {},
): DeliverySettingDto {
  return {
    senderCityRef: null,
    senderCityName: null,
    senderWarehouseRef: null,
    defaultWeightKg: 0.5,
    npEnabled: true,
    pickupEnabled: false,
    courierEnabled: false,
    otherEnabled: true,
    courierCityName: "Київ",
    courierPrice: "150.00",
    courierFreeFrom: "2000.00",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Stub PUT /api/admin/delivery-settings; collects the bodies, echoes them. */
function stubUpdate() {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.put("*/api/admin/delivery-settings", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      const price = body.courierPrice;
      const freeFrom = body.courierFreeFrom;
      return HttpResponse.json({
        data: makeSettings({
          ...(body as Partial<DeliverySettingDto>),
          senderCityRef: (body.senderCityRef as string) || null,
          senderCityName: (body.senderCityName as string) || null,
          senderWarehouseRef: (body.senderWarehouseRef as string) || null,
          courierPrice: typeof price === "number" ? price.toFixed(2) : "150.00",
          courierFreeFrom:
            typeof freeFrom === "number" ? freeFrom.toFixed(2) : null,
        }),
      });
    }),
  );
  return bodies;
}

const methodSwitch = (title: string) =>
  screen.getByRole("switch", { name: title });
const saveButton = () => screen.getByRole("button", { name: t.submit });
const preview = () => screen.getByTestId("delivery-preview");
const previewTitles = () =>
  within(preview())
    .queryAllByRole("listitem")
    .map((item) => item.getAttribute("data-method"));

function renderForm(
  settings = makeSettings(),
  activePickupPoints: number | null = 2,
) {
  return renderWithProviders(
    <DeliverySettingsForm
      settings={settings}
      activePickupPoints={activePickupPoints}
    />,
  );
}

describe("DeliverySettingsForm (TASK-644, ДН-1.1)", () => {
  it("draws the four method cards with their state", () => {
    renderForm();

    expect(methodSwitch(t.npTitle)).toBeChecked();
    expect(methodSwitch(t.pickupTitle)).not.toBeChecked();
    expect(methodSwitch(t.courierTitle)).not.toBeChecked();
    expect(methodSwitch(t.otherTitle)).toBeChecked();
    // A switched-off method's fields are not on screen.
    expect(
      screen.queryByRole("textbox", { name: t.courierPrice }),
    ).not.toBeInTheDocument();
  });

  it("puts a switched-on method into the preview, from the unsaved values", async () => {
    renderForm();
    expect(previewTitles()).toEqual(["np", "other"]);

    await userEvent.click(methodSwitch(t.courierTitle));

    expect(previewTitles()).toEqual(["np", "courier", "other"]);
    expect(within(preview()).getByText("Курʼєр · Київ")).toBeInTheDocument();

    const price = screen.getByRole("textbox", { name: t.courierPrice });
    await userEvent.clear(price);
    await userEvent.type(price, "99");
    expect(
      within(preview()).getByText(/^99 ₴ · безкоштовно від/),
    ).toBeInTheDocument();
  });

  it("leaves pickup out of the preview and warns while no point is active (ДН-1.7)", async () => {
    renderForm(makeSettings(), 0);

    await userEvent.click(methodSwitch(t.pickupTitle));

    expect(screen.getByText(t.pickupNoActive)).toBeInTheDocument();
    expect(previewTitles()).not.toContain("pickup");
  });

  it("disables «Зберегти» and says why when every method is off (ДН-1.8)", async () => {
    renderForm();
    expect(saveButton()).toBeEnabled();

    await userEvent.click(methodSwitch(t.npTitle));
    await userEvent.click(methodSwitch(t.otherTitle));

    expect(screen.getByRole("alert")).toHaveTextContent(t.allOffTitle);
    expect(saveButton()).toBeDisabled();
    expect(within(preview()).getByText(t.previewEmpty)).toBeInTheDocument();
    expect(within(preview()).getByText(t.previewHintNone)).toBeInTheDocument();
  });

  it("names the changed cards in the sticky bar and «Скасувати зміни» drops them", async () => {
    renderForm();

    await userEvent.click(methodSwitch(t.courierTitle));
    expect(
      screen.getByText(dict.canon.unsavedChanges(t.courierTitle)),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    expect(methodSwitch(t.courierTitle)).not.toBeChecked();
    expect(
      screen.queryByText(dict.canon.unsavedChanges(t.courierTitle)),
    ).not.toBeInTheDocument();
  });

  it("saves the courier with an emptied threshold as null", async () => {
    const bodies = stubUpdate();
    renderForm();

    await userEvent.click(methodSwitch(t.courierTitle));
    const price = screen.getByRole("textbox", { name: t.courierPrice });
    await userEvent.clear(price);
    await userEvent.type(price, "120,5");
    await userEvent.clear(
      screen.getByRole("textbox", { name: t.courierFreeFrom }),
    );
    await userEvent.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      npEnabled: true,
      pickupEnabled: false,
      courierEnabled: true,
      otherEnabled: true,
      courierCityName: "Київ",
      courierPrice: 120.5,
      courierFreeFrom: null,
      defaultWeightKg: 0.5,
    });
    // The new baseline is what was saved: nothing left unsaved.
    await waitFor(() =>
      expect(screen.queryByText(/^Незбережені зміни/)).not.toBeInTheDocument(),
    );
  });

  it("blocks the save and focuses the first invalid field", async () => {
    const bodies = stubUpdate();
    renderForm();

    await userEvent.click(methodSwitch(t.courierTitle));
    await userEvent.clear(screen.getByRole("textbox", { name: t.courierCity }));
    await userEvent.clear(
      screen.getByRole("textbox", { name: t.courierPrice }),
    );
    await userEvent.click(saveButton());

    const city = screen.getByRole("textbox", { name: t.courierCity });
    await waitFor(() => expect(city).toHaveFocus());
    expect(city).toHaveAccessibleDescription(
      expect.stringContaining(t.errors.courierCityRequired),
    );
    expect(bodies).toHaveLength(0);
  });

  it("keeps an in-progress edit when the settings refetch (forms.md Rule 2a)", async () => {
    const { rerender } = renderForm(makeSettings({ courierEnabled: true }));

    const price = screen.getByRole("textbox", { name: t.courierPrice });
    await userEvent.clear(price);
    await userEvent.type(price, "175");

    // A background refetch: someone else changed the courier city.
    rerender(
      <DeliverySettingsForm
        settings={makeSettings({
          courierEnabled: true,
          courierCityName: "Львів",
        })}
        activePickupPoints={2}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: t.courierCity })).toHaveValue(
        "Львів",
      ),
    );
    expect(screen.getByRole("textbox", { name: t.courierPrice })).toHaveValue(
      "175",
    );
  });

  it("picks the dispatch city from the NP directory and saves ref + name", async () => {
    const bodies = stubUpdate();
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({
          data: [
            {
              ref: "ref-lviv",
              name: "Львів",
              area: "Львівська",
              warehouses: 90,
            },
          ],
        }),
      ),
      http.get("*/api/delivery/warehouses", () =>
        HttpResponse.json({ data: [] }),
      ),
    );
    renderForm();

    await userEvent.type(
      screen.getByRole("combobox", { name: t.senderCity }),
      "Льв",
    );
    await userEvent.click(await screen.findByRole("option", { name: /Львів/ }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      senderCityRef: "ref-lviv",
      senderCityName: "Львів, Львівська",
      senderWarehouseRef: "",
    });
  });

  it("refuses a typed dispatch city that was never picked", async () => {
    const bodies = stubUpdate();
    server.use(
      http.get("*/api/delivery/cities", () => HttpResponse.json({ data: [] })),
    );
    renderForm();

    const city = screen.getByRole("combobox", { name: t.senderCity });
    await userEvent.type(city, "Нікуди");
    await userEvent.click(saveButton());

    await waitFor(() => expect(city).toHaveFocus());
    expect(screen.getByText(t.errors.senderCityPick)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("says «4 способи доставки» when every card has changed", async () => {
    renderForm(makeSettings({ pickupEnabled: false }));

    await userEvent.click(methodSwitch(t.npTitle));
    await userEvent.click(methodSwitch(t.pickupTitle));
    await userEvent.click(methodSwitch(t.courierTitle));
    await userEvent.click(methodSwitch(t.otherTitle));

    expect(
      screen.getByText(dict.canon.unsavedChanges(t.dirtyAll(4))),
    ).toBeInTheDocument();
  });
});
