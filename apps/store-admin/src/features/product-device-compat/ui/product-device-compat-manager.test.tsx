import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
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
