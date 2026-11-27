import { delay, http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductPublishPanel } from "./product-publish-panel";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const ID = "product-1";
const p = dict.productPublish;

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

/** The panel's two reads; returns how often publish-state was asked. */
function stubReads(
  blockers: string[] = [],
  hiddenByCategory: { id: string; name: string } | null = null,
) {
  const hits = { state: 0 };
  server.use(
    http.get(`*/api/products/${ID}/images`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`*/api/products/${ID}/publish-state`, () => {
      hits.state += 1;
      return HttpResponse.json({ data: { blockers, hiddenByCategory } });
    }),
  );
  return hits;
}

const props = {
  productId: ID,
  isActive: false,
  name: "Чохол",
  categoryId: "cat-1",
  price: "299.00",
  stock: 5,
  description: "<p>Опис</p>",
  specCount: 1,
  compatCount: 1,
};

const publishButton = () => screen.getByRole("button", { name: p.publish });

describe("ProductPublishPanel — the server judges readiness (TASK-2573)", () => {
  it("keeps «Показати на сайті» off while the verdict is loading", async () => {
    server.use(
      http.get(`*/api/products/${ID}/images`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`*/api/products/${ID}/publish-state`, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<ProductPublishPanel {...props} />);
    expect(publishButton()).toBeDisabled();
    expect(screen.queryByText(p.readyHint)).not.toBeInTheDocument();
  });

  it("keeps it off and says so when the verdict fails to load", async () => {
    server.use(
      http.get(`*/api/products/${ID}/images`, () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(`*/api/products/${ID}/publish-state`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<ProductPublishPanel {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      p.stateLoadFailed,
    );
    expect(publishButton()).toBeDisabled();
  });

  it("marks exactly the server's blockers unmet", async () => {
    stubReads(["photo"]);
    renderWithProviders(<ProductPublishPanel {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("publish-check-name")).toHaveAttribute(
        "data-done",
        "true",
      ),
    );
    expect(screen.getByTestId("publish-check-photo")).toHaveAttribute(
      "data-done",
      "false",
    );
    expect(publishButton()).toBeDisabled();
  });

  it("enables publishing once the server lists no blockers", async () => {
    stubReads([]);
    renderWithProviders(<ProductPublishPanel {...props} />);
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(screen.getByText(p.readyHint)).toBeInTheDocument();
  });

  it("re-reads the verdict when the saved price changes", async () => {
    const hits = stubReads([]);
    const { rerender } = renderWithProviders(
      <ProductPublishPanel {...props} />,
    );
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(hits.state).toBe(1);

    rerender(<ProductPublishPanel {...props} price="0" />);
    await waitFor(() => expect(hits.state).toBe(2));
  });

  it("names the reasons when the server refuses with PRODUCT_NOT_READY", async () => {
    const hits = stubReads([]);
    server.use(
      http.patch(`*/api/products/${ID}/activate`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: "PRODUCT_NOT_READY",
            message: "Product is not ready to be shown",
            blockers: ["photo"],
          },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<ProductPublishPanel {...props} />);
    await waitFor(() => expect(publishButton()).toBeEnabled());

    await userEvent.click(publishButton());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        p.notShown(p.blockerReasons.photo),
      ),
    );
    await waitFor(() => expect(hits.state).toBe(2));
  });

  it("keeps the generic copy for any other failure", async () => {
    stubReads([]);
    server.use(
      http.patch(`*/api/products/${ID}/activate`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<ProductPublishPanel {...props} />);
    await waitFor(() => expect(publishButton()).toBeEnabled());

    await userEvent.click(publishButton());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(p.toastFailed));
  });
});

describe("ProductPublishPanel — a hidden category (TASK-2574)", () => {
  const live = { ...props, isActive: true };
  const categoryLink = (name: string) =>
    screen.findByRole("link", { name: p.hiddenByCategoryLinkAria(name) });

  it("says «Приховано» and names the product's own hidden category", async () => {
    stubReads([], { id: "cat-1", name: "Чохли" });
    renderWithProviders(<ProductPublishPanel {...live} />);

    const link = await categoryLink("Чохли");
    expect(link).toHaveAttribute("href", "/categories/cat-1/edit");
    expect(link.closest("p")).toHaveTextContent(
      `${p.hiddenByCategoryLive}«Чохли»${p.hiddenByCategoryTail}`,
    );
    expect(screen.getByText(p.draftBadge)).toBeInTheDocument();
    expect(screen.queryByText(p.liveBadge)).not.toBeInTheDocument();
    // A hidden category never blocks: the category check is about selection.
    expect(screen.getByTestId("publish-check-category")).toHaveAttribute(
      "data-done",
      "true",
    );
  });

  it("links the hidden ANCESTOR the server names", async () => {
    stubReads([], { id: "cat-root", name: "Аксесуари" });
    renderWithProviders(<ProductPublishPanel {...live} />);

    expect(await categoryLink("Аксесуари")).toHaveAttribute(
      "href",
      "/categories/cat-root/edit",
    );
    expect(screen.getByText(p.draftBadge)).toBeInTheDocument();
  });

  it("warns a hidden draft in one line that publishing alone will not show it", async () => {
    stubReads([], { id: "cat-1", name: "Чохли" });
    renderWithProviders(<ProductPublishPanel {...props} />);

    const link = await categoryLink("Чохли");
    expect(link.closest("p")).toHaveTextContent(
      `${p.hiddenByCategoryDraft}«Чохли»`,
    );
    expect(screen.getByText(p.draftBadge)).toBeInTheDocument();
    await waitFor(() => expect(publishButton()).toBeEnabled());
  });

  it("draws no line and says «Показується» when the category is on sale", async () => {
    stubReads([], null);
    renderWithProviders(<ProductPublishPanel {...live} />);

    expect(await screen.findByText(p.liveBadge)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: p.unpublish })).toBeEnabled(),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
