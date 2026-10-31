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
      // The category tree is the part that used to disagree (then as the
      // chips row, since TASK-2011 the rail's «Категорія» panel) — wait until
      // the client has it, i.e. until the tree has arrived and been rendered.
      await expect(
        main.getByRole("navigation", { name: "Категорія", exact: true }),
      ).toBeVisible();
      // The count line under the H1 (Д3-2 Catalog §3), «N товарів».
      await expect(
        main.getByText(/^[\d\s]+ товар/).filter({ visible: true }),
      ).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});
