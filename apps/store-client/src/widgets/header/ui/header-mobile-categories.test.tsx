import { http, HttpResponse, delay } from "msw";
import { waitFor } from "@testing-library/react";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { HeaderMobileCategories } from "./header-mobile-categories";

/** Build a category tree node with sensible defaults; override per-test. */
function makeTreeNode(
  overrides: Partial<CategoryTreeNodeEntity> = {},
): CategoryTreeNodeEntity {
  return {
    id: "cat-1",
    name: "Смартфони",
    slug: "phones",
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    children: [],
    ...overrides,
  };
}

/** Two roots with children + one childless root. */
function makeTree(): CategoryTreeNodeEntity[] {
  return [
    makeTreeNode({
      children: [
        makeTreeNode({ id: "cat-1a", name: "Чохли", slug: "cases" }),
        makeTreeNode({ id: "cat-1b", name: "Скло", slug: "glass" }),
      ],
    }),
    makeTreeNode({
      id: "cat-2",
      name: "Аудіо",
      slug: "audio",
      sortOrder: 1,
      children: [
        makeTreeNode({ id: "cat-2a", name: "Навушники", slug: "headphones" }),
      ],
    }),
    makeTreeNode({ id: "cat-3", name: "Кабелі", slug: "cables", sortOrder: 2 }),
  ];
}

function setupTree(categories: CategoryTreeNodeEntity[]) {
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: categories }),
    ),
  );
}

/** The chevron disclosure button for a root category. */
function chevronFor(name: string) {
  return screen.getByRole("button", {
    name: dict.header.toggleSubcategoriesAria(name),
  });
}

describe("HeaderMobileCategories (TASK-082-B)", () => {
  it("renders root links and hides children by default", async () => {
    setupTree(makeTree());
    const onNavigate = jest.fn();
    renderWithProviders(<HeaderMobileCategories onNavigate={onNavigate} />);

    expect(
      await screen.findByRole("link", { name: "Смартфони" }),
    ).toHaveAttribute("href", "/categories/phones");
    expect(screen.getByRole("link", { name: "Аудіо" })).toBeInTheDocument();
    // Section heading is present; no child link is visible yet.
    expect(screen.getByText(dict.header.catalogButton)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Чохли" }),
    ).not.toBeInTheDocument();
    expect(chevronFor("Смартфони")).toHaveAttribute("aria-expanded", "false");
  });

  it("expands and collapses a root's children via its chevron without navigating", async () => {
    setupTree(makeTree());
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<HeaderMobileCategories onNavigate={onNavigate} />);
    await screen.findByRole("link", { name: "Смартфони" });

    await user.click(chevronFor("Смартфони"));
    expect(chevronFor("Смартфони")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/cases",
    );
    expect(screen.getByRole("link", { name: "Скло" })).toBeInTheDocument();
    // Only this root expanded; the chevron never navigates/closes the Sheet.
    expect(
      screen.queryByRole("link", { name: "Навушники" }),
    ).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    await user.click(chevronFor("Смартфони"));
    expect(chevronFor("Смартфони")).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "Чохли" }),
    ).not.toBeInTheDocument();
  });

  it("keeps two roots expanded independently at once", async () => {
    setupTree(makeTree());
    const user = userEvent.setup();
    renderWithProviders(<HeaderMobileCategories onNavigate={jest.fn()} />);
    await screen.findByRole("link", { name: "Смартфони" });

    await user.click(chevronFor("Смартфони"));
    await user.click(chevronFor("Аудіо"));

    expect(screen.getByRole("link", { name: "Чохли" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Навушники" })).toBeInTheDocument();
  });

  it("calls onNavigate from root and child links", async () => {
    setupTree(makeTree());
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<HeaderMobileCategories onNavigate={onNavigate} />);
    await screen.findByRole("link", { name: "Смартфони" });

    await user.click(screen.getByRole("link", { name: "Смартфони" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);

    await user.click(chevronFor("Аудіо"));
    await user.click(screen.getByRole("link", { name: "Навушники" }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("renders no chevron for a childless root", async () => {
    setupTree(makeTree());
    renderWithProviders(<HeaderMobileCategories onNavigate={jest.fn()} />);
    await screen.findByRole("link", { name: "Кабелі" });

    expect(
      screen.queryByRole("button", {
        name: dict.header.toggleSubcategoriesAria("Кабелі"),
      }),
    ).not.toBeInTheDocument();
  });

  it("shows skeleton rows while the tree is loading", () => {
    server.use(
      http.get("*/api/categories/tree", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    );
    renderWithProviders(<HeaderMobileCategories onNavigate={jest.fn()} />);

    // Skeletons live in an aria-hidden container — query the hidden tree.
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(5);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error state when the tree request fails", async () => {
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json(
          { error: "Internal", message: "boom", statusCode: 500 },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<HeaderMobileCategories onNavigate={jest.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.catalog.categoriesError,
    );
  });

  it("renders nothing when the tree is empty", async () => {
    setupTree([]);
    const { container } = renderWithProviders(
      <HeaderMobileCategories onNavigate={jest.fn()} />,
    );

    // Once the fetch settles the section renders nothing at all.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(
      screen.queryByText(dict.header.catalogButton),
    ).not.toBeInTheDocument();
  });
});
