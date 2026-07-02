import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogView } from "./blog-view";

describe("BlogView", () => {
  it("renders the hero, the featured card and grid cards in the default view", () => {
    renderWithProviders(<BlogView />);

    expect(
      screen.getByRole("heading", { level: 1, name: dict.blog.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.blog.badge)).toBeInTheDocument();

    // Featured post (unfiltered view only).
    expect(
      screen.getByText("iPhone 16 проти iPhone 15: чи варто оновлюватись"),
    ).toBeInTheDocument();
    // A regular grid card.
    expect(
      screen.getByText("Як обрати бездротові навушники у 2026 році"),
    ).toBeInTheDocument();
  });

  it("filters to a single category and hides the featured card", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BlogView />);

    await user.click(screen.getByRole("button", { name: /Новини/ }));

    expect(screen.getByText(/Новинки червня/)).toBeInTheDocument();
    // Featured (a "compare" post) and a "guides" post are filtered out.
    expect(
      screen.queryByText("iPhone 16 проти iPhone 15: чи варто оновлюватись"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Як обрати бездротові навушники у 2026 році"),
    ).not.toBeInTheDocument();
  });

  it("searches by title and shows the empty state for no match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BlogView />);

    const search = screen.getByPlaceholderText(dict.blog.searchPlaceholder);

    await user.type(search, "павербанк");
    expect(
      screen.getByText("Скільки mAh потрібно саме вам: гайд по павербанках"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("iPhone 16 проти iPhone 15: чи варто оновлюватись"),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzzzzzz");
    expect(screen.getByText(dict.blog.emptyHeading)).toBeInTheDocument();
  });

  it("reveals more posts when 'load more' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BlogView />);

    // The last two posts are beyond the initial page of 9.
    expect(
      screen.queryByText("5 звичок, що збережуть батарею смартфона надовго"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: dict.blog.loadMore }));

    expect(
      screen.getByText("5 звичок, що збережуть батарею смартфона надовго"),
    ).toBeInTheDocument();
    // All posts shown → the load-more button is gone.
    expect(
      screen.queryByRole("button", { name: dict.blog.loadMore }),
    ).not.toBeInTheDocument();
  });
});
