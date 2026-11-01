/**
 * `/devices` — the guest «Мої пристрої» page (TASK-2076): a static shell,
 * kept out of the index, that renders the client-only manager.
 */
import { renderWithProviders, screen } from "@/shared/test/render";
import MyDevicesPage, { metadata } from "./page";

describe("/devices", () => {
  it("is noindex but lets crawlers follow the links out", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("Мої пристрої");
  });

  it("renders the manager in the page shell, with its crumbs", () => {
    renderWithProviders(<MyDevicesPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Мої пристрої" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Навігаційний ланцюжок" }),
    ).toBeInTheDocument();
  });
});
