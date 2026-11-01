import { createRef } from "react";
import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
import userEvent from "@testing-library/user-event";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
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
const p = dict.seriesPicker;

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
          {
            id: "m-1",
            name: "iPhone 15",
            slug: "i15",
            series: "iPhone 15",
            releaseYear: 2023,
            deviceBrandId: "b-1",
          },
          {
            id: "m-2",
            name: "iPhone 14",
            slug: "i14",
            series: "iPhone 14",
            releaseYear: 2022,
            deviceBrandId: "b-1",
          },
          {
            id: "m-3",
            name: "Galaxy S24",
            slug: "s24",
            series: "Galaxy S24",
            releaseYear: 2024,
            deviceBrandId: "b-2",
          },
        ],
      });
    }),
  );
  return queries;
}

describe("ProductDeviceCompatManager — by series (TASK-1955)", () => {
  it("asks for every model the endpoint can return, not its default 50", async () => {
    const queries = stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText(p.seriesAria("iPhone 15"));
    expect(queries[0]).toContain("limit=200");
  });

  it("narrows by the typed model name across brands", async () => {
    stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText(p.seriesAria("iPhone 15"));

    await userEvent.type(
      screen.getByRole("searchbox", { name: p.searchAria }),
      "s24",
    );
    // Another brand's model, found without switching the tab; its series opens.
    expect(screen.getByLabelText("Galaxy S24")).toBeInTheDocument();
    expect(screen.queryByLabelText(p.seriesAria("iPhone 15"))).toBeNull();
  });

  it("switches brands with the tabs", async () => {
    stubManyDevices();
    renderWithProviders(<ProductDeviceCompatManager productId={PRODUCT_ID} />);
    await screen.findByLabelText(p.seriesAria("iPhone 15"));

    await userEvent.click(screen.getByRole("radio", { name: /Samsung/ }));
    expect(
      screen.getByLabelText(p.seriesAria("Galaxy S24")),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(p.seriesAria("iPhone 15"))).toBeNull();
  });

  it("opens on the brand of the ticked model and summarises the selection", async () => {
    stubManyDevices();
    renderWithProviders(
      <ProductDeviceCompatManager
        productId={PRODUCT_ID}
        initialModelIds={["m-3"]}
      />,
    );
    // Samsung is active, and the series with a tick is open.
    expect(await screen.findByLabelText("Galaxy S24")).toBeChecked();
    expect(screen.getByText(p.summaryLead(1))).toBeInTheDocument();
    expect(
      screen.getByText(p.summaryWhole("Galaxy S24", 1)),
    ).toBeInTheDocument();
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

    await userEvent.click(screen.getByLabelText(p.seriesAria("iPhone 14")));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    act(() => controller.current?.discard());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByLabelText(p.seriesAria("iPhone 14"))).not.toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: /Samsung/ }));
    await userEvent.click(screen.getByLabelText(p.seriesAria("Galaxy S24")));
    await act(async () => {
      await controller.current?.save();
    });
    expect(bodies).toEqual([{ deviceModelIds: ["m-1", "m-3"] }]);
  });
});
