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
import { DeviceBrandFormDialog } from "./device-brand-form-dialog";

const d = dict.devices;
const f = dict.deviceBrandForm;

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const APPLE = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Apple",
  slug: "apple",
  isActive: true,
  sortOrder: 0,
  modelCount: 28,
};

describe("DeviceBrandFormDialog (ПР6)", () => {
  it("edits a brand in a dialog: title, required name, slug hint, switch, models link", () => {
    renderWithProviders(
      <DeviceBrandFormDialog open onOpenChange={() => {}} brand={APPLE} />,
    );

    const dialog = screen.getByRole("dialog", {
      name: d.brandDialogTitle("Apple"),
    });
    const name = within(dialog).getByRole("textbox", { name: f.name });
    expect(name).toHaveValue("Apple");
    expect(name).toHaveAttribute("aria-required", "true");
    expect(within(dialog).getByText(f.slugHint)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", { name: f.active }),
    ).toBeChecked();
    expect(
      within(dialog).getByText(d.brandDialogModels(28)),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: d.brandDialogGoModels }),
    ).toHaveAttribute("href", `/devices/models?deviceBrandId=${APPLE.id}`);
    expect(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    ).toBeInTheDocument();
  });

  it("saves through PUT and closes", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.put(
        `*/api/admin/devices/brands/${APPLE.id}`,
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ data: APPLE });
        },
      ),
    );
    const onOpenChange = jest.fn();
    renderWithProviders(
      <DeviceBrandFormDialog open onOpenChange={onOpenChange} brand={APPLE} />,
    );

    await userEvent.click(screen.getByRole("switch", { name: f.active }));
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ name: "Apple", isActive: false });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("creates a new brand and shows the error under an empty name", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/admin/devices/brands", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: APPLE }, { status: 201 });
      }),
    );
    renderWithProviders(<DeviceBrandFormDialog open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: d.createBrandHeading });
    await userEvent.click(
      within(dialog).getByRole("button", { name: f.createSubmit }),
    );
    const name = within(dialog).getByRole("textbox", { name: f.name });
    expect(
      await within(dialog).findByText(f.errors.nameRequired),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);

    await userEvent.type(name, "Google");
    await userEvent.click(
      within(dialog).getByRole("button", { name: f.createSubmit }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ name: "Google" });
  });

  it("view-only: the values as text and nothing to save", () => {
    renderWithProviders(
      <DeviceBrandFormDialog
        open
        onOpenChange={() => {}}
        brand={APPLE}
        readOnly
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", { name: f.active }),
    ).toBeDisabled();
  });
});
