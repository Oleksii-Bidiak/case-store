import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/entities/site-contact";
import { SiteContactForm } from "./site-contact-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.siteContactForm;

function makeSettings(workingHours: string | null): SiteContactSettingsEntity {
  return {
    id: "site-contact-singleton",
    email: "support@example.ua",
    phone: "+380 44 000 0000",
    workingHours,
    viberLink: null,
    telegramLink: null,
    instagramLink: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

/** Stub PUT /api/admin/site-contact and collect submitted bodies. */
function stubUpdate() {
  const bodies: unknown[] = [];
  server.use(
    http.put("*/api/admin/site-contact", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: makeSettings("whatever") });
    }),
  );
  return bodies;
}

const openInput = (day: string) =>
  screen.getByLabelText(t.workingHoursOpenAria(day));
const closeInput = (day: string) =>
  screen.getByLabelText(t.workingHoursCloseAria(day));
const closedToggle = (day: string) =>
  screen.getByRole("checkbox", { name: t.workingHoursClosedAria(day) });

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: t.submit }));

const CANONICAL = "Пн–Пт: 9:00–18:00; Сб: 10:00–16:00; Нд: вихідний";

describe("SiteContactForm — structured working-hours editor (TASK-221)", () => {
  it("seeds the per-day rows from a parseable stored string", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    expect(openInput("Понеділок")).toHaveValue("09:00");
    expect(closeInput("Понеділок")).toHaveValue("18:00");
    expect(openInput("Субота")).toHaveValue("10:00");
    expect(closeInput("Субота")).toHaveValue("16:00");

    expect(closedToggle("Неділя")).toBeChecked();
    expect(openInput("Неділя")).toBeDisabled();
    expect(closeInput("Неділя")).toBeDisabled();

    // Live preview shows the canonical serialization.
    expect(screen.getByText(CANONICAL)).toBeInTheDocument();
  });

  it("updates the live preview when a day changes", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Субота"), { target: { value: "17:00" } });

    expect(
      screen.getByText("Пн–Пт: 9:00–18:00; Сб: 10:00–17:00; Нд: вихідний"),
    ).toBeInTheDocument();
  });

  it("submits the serialized string after editing a day", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Субота"), { target: { value: "17:00" } });
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      workingHours: "Пн–Пт: 9:00–18:00; Сб: 10:00–17:00; Нд: вихідний",
    });
  });

  it("shows an inline row error and blocks submit when close ≤ open", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Понеділок"), { target: { value: "08:00" } });

    expect(
      screen.getByText(t.errors.workingHoursCloseAfterOpen),
    ).toBeInTheDocument();

    await submit();
    // The mutation must not fire while a row is invalid.
    await waitFor(() => expect(bodies).toHaveLength(0));
  });

  it("toggling «вихідний» disables the time inputs and reflects in the preview", async () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    await userEvent.click(closedToggle("Субота"));

    expect(closedToggle("Субота")).toBeChecked();
    expect(openInput("Субота")).toBeDisabled();
    expect(
      screen.getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });

  it("warns softly (but still allows submit) when every day is вихідний", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    for (const day of [
      "Понеділок",
      "Вівторок",
      "Середа",
      "Четвер",
      "Пʼятниця",
      "Субота",
    ]) {
      await userEvent.click(closedToggle(day));
    }

    expect(
      screen.getByText(t.workingHoursAllClosedWarning),
    ).toBeInTheDocument();

    await submit();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ workingHours: "Пн–Нд: вихідний" });
  });

  it("seeds the default schedule when no working hours are stored yet", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(null)} />);

    expect(openInput("Понеділок")).toHaveValue("09:00");
    expect(closedToggle("Субота")).toBeChecked();
    expect(
      screen.getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });
});

describe("SiteContactForm — legacy free-text working hours (TASK-221)", () => {
  const LEGACY = "Цілодобово, без вихідних";

  it("keeps unparseable text editable as raw text and submits it unchanged", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(LEGACY)} />);

    // Raw mode: the free-text input holds the owner's text; no day rows.
    const rawInput = screen.getByLabelText(t.workingHours);
    expect(rawInput).toHaveValue(LEGACY);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await submit();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ workingHours: LEGACY });
  });

  it("switches to the structured editor with the default schedule on demand", async () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(LEGACY)} />);

    await userEvent.click(
      screen.getByRole("button", { name: t.workingHoursSwitchToStructured }),
    );

    expect(openInput("Понеділок")).toHaveValue("09:00");
    expect(closedToggle("Неділя")).toBeChecked();
    expect(
      screen.getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });
});
