import { useForm, useWatch } from "react-hook-form";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  act,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCity } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";
import { NpCityField } from "./np-city-field";

/**
 * Render NpCityField inside a real useForm, exposing the bound city + npCityRef
 * values so the test can assert what the autocomplete writes into the form.
 */
function Harness() {
  const form = useForm<CheckoutFormValues>({
    defaultValues: {
      city: "",
      npCityRef: "",
      deliveryAddress: "",
      npWarehouseRef: "",
    },
  });
  const city = useWatch({ control: form.control, name: "city" });
  const npCityRef = useWatch({ control: form.control, name: "npCityRef" });

  return (
    <div>
      <NpCityField control={form.control} setValue={form.setValue} />
      <output data-testid="city">{city}</output>
      <output data-testid="npCityRef">{npCityRef}</output>
    </div>
  );
}

describe("NpCityField", () => {
  it("searches and lists matching cities after typing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");

    expect(
      await screen.findByText("м. Київ, Київська обл."),
    ).toBeInTheDocument();
  });

  it("writes both the display name and the npCityRef when a city is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
    await user.click(await screen.findByText("м. Київ, Київська обл."));

    expect(screen.getByTestId("city")).toHaveTextContent(
      "м. Київ, Київська обл.",
    );
    expect(screen.getByTestId("npCityRef")).toHaveTextContent("city-ref-1");
  });

  it("keeps typed text as free text and clears the ref (NP-offline fallback)", async () => {
    // Pick a city first (sets a ref), then type more — the ref must clear.
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
    await user.click(await screen.findByText("м. Київ, Київська обл."));
    expect(screen.getByTestId("npCityRef")).toHaveTextContent("city-ref-1");

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "x");

    await waitFor(() =>
      expect(screen.getByTestId("npCityRef")).toHaveTextContent(""),
    );
  });

  // TASK-402: the lookup is a proxy to a third party. When it fails, "нічого не
  // знайдено" blames the shopper's spelling for someone else's outage — and the
  // free-text path that would have unblocked them goes unmentioned.
  it("says the directory is unavailable when the lookup itself fails", async () => {
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json(
          { statusCode: 503, message: "Nova Poshta is unavailable" },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");

    // Twice on purpose: inside the open dropdown, and as a notice under the
    // field that survives the blur which closes it.
    const notices = await screen.findAllByText(dict.checkout.searchUnavailable);
    expect(notices.some((el) => el.getAttribute("role") === "status")).toBe(
      true,
    );
    // The empty-result copy must not be what a failure looks like.
    expect(screen.queryByText(dict.checkout.searchEmpty)).toBeNull();
  });

  it("keeps the typed city usable when the directory is down (free-text fallback)", async () => {
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({ statusCode: 503 }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Ромни");
    await screen.findAllByText(dict.checkout.searchUnavailable);

    expect(screen.getByTestId("city")).toHaveTextContent("Ромни");
    expect(screen.getByTestId("npCityRef")).toHaveTextContent("");
  });

  it("does not fire a search for queries shorter than 2 characters", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/delivery/cities", () => {
        calls += 1;
        return HttpResponse.json({ data: [makeCity()] });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText(dict.checkout.fields.city), "К");
    // Let the debounce window elapse (inside act, since it sets state) and
    // assert no request was made for the 1-char query.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(calls).toBe(0);
  });
});
