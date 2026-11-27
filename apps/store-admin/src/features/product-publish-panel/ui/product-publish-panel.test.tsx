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
function stubReads(blockers: string[] = []) {
  const hits = { state: 0 };
  server.use(
    http.get(`*/api/products/${ID}/images`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`*/api/products/${ID}/publish-state`, () => {
      hits.state += 1;
      return HttpResponse.json({ data: { blockers, hiddenByCategory: null } });
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
