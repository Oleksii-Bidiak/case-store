import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductImageManager } from "./product-image-manager";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const makeFile = (name: string) =>
  new File(["png-bytes"], name, { type: "image/png" });

/**
 * Stub the gallery endpoints. `reject` names the files the API refuses with 413,
 * so a batch can contain one oversized photo among good ones — the case that used
 * to fail all twelve at once.
 */
function stubGallery({ reject = [] as string[] } = {}) {
  const requests: string[][] = [];
  server.use(
    http.get(`*/api/products/${PRODUCT_ID}/images`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.post(`*/api/products/${PRODUCT_ID}/images`, async ({ request }) => {
      const form = await request.formData();
      const names = form
        .getAll("files")
        .map((file) => (file instanceof File ? file.name : String(file)));
      requests.push(names);
      if (names.some((name) => reject.includes(name))) {
        return new HttpResponse(null, { status: 413 });
      }
      return HttpResponse.json({ data: [] });
    }),
  );
  return requests;
}

/** Drop files onto the zone — `userEvent` has no drop helper. */
function dropFiles(files: File[]) {
  const zone = screen.getByTestId("image-drop-zone");
  fireEvent.drop(zone, {
    dataTransfer: { files, items: [], types: ["Files"] },
  });
}

describe("ProductImageManager — drag-and-drop batch upload (TASK-424)", () => {
  it("renders a labelled drop zone alongside the picker button", () => {
    stubGallery();
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    expect(
      screen.getByRole("group", { name: dict.productImages.dropZoneAria }),
    ).toBeInTheDocument();
    // The button is the keyboard path and must not be replaced by the zone.
    expect(
      screen.getByRole("button", { name: dict.productImages.upload }),
    ).toBeInTheDocument();
  });

  it("uploads a dropped batch as one request per file, in order", async () => {
    const requests = stubGallery();
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    dropFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);

    await waitFor(() => expect(requests).toHaveLength(3));
    // One file each — that is what buys a per-file outcome and a per-file retry.
    expect(requests).toEqual([["a.png"], ["b.png"], ["c.png"]]);
    expect(
      await screen.findByText(dict.productImages.queueProgress(3, 3)),
    ).toBeInTheDocument();
  });

  it("fails only the oversized file and keeps the rest of the batch", async () => {
    const requests = stubGallery({ reject: ["big.png"] });
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    dropFiles([makeFile("ok.png"), makeFile("big.png")]);

    await waitFor(() => expect(requests).toHaveLength(2));
    // The reason is named, next to the file it belongs to.
    expect(
      await screen.findByText(dict.productImages.errorTooLarge),
    ).toBeInTheDocument();
    expect(screen.getByText("ok.png")).toBeInTheDocument();
    expect(screen.getByText("big.png")).toBeInTheDocument();
    // One done, two queued.
    expect(
      screen.getByText(dict.productImages.queueProgress(1, 2)),
    ).toBeInTheDocument();
  });

  it("retries only the failed file", async () => {
    const requests = stubGallery({ reject: ["big.png"] });
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    dropFiles([makeFile("ok.png"), makeFile("big.png")]);
    await waitFor(() => expect(requests).toHaveLength(2));

    await userEvent.click(
      screen.getByRole("button", { name: dict.productImages.retryAll }),
    );

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual(["big.png"]);
  });

  it("announces the finished batch to screen readers", async () => {
    stubGallery({ reject: ["big.png"] });
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    dropFiles([makeFile("ok.png"), makeFile("big.png")]);

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.productImages.announceAllDone(1, 1),
      ),
    );
  });
});
