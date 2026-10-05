import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict, PAGE_CONTAINER } from "@/shared/config";
import Loading from "./loading";

/**
 * TASK-869 — the confirmation page draws the checkout stepper above its
 * `<Suspense>`, but `loading.tsx` drew the skeleton alone, so every block sat a
 * stepper's height too high and dropped when the page landed. The boundary now
 * stands in for the whole page: same container, the real stepper on step 3,
 * then a skeleton built on the page's 2/3 + 1/3 grid.
 */
describe("/orders/[id]/confirmation loading boundary (TASK-869)", () => {
  it("renders inside the page container", () => {
    const { container } = renderWithProviders(<Loading />);
    const root = container.firstElementChild as HTMLElement;
    for (const cls of PAGE_CONTAINER.split(" ")) {
      expect(root).toHaveClass(cls);
    }
    expect(root).toHaveClass("py-8");
  });

  it("shows the real stepper with the confirmation step current", () => {
    renderWithProviders(<Loading />);
    const stepper = screen.getByRole("list", {
      name: dict.checkout.progressAria,
    });
    const current = within(stepper)
      .getAllByRole("listitem")
      .find((li) => li.querySelector('[aria-current="step"]'));
    expect(current).toHaveTextContent(dict.checkout.stepConfirm);
  });

  it("lays the skeleton on the page's three-column grid, hidden from AT", () => {
    renderWithProviders(<Loading />);
    const skeleton = screen.getByTestId("order-confirmation-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    const grid = skeleton.querySelector(".lg\\:grid-cols-3");
    expect(grid).not.toBeNull();
    // 2/3 column for items, address and the CTA row; 1/3 aside for totals.
    expect(grid?.querySelector(".lg\\:col-span-2")).not.toBeNull();
    expect(grid?.querySelector(".lg\\:col-span-1")).not.toBeNull();
  });
});
