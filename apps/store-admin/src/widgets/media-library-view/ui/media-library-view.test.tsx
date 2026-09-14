/**
 * `MediaLibraryView` — the media library screen (TASK-441, plan 177).
 *
 * The cases below are the ones where this screen can quietly do the wrong thing:
 * what it ASKS the server for (a search that never leaves the browser looks
 * identical to a library with nothing in it), whether a dropped batch really
 * becomes one request per file in the order it was dropped, whether the
 * self-saving alt field survives its own save landing back in the cache, and
 * whether a refused delete tells the operator WHERE the picture is still used
 * instead of only that it failed.
 */

import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";
import { MediaLibraryView } from "./media-library-view";

const t = dict.mediaLibrary;

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// jsdom mounts no app router, and this screen both reads `?search=`/`?page=`
// and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/media",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

interface Usage {
  kind: string;
  entityId: string;
  label: string;
}

interface Asset {
  id: string;
  url: string;
  blurDataUrl: string | null;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  alt: string | null;
  tags: string[];
  uploadedById: string | null;
  usedInCount: number;
  createdAt: string;
  updatedAt: string;
}

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    url: `http://localhost:3001/uploads/media/${id}.webp`,
    blurDataUrl: null,
    width: 2000,
    height: 1333,
    bytes: 184320,
    mime: "image/webp",
    alt: null,
    tags: [],
    uploadedById: null,
    usedInCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * A small in-memory stand-in for the media API: the tests that delete or upload
 * need the NEXT list read to disagree with the first one, which a fixed fixture
 * cannot express.
 */
function stubMedia(initial: Asset[] = []) {
  const state = {
    assets: [...initial],
    /** Usage per asset id, as `GET /:id` reports it. */
    usage: {} as Record<string, Usage[]>,
    /** Status the next DELETE answers with. */
    deleteStatus: 204,
  };
  const listRequests: URL[] = [];
  const uploadedNames: string[] = [];
  const patches: { id: string; body: unknown }[] = [];

  const detailOf = (id: string) => {
    const asset = state.assets.find((one) => one.id === id);
    if (!asset) return null;
    return { ...asset, usedIn: state.usage[id] ?? [] };
  };

  server.use(
    http.get("*/api/admin/media", ({ request }) => {
      listRequests.push(new URL(request.url));
      return HttpResponse.json({
        data: state.assets,
        meta: {
          total: state.assets.length,
          page: 1,
          limit: 20,
          totalPages: Math.max(1, Math.ceil(state.assets.length / 20)),
        },
      });
    }),
    http.post("*/api/admin/media", async ({ request }) => {
      const form = await request.formData();
      const file = form.get("file");
      uploadedNames.push(file instanceof File ? file.name : String(file));
      const created = makeAsset(`up-${uploadedNames.length}`);
      state.assets = [created, ...state.assets];
      return HttpResponse.json({ data: { ...created, usedIn: [] } });
    }),
    http.get("*/api/admin/media/:id", ({ params }) => {
      const detail = detailOf(String(params.id));
      return detail
        ? HttpResponse.json({ data: detail })
        : new HttpResponse(null, { status: 404 });
    }),
    http.patch("*/api/admin/media/:id", async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as { alt?: string; tags?: string[] };
      patches.push({ id, body });
      state.assets = state.assets.map((asset) =>
        asset.id === id
          ? {
              ...asset,
              // The API stores "no alt text", not the empty string.
              alt:
                body.alt === undefined ? asset.alt : (body.alt ?? "") || null,
              tags: body.tags ?? asset.tags,
            }
          : asset,
      );
      return HttpResponse.json({ data: detailOf(id) });
    }),
    http.delete("*/api/admin/media/:id", ({ params }) => {
      const id = String(params.id);
      if (state.deleteStatus !== 204) {
        return HttpResponse.json(
          {
            statusCode: state.deleteStatus,
            message: "This image is still used in 1 place(s)",
          },
          { status: state.deleteStatus },
        );
      }
      state.assets = state.assets.filter((asset) => asset.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return { state, listRequests, uploadedNames, patches };
}

/** Render the library for a manager holding exactly `permissions`. */
function renderLibrary(
  permissions: string[] = [PERM.mediaRead, PERM.mediaWrite],
) {
  return renderWithProviders(
    <WithAuth isOwner={false} permissions={permissions}>
      <MediaLibraryView />
    </WithAuth>,
  );
}

/** Drop files onto the zone — `userEvent` has no drop helper. */
function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByTestId("media-drop-zone"), {
    dataTransfer: { files, items: [], types: ["Files"] },
  });
}

const makeFile = (name: string) =>
  new File(["png-bytes"], name, { type: "image/png" });

/** Open the card for `name` and wait for its detail to land. */
async function openCard(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: t.openCardAria(name) }),
  );
  return screen.findByRole("dialog");
}

describe("MediaLibraryView — the grid", () => {
  it("renders one card per asset, named by its alt text", async () => {
    stubMedia([
      makeAsset("a1", { alt: "Чохол MagSafe", usedInCount: 2 }),
      makeAsset("a2", { alt: "Банер літнього розпродажу", tags: ["банер"] }),
    ]);

    renderLibrary();

    expect(
      await screen.findByRole("button", {
        name: t.openCardAria("Чохол MagSafe"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: t.openCardAria("Банер літнього розпродажу"),
      }),
    ).toBeInTheDocument();
    // The badge is what tells an operator, before opening anything, which
    // pictures are safe to delete.
    expect(screen.getByText(t.usedInBadge(2))).toBeInTheDocument();
    expect(screen.getByText(t.unusedBadge)).toBeInTheDocument();
  });

  it("falls back to the file name when an asset has no alt text yet", async () => {
    stubMedia([makeAsset("a1")]);

    renderLibrary();

    // Freshly dropped photos have no alt on any of them; a grid of buttons all
    // named alike is unusable with a screen reader.
    expect(
      await screen.findByRole("button", { name: t.openCardAria("a1.webp") }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.noAlt)).toBeInTheDocument();
  });

  it("shows the empty state when the library holds nothing", async () => {
    stubMedia([]);

    renderLibrary();

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("distinguishes an empty library from a search that matched nothing", async () => {
    mockSearchParams = new URLSearchParams("search=нічого");
    stubMedia([]);

    renderLibrary();

    expect(
      await screen.findByText(dict.common.table.emptyFiltered),
    ).toBeInTheDocument();
    expect(screen.queryByText(t.empty)).not.toBeInTheDocument();
  });
});

describe("MediaLibraryView — search", () => {
  it("asks the API for the term the URL carries", async () => {
    mockSearchParams = new URLSearchParams("search=iphone");
    const { listRequests } = stubMedia([makeAsset("a1", { alt: "iPhone" })]);

    renderLibrary();

    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0].searchParams.get("search")).toBe("iphone");
    expect(listRequests[0].searchParams.get("page")).toBe("1");
    expect(listRequests[0].searchParams.get("limit")).toBe("20");
  });

  it("writes what the operator typed into the URL, resetting the page", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    stubMedia([makeAsset("a1")]);

    renderLibrary();

    await userEvent.type(
      await screen.findByRole("searchbox", { name: t.searchAria }),
      "банер",
    );

    // Debounced — the assertion waits it out rather than asserting per keystroke.
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    // Page 3 of the old result set holds rows the new one does not have.
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/media?search=%D0%B1%D0%B0%D0%BD%D0%B5%D1%80",
    );
  });
});

describe("MediaLibraryView — batch upload", () => {
  it("sends one request per dropped file, in the order they were dropped", async () => {
    const { uploadedNames } = stubMedia([]);

    renderLibrary();
    await screen.findByText(t.empty);

    dropFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);

    await waitFor(() => expect(uploadedNames).toHaveLength(3));
    // One file each — that is what buys a per-file outcome and a per-file retry.
    expect(uploadedNames).toEqual(["a.png", "b.png", "c.png"]);
    expect(await screen.findByText(t.queueProgress(3, 3))).toBeInTheDocument();
  });

  it("keeps the file picker as the keyboard path next to the drop zone", async () => {
    stubMedia([]);

    renderLibrary();

    // There is no keyboard equivalent to dragging a file off a desktop, so the
    // button must never be replaced by the zone.
    expect(
      await screen.findByRole("group", { name: t.dropZoneAria }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.upload })).toBeInTheDocument();
  });
});

describe("MediaLibraryView — editing alt text", () => {
  it("saves what was typed and survives the saved row landing back in the cache", async () => {
    const { patches } = stubMedia([makeAsset("a1")]);

    renderLibrary();
    const dialog = await openCard("a1.webp");

    const altInput = await within(dialog).findByLabelText(t.altLabel);
    await userEvent.type(altInput, "Чохол MagSafe");

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ id: "a1", body: { alt: "Чохол MagSafe" } });

    // The save writes the server's answer straight into the query cache, so the
    // field is re-rendered with a `value` that arrived asynchronously — the
    // exact moment a `key`-remount or an unguarded `useState` seed would throw
    // away focus and whatever was typed since.
    expect(await within(dialog).findByText(t.saved)).toBeInTheDocument();
    expect(altInput).toHaveValue("Чохол MagSafe");
    expect(altInput).toHaveFocus();

    // Still typing afterwards keeps working, against the same mounted input.
    await userEvent.type(altInput, ", чорний");
    expect(altInput).toHaveValue("Чохол MagSafe, чорний");
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].body).toEqual({ alt: "Чохол MagSafe, чорний" });
  });
});

describe("MediaLibraryView — editing tags", () => {
  it("collapses case-insensitive duplicates the way the API does", async () => {
    const { patches } = stubMedia([makeAsset("a1")]);

    renderLibrary();
    const dialog = await openCard("a1.webp");

    await userEvent.type(
      await within(dialog).findByLabelText(t.tagsLabel),
      "Банер, банер, iphone",
    );

    await waitFor(() => expect(patches).toHaveLength(1));
    // «Банер» and «банер» are one tag — a library where they are two is a
    // library whose filtering silently misses half the assets.
    expect(patches[0].body).toEqual({ tags: ["Банер", "iphone"] });
  });

  it("explains an over-long tag list instead of letting the API 400", async () => {
    const { patches } = stubMedia([makeAsset("a1")]);

    renderLibrary();
    const dialog = await openCard("a1.webp");

    const tagsInput = await within(dialog).findByLabelText(t.tagsLabel);
    // 21 tags — one past the cap the DTO enforces.
    fireEvent.change(tagsInput, {
      target: {
        value: Array.from({ length: 21 }, (_, i) => `тег${i}`).join(", "),
      },
    });
    fireEvent.blur(tagsInput);

    expect(await within(dialog).findByText(t.tagsInvalid)).toBeInTheDocument();
    // Nothing was sent: a rejected list is caught before it costs a request.
    expect(patches).toHaveLength(0);
  });
});

describe("MediaLibraryView — deleting", () => {
  it("removes the card once the API accepts the delete", async () => {
    stubMedia([makeAsset("a1", { alt: "Зайве фото" })]);

    renderLibrary();
    const dialog = await openCard("Зайве фото");

    expect(within(dialog).getByText(t.usageEmpty)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.delete }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.deleteConfirm }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: t.openCardAria("Зайве фото") }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("refuses to offer a delete for an asset that is already in use", async () => {
    const stub = stubMedia([
      makeAsset("a1", { alt: "Логотип", usedInCount: 1 }),
    ]);
    stub.state.usage.a1 = [
      { kind: "BRAND_LOGO", entityId: "b1", label: "Apple" },
    ];

    renderLibrary();
    const dialog = await openCard("Логотип");

    expect(
      await within(dialog).findByText(
        t.usageRow(dict.mediaLibrary.usageKinds.BRAND_LOGO, "Apple"),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: t.delete }),
    ).toBeDisabled();
    expect(within(dialog).getByText(t.deleteBlocked)).toBeInTheDocument();
  });

  it("names every place the picture is used when the API answers 409", async () => {
    const stub = stubMedia([makeAsset("a1", { alt: "Спільне фото" })]);
    // Nothing used it when the card opened…
    stub.state.deleteStatus = 409;

    renderLibrary();
    const dialog = await openCard("Спільне фото");
    await within(dialog).findByText(t.usageEmpty);

    // …and by the time the delete lands, someone has attached it twice.
    stub.state.usage.a1 = [
      { kind: "PRODUCT_IMAGE", entityId: "p1", label: "iPhone 16 Pro" },
      { kind: "BANNER_IMAGE", entityId: "n1", label: "Літній розпродаж" },
    ];

    await userEvent.click(
      within(dialog).getByRole("button", { name: t.delete }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.deleteConfirm }),
    );

    // The refusal is the LIST, not "не вдалося видалити".
    expect(
      await within(dialog).findByText(t.conflictHeading),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        t.usageRow(dict.mediaLibrary.usageKinds.PRODUCT_IMAGE, "iPhone 16 Pro"),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        t.usageRow(
          dict.mediaLibrary.usageKinds.BANNER_IMAGE,
          "Літній розпродаж",
        ),
      ),
    ).toBeInTheDocument();
    // Nothing was deleted, and the delete is now correctly refused: the confirm
    // step is dismissed and the button is disabled against the fresh usage.
    expect(
      within(dialog).queryByRole("button", { name: t.deleteConfirm }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: t.delete }),
    ).toBeDisabled();
  });
});

describe("MediaLibraryView — without media:write", () => {
  it("keeps the library readable but offers no upload and no delete", async () => {
    stubMedia([makeAsset("a1", { alt: "Чужий банер" })]);

    renderLibrary([PERM.mediaRead]);

    // Reading is the whole point of the read key.
    const card = await screen.findByRole("button", {
      name: t.openCardAria("Чужий банер"),
    });
    expect(screen.getByText(t.readOnlyHint)).toBeInTheDocument();

    // Nothing that writes.
    expect(screen.queryByTestId("media-drop-zone")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.upload }),
    ).not.toBeInTheDocument();

    await userEvent.click(card);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: t.delete }),
    ).not.toBeInTheDocument();
    // The metadata is visible, but read-only.
    expect(await within(dialog).findByLabelText(t.altLabel)).toBeDisabled();
  });
});
