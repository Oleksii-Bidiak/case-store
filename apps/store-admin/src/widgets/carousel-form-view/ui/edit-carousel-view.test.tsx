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
import { EditCarouselView } from "./edit-carousel-view";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

beforeEach(() => push.mockReset());

const carouselId = "11111111-2222-3333-4444-555555555555";
const c = dict.carouselItems;
const f = dict.carouselForm;

function carousel(source: string, status = "PUBLISHED") {
  return {
    id: carouselId,
    title: "Популярне",
    source,
    placement: "HOME_RAILS",
    categoryId: null,
    itemLimit: 12,
    sortOrder: 0,
    status,
    publishedAt: "2026-07-01T00:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const ITEMS = [
  {
    id: "i1",
    productId: "p1",
    sortOrder: 0,
    product: {
      id: "p1",
      name: "iPhone 16 Pro 128",
      imageUrl: null,
      price: "54999.00",
      isActive: true,
    },
  },
  {
    id: "i2",
    productId: "p2",
    sortOrder: 1,
    product: {
      id: "p2",
      name: "iPhone 16 Pro 256",
      imageUrl: null,
      price: "59999.00",
      isActive: true,
    },
  },
];

/** Stub the carousel and its items; capture every write. */
function stubCarousel(source: string, status = "PUBLISHED") {
  const writes: { kind: string; body: unknown }[] = [];
  server.use(
    http.get(`*/api/admin/carousels/${carouselId}`, () =>
      HttpResponse.json({ data: carousel(source, status) }),
    ),
    http.get(`*/api/admin/carousels/${carouselId}/items`, () =>
      HttpResponse.json({ data: source === "MANUAL" ? ITEMS : [] }),
    ),
    http.put(`*/api/admin/carousels/${carouselId}`, async ({ request }) => {
      writes.push({ kind: "carousel", body: await request.json() });
      return HttpResponse.json({ data: carousel(source, status) });
    }),
    http.put(
      `*/api/admin/carousels/${carouselId}/items`,
      async ({ request }) => {
        writes.push({ kind: "items", body: await request.json() });
        return HttpResponse.json({ data: ITEMS });
      },
    ),
  );
  return writes;
}

const chooseSource = (value: keyof typeof f.sourceOptions) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: f.source })).getByRole(
      "radio",
      { name: f.sourceOptions[value] },
    ),
  );

/**
 * AD-CNT-25 (TASK-429): a non-MANUAL carousel used to render NOTHING where the
 * item picker sits, and operators reported that as "reordering is broken". The
 * screen must still explain itself when there is no live preview to show.
 */
describe("EditCarouselView — items section for an automatic source (AD-CNT-25)", () => {
  it("explains that the order is automatic instead of showing an empty space", async () => {
    stubCarousel("BESTSELLING", "DRAFT");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(await screen.findByText(c.autoHeading)).toBeInTheDocument();
    // Names the source that is actually in charge…
    expect(
      screen.getByText(c.autoHint(f.sourceOptions.BESTSELLING)),
    ).toBeInTheDocument();
    // …and the single action that brings the picker back.
    expect(screen.getByText(c.autoSwitchHint)).toBeInTheDocument();
    // The real picker is NOT mounted — no dead search box.
    expect(
      screen.queryByPlaceholderText(c.searchPlaceholder),
    ).not.toBeInTheDocument();
  });

  it("shows the real picker for a MANUAL carousel, with its saved list", async () => {
    stubCarousel("MANUAL");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(
      await screen.findByPlaceholderText(c.searchPlaceholder),
    ).toBeInTheDocument();
    expect(await screen.findByText("iPhone 16 Pro 128")).toBeInTheDocument();
    expect(screen.queryByText(c.autoHeading)).not.toBeInTheDocument();
  });

  it("swaps the notice for the picker the moment the source flips to MANUAL", async () => {
    stubCarousel("NEWEST", "DRAFT");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(await screen.findByText(c.autoHeading)).toBeInTheDocument();

    await chooseSource("MANUAL");

    // The gate is on the LIVE value, so the operator sees the list before
    // saving — «список з'явиться одразу, без збереження».
    expect(
      await screen.findByPlaceholderText(c.searchPlaceholder),
    ).toBeInTheDocument();
    expect(screen.queryByText(c.autoHeading)).not.toBeInTheDocument();
  });
});

describe("EditCarouselView — «Зараз на сайті» (КР7)", () => {
  it("shows what the site shows now for a published automatic carousel", async () => {
    stubCarousel("BESTSELLING");
    server.use(
      http.get("*/api/carousels", () =>
        HttpResponse.json({
          data: [
            {
              id: carouselId,
              title: "Популярне",
              source: "BESTSELLING",
              placement: "HOME_RAILS",
              sortOrder: 0,
              products: [
                { id: "a", name: "Навушники AirPods", price: "10999.00" },
                { id: "b", name: "Чохол Spigen", price: "749.00" },
              ],
            },
          ],
        }),
      ),
    );
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(await screen.findByText(f.livePreview(2))).toBeInTheDocument();
    expect(screen.getByText("Навушники AirPods")).toBeInTheDocument();
    expect(screen.getByText(c.autoSwitchHint)).toBeInTheDocument();
  });
});

describe("EditCarouselView — the list saves with the one «Зберегти» (КР5/КР6)", () => {
  it("names «Товари каруселі» as unsaved and writes the list after the carousel", async () => {
    const writes = stubCarousel("MANUAL");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    await screen.findByText("iPhone 16 Pro 128");
    await userEvent.click(
      screen.getByRole("button", { name: c.removeAria("iPhone 16 Pro 128") }),
    );
    expect(
      screen.getByText(dict.canon.unsavedChanges(c.heading)),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.save }),
    );

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0].kind).toBe("carousel");
    expect(writes[1]).toEqual({
      kind: "items",
      body: { items: [{ productId: "p2", sortOrder: 0 }] },
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/carousels"));
  });

  it("«Скасувати зміни» brings the saved list back", async () => {
    stubCarousel("MANUAL");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    await screen.findByText("iPhone 16 Pro 128");
    await userEvent.click(
      screen.getByRole("button", { name: c.removeAria("iPhone 16 Pro 128") }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    expect(await screen.findByText("iPhone 16 Pro 128")).toBeInTheDocument();
  });

  it("does not rewrite an untouched list", async () => {
    const writes = stubCarousel("MANUAL");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    await screen.findByText("iPhone 16 Pro 128");
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.save }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/carousels"));
    expect(writes.map((w) => w.kind)).toEqual(["carousel"]);
  });
});

describe("EditCarouselView — header «⋯» (КР5)", () => {
  it("names the carousel and keeps «Дублювати» / «Видалити…» in «⋯»", async () => {
    stubCarousel("BESTSELLING", "DRAFT");
    const deleted: string[] = [];
    server.use(
      http.delete("*/api/admin/carousels/:id", ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(
      await screen.findByRole("heading", { name: "Популярне" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.registry.rowActionsAria("Популярне"),
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: dict.carousels.duplicate }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitem", { name: dict.carousels.deleteAction }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        dict.carousels.deleteDescriptionRail("Популярне"),
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: dict.carousels.deleteConfirmLabel,
      }),
    );

    await waitFor(() => expect(deleted).toEqual([carouselId]));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/carousels"));
  });
});
