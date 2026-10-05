import type { ComponentType } from "react";
import { render } from "@/shared/test/render";
import { PAGE_CONTAINER } from "@/shared/config";
import AccountLoading from "./account/loading";
import AccountOrdersLoading from "./account/orders/loading";
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
 * padding (`/cart` pt-8, `/checkout` pt-7), so the skeleton does not start off
 * the real breadcrumb line. The account's is the shell's (see below).
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

/**
 * TASK-217 — the account routes render inside `app/account/layout.tsx`'s
 * AccountShell, which owns the container and the `pt-5.5 pb-16` padding (and
 * renders the frame's skeleton while the session loads). A loader under that
 * layout is the content column only: a container of its own would nest a second
 * 1320px shell inside the first.
 */
describe("loading.tsx under the account layout (TASK-217)", () => {
  it.each<[string, ComponentType]>([
    ["/account", AccountLoading],
    ["/account/orders", AccountOrdersLoading],
  ])("%s renders no page container", (_route, Loading) => {
    const { container } = render(<Loading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveClass("max-w-page", "mx-auto", "pt-5.5");
  });
});
