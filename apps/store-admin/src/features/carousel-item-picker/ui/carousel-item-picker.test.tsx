import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CarouselItemPicker } from "./carousel-item-picker";

const CAROUSEL_ID = "carousel-1";

interface ItemsPayload {
  items: { productId: string; sortOrder: number }[];
}

function makeItem(
  id: string,
  productId: string,
  name: string,
  sortOrder: number,
  isActive = true,
) {
  return {
    id,
    productId,
    sortOrder,
    product: { id: productId, name, imageUrl: null, price: "29.99", isActive },
  };
}

const twoItems = [
  makeItem("item-1", "product-1", "Чохол Alpha", 0),
  makeItem("item-2", "product-2", "Скло Beta", 1),
];

/** Stub the GET items read and capture every PUT full-replace payload. */
function stubItems(rows: ReturnType<typeof makeItem>[]) {
  const putBodies: ItemsPayload[] = [];
  server.use(
    http.get(`*/api/admin/carousels/${CAROUSEL_ID}/items`, () =>
      HttpResponse.json({ data: rows }),
    ),
    http.put(
      `*/api/admin/carousels/${CAROUSEL_ID}/items`,
      async ({ request }) => {
        putBodies.push((await request.json()) as ItemsPayload);
        return HttpResponse.json({ data: rows });
      },
    ),
  );
  return putBodies;
}

function stubProductSearch(products: { id: string; name: string }[]) {
  server.use(
    http.get("*/api/products/admin/list", () =>
      HttpResponse.json({
        data: products.map((p) => ({
          id: p.id,
          name: p.name,
          price: "19.99",
          isActive: true,
        })),
        meta: { total: products.length, page: 1, limit: 8, totalPages: 1 },
      }),
    ),
  );
}

describe("CarouselItemPicker", () => {
  it("renders the current items in order with an inactive badge where relevant", async () => {
    stubItems([
      makeItem("item-1", "product-1", "Чохол Alpha", 0),
      makeItem("item-2", "product-2", "Скло Beta", 1, false),
    ]);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);

    expect(await screen.findByText(/Чохол Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Скло Beta/)).toBeInTheDocument();
    expect(
      screen.getByText(dict.carouselItems.inactiveBadge),
    ).toBeInTheDocument();
  });

  it("shows the empty hint when the carousel has no items", async () => {
    stubItems([]);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);

    expect(
      await screen.findByText(dict.carouselItems.emptyHint),
    ).toBeInTheDocument();
  });

  it("search + add issues a full-replace PUT appending the product at the end", async () => {
    const putBodies = stubItems(twoItems);
    stubProductSearch([{ id: "product-3", name: "Кабель Gamma" }]);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);
    await screen.findByText(/Чохол Alpha/);

    await userEvent.type(
      screen.getByLabelText(dict.carouselItems.searchPlaceholder),
      "Гамма",
    );
    const addButton = await screen.findByRole("button", {
      name: new RegExp(dict.carouselItems.addLabel),
    });
    await userEvent.click(addButton);

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({
      items: [
        { productId: "product-1", sortOrder: 0 },
        { productId: "product-2", sortOrder: 1 },
        { productId: "product-3", sortOrder: 2 },
      ],
    });
  });

  it("remove issues a full-replace PUT without the removed product, re-indexed", async () => {
    const putBodies = stubItems(twoItems);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);
    await screen.findByText(/Чохол Alpha/);

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.carouselItems.removeAria("Чохол Alpha"),
      }),
    );

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({
      items: [{ productId: "product-2", sortOrder: 0 }],
    });
  });

  it("move-down issues a full-replace PUT with the two rows swapped", async () => {
    const putBodies = stubItems(twoItems);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);
    await screen.findByText(/Чохол Alpha/);

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.carouselItems.moveDownAria("Чохол Alpha"),
      }),
    );

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({
      items: [
        { productId: "product-2", sortOrder: 0 },
        { productId: "product-1", sortOrder: 1 },
      ],
    });
  });

  it("disables move-up on the first row and move-down on the last", async () => {
    stubItems(twoItems);

    renderWithProviders(<CarouselItemPicker carouselId={CAROUSEL_ID} />);
    await screen.findByText(/Чохол Alpha/);

    expect(
      screen.getByRole("button", {
        name: dict.carouselItems.moveUpAria("Чохол Alpha"),
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: dict.carouselItems.moveDownAria("Скло Beta"),
      }),
    ).toBeDisabled();
  });
});
