/**
 * TASK-442 — creating a product with its photos, specs, fitment and add-on
 * services in one go.
 *
 * Three things are worth a test here, and they are the three things that can
 * quietly stop being true:
 *
 *   1. STAGED mode really stages. Every panel below the form talks to an
 *      endpoint keyed by a product id, so the moment one of them forgets its
 *      `enabled: false` (or calls its mutation anyway) the create page starts
 *      firing requests at `/api/products/undefined/…`.
 *   2. The replay actually replays — all four areas, against the id the create
 *      response returned, photos one request per file and in order.
 *   3. A partial failure loses nothing and lies about nothing: the product
 *      stays, we land on its edit page, and the alert there names EXACTLY the
 *      pieces that failed — not the ones that worked.
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
import { dict } from "@/shared/config";
import { clearCreateCarryover } from "../model/create-carryover";
import { CreateProductView } from "./create-product-view";
import { EditProductView } from "./edit-product-view";

// next/navigation is unavailable under jsdom. Where the operator is sent after
// a create is part of what this suite asserts, so the mocks are stable.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const NEW_ID = "77777777-7777-4777-8777-777777777777";
const CATEGORY_ID = "3f0e8f9a-1111-4222-8333-444455556666";
const addonD = dict.products.addonDeltas;

const MATERIAL_DEF = {
  id: "def-material",
  categoryId: CATEGORY_ID,
  key: "material",
  label: "Матеріал",
  type: "TEXT",
  unit: null,
  options: [],
  isFilterable: true,
  sortOrder: 0,
};

const ADDON_CATALOG = [
  {
    id: "svc-setup",
    name: "Налаштування",
    description: null,
    price: "299.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

interface Recorded {
  creates: unknown[];
  /** File names per image request — one entry per POST. */
  images: string[][];
  specs: unknown[];
  compat: unknown[];
  addons: { addonServiceId: string; body: unknown }[];
}

interface ArrangeOptions {
  /** File names the image endpoint refuses with 413. */
  rejectImages?: string[];
  failSpecs?: boolean;
  failCompat?: boolean;
  /** Add-on service ids the delta endpoint refuses. */
  failAddons?: string[];
}

function arrange({
  rejectImages = [],
  failSpecs = false,
  failCompat = false,
  failAddons = [],
}: ArrangeOptions = {}): Recorded {
  const recorded: Recorded = {
    creates: [],
    images: [],
    specs: [],
    compat: [],
    addons: [],
  };

  server.use(
    // ── Reference data the form and the staged panels read (no product id) ──
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({
        data: [
          {
            id: CATEGORY_ID,
            name: "Чохли",
            slug: "chohly",
            description: null,
            image: null,
            isActive: true,
            sortOrder: 0,
            children: [],
          },
        ],
      }),
    ),
    http.get("*/api/product-groups", () => HttpResponse.json({ data: [] })),
    http.get("*/api/brands/admin/list", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    ),
    http.get(
      `*/api/categories/${CATEGORY_ID}/effective-attribute-definitions`,
      () => HttpResponse.json({ data: [MATERIAL_DEF] }),
    ),
    http.get("*/api/device-brands", () =>
      HttpResponse.json({
        data: [{ id: "brand-apple", name: "Apple", slug: "apple" }],
      }),
    ),
    http.get("*/api/device-models", () =>
      HttpResponse.json({
        data: [
          {
            id: "model-iphone-15",
            deviceBrandId: "brand-apple",
            name: "iPhone 15",
            slug: "iphone-15",
          },
        ],
      }),
    ),
    http.get("*/api/addon-services/admin/active", () =>
      HttpResponse.json({ data: ADDON_CATALOG }),
    ),

    // ── The writes the replay performs ─────────────────────────────────────
    http.post("*/api/products", async ({ request }) => {
      recorded.creates.push(await request.json());
      return HttpResponse.json({ data: { id: NEW_ID } });
    }),
    http.post(`*/api/products/${NEW_ID}/images`, async ({ request }) => {
      const form = await request.formData();
      const names = form
        .getAll("files")
        .map((file) => (file instanceof File ? file.name : String(file)));
      recorded.images.push(names);
      if (names.some((name) => rejectImages.includes(name))) {
        return new HttpResponse(null, { status: 413 });
      }
      return HttpResponse.json({ data: [] });
    }),
    http.put(`*/api/products/${NEW_ID}/specs`, async ({ request }) => {
      recorded.specs.push(await request.json());
      return failSpecs
        ? HttpResponse.json({}, { status: 500 })
        : HttpResponse.json({ data: {} });
    }),
    http.put(`*/api/products/${NEW_ID}/device-compat`, async ({ request }) => {
      recorded.compat.push(await request.json());
      return failCompat
        ? HttpResponse.json({}, { status: 500 })
        : HttpResponse.json({ data: {} });
    }),
    http.put(
      "*/api/addon-services/deltas/product/:productId/:addonServiceId",
      async ({ params, request }) => {
        const addonServiceId = params.addonServiceId as string;
        recorded.addons.push({ addonServiceId, body: await request.json() });
        return failAddons.includes(addonServiceId)
          ? HttpResponse.json({}, { status: 500 })
          : HttpResponse.json({ data: {} });
      },
    ),
  );

  return recorded;
}

const makeFile = (name: string) =>
  new File(["png-bytes"], name, { type: "image/png" });

/** Drop files onto the zone — `userEvent` has no drop helper. */
function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByTestId("image-drop-zone"), {
    dataTransfer: { files, items: [], types: ["Files"] },
  });
}

/** Name, price, category — everything zod insists on before a submit. */
async function fillRequiredFields() {
  await userEvent.type(
    screen.getByLabelText(dict.productForm.name),
    "Чохол MagSafe",
  );
  await userEvent.type(screen.getByLabelText(dict.productForm.price), "199");
  await userEvent.click(screen.getByLabelText(dict.productForm.category));
  await userEvent.click(await screen.findByRole("option", { name: "Чохли" }));
}

/** Put something into each of the four staged areas. */
async function stageEverything(files: File[]) {
  dropFiles(files);
  await userEvent.type(await screen.findByLabelText("Матеріал"), "Силікон");
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "iPhone 15" }),
  );
  await userEvent.click(
    screen.getByRole("combobox", { name: addonD.addPickerAria }),
  );
  await userEvent.click(
    await screen.findByRole("option", { name: "Налаштування" }),
  );
  await userEvent.click(screen.getByRole("button", { name: addonD.actionAdd }));
}

const submit = () =>
  userEvent.click(
    screen.getByRole("button", { name: dict.products.createSubmit }),
  );

/** The edit page the operator is handed over to. */
function stubEditPage() {
  server.use(
    http.get(`*/api/products/admin/${NEW_ID}`, () =>
      HttpResponse.json({
        data: {
          id: NEW_ID,
          name: "Чохол MagSafe",
          slug: "chohol-magsafe",
          description: null,
          price: "199.00",
          compareAtPrice: null,
          sku: null,
          stock: 0,
          reservedQty: 0,
          physicalQty: 0,
          categoryId: CATEGORY_ID,
          groupId: null,
          brand: null,
          attributes: {},
          positionOrder: 0,
          isActive: false,
          metaTitle: null,
          metaDescription: null,
          specs: [],
          compatibleDeviceModels: [],
          createdAt: "2026-09-14T09:00:00.000Z",
          updatedAt: "2026-09-14T09:00:00.000Z",
        },
      }),
    ),
    http.get(`*/api/products/${NEW_ID}/images`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`*/api/addon-services/resolved-for-product/${NEW_ID}`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`*/api/addon-services/deltas/product/${NEW_ID}`, () =>
      HttpResponse.json({ data: [] }),
    ),
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  clearCreateCarryover();
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("CreateProductView — staging before the product exists", () => {
  it("sends nothing to any product-keyed endpoint while there is no product", async () => {
    arrange();
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(`${request.method} ${new URL(request.url).pathname}`);
    });

    renderWithProviders(<CreateProductView />);
    await fillRequiredFields();
    await stageEverything([makeFile("a.png")]);

    // Everything the operator entered is on screen…
    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(await screen.findByLabelText("Матеріал")).toHaveValue("Силікон");
    expect(screen.getByRole("checkbox", { name: "iPhone 15" })).toBeChecked();
    expect(screen.getByText("Налаштування")).toBeInTheDocument();

    // …and none of it has been sent anywhere. No writes at all,
    const writes = seen.filter((line) => !line.startsWith("GET "));
    expect(writes).toEqual([]);
    // and not one read of an endpoint that would need an id we do not have.
    const productScoped = seen.filter((line) =>
      /\/(images|specs|device-compat)$|\/(deltas|resolved-for-product)\//.test(
        line,
      ),
    );
    expect(productScoped).toEqual([]);
  });
});

describe("CreateProductView — replaying the staged areas onto the new product", () => {
  it("creates the product, then places photos, specs, fitment and add-ons", async () => {
    const recorded = arrange();

    renderWithProviders(<CreateProductView />);
    await fillRequiredFields();
    await stageEverything([makeFile("a.png"), makeFile("b.png")]);
    await submit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/products/${NEW_ID}/edit`),
    );

    expect(recorded.creates).toHaveLength(1);
    // One request per file, in the order they were staged — the first photo is
    // the cover, so the order is not cosmetic.
    expect(recorded.images).toEqual([["a.png"], ["b.png"]]);
    expect(recorded.specs).toEqual([
      { specs: [{ definitionId: "def-material", value: "Силікон" }] },
    ]);
    expect(recorded.compat).toEqual([{ deviceModelIds: ["model-iphone-15"] }]);
    expect(recorded.addons).toEqual([
      { addonServiceId: "svc-setup", body: { type: "ADD" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith(dict.products.toastDraftCreated);
  });

  it("skips the areas the operator left empty", async () => {
    const recorded = arrange();

    renderWithProviders(<CreateProductView />);
    await fillRequiredFields();
    await submit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/products/${NEW_ID}/edit`),
    );
    expect(recorded.images).toEqual([]);
    expect(recorded.specs).toEqual([]);
    expect(recorded.compat).toEqual([]);
    expect(recorded.addons).toEqual([]);
  });

  it("keeps the operator on the form when the product itself cannot be created", async () => {
    arrange();
    server.use(
      http.post("*/api/products", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: ["Slug already in use"],
            error: "Bad Request",
          },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<CreateProductView />);
    await fillRequiredFields();
    await stageEverything([makeFile("a.png")]);
    await submit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Slug already in use"),
    );
    expect(mockPush).not.toHaveBeenCalled();
    // Nothing was staged away: the photo is still there to try again with.
    expect(screen.getByText("a.png")).toBeInTheDocument();
  });
});

/**
 * A partial failure rolls back NOTHING — the product exists and is hidden, which
 * is the part that matters. What is owed to the operator is an accurate list of
 * what to redo, on the page that can redo it.
 */
describe("CreateProductView — partial failure", () => {
  it("hands the edit page exactly the pieces that failed, and no others", async () => {
    const recorded = arrange({ rejectImages: ["b.png"], failSpecs: true });

    const created = renderWithProviders(<CreateProductView />);
    await fillRequiredFields();
    await stageEverything([makeFile("a.png"), makeFile("b.png")]);
    await submit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/products/${NEW_ID}/edit`),
    );
    // The two areas that did land were still written — a failure earlier in the
    // sequence must not abort the rest.
    expect(recorded.compat).toHaveLength(1);
    expect(recorded.addons).toHaveLength(1);
    // No "Чернетку створено" on top of a list of what did not save.
    expect(toastSuccess).not.toHaveBeenCalled();

    created.unmount();

    stubEditPage();
    renderWithProviders(
      <WithAuth isOwner>
        <EditProductView productId={NEW_ID} />
      </WithAuth>,
    );

    const carryover = dict.products.createCarryover;
    // Located by its heading, not by `getByRole("alert")`: the live-announcer
    // regions this page mounts are alerts too, and an empty one first in the
    // DOM would make every assertion below pass for the wrong reason.
    const alert = (await screen.findByText(carryover.heading)).closest(
      '[role="alert"]',
    ) as HTMLElement;
    expect(
      within(alert).getByText(carryover.images(["b.png"])),
    ).toBeInTheDocument();
    expect(within(alert).getByText(carryover.specs)).toBeInTheDocument();
    // Compatibility and the add-on landed, so neither may be named here.
    expect(within(alert).queryByText(carryover.compat)).not.toBeInTheDocument();
    expect(
      within(alert).queryByText(carryover.addons(["Налаштування"])),
    ).not.toBeInTheDocument();
  });

  it("shows no alert on an edit page reached any other way", async () => {
    arrange();
    stubEditPage();

    renderWithProviders(
      <WithAuth isOwner>
        <EditProductView productId={NEW_ID} />
      </WithAuth>,
    );

    await screen.findByLabelText(dict.productForm.slug);
    expect(
      screen.queryByText(dict.products.createCarryover.heading),
    ).not.toBeInTheDocument();
  });
});
