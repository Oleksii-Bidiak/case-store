import { http, HttpResponse } from "msw";
import { useForm, useWatch } from "react-hook-form";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  NpCityField,
  NpWarehouseField,
  type NpAddressValues,
} from "./np-address-fields";

/**
 * The NP pickers on their own (moved here from `features/order-create` by
 * TASK-1973, so the delivery edit of an existing order can host them too).
 * The settlement-change rules inside a whole form are pinned by
 * `features/order-create/ui/np-address-fields.test.tsx`; this suite pins the
 * contract any host form relies on: its own ids, and refs that never outlive
 * the names they belong to.
 */

/** A host form with MORE fields than the pickers know — as both features have. */
interface HostValues extends NpAddressValues {
  phone: string;
}

function Host() {
  const host = useForm<HostValues>({
    defaultValues: {
      phone: "",
      city: "Київ",
      address1: "Відділення №5",
      npCityRef: "kyiv-ref",
      npWarehouseRef: "kyiv-branch-5",
    },
  });
  // The values on screen, so the tests read what the pickers wrote.
  const values = useWatch({ control: host.control });
  return (
    <form>
      <NpCityField form={host} idPrefix="host" />
      <NpWarehouseField form={host} idPrefix="host" />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </form>
  );
}

const valueOf = (key: keyof HostValues): string =>
  (JSON.parse(screen.getByTestId("values").textContent ?? "{}") as HostValues)[
    key
  ];

describe("NpCityField / NpWarehouseField — the host contract (TASK-1973)", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({
          data: [
            {
              ref: "lviv-ref",
              name: "Львів",
              area: "Львівська",
              warehouses: 1,
            },
          ],
        }),
      ),
      http.get("*/api/delivery/warehouses", () =>
        HttpResponse.json({ data: [] }),
      ),
    );
  });

  it("names its inputs after the host's prefix", () => {
    renderWithProviders(<Host />);

    expect(document.getElementById("host-city")).toHaveValue("Київ");
    expect(document.getElementById("host-address1")).toHaveValue(
      "Відділення №5",
    );
  });

  it("drops both refs — and the directory branch — when the city is retyped", async () => {
    renderWithProviders(<Host />);

    await userEvent.type(
      screen.getByLabelText(dict.orderCreate.addressCity),
      "щина",
    );

    expect(valueOf("npCityRef")).toBe("");
    expect(valueOf("npWarehouseRef")).toBe("");
    expect(valueOf("address1")).toBe("");
  });

  it("sets the city and its ref together when one is picked", async () => {
    renderWithProviders(<Host />);
    const city = screen.getByLabelText(dict.orderCreate.addressCity);
    await userEvent.clear(city);
    await userEvent.type(city, "Льв");

    await userEvent.click(
      await screen.findByRole("button", { name: /Вибрати «Львів»/i }),
    );

    expect(valueOf("city")).toBe("Львів");
    expect(valueOf("npCityRef")).toBe("lviv-ref");
  });
});
