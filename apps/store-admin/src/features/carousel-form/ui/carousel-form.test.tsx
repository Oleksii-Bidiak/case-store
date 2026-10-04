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
import { CarouselForm, flattenCategoryTree } from "./carousel-form";

const f = dict.carouselForm;
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

// The required star is aria-hidden, so the title is found by its NAME.
const titleInput = () => screen.getByRole("textbox", { name: f.title });
const submitButton = () => screen.getByRole("button", { name: f.submit });
const sourceGroup = () => screen.getByRole("radiogroup", { name: f.source });
const placementGroup = () =>
  screen.getByRole("radiogroup", { name: f.placement });
const chooseSource = (value: keyof typeof f.sourceOptions) =>
  userEvent.click(
    within(sourceGroup()).getByRole("radio", { name: f.sourceOptions[value] }),
  );
const categorySelect = () => screen.getByRole("combobox", { name: f.category });

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

describe("CarouselForm — «Звідки товари» as cards (КР5/КР7)", () => {
  it("explains every source and hides the category select until CATEGORY", async () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    expect(
      within(sourceGroup()).getByRole("radio", {
        name: f.sourceOptions.BESTSELLING,
      }),
    ).toBeChecked();
    expect(
      within(sourceGroup()).getByText(f.sourceDescriptions.MANUAL),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: f.category }),
    ).not.toBeInTheDocument();

    await chooseSource("CATEGORY");

    // PARENT categories are offered too (subtree rollup happens server-side).
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Чохли" })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("option", { name: /iPhone Cases/ }),
    ).toBeInTheDocument();
    expect(categorySelect()).toBeInTheDocument();
  });

  it("counts with −/+ within 1…24 for an automatic source, and hides it for MANUAL", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    const limit = screen.getByRole("spinbutton", { name: f.itemLimit });
    expect(limit).toHaveValue(12);
    await userEvent.click(screen.getByRole("button", { name: f.stepUp }));
    expect(limit).toHaveValue(13);
    await userEvent.click(screen.getByRole("button", { name: f.stepDown }));
    await userEvent.click(screen.getByRole("button", { name: f.stepDown }));
    expect(limit).toHaveValue(11);
    expect(screen.getByText(f.itemLimitHint)).toBeInTheDocument();

    await userEvent.type(titleInput(), "Хіти");
    await userEvent.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ itemLimit: 11 });

    // «Вибрані вручну» shows every product added — the count does not apply.
    await chooseSource("MANUAL");
    expect(
      screen.queryByRole("spinbutton", { name: f.itemLimit }),
    ).not.toBeInTheDocument();
  });

  it("stops − at 1 and + at 24", async () => {
    stubAdminTree();
    renderWithProviders(
      <CarouselForm
        id="c1"
        defaultValues={{ title: "Хіти", itemLimit: "24" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: f.itemLimit })).toHaveValue(
        24,
      ),
    );
    expect(screen.getByRole("button", { name: f.stepUp })).toBeDisabled();
  });

  it("blocks submit with the categoryRequired error when CATEGORY has no category", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Аксесуари");
    await chooseSource("CATEGORY");
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(f.errors.categoryRequired),
    ).toBeInTheDocument();
    expect(screen.getByText(f.barErrors(1))).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed values for a valid CATEGORY carousel", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Чохли тижня");
    await chooseSource("CATEGORY");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Чохли" })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(categorySelect(), "cat-parent");
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Чохли тижня",
      source: "CATEGORY",
      categoryId: "cat-parent",
      itemLimit: 12,
      // No `sortOrder` — TASK-428 removed the field; the server appends the new
      // carousel to the end of its placement bucket.
      status: "DRAFT",
    });
  });

  it("submits the default placement", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Хіти");
    await userEvent.click(submitButton());

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

    await chooseSource("MANUAL");

    expect(await screen.findByTestId("items-panel")).toBeInTheDocument();
  });
});

describe("CarouselForm — «Місце на головній» (TASK-288, КР5)", () => {
  it("offers both placements as cards that say where they are", () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    expect(
      within(placementGroup()).getByRole("radio", {
        name: f.placementOptions.HOME_RAILS,
      }),
    ).toBeChecked();
    expect(
      within(placementGroup()).getByText(
        dict.carousels.placementWhere.HOME_TABS,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(f.placementHint)).toBeInTheDocument();
  });

  it("submits HOME_TABS once the admin picks the tab placement", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(<CarouselForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Новинки");
    await userEvent.click(
      within(placementGroup()).getByRole("radio", {
        name: f.placementOptions.HOME_TABS,
      }),
    );
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Новинки",
      placement: "HOME_TABS",
    });
  });

  it("seeds the placement from the edited carousel in edit mode", async () => {
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
      expect(
        screen.getByRole("radio", { name: f.placementOptions.HOME_TABS }),
      ).toBeChecked(),
    );
  });
});

describe("CarouselForm — «Публікація» and the sticky bar", () => {
  it("chooses the status from segments and asks for a date when SCHEDULED", async () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    const status = screen.getByRole("radiogroup", { name: f.status });
    expect(
      within(status).getByRole("radio", { name: f.statusDraft }),
    ).toBeChecked();
    expect(screen.queryByLabelText(f.scheduledAt)).not.toBeInTheDocument();

    await userEvent.click(
      within(status).getByRole("radio", { name: f.statusScheduled }),
    );
    expect(screen.getByLabelText(f.scheduledAt)).toHaveAttribute(
      "type",
      "datetime-local",
    );
  });

  it("says a new carousel is not saved yet", () => {
    stubAdminTree();
    renderWithProviders(<CarouselForm onSubmit={noop} isPending={false} />);

    expect(screen.getByText(f.barNew)).toBeInTheDocument();
  });

  it("names the host's unsaved items section and discards it too", async () => {
    stubAdminTree();
    const onDiscardExtra = jest.fn();
    renderWithProviders(
      <CarouselForm
        id="c1"
        defaultValues={{ title: "Редакція обирає", source: "MANUAL" }}
        onSubmit={noop}
        isPending={false}
        extraDirtySections={[dict.carouselItems.heading]}
        onDiscardExtra={onDiscardExtra}
      />,
    );

    expect(
      await screen.findByText(
        dict.canon.unsavedChanges(dict.carouselItems.heading),
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );
    expect(onDiscardExtra).toHaveBeenCalled();
  });
});
