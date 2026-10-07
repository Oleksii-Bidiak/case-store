import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { RegistrationsReport } from "./RegistrationsReport";

/** TASK-692 — «Реєстрації»: two figures with their change, the daily run. */

const d = dict.analytics;
const QUERY = { preset: "30d" as const };

const stat = (label: string) =>
  screen.getByText(label).parentElement as HTMLElement;

describe("RegistrationsReport", () => {
  it("shows new accounts and former guests with their change and base", async () => {
    renderWithProviders(<RegistrationsReport query={QUERY} />);

    expect(await screen.findByText("48")).toBeInTheDocument();
    const fresh = stat(d.registrationsNew);
    expect(within(fresh).getByText("+20%")).toBeInTheDocument();
    expect(within(fresh).getByText(d.was("40"))).toBeInTheDocument();

    const guests = stat(d.registrationsFromGuest);
    expect(within(guests).getByText("11")).toBeInTheDocument();
    expect(within(guests).getByText(d.deltaFlat)).toBeInTheDocument();
    expect(within(guests).getByText(d.was("11"))).toBeInTheDocument();
  });

  it("describes the daily bars for a screen reader", async () => {
    renderWithProviders(<RegistrationsReport query={QUERY} />);
    expect(
      await screen.findByText(
        d.registrationsChartSummary(d.rangeDays(30), 48, 4),
      ),
    ).toBeInTheDocument();
  });
});
