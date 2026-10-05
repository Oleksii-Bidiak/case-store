import { createRef } from "react";
import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
import userEvent from "@testing-library/user-event";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "@/shared/test/render";
import type { SectionSaveController } from "@/shared/lib/section-save";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductDeviceCompatManager } from "./product-device-compat-manager";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const PRODUCT_ID = "prod-1";

function stubDevices() {
  server.use(
    http.get("*/api/device-brands", () =>
      HttpResponse.json({
        data: [{ id: "b-1", name: "Apple", slug: "apple" }],
      }),
    ),
    http.get("*/api/device-models", () =>
      HttpResponse.json({
        data: [
          {
            id: "m-1",
            name: "iPhone 15",
            slug: "iphone-15",
            deviceBrandId: "b-1",
          },
        ],
      }),
    ),
  );
}

describe("ProductDeviceCompatManager — save button (TASK-726)", () => {
  it("labels the save button with the action, not the block title", async () => {
    stubDevices();
    const bodies: unknown[] = [];
    // Held open until the test lets it go, so the pending label can be seen.
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(
        `*/api/products/${PRODUCT_ID}/device-compat`,
        async ({ request }) => {
          bodies.push(await request.json());
          await released;
          return HttpResponse.json({ data: { deviceModelIds: ["m-1"] } });
        },
      ),
    );

    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);

    const save = await screen.findByRole("button", {
      name: dict.productCompat.save,
    });
    expect(save).toHaveTextContent("Зберегти сумісність");
    expect(
      screen.queryByRole("button", { name: dict.productCompat.title }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("iPhone 15"));
    await userEvent.click(save);

    // While the PUT is in flight the same button says what it is doing.
    expect(
      await screen.findByRole("button", { name: dict.common.saving }),
    ).toBeInTheDocument();
    await waitFor(() => expect(bodies).toEqual([{ deviceModelIds: ["m-1"] }]));

    release();

    await waitFor(() => expect(sonnerToast.success).toHaveBeenCalledTimes(1));
    expect((sonnerToast.success as jest.Mock).mock.calls[0][0]).toBe(
      dict.productCompat.toastSaved,
    );
    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: dict.productCompat.save }),
    ).toBeInTheDocument();
  });

  it("offers no save button in staged mode (no product yet)", async () => {
    stubDevices();

    renderWithProviders(<ProductDeviceCompatManager onStage={() => {}} />);

    expect(
      await screen.findByText(dict.productCompat.stagedHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.productCompat.save }),
    ).not.toBeInTheDocument();
  });
});

const c = dict.productCompat;

function stubManyDevices() {
  const queries: string[] = [];
  server.use(
    http.get("*/api/device-brands", () =>
      HttpResponse.json({
        data: [
          { id: "b-1", name: "Apple", slug: "apple" },
          { id: "b-2", name: "Samsung", slug: "samsung" },
        ],
      }),
    ),
    http.get("*/api/device-models", ({ request }) => {
      queries.push(new URL(request.url).search);
      return HttpResponse.json({
        data: [
          { id: "m-1", name: "iPhone 15", slug: "i15", deviceBrandId: "b-1" },
          { id: "m-2", name: "iPhone 14", slug: "i14", deviceBrandId: "b-1" },
          { id: "m-3", name: "Galaxy S24", slug: "s24", deviceBrandId: "b-2" },
        ],
      });
    }),
  );
  return queries;
}

describe("ProductDeviceCompatManager — search, brands, «Лише вибрані» (TASK-1050, Ф3)", () => {
  it("asks for every model the endpoint can return, not its default 50", async () => {
    const queries = stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText("iPhone 15");
    expect(queries[0]).toContain("limit=200");
  });

  it("narrows by the typed model name across brands", async () => {
    stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText("iPhone 15");

    await userEvent.type(
      screen.getByRole("searchbox", { name: c.searchAria }),
      "15",
    );
    expect(screen.getByLabelText("iPhone 15")).toBeInTheDocument();
    expect(screen.queryByLabelText("iPhone 14")).toBeNull();
    expect(screen.queryByLabelText("Galaxy S24")).toBeNull();
  });

  it("filters by a brand pill, with counts, and back to all", async () => {
    stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText("iPhone 15");

    const brands = screen.getByRole("group", { name: c.brandFilterAria });
    await userEvent.click(
      within(brands).getByRole("button", { name: /Samsung/ }),
    );
    expect(screen.getByLabelText("Galaxy S24")).toBeInTheDocument();
    expect(screen.queryByLabelText("iPhone 15")).toBeNull();

    await userEvent.click(
      within(brands).getByRole("button", { name: c.allBrands(3) }),
    );
    expect(screen.getByLabelText("iPhone 15")).toBeInTheDocument();
  });

  it("«Лише вибрані» leaves only the ticked models, and the badge counts them", async () => {
    stubManyDevices();
    renderWithProviders(
      <ProductDeviceCompatManager
        productId={PRODUCT_ID}
        initialModelIds={["m-3"]}
      />,
    );
    await screen.findByLabelText("iPhone 15");
    expect(screen.getByText(c.selectedCount(1))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: c.onlySelected }));
    expect(screen.getByLabelText("Galaxy S24")).toBeChecked();
    expect(screen.queryByLabelText("iPhone 15")).toBeNull();
  });

  it("under the form's one «Зберегти»: no own button, reports dirty, saves on command", async () => {
    stubManyDevices();
    const bodies: unknown[] = [];
    server.use(
      http.put(
        `*/api/products/${PRODUCT_ID}/device-compat`,
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ data: { deviceModelIds: [] } });
        },
      ),
    );
    const controller = createRef<SectionSaveController>();
    const onDirtyChange = jest.fn();
    renderWithProviders(
      <ProductDeviceCompatManager
        productId={PRODUCT_ID}
        initialModelIds={["m-1"]}
        controllerRef={controller}
        onDirtyChange={onDirtyChange}
      />,
    );
    await screen.findByLabelText("iPhone 15");
    expect(screen.queryByRole("button", { name: c.save })).toBeNull();

    await userEvent.click(screen.getByLabelText("iPhone 14"));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    act(() => controller.current?.discard());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByLabelText("iPhone 14")).not.toBeChecked();

    await userEvent.click(screen.getByLabelText("Galaxy S24"));
    await act(async () => {
      await controller.current?.save();
    });
    expect(bodies).toEqual([{ deviceModelIds: ["m-1", "m-3"] }]);
  });
});
