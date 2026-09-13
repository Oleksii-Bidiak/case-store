import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { OrderCreateForm } from "./order-create-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

/**
 * What happens to the branch field when the settlement changes under it
 * (`np-address-fields.tsx`).
 *
 * The bug this pins: the city pickers cleared `npCityRef`/`npWarehouseRef` but
 * never `address1`, so a branch chosen from the Kyiv directory stayed in the
 * address while the city became Бровари. Nothing on screen said so — the only
 * visible change was the grey «Обрано з довідника» line disappearing — and
 * `createOrderValuesToDto` then omits the empty `npWarehouseRef` and posts
 * `city: "Бровари"` with `address1` naming a Kyiv branch. The parcel is created
 * against a branch that does not exist in that settlement.
 *
 * The other half is equally load-bearing and is why the naive "always clear
 * address1" fix is wrong: an operator on the phone types addresses by hand all
 * the time (NP refuses keyless calls, so a deployment without an NP key has no
 * directory at all), and deleting their own words while they fix a typo in the
 * city name costs them the call. `npWarehouseRef` is the only record of where the
 * text came from, which is why the fix reads it before clearing it.
 *
 * Rendered through the whole `OrderCreateForm` on purpose: these fields only
 * exist as part of one RHF form, and it is the shared form state — not the two
 * components in isolation — that the bug lived in.
 */

const KYIV = {
  ref: "db5c88e0-391c-11dd-90d9-001a92567626",
  name: "Київ",
  area: "Київська",
  warehouses: 900,
};

const BROVARY = {
  ref: "e71d5b48-4b33-11e4-ab6d-005056801329",
  name: "Бровари",
  area: "Київська",
  warehouses: 30,
};

const KYIV_BRANCH = {
  ref: "7b422fc6-e1b8-11e3-8c4a-0050568002cf",
  description: "Відділення №5: вул. Хрещатик, 22",
  number: "5",
  typeOfWarehouse: "branch",
};

/** The directory, answering the way NP does: a prefix search over settlements. */
function directoryIsReachable(): void {
  server.use(
    http.get("*/api/delivery/cities", ({ request }) => {
      const q = (
        new URL(request.url).searchParams.get("q") ?? ""
      ).toLowerCase();
      return HttpResponse.json({
        data: [KYIV, BROVARY].filter((city) =>
          city.name.toLowerCase().startsWith(q),
        ),
      });
    }),
    http.get("*/api/delivery/warehouses", () =>
      HttpResponse.json({ data: [KYIV_BRANCH] }),
    ),
  );
}

function field(name: string): HTMLInputElement {
  const element = document.getElementById(`order-create-${name}`);
  if (element === null) throw new Error(`No field order-create-${name}`);
  return element as HTMLInputElement;
}

/** Type a settlement and pick it out of the directory list. */
async function pickCity(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  await user.clear(field("city"));
  await user.type(field("city"), name);
  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`Вибрати «${name}»`),
    }),
  );
}

describe("NpCityField / NpWarehouseField — changing the settlement", () => {
  it("drops a branch that came from the directory when the city changes", async () => {
    const user = userEvent.setup();
    directoryIsReachable();
    renderWithProviders(<OrderCreateForm />);

    await pickCity(user, "Київ");
    // Clicking into the branch field opens that settlement's branches.
    await user.click(field("address1"));
    await user.click(
      await screen.findByRole("button", { name: /Вибрати «Відділення №5/ }),
    );
    expect(field("address1")).toHaveValue(KYIV_BRANCH.description);
    // Both fields now carry the «обрано з довідника» line — city and branch.
    expect(screen.getAllByText(/Обрано з довідника Нової Пошти/i)).toHaveLength(
      2,
    );

    // «Ні, у Бровари» — the correction that used to leave a Kyiv branch behind.
    await pickCity(user, "Бровари");

    expect(field("city")).toHaveValue("Бровари");
    expect(field("address1")).toHaveValue("");
    // Exactly one line left, the city's: the branch no longer claims to have come
    // from the directory, because it no longer exists as far as we know.
    await waitFor(() =>
      expect(
        screen.getAllByText(/Обрано з довідника Нової Пошти/i),
      ).toHaveLength(1),
    );
  });

  it("keeps an address the operator typed by hand when the city changes", async () => {
    const user = userEvent.setup();
    directoryIsReachable();
    renderWithProviders(<OrderCreateForm />);

    await pickCity(user, "Київ");
    const dictated = "вул. Лесі Українки, 7, кв. 3";
    await user.type(field("address1"), dictated);

    // Same correction as above, but the branch text is the operator's own words:
    // they were dictated over the phone and no directory wrote them.
    await pickCity(user, "Бровари");

    expect(field("city")).toHaveValue("Бровари");
    expect(field("address1")).toHaveValue(dictated);
  });
});
