import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { PeriodBar } from "./PeriodBar";
import type { ReportPeriodSelection } from "../model/report-period";

/**
 * TASK-692 — the one period for all reports. The URL is the state (a preset is
 * written at once); «Довільно…» is a draft that only «Показати» writes, seeded
 * from the URL each time it opens (forms.md rule 1a).
 */

const d = dict.analytics;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

// Fixed days in the past of any clock this suite will run on.
const AUGUST: ReportPeriodSelection = {
  preset: "custom",
  from: "2026-08-01",
  to: "2026-08-31",
};
const THIRTY: ReportPeriodSelection = { preset: "30d", from: "", to: "" };

const period = {
  preset: "30d" as const,
  from: "2026-09-06",
  to: "2026-10-05",
  days: 30,
  previousFrom: "2026-08-07",
  previousTo: "2026-09-05",
  previousDays: 30,
};

const fromField = () => screen.getByLabelText(d.customFrom);
const toField = () => screen.getByLabelText(d.customTo);
const openCustom = () =>
  userEvent.click(screen.getByRole("button", { name: d.presetCustom }));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

describe("PeriodBar — presets", () => {
  it("marks the applied preset as pressed", () => {
    renderWithProviders(<PeriodBar selection={THIRTY} />);
    expect(screen.getByRole("button", { name: d.preset30d })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: d.preset7d })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("writes a preset to the URL the moment it is pressed", async () => {
    renderWithProviders(<PeriodBar selection={THIRTY} />);
    await userEvent.click(screen.getByRole("button", { name: d.preset7d }));
    expect(mockReplace).toHaveBeenCalledWith("/analytics?preset=7d");
  });

  it("drops a custom range, and the default preset, from the URL", async () => {
    renderWithProviders(<PeriodBar selection={AUGUST} />);
    await userEvent.click(screen.getByRole("button", { name: d.preset30d }));
    expect(mockReplace).toHaveBeenCalledWith("/analytics");
  });

  it("cleans an invalid link when its fallback preset is pressed", async () => {
    // `readReportPeriod` fell back to 30 days; the junk is still in the URL.
    mockSearchParams = new URLSearchParams(
      "preset=custom&from=2026-13-01&to=x",
    );
    renderWithProviders(<PeriodBar selection={THIRTY} />);
    const thirty = screen.getByRole("button", { name: d.preset30d });
    expect(thirty).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(thirty);
    expect(mockReplace).toHaveBeenCalledWith("/analytics");
  });
});

describe("PeriodBar — the label", () => {
  it("says the server's period and what it is compared with", () => {
    renderWithProviders(<PeriodBar selection={THIRTY} period={period} />);
    expect(
      screen.getByText("6 вересня — 5 жовтня 2026 · 30 днів"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.comparedWith("7 серпня — 5 вересня")),
    ).toBeInTheDocument();
  });

  it("draws no label of its own while the period is unknown", () => {
    const { container } = renderWithProviders(
      <PeriodBar selection={THIRTY} periodLoading />,
    );
    const label = container.querySelector('[data-slot="period-label"]');
    // Placeholders only — no range guessed on the client.
    expect(label).toHaveTextContent("");
    expect(label?.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });
});

describe("PeriodBar — «Довільно…»", () => {
  it("seeds the draft from the custom range in the URL", async () => {
    renderWithProviders(<PeriodBar selection={AUGUST} />);
    await openCustom();
    expect(
      screen.getByRole("dialog", { name: d.customTitle }),
    ).toBeInTheDocument();
    expect(fromField()).toHaveValue("2026-08-01");
    expect(toField()).toHaveValue("2026-08-31");
    // The hint names the comparison range: 31 days right before.
    expect(
      screen.getByText(d.customCompare(31, "01.07–31.07.2026"), {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("starts from the server's days when a preset is applied", async () => {
    renderWithProviders(<PeriodBar selection={THIRTY} period={period} />);
    await openCustom();
    expect(fromField()).toHaveValue("2026-09-06");
    expect(toField()).toHaveValue("2026-10-05");
  });

  it("cannot be opened on a preset before the server has said its days", async () => {
    const { rerender } = renderWithProviders(
      <PeriodBar selection={THIRTY} periodLoading />,
    );
    expect(screen.getByRole("button", { name: d.presetCustom })).toBeDisabled();

    rerender(<PeriodBar selection={THIRTY} period={period} />);
    await openCustom();
    expect(fromField()).toHaveValue("2026-09-06");
  });

  it("opens on a custom range at once — its days are in the URL", () => {
    renderWithProviders(<PeriodBar selection={AUGUST} periodLoading />);
    expect(
      screen.getByRole("button", { name: d.presetCustom }),
    ).not.toBeDisabled();
  });

  it("keeps the draft across a parent re-render", async () => {
    const { rerender } = renderWithProviders(<PeriodBar selection={AUGUST} />);
    await openCustom();
    fireEvent.change(fromField(), { target: { value: "2026-08-10" } });

    // The registrations query lands with the server's period: a new prop.
    rerender(<PeriodBar selection={AUGUST} period={period} />);

    expect(fromField()).toHaveValue("2026-08-10");
    expect(toField()).toHaveValue("2026-08-31");
  });

  it("throws the draft away on «Скасувати» and reseeds on the next open", async () => {
    renderWithProviders(<PeriodBar selection={AUGUST} />);
    await openCustom();
    fireEvent.change(fromField(), { target: { value: "2026-08-10" } });

    await userEvent.click(screen.getByRole("button", { name: d.customCancel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    await openCustom();
    expect(fromField()).toHaveValue("2026-08-01");
  });

  it("throws the draft away on Escape too", async () => {
    renderWithProviders(<PeriodBar selection={AUGUST} />);
    await openCustom();
    fireEvent.change(fromField(), { target: { value: "2026-08-10" } });

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openCustom();
    expect(fromField()).toHaveValue("2026-08-01");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("writes preset=custom with both days on «Показати»", async () => {
    renderWithProviders(<PeriodBar selection={THIRTY} />);
    await openCustom();
    fireEvent.change(fromField(), { target: { value: "2026-07-01" } });
    fireEvent.change(toField(), { target: { value: "2026-07-15" } });

    await userEvent.click(screen.getByRole("button", { name: d.customApply }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/analytics?preset=custom&from=2026-07-01&to=2026-07-15",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses a reversed range with a message, and writes nothing", async () => {
    renderWithProviders(<PeriodBar selection={AUGUST} />);
    await openCustom();
    fireEvent.change(fromField(), { target: { value: "2026-09-02" } });
    fireEvent.change(toField(), { target: { value: "2026-09-01" } });

    await userEvent.click(screen.getByRole("button", { name: d.customApply }));

    expect(screen.getByRole("alert")).toHaveTextContent(d.rangeErrorOrder);
    expect(fromField()).toHaveAttribute("aria-invalid", "true");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses an empty day", async () => {
    renderWithProviders(<PeriodBar selection={THIRTY} />);
    await openCustom();

    await userEvent.click(screen.getByRole("button", { name: d.customApply }));

    expect(screen.getByRole("alert")).toHaveTextContent(d.rangeErrorMissing);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
