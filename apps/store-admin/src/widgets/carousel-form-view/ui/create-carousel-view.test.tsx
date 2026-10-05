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
import { CreateCarouselView } from "./create-carousel-view";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

const c = dict.carouselItems;
const f = dict.carouselForm;

/**
 * КР8: «Вибрані вручну» shows the list straight away on a NEW carousel — the
 * list is built before the first save and written right after the carousel.
 */
describe("CreateCarouselView — the hand-picked list before the first save", () => {
  it("creates the carousel, then writes the list to the new id", async () => {
    const writes: { kind: string; url: string; body: unknown }[] = [];
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [
            {
              id: "p9",
              name: "Чохол Gamma",
              price: "749.00",
              stock: 3,
              isActive: true,
              primaryImage: null,
            },
          ],
          meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
        }),
      ),
      http.post("*/api/admin/carousels", async ({ request }) => {
        writes.push({
          kind: "create",
          url: request.url,
          body: await request.json(),
        });
        return HttpResponse.json({
          data: { id: "new-1", title: "Редакція обирає" },
        });
      }),
      http.put("*/api/admin/carousels/:id/items", async ({ request }) => {
        writes.push({
          kind: "items",
          url: request.url,
          body: await request.json(),
        });
        return HttpResponse.json({ data: [] });
      }),
    );
    renderWithProviders(<CreateCarouselView />);

    expect(
      screen.getByRole("heading", { name: dict.carousels.createHeading }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: f.title }),
      "Редакція обирає",
    );
    await userEvent.click(
      within(screen.getByRole("radiogroup", { name: f.source })).getByRole(
        "radio",
        { name: f.sourceOptions.MANUAL },
      ),
    );
    expect(screen.getByText(c.emptyHint)).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("searchbox", { name: c.searchPlaceholder }),
      "чохол",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: c.addLabel }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.carousels.createSubmit }),
    );

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toMatchObject({
      kind: "create",
      body: { title: "Редакція обирає", source: "MANUAL" },
    });
    expect(writes[1].url).toContain("/api/admin/carousels/new-1/items");
    expect(writes[1].body).toEqual({
      items: [{ productId: "p9", sortOrder: 0 }],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/carousels"));
  });
});
