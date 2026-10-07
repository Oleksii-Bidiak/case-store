import { act, render, screen } from "@/shared/test/render";
import { toast } from "sonner";
import { Toaster } from "./sonner";

/**
 * TASK-1771 — the app-wide toaster opts into `clearMobileBar`, which binds
 * sonner's bottom offsets to the globals.css properties that grow by a mounted
 * fixed bottom bar below `md`. A toaster inside an overlay (the cart sheet's)
 * does not opt in and keeps sonner's own offsets. Sonner renders its list only
 * once a toast exists, so each test raises one and reads the list's inline
 * custom properties.
 */

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

async function toasterList(text: string) {
  act(() => {
    toast.success(text);
  });
  const item = await screen.findByText(text);
  const list = item.closest<HTMLElement>("[data-sonner-toaster]");
  expect(list).not.toBeNull();
  return list!;
}

describe("Toaster", () => {
  it("lifts the bottom offsets above a fixed bottom bar with clearMobileBar", async () => {
    render(<Toaster clearMobileBar />);
    const list = await toasterList("Прибрано 2 недоступні товари з кошика");

    expect(list.style.getPropertyValue("--offset-bottom")).toBe(
      "var(--toast-offset-bottom)",
    );
    expect(list.style.getPropertyValue("--mobile-offset-bottom")).toBe(
      "var(--toast-mobile-offset-bottom)",
    );
    // Only the bottom edge moves — the sides keep sonner's defaults, so the
    // bottom-centre toast is exactly as wide as before.
    expect(list.style.getPropertyValue("--offset-left")).toBe("24px");
    expect(list.style.getPropertyValue("--mobile-offset-left")).toBe("16px");
  });

  it("keeps sonner's own offsets without it (e.g. the cart sheet's toaster)", async () => {
    render(<Toaster id="sheet" />);
    act(() => {
      toast.success("Товар видалено", { toasterId: "sheet" });
    });
    const item = await screen.findByText("Товар видалено");
    const list = item.closest<HTMLElement>("[data-sonner-toaster]")!;

    expect(list.style.getPropertyValue("--offset-bottom")).toBe("24px");
    expect(list.style.getPropertyValue("--mobile-offset-bottom")).toBe("16px");
  });
});
