import { useForm } from "react-hook-form";
import { renderWithProviders, screen } from "@/shared/test/render";
import { makeDeliveryMethods } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import {
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "../model/checkout-schema";
import {
  toDeliveryOptions,
  type CheckoutDeliveryOptions,
} from "../model/delivery";
import { DeliveryMethodPicker } from "./delivery-method-picker";

function renderPicker(options: CheckoutDeliveryOptions) {
  function Harness() {
    const form = useForm<CheckoutFormValues>({
      defaultValues: CHECKOUT_DEFAULT_VALUES,
    });
    return (
      <DeliveryMethodPicker
        control={form.control}
        setValue={form.setValue}
        options={options}
      />
    );
  }
  return renderWithProviders(<Harness />);
}

const offer = (overrides: Parameters<typeof makeDeliveryMethods>[0] = {}) =>
  toDeliveryOptions(makeDeliveryMethods(overrides));

describe("DeliveryMethodPicker", () => {
  it("offers a radio per method when the shop has several", () => {
    renderPicker(offer({ methods: ["NOVA_POSHTA", "PICKUP"] }));

    expect(
      screen.getByRole("radiogroup", {
        name: dict.checkout.delivery.methodHeading,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  // TASK-1998: a choice of one is not a choice — but the shopper still has to
  // know how the parcel travels.
  it.each([
    ["NOVA_POSHTA", dict.checkout.delivery.titles.NOVA_POSHTA],
    ["PICKUP", dict.checkout.delivery.titles.PICKUP],
    ["OTHER", dict.checkout.delivery.titles.OTHER],
    ["COURIER", "Кур'єр · Київ"],
  ] as const)(
    "names the one method %s as a heading, with no radios",
    (method, title) => {
      renderPicker(offer({ methods: [method] }));

      expect(
        screen.getByRole("heading", { level: 2, name: title }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
    },
  );
});
