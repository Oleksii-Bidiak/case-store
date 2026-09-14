import { http, HttpResponse } from "msw";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  LIBRARY_ASSET_ALT,
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  pickFromLibrary,
  stubMediaLibrary,
} from "@/features/media-picker/model/media-picker.fixture";
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

describe("ProductImageManager — media library picker (TASK-441)", () => {
  /** Stub the attach route; collects the asset ids it was asked to attach. */
  function stubAttach(status = 201) {
    const attached: string[] = [];
    server.use(
      http.post(
        `*/api/products/${PRODUCT_ID}/images/attach`,
        async ({ request }) => {
          const body = (await request.json()) as { mediaAssetId: string };
          attached.push(body.mediaAssetId);
          if (status !== 201) return new HttpResponse(null, { status });
          return HttpResponse.json({
            data: {
              id: "img-1",
              url: `http://localhost:3001/uploads/media/${body.mediaAssetId}.webp`,
              alt: LIBRARY_ASSET_ALT,
              blurDataUrl: null,
              sortOrder: 0,
              isPrimary: true,
            },
          });
        },
      ),
    );
    return attached;
  }

  it("attaches the picked asset to THIS product's gallery", async () => {
    stubGallery();
    stubMediaLibrary([makeMediaAsset("m7", { alt: LIBRARY_ASSET_ALT })]);
    const attached = stubAttach();

    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    await pickFromLibrary();

    // The gallery is the one place a picked asset is not a URL in a field: it
    // needs a request, and that request must carry the ASSET ID, not a URL —
    // the server reads the file's details off the asset itself.
    await waitFor(() => expect(attached).toEqual(["m7"]));
  });

  it("uploads nothing when an existing asset is chosen", async () => {
    const uploads = stubGallery();
    stubMediaLibrary([makeMediaAsset("m7", { alt: LIBRARY_ASSET_ALT })]);
    stubAttach();

    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    await pickFromLibrary();

    // One file on disk, two rows pointing at it. A picker that re-posted the
    // bytes would grow the library by a duplicate on every reuse.
    await waitFor(() => expect(uploads).toHaveLength(0));
  });

  it("offers no picker before the product exists", () => {
    stubMediaLibrary();
    renderWithProviders(
      <ProductImageManager value={[]} onStage={jest.fn()} />,
      { auth: { permissions: MEDIA_PERMISSIONS } },
    );

    // STAGED mode on `/products/new`: there is no `:productId` to attach to, so
    // the panel says so instead of offering a button that would 404.
    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.trigger }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.mediaPicker.galleryNeedsProduct),
    ).toBeInTheDocument();
  });

  it("offers no picker to an operator with no media keys", () => {
    stubGallery();
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);

    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.trigger }),
    ).not.toBeInTheDocument();
    // The upload path they already had is untouched.
    expect(
      screen.getByRole("button", { name: dict.productImages.upload }),
    ).toBeInTheDocument();
  });
});

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

/** Two existing photos, so the per-image gallery controls actually render. */
const EXISTING_IMAGES = [
  {
    id: "img-1",
    url: "/uploads/1.webp",
    sortOrder: 0,
    isPrimary: true,
    alt: null,
  },
  {
    id: "img-2",
    url: "/uploads/2.webp",
    sortOrder: 1,
    isPrimary: false,
    alt: null,
  },
];

/**
 * Like `stubGallery`, but the upload of `holdFile` hangs until `release()` is
 * called. Without a held request there is no observable window in which a batch
 * is "still uploading", and the whole second-drop race is untestable.
 */
function stubGalleryHolding(holdFile: string) {
  const requests: string[][] = [];
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(`*/api/products/${PRODUCT_ID}/images`, () =>
      HttpResponse.json({ data: EXISTING_IMAGES }),
    ),
    http.post(`*/api/products/${PRODUCT_ID}/images`, async ({ request }) => {
      const form = await request.formData();
      const names = form
        .getAll("files")
        .map((file) => (file instanceof File ? file.name : String(file)));
      requests.push(names);
      if (names.includes(holdFile)) await held;
      return HttpResponse.json({ data: [] });
    }),
  );
  return { requests, release: () => release() };
}

describe("ProductImageManager — a second drop while the first is uploading", () => {
  it("joins the running queue and keeps every control disabled until all files settle", async () => {
    const { requests, release } = stubGalleryHolding("slow.png");
    renderWithProviders(<ProductImageManager productId={PRODUCT_ID} />);
    // Wait for the gallery, so the per-image controls exist to be asserted on.
    await screen.findAllByRole("button", {
      name: dict.productImages.deleteImage,
    });

    const clearQueue = () =>
      screen.getByRole("button", { name: dict.productImages.clearQueue });
    const deleteImage = () =>
      screen.getAllByRole("button", {
        name: dict.productImages.deleteImage,
      })[0];

    dropFiles([makeFile("slow.png")]);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(clearQueue()).toBeDisabled();
    expect(deleteImage()).toBeDisabled();

    // The second drop. The drop zone has no `busy` guard by design — it must
    // append to the queue the running loop is draining, not start its own.
    dropFiles([makeFile("second.png")]);
    expect(await screen.findByText("second.png")).toBeInTheDocument();

    // Long enough for a second, concurrent loop to have uploaded its one file
    // and cleared `isUploading` (MSW answers from memory). Nothing may be sent
    // while slow.png is in flight, «Очистити список» must stay disabled —
    // pressing it wipes the rows the running loop is still patching — and so
    // must delete, whose `reorder`/gallery view is still growing server-side.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(requests).toHaveLength(1);
    expect(clearQueue()).toBeDisabled();
    expect(deleteImage()).toBeDisabled();

    release();

    // The second batch is not dropped on the floor: the one loop picks it up.
    await waitFor(() =>
      expect(requests).toEqual([["slow.png"], ["second.png"]]),
    );
    await waitFor(() => expect(clearQueue()).toBeEnabled());
    expect(deleteImage()).toBeEnabled();
    // One summary for both drops — they were one upload to the operator.
    expect(
      screen.getByText(dict.productImages.queueProgress(2, 2)),
    ).toBeInTheDocument();
  });
});
