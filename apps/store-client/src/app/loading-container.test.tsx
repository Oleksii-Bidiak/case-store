import type { ComponentType } from "react";
import { render } from "@/shared/test/render";
import { PAGE_CONTAINER } from "@/shared/config";
import AccountLoading from "./account/loading";
import CartLoading from "./cart/loading";
import CheckoutLoading from "./checkout/loading";
import OrdersLoading from "./orders/loading";
import ConfirmationLoading from "./orders/[id]/confirmation/loading";
import ProductsLoading from "./products/(catalog)/loading";
import ProductLoading from "./products/[slug]/loading";

/**
 * TASK-860 — every route-level `loading.tsx` renders inside the same
 * `PAGE_CONTAINER` as its page, so the skeleton does not sit at a different
 * width and snap sideways when the page lands. The confirmation skeleton used
 * to render with no container at all.
 */
const LOADERS: Array<[string, ComponentType]> = [
  ["/account", AccountLoading],
  ["/cart", CartLoading],
  ["/checkout", CheckoutLoading],
  ["/orders", OrdersLoading],
  ["/orders/[id]/confirmation", ConfirmationLoading],
  ["/products", ProductsLoading],
  ["/products/[slug]", ProductLoading],
];

describe("loading.tsx page container (TASK-860)", () => {
  it.each(LOADERS)("%s renders inside PAGE_CONTAINER", (_route, Loading) => {
    const { container } = render(<Loading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass(...PAGE_CONTAINER.split(" "));
  });
});

/**
 * TASK-869 — the cart and checkout loaders also take their page's vertical
 * padding (`/cart` pt-8, `/checkout` pt-7), so the skeleton does not start
 * 4px off the real breadcrumb line.
 */
describe("loading.tsx page padding (TASK-869)", () => {
  it.each<[string, ComponentType, string[]]>([
    ["/cart", CartLoading, ["pt-8", "pb-16"]],
    ["/checkout", CheckoutLoading, ["pt-7", "pb-16"]],
  ])("%s matches its page's padding", (_route, Loading, padding) => {
    const { container } = render(<Loading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass(...padding);
    expect(root).not.toHaveClass("py-8");
  });
});
