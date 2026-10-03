import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SiteContactSettingsEntity } from "@/entities/site-contact";
import { SiteContactForm } from "./site-contact-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.siteContactForm;

function makeSettings(
  workingHours: string | null,
  overrides: Partial<SiteContactSettingsEntity> = {},
): SiteContactSettingsEntity {
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
    ...overrides,
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

/** A text field by its accessible name (the «*» of a required label is aria-hidden). */
const field = (name: string) => screen.getByRole("textbox", { name });
const openInput = (day: string) =>
  screen.getByLabelText(t.workingHoursOpenAria(day));
const closeInput = (day: string) =>
  screen.getByLabelText(t.workingHoursCloseAria(day));
/** TASK-1053: the day row is a switch «Працюємо / Вихідний» — ON = open. */
const daySwitch = (day: string) =>
  screen.getByRole("switch", { name: t.workingHoursOpenDayAria(day) });
const preview = () =>
  within(screen.getByRole("complementary", { name: t.previewHeading }));

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

    expect(daySwitch("Понеділок")).toBeChecked();
    expect(daySwitch("Неділя")).not.toBeChecked();
    // A day off has no time inputs to fill in.
    expect(
      screen.queryByLabelText(t.workingHoursOpenAria("Неділя")),
    ).not.toBeInTheDocument();

    // Live preview shows the canonical serialization.
    expect(preview().getByText(CANONICAL)).toBeInTheDocument();
  });

  it("updates the live preview when a day changes", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Субота"), { target: { value: "17:00" } });

    expect(
      preview().getByText("Пн–Пт: 9:00–18:00; Сб: 10:00–17:00; Нд: вихідний"),
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

  it("switching a day to «Вихідний» removes its times and reflects in the preview", async () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    await userEvent.click(daySwitch("Субота"));

    expect(daySwitch("Субота")).not.toBeChecked();
    expect(
      screen.queryByLabelText(t.workingHoursOpenAria("Субота")),
    ).not.toBeInTheDocument();
    expect(
      preview().getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });

  it("switching a day back on restores the hours it had", async () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    await userEvent.click(daySwitch("Субота"));
    await userEvent.click(daySwitch("Субота"));

    expect(daySwitch("Субота")).toBeChecked();
    expect(openInput("Субота")).toHaveValue("10:00");
    expect(closeInput("Субота")).toHaveValue("16:00");
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
      await userEvent.click(daySwitch(day));
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
    expect(daySwitch("Субота")).not.toBeChecked();
    expect(
      preview().getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });

  /** TASK-1053 (Н1): one click makes the working week uniform. */
  it("«Як у понеділок — на всі будні» copies Monday to Tuesday–Friday", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Понеділок"), { target: { value: "20:00" } });
    await userEvent.click(screen.getByRole("button", { name: t.copyMonday }));

    for (const day of ["Вівторок", "Середа", "Четвер", "Пʼятниця"]) {
      expect(openInput(day)).toHaveValue("09:00");
      expect(closeInput(day)).toHaveValue("20:00");
    }
    // The weekend is untouched.
    expect(closeInput("Субота")).toHaveValue("16:00");

    await submit();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      workingHours: "Пн–Пт: 9:00–20:00; Сб: 10:00–16:00; Нд: вихідний",
    });
  });
});

describe("SiteContactForm — legacy free-text working hours (TASK-221)", () => {
  const LEGACY = "Цілодобово, без вихідних";

  it("keeps unparseable text editable as raw text and submits it unchanged", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(LEGACY)} />);

    // Raw mode: the free-text input holds the owner's text; no day rows.
    const rawInput = field(t.workingHours);
    expect(rawInput).toHaveValue(LEGACY);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    // «Як у понеділок» has no Monday to copy in free text.
    expect(
      screen.queryByRole("button", { name: t.copyMonday }),
    ).not.toBeInTheDocument();
    expect(preview().getByText(LEGACY)).toBeInTheDocument();

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
    expect(daySwitch("Неділя")).not.toBeChecked();
    expect(
      preview().getByText("Пн–Пт: 9:00–18:00; Сб–Нд: вихідний"),
    ).toBeInTheDocument();
  });
});

describe("SiteContactForm — by mockup Н1 (TASK-1053)", () => {
  it("groups the fields into the three sections", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    for (const title of [
      t.sectionContact,
      t.workingHours,
      t.sectionMessengers,
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(field(t.viberLink)).toBeInTheDocument();
    expect(field(t.telegramLink)).toBeInTheDocument();
    expect(field(t.instagramLink)).toBeInTheDocument();
  });

  it("marks the support email and the phone as required and says so when blank", async () => {
    const bodies = stubUpdate();
    renderWithProviders(
      <SiteContactForm
        settings={makeSettings(CANONICAL, { email: null, phone: null })}
      />,
    );

    expect(field(t.email)).toBeRequired();
    expect(field(t.phone)).toBeRequired();
    await submit();

    expect(await screen.findByText(t.errors.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(t.errors.phoneRequired)).toBeInTheDocument();
    expect(field(t.email)).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("shows the phone format hint under the phone", () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    expect(field(t.phone)).toHaveAccessibleDescription(t.phoneHint);
  });

  it("previews the footer contacts live — email, phone, hours, filled messengers only", async () => {
    renderWithProviders(
      <SiteContactForm
        settings={makeSettings(CANONICAL, {
          telegramLink: "https://t.me/shop",
        })}
      />,
    );

    expect(preview().getByText("support@example.ua")).toBeInTheDocument();
    expect(preview().getByText("+380 44 000 0000")).toBeInTheDocument();
    expect(preview().getByText(/Telegram/)).toBeInTheDocument();
    expect(preview().queryByText(/Viber/)).not.toBeInTheDocument();
    expect(preview().getByText(t.previewEmptyMessengers)).toBeInTheDocument();

    const email = field(t.email);
    await userEvent.clear(email);
    await userEvent.type(email, "hello@shop.ua");

    expect(preview().getByText("hello@shop.ua")).toBeInTheDocument();
  });

  it("lists the edited sections in the sticky bar and discards them on «Скасувати зміни»", async () => {
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    expect(
      screen.queryByRole("button", { name: dict.canon.discardChanges }),
    ).not.toBeInTheDocument();

    fireEvent.change(closeInput("Субота"), { target: { value: "17:00" } });
    await userEvent.type(field(t.viberLink), "https://viber.me/x");

    expect(
      screen.getByText(
        dict.canon.unsavedChanges(`${t.dirtyHours}, ${t.dirtyMessengers}`),
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    expect(closeInput("Субота")).toHaveValue("16:00");
    expect(field(t.viberLink)).toHaveValue("");
    expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument();
  });

  it("is clean again after a successful save", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SiteContactForm settings={makeSettings(CANONICAL)} />);

    fireEvent.change(closeInput("Субота"), { target: { value: "17:00" } });
    expect(screen.getByText(/Незбережені зміни/)).toBeInTheDocument();
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument(),
    );
    // What was saved stays on screen.
    expect(closeInput("Субота")).toHaveValue("17:00");
  });
});
