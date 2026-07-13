import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CarouselForm, flattenCategoryTree } from "./carousel-form";

const noop = () => {};

function stubAdminTree() {
  server.use(
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({
        data: [
          {
            id: "cat-parent",
            name: "Чохли",
            slug: "cases",
            isActive: true,
            sortOrder: 0,
            children: [
              {
                id: "cat-child",
                name: "iPhone Cases",
                slug: "iphone-cases",
                isActive: true,
                sortOrder: 0,
                children: [],
              },
            ],
          },
        ],
      }),
    ),
  );
}

describe("flattenCategoryTree", () => {
  it("keeps EVERY node — parents included — unlike the leaf-only product-form helper", () => {
    const options = flattenCategoryTree([
      {
        id: "p",
        name: "Parent",
        children: [{ id: "c", name: "Child", children: [] }],
      },
    ] as never);

    expect(options).toEqual([
      { id: "p", name: "Parent", depth: 0 },
      { id: "c", name: "Child", depth: 1 },
    ]);
  });
});

describe("CarouselForm — conditional fields per source", () => {
  it("hides the category select for a rule source and shows it for CATEGORY", async () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    // Default source is BESTSELLING — no category select.
    expect(
      screen.queryByLabelText(dict.carouselForm.category),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "CATEGORY",
    );

    const categorySelect = await screen.findByLabelText(
      dict.carouselForm.category,
    );
    // PARENT categories are offered too (subtree rollup happens server-side).
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Чохли" })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("option", { name: /iPhone Cases/ }),
    ).toBeInTheDocument();
    expect(categorySelect).toBeInTheDocument();
  });

  it("keeps the item-limit field visible for MANUAL, labelled as ignored", async () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "MANUAL",
    );

    expect(
      screen.getByLabelText(dict.carouselForm.itemLimit),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carouselForm.itemLimitHint),
    ).toBeInTheDocument();
    // …and the category select stays hidden.
    expect(
      screen.queryByLabelText(dict.carouselForm.category),
    ).not.toBeInTheDocument();
  });

  it("blocks submit with the categoryRequired error when CATEGORY has no category", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.carouselForm.title),
      "Аксесуари",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "CATEGORY",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.carouselForm.submit }),
    );

    expect(
      await screen.findByText(dict.carouselForm.errors.categoryRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed values for a valid CATEGORY carousel", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.carouselForm.title),
      "Чохли тижня",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "CATEGORY",
    );
    const categorySelect = await screen.findByLabelText(
      dict.carouselForm.category,
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Чохли" })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(categorySelect, "cat-parent");
    await userEvent.click(
      screen.getByRole("button", { name: dict.carouselForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Чохли тижня",
      source: "CATEGORY",
      categoryId: "cat-parent",
      itemLimit: 12,
      sortOrder: 0,
      status: "DRAFT",
    });
  });

  it("submits parsed values for a valid CATEGORY carousel with the default placement", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.carouselForm.title),
      "Хіти",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.carouselForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Mirrors the API's CreateCarouselDto default.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      placement: "HOME_RAILS",
    });
  });

  it("renders the items slot with the LIVE source value", async () => {
    stubAdminTree();
    renderWithProviders(
      <CarouselForm
        onSubmit={noop}
        isPending={false}
        renderItemsSection={(source) =>
          source === "MANUAL" ? <div data-testid="items-panel" /> : null
        }
      />,
    );

    expect(screen.queryByTestId("items-panel")).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "MANUAL",
    );

    expect(await screen.findByTestId("items-panel")).toBeInTheDocument();
  });
});

describe("CarouselForm — placement (TASK-288)", () => {
  it("offers both placements and explains that sortOrder drives the tab order", async () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    const placementSelect = screen.getByLabelText(dict.carouselForm.placement);
    expect(placementSelect).toHaveValue("HOME_RAILS");
    expect(
      screen.getByRole("option", {
        name: dict.carouselForm.placementOptions.HOME_TABS,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: dict.carouselForm.placementOptions.HOME_RAILS,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carouselForm.placementHint),
    ).toBeInTheDocument();
  });

  it("submits HOME_TABS once the admin picks the tab placement", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.carouselForm.title),
      "Новинки",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.placement),
      "HOME_TABS",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.carouselForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Новинки",
      placement: "HOME_TABS",
    });
  });

  it("seeds the select from the edited carousel in edit mode", async () => {
    stubAdminTree();
    renderWithProviders(
      <CarouselForm
        id="carousel-1"
        defaultValues={{ title: "Хіти", placement: "HOME_TABS" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(dict.carouselForm.placement)).toHaveValue(
        "HOME_TABS",
      ),
    );
  });
});
