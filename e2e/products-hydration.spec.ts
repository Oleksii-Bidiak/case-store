import { test, expect, type Page } from "./fixtures/test";

/**
 * `/products` hydrates without a mismatch (TASK-534, SF-UX-13).
 *
 * The first spec to open the catalogue with the console visible (TASK-410)
 * caught «Hydration failed»: the server rendered `ProductListView` with no
 * category tree (the chips row returns `null`), while the client — its query
 * cache already holding the tree the header had fetched by the time the
 * listing's Suspense boundary hydrated — rendered the chips row as the first
 * child where the server had put the toolbar. React then threw the whole
 * subtree away and re-rendered it on the client.
 *
 * Opening `/products` twice covers both orders: a cold visit (nothing cached)
 * and a soft reload after the tree has been fetched once in this context.
 */
function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  const isHydration = (text: string) =>
    /hydrat|did not match|server rendered HTML/i.test(text);
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (isHydration(text)) errors.push(text);
  });
  page.on("pageerror", (error) => {
    if (isHydration(error.message)) errors.push(error.message);
  });
  return errors;
}

test.describe("catalogue hydration", () => {
  test("/products renders the same tree on the server and the client", async ({
    page,
  }) => {
    const errors = collectHydrationErrors(page);

    for (let visit = 0; visit < 2; visit += 1) {
      await page.goto("/products");
      const main = page.getByRole("main");
      // The chips row is the part that used to disagree — wait until the
      // client has it, i.e. until the tree has arrived and been rendered.
      await expect(
        main.getByRole("group", { name: "Фільтр за категорією" }),
      ).toBeVisible();
      await expect(main.getByText(/Знайдено товарів: \d+/)).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});
