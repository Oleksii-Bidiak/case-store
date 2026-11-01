import { useState } from "react";
import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { useProductBulkCompat } from "../model/use-product-bulk-compat";
import type { CompatRow } from "../model/preview";
import { BulkCompatDialog } from "./bulk-compat-dialog";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.bulkCompat;
const p = dict.seriesPicker;

const ROWS: CompatRow[] = [
  { id: "p1", compatibleDeviceModels: [] },
  { id: "p2", compatibleDeviceModels: [] },
  { id: "p3", compatibleDeviceModels: [{ id: "14", name: "iPhone 14" }] },
];

function stubModels() {
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
            id: "15p",
            name: "iPhone 15 Pro",
            series: "iPhone 15",
            releaseYear: 2023,
            deviceBrandId: "b-1",
          },
          {
            id: "15",
            name: "iPhone 15",
            series: "iPhone 15",
            releaseYear: 2023,
            deviceBrandId: "b-1",
          },
          {
            id: "14",
            name: "iPhone 14",
            series: "iPhone 14",
            releaseYear: 2022,
            deviceBrandId: "b-1",
          },
        ],
      }),
    ),
  );
}

function Harness({ rows = ROWS }: { rows?: CompatRow[] }) {
  const [open, setOpen] = useState(true);
  const bulk = useProductBulkCompat({ onSuccess: () => setOpen(false) });
  return (
    <>
      <BulkCompatDialog
        open={open}
        onOpenChange={setOpen}
        rows={rows}
        isPending={bulk.isPending}
        onConfirm={(change) =>
          bulk.run(
            rows.map((row) => row.id),
            change,
          )
        }
      />
      {bulk.confirmDialog}
    </>
  );
}

describe("BulkCompatDialog (TASK-1955)", () => {
  it("summarises the selection, previews an add of a whole series and sends it by name", async () => {
    stubModels();
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/admin/devices/compat/bulk", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          data: { updatedProducts: 3, added: 6, removed: 0 },
        });
      }),
    );

    renderWithProviders(<Harness />);

    expect(
      screen.getByRole("heading", { name: t.title(3) }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${t.currentLead} ${t.currentNone(2)}, ${t.currentGroup(1, "iPhone 14")}.`,
      ),
    ).toBeInTheDocument();

    const apply = screen.getByRole("button", { name: t.apply(3) });
    expect(apply).toBeDisabled();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: p.seriesAria("iPhone 15") }),
    );

    const preview = screen.getByTestId("bulk-compat-preview");
    expect(preview).toHaveTextContent(t.previewChanged(3));
    expect(preview).toHaveTextContent(
      t.previewAdd(2, t.wholeSeries("iPhone 15")),
    );
    expect(preview).toHaveTextContent(t.previewKeepOne("iPhone 14"));

    await userEvent.click(apply);

    await waitFor(() =>
      expect(bodies).toEqual([
        { productIds: ["p1", "p2", "p3"], mode: "add", series: ["iPhone 15"] },
      ]),
    );
    await waitFor(() =>
      expect((sonnerToast.success as jest.Mock).mock.calls[0]?.[0]).toBe(
        t.done(3),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: t.title(3) })).toBeNull(),
    );
  });

  it("removes single models by id and says when nothing would change", async () => {
    stubModels();
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/admin/devices/compat/bulk", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          data: { updatedProducts: 1, added: 0, removed: 1 },
        });
      }),
    );

    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: t.modeRemove }));

    // iPhone 15 Pro: no selected product has it — removing it changes nothing.
    await userEvent.click(
      await screen.findByRole("button", { name: /iPhone 15/ }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "iPhone 15 Pro" }),
    );
    expect(screen.getByTestId("bulk-compat-preview")).toHaveTextContent(
      t.previewNothing,
    );
    expect(screen.getByRole("button", { name: t.apply(3) })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "iPhone 15 Pro" }),
    );
    await userEvent.click(screen.getByLabelText(p.seriesAria("iPhone 14")));
    expect(screen.getByTestId("bulk-compat-preview")).toHaveTextContent(
      t.previewChanged(1),
    );
    await userEvent.click(screen.getByRole("button", { name: t.apply(3) }));

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          productIds: ["p1", "p2", "p3"],
          mode: "remove",
          series: ["iPhone 14"],
        },
      ]),
    );
  });

  it("asks before a replace and sends nothing on cancel", async () => {
    stubModels();
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/admin/devices/compat/bulk", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          data: { updatedProducts: 3, added: 3, removed: 1 },
        });
      }),
    );

    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: t.modeReplace }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: p.seriesAria("iPhone 15") }),
    );
    expect(screen.getByTestId("bulk-compat-preview")).toHaveTextContent(
      t.previewReplaceNote,
    );
    await userEvent.click(screen.getByRole("button", { name: t.apply(3) }));

    expect(await screen.findByText(t.replaceConfirm(3))).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );
    expect(bodies).toEqual([]);
  });
});
