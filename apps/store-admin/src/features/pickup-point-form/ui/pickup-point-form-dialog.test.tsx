import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { AdminPickupPointDto } from "@/entities/delivery";
import { PickupPointFormDialog } from "./pickup-point-form-dialog";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.pickupPointForm;

const OBOLON: AdminPickupPointDto = {
  id: "p-obolon",
  name: "Магазин на Оболоні",
  city: "Київ",
  address: "просп. Оболонський, 1",
  phone: "+380 44 765 43 21",
  workingHours: "Щодня 10:00–21:00",
  mapUrl: null,
  isActive: true,
  sortOrder: 1,
  ordersCount: 12,
};

/**
 * The dialog as the settings page mounts it: INSIDE another `<form>`, whose
 * submit must never fire for a point saved here.
 */
function Harness({
  point,
  onOuterSubmit,
}: {
  point: AdminPickupPointDto | null;
  onOuterSubmit: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onOuterSubmit();
      }}
    >
      <PickupPointFormDialog open={open} onOpenChange={setOpen} point={point} />
    </form>
  );
}

function renderDialog(point: AdminPickupPointDto | null = null) {
  const onOuterSubmit = jest.fn();
  const result = renderWithProviders(
    <Harness point={point} onOuterSubmit={onOuterSubmit} />,
  );
  return { ...result, onOuterSubmit };
}

const field = (name: string | RegExp) =>
  within(screen.getByRole("dialog")).getByRole("textbox", { name });

describe("PickupPointFormDialog (TASK-645)", () => {
  it("creates a point with the typed values, blank optional fields as null", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/admin/pickup-points", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { ...OBOLON, id: "new" } });
      }),
    );
    const { onOuterSubmit } = renderDialog();

    expect(
      screen.getByRole("dialog", { name: t.createTitle }),
    ).toBeInTheDocument();
    await userEvent.type(field(t.name), "Склад на Лівому березі");
    await userEvent.type(field(t.city), "Київ");
    await userEvent.type(field(t.address), "вул. Причальна, 11");
    await userEvent.type(field(t.workingHours), "Пн–Пт 9:00–18:00");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      name: "Склад на Лівому березі",
      city: "Київ",
      address: "вул. Причальна, 11",
      phone: null,
      workingHours: "Пн–Пт 9:00–18:00",
      mapUrl: null,
      isActive: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });

  it("edits the point it was opened for and PUTs every field", async () => {
    const calls: { id: string; body: unknown }[] = [];
    server.use(
      http.put("*/api/admin/pickup-points/:id", async ({ request, params }) => {
        calls.push({ id: String(params.id), body: await request.json() });
        return HttpResponse.json({ data: OBOLON });
      }),
    );
    const { onOuterSubmit } = renderDialog(OBOLON);

    expect(
      screen.getByRole("dialog", { name: t.editTitle }),
    ).toBeInTheDocument();
    // Seeded by reset() on open, not by defaultValues.
    await waitFor(() => expect(field(t.name)).toHaveValue(OBOLON.name));
    expect(field(t.phone)).toHaveValue(OBOLON.phone);

    await userEvent.clear(field(t.phone));
    await userEvent.type(field(t.mapUrl), "https://maps.app.goo.gl/Obolon1");
    await userEvent.click(screen.getByRole("switch", { name: t.isActive }));
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      id: OBOLON.id,
      body: {
        name: OBOLON.name,
        city: OBOLON.city,
        address: OBOLON.address,
        phone: null,
        workingHours: OBOLON.workingHours,
        mapUrl: "https://maps.app.goo.gl/Obolon1",
        isActive: false,
      },
    });
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });

  it("blocks an incomplete point: says why, focuses the first field, sends nothing", async () => {
    let posts = 0;
    server.use(
      http.post("*/api/admin/pickup-points", () => {
        posts += 1;
        return HttpResponse.json({ data: OBOLON });
      }),
    );
    const { onOuterSubmit } = renderDialog();

    await userEvent.type(field(t.mapUrl), "maps.app.goo.gl/x");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByText(t.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(t.errors.cityRequired)).toBeInTheDocument();
    expect(screen.getByText(t.errors.addressRequired)).toBeInTheDocument();
    expect(screen.getByText(t.errors.mapUrlInvalid)).toBeInTheDocument();
    expect(field(t.name)).toHaveFocus();
    expect(field(t.name)).toHaveAttribute("aria-invalid", "true");
    expect(posts).toBe(0);
    expect(onOuterSubmit).not.toHaveBeenCalled();

    // Fixed → its message goes as it is typed (reValidateMode onChange).
    await userEvent.type(field(t.name), "Склад");
    expect(screen.queryByText(t.errors.nameRequired)).not.toBeInTheDocument();
  });

  it("keeps the dialog open when the save is refused", async () => {
    const { toast } = jest.requireMock("@/shared/ui/toast") as {
      toast: { error: jest.Mock };
    };
    server.use(
      http.put("*/api/admin/pickup-points/:id", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderDialog(OBOLON);
    await waitFor(() => expect(field(t.name)).toHaveValue(OBOLON.name));

    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(t.toastSaveFailed),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
