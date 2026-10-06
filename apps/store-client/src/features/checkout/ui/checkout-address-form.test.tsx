import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeDeliveryMethods } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import {
  CHECKOUT_DEFAULT_VALUES,
  checkoutSchemaFor,
  type CheckoutFormValues,
} from "../model/checkout-schema";
import {
  toDeliveryOptions,
  type CheckoutDeliveryMethod,
  type CheckoutDeliveryOptions,
} from "../model/delivery";
import { CheckoutAddressForm } from "./checkout-address-form";

const OPTIONS = toDeliveryOptions(makeDeliveryMethods());

/**
 * Render the form inside a real `useForm` instance. The phone field uses
 * `Controller`, which needs a genuine `control` object. Errors are injected via
 * `setError` so they flow through both `formState.errors` (register fields) and
 * `fieldState` (Controller fields).
 */
function renderForm(
  errors: Partial<Record<keyof CheckoutFormValues, string>> = {},
) {
  function Harness() {
    const form = useForm<CheckoutFormValues>({
      defaultValues: CHECKOUT_DEFAULT_VALUES,
    });

    useEffect(() => {
      Object.entries(errors).forEach(([name, message]) => {
        form.setError(name as keyof CheckoutFormValues, {
          type: "manual",
          message,
        });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <CheckoutAddressForm
        legend="Доставка"
        register={form.register}
        control={form.control}
        setValue={form.setValue}
        errors={form.formState.errors}
      />
    );
  }

  return renderWithProviders(<Harness />);
}

/**
 * A validating harness for one branch: the real schema behind a submit button,
 * and the watched `npManual` printed so the NP-down switch can be asserted.
 */
function renderBranch(
  method: CheckoutDeliveryMethod,
  options: CheckoutDeliveryOptions = OPTIONS,
) {
  // The same choice the view makes: a courier without a city asks for one.
  const schema = checkoutSchemaFor(false, {
    courierCityFixed: Boolean(options.courier.cityName?.trim()),
  });
  function Harness() {
    const form = useForm<CheckoutFormValues>({
      resolver: zodResolver(schema),
      defaultValues: { ...CHECKOUT_DEFAULT_VALUES, deliveryMethod: method },
    });
    const npManual = useWatch({ control: form.control, name: "npManual" });
    return (
      <form onSubmit={form.handleSubmit(() => {})} noValidate>
        <CheckoutAddressForm
          legend={dict.checkout.delivery.recipientHeading}
          register={form.register}
          control={form.control}
          setValue={form.setValue}
          errors={form.formState.errors}
          method={method}
          options={options}
        />
        <output data-testid="npManual">{String(npManual)}</output>
        <button type="submit">submit</button>
      </form>
    );
  }
  return renderWithProviders(<Harness />);
}

describe("CheckoutAddressForm", () => {
  it("renders the recipient and the Nova Poshta fields by default", () => {
    renderForm();

    expect(
      screen.getByLabelText(dict.checkout.fields.firstName),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.lastName),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.phone),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.city),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.delivery.npWarehouseLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: dict.checkout.delivery.npHeading }),
    ).toBeInTheDocument();
  });

  it("renders the phone field with type=tel and inputMode=numeric", () => {
    renderForm();

    const phone = screen.getByLabelText(dict.checkout.fields.phone);
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("inputmode", "numeric");
  });

  it("shows the warehouse hint until a city is selected", () => {
    renderForm();

    expect(screen.getByText(dict.checkout.warehouseHint)).toBeInTheDocument();
  });

  it("marks a field invalid and surfaces its error message", () => {
    renderForm({ phone: "Невірний телефон" });

    expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Невірний телефон");
  });

  it("links each errored field to its message via aria-describedby (TASK-259-I)", () => {
    renderForm({ firstName: "Вкажіть імʼя", phone: "Невірний телефон" });

    // register-driven field (renderField helper).
    const firstName = screen.getByLabelText(dict.checkout.fields.firstName);
    const describedBy = firstName.getAttribute("aria-describedby");
    expect(describedBy).toBe("checkout-firstName-error");
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Вкажіть імʼя",
    );

    // Controller-driven phone field.
    const phone = screen.getByLabelText(dict.checkout.fields.phone);
    expect(phone).toHaveAttribute("aria-describedby", "checkout-phone-error");
    expect(document.getElementById("checkout-phone-error")).toHaveTextContent(
      "Невірний телефон",
    );
  });

  it("replaces the warehouse hint with the error when deliveryAddress is invalid", () => {
    renderForm({ deliveryAddress: "Вкажіть адресу" });

    expect(
      screen.queryByText(dict.checkout.warehouseHint),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Вкажіть адресу");
  });
});

// ── TASK-646: one subsection per delivery method ─────────────────────────────
describe("CheckoutAddressForm — delivery branches (TASK-646)", () => {
  it("Nova Poshta: a typed city that was never picked is refused", async () => {
    const user = userEvent.setup();
    renderBranch("NOVA_POSHTA");

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(
      await screen.findByText(dict.checkout.delivery.validation.npCity),
    ).toBeInTheDocument();
  });

  it("Nova Poshta down: swaps to typed fields with the warning, keeping the typed city (TASK-1097)", async () => {
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({ statusCode: 503 }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderBranch("NOVA_POSHTA");

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Ромни");

    const notice = await screen.findByText(dict.checkout.delivery.npDownNotice);
    expect(notice.closest("[role=status]")).not.toBeNull();
    // Still the Nova Poshta section — only the lookup is down (#np-down).
    expect(
      screen.getByRole("heading", { name: dict.checkout.delivery.npHeading }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: dict.checkout.delivery.otherHeading,
      }),
    ).toBeNull();
    expect(screen.getByTestId("npManual")).toHaveTextContent("true");
    const city = screen.getByLabelText(dict.checkout.fields.city);
    expect(city).toHaveValue("Ромни");
    expect(city).toHaveAttribute(
      "placeholder",
      dict.checkout.delivery.manualCityPlaceholder,
    );
    // The shopper was typing there — focus follows them to the new input.
    await waitFor(() => expect(city).toHaveFocus());
    expect(
      screen.getByLabelText(dict.checkout.delivery.manualAddressLabel),
    ).toHaveAttribute(
      "placeholder",
      dict.checkout.delivery.manualAddressPlaceholder,
    );

    // A typed city is now the whole answer; only the address is missing.
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(
      await screen.findByText(dict.checkout.validation.deliveryAddress),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.checkout.delivery.validation.npCity),
    ).toBeNull();
  });

  it("pickup: a radiogroup of points with the map link, and no address fields", async () => {
    const user = userEvent.setup();
    renderBranch(
      "PICKUP",
      toDeliveryOptions(
        makeDeliveryMethods({
          pickupPoints: [
            {
              id: "pp-1",
              name: "Магазин на Хрещатику",
              city: "Київ",
              address: "вул. Хрещатик, 22",
              phone: "+380441234567",
              workingHours: "Пн–Сб 10:00–20:00",
              mapUrl: "https://maps.example/1",
            },
            {
              id: "pp-2",
              name: "Магазин на Оболоні",
              city: "Київ",
              address: "просп. Оболонський, 1",
              phone: null,
              workingHours: null,
              mapUrl: null,
            },
          ],
        }),
      ),
    );

    const group = screen.getByRole("radiogroup", {
      name: dict.checkout.delivery.pickupGroupAria,
    });
    expect(group).toHaveTextContent("Пн–Сб 10:00–20:00 · +380441234567");
    // The address names the city first, as drawn: «Київ, вул. Хрещатик, 22».
    expect(screen.getByText("Київ, вул. Хрещатик, 22")).toBeVisible();
    expect(screen.getByText("Київ, просп. Оболонський, 1")).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByLabelText(dict.checkout.fields.city)).toBeNull();
    // One map link — the second point has none.
    const links = screen.getAllByRole("link", {
      name: new RegExp(dict.checkout.delivery.pickupMapLink),
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://maps.example/1");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(screen.getByText(dict.checkout.delivery.pickupNote)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(
      await screen.findByText(dict.checkout.delivery.validation.pickupPoint),
    ).toBeInTheDocument();
    expect(group).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("radio", { name: /Оболоні/ }));
    await waitFor(() =>
      expect(
        screen.queryByText(dict.checkout.delivery.validation.pickupPoint),
      ).toBeNull(),
    );
  });

  it("courier: the courier's city read-only, street and house required, the progress to free", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          makeCart(), // subtotal well under the 2 000 ₴ threshold
        ),
      ),
    );
    const user = userEvent.setup();
    renderBranch("COURIER");

    const city = screen.getByLabelText(dict.checkout.fields.city);
    expect(city).toHaveValue("Київ");
    expect(city).toHaveAttribute("readonly");
    expect(city).toHaveAccessibleDescription(
      dict.checkout.delivery.courierCityHint("Київ"),
    );
    expect(
      await screen.findByRole("progressbar", {
        name: dict.checkout.delivery.courierProgressAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.checkout.delivery.courierRemaining, {
        exact: false,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(
      await screen.findByText(dict.checkout.delivery.validation.courierStreet),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.checkout.delivery.validation.courierHouse),
    ).toBeInTheDocument();
    // The flat is optional — no message for it.
    expect(
      screen.getByLabelText(
        new RegExp(dict.checkout.delivery.courierApartment),
      ),
    ).not.toHaveAttribute("aria-invalid");
  });

  it("courier: says the delivery is free once the cart clears the threshold", async () => {
    server.use(
      http.get("*/api/cart", () => {
        const cart = makeCart();
        cart.data.totals = { ...cart.data.totals, subtotal: "2500.00" };
        return HttpResponse.json(cart);
      }),
    );
    renderBranch("COURIER");

    expect(
      await screen.findByText(dict.checkout.delivery.courierFree("2 000 ₴"), {
        normalizer: (text) => text.replace(/\s/g, " "),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("courier without a city from the shop: the city is typed, and required", async () => {
    const user = userEvent.setup();
    renderBranch(
      "COURIER",
      toDeliveryOptions(
        makeDeliveryMethods({
          courier: { price: "150.00", freeFrom: null, cityName: null },
        }),
      ),
    );

    const city = screen.getByLabelText(dict.checkout.fields.city);
    expect(city).not.toHaveAttribute("readonly");
    expect(city).toHaveValue("");

    await user.type(
      screen.getByLabelText(dict.checkout.delivery.courierStreet),
      "вул. Соборна",
    );
    await user.type(
      screen.getByLabelText(dict.checkout.delivery.courierHouse),
      "5",
    );
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(
      await screen.findByText(dict.checkout.validation.city),
    ).toBeInTheDocument();
    expect(city).toHaveAttribute("aria-invalid", "true");

    // Typing it clears the message (re-validation on change after a submit).
    await user.type(city, "Біла Церква");
    await waitFor(() => expect(city).not.toHaveAttribute("aria-invalid"));
    expect(screen.queryByText(dict.checkout.validation.city)).toBeNull();
  });

  it("other: a city and a free-text address with its hint and the operator note", async () => {
    const user = userEvent.setup();
    renderBranch("OTHER");

    const address = screen.getByLabelText(
      dict.checkout.delivery.otherAddressLabel,
    );
    expect(address).toHaveAttribute(
      "placeholder",
      dict.checkout.delivery.otherAddressPlaceholder,
    );
    expect(address).toHaveAccessibleDescription(
      dict.checkout.delivery.otherAddressHint,
    );
    expect(screen.getByText(dict.checkout.delivery.otherNote)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(
      await screen.findByText(dict.checkout.validation.city),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.checkout.delivery.validation.otherAddress),
    ).toBeInTheDocument();
  });
});
