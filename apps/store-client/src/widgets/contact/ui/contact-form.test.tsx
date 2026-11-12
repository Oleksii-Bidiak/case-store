import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ContactForm } from "./contact-form";

const d = dict.contact;

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: d.fieldName }),
    "Олександр",
  );
  await user.type(
    screen.getByRole("textbox", { name: d.fieldPhone }),
    "501112233",
  );
  await user.type(
    screen.getByRole("textbox", { name: d.fieldEmail }),
    "shopper@example.com",
  );
  await user.type(
    screen.getByRole("textbox", { name: d.fieldMessage }),
    "Питання про доставку",
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: d.submit }));
}

/** The per-email cooldown 429 as the API sends it since TASK-762. */
function cooldownResponse(retryAfterSeconds?: number) {
  return HttpResponse.json(
    {
      statusCode: 429,
      error: "CONTACT_COOLDOWN",
      message: "recent",
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    },
    {
      status: 429,
      headers:
        retryAfterSeconds !== undefined
          ? { "Retry-After": String(retryAfterSeconds) }
          : undefined,
    },
  );
}

describe("ContactForm — cooldown wait (TASK-762)", () => {
  it("names the REAL remaining minutes, rounded up", async () => {
    server.use(http.post("*/api/contact", () => cooldownResponse(61)));
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.cooldownIn(2))).toBeInTheDocument();
    expect(screen.queryByText(d.errors.cooldown)).not.toBeInTheDocument();
  });

  it("falls back to the fixed sentence when the API gives no figure", async () => {
    server.use(http.post("*/api/contact", () => cooldownResponse()));
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.cooldown)).toBeInTheDocument();
  });
});

/** Every field the shopper filled, as it should still read after a failure. */
function expectInputKept() {
  expect(screen.getByRole("textbox", { name: d.fieldName })).toHaveValue(
    "Олександр",
  );
  expect(screen.getByRole("textbox", { name: d.fieldPhone })).toHaveValue(
    "+380 50 111 2233",
  );
  expect(screen.getByRole("textbox", { name: d.fieldEmail })).toHaveValue(
    "shopper@example.com",
  );
  expect(screen.getByRole("textbox", { name: d.fieldMessage })).toHaveValue(
    "Питання про доставку",
  );
  expect(screen.getByRole("checkbox")).toBeChecked();
}

/**
 * TASK-764 — the existing suites only looked at the error TEXT. What matters to
 * the person who just typed a long message is that it is still there, and that
 * a failure is never dressed up as the «Дякуємо!» panel.
 */
describe("ContactForm — a failed submit keeps the form (TASK-764)", () => {
  it.each([
    ["the per-email cooldown", () => cooldownResponse(120)],
    [
      "the per-IP throttle",
      () =>
        HttpResponse.json(
          { statusCode: 429, message: "Too Many Requests" },
          { status: 429 },
        ),
    ],
  ])("keeps every field filled after a 429 from %s", async (_, respond) => {
    server.use(http.post("*/api/contact", respond));
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expectInputKept();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
  });

  it("stays on the form after a 500 — no success panel, input intact", async () => {
    server.use(
      http.post("*/api/contact", () =>
        HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.submitFailed)).toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
    expectInputKept();
    expect(screen.getByRole("button", { name: d.submit })).toBeEnabled();
  });

  it("stays on the form when the network fails outright", async () => {
    server.use(http.post("*/api/contact", () => HttpResponse.error()));
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.submitFailed)).toBeInTheDocument();
    expect(screen.queryByText(d.sentHeading)).not.toBeInTheDocument();
    expectInputKept();
  });
});

describe("ContactForm — consent link (TASK-866)", () => {
  it("links the consent to the privacy policy document, not the /legal hub", () => {
    renderWithProviders(<ContactForm />);

    expect(screen.getByRole("link", { name: d.consentLink })).toHaveAttribute(
      "href",
      "/legal/privacy-policy",
    );
  });
});

/** A DTO 400 as the global ValidationPipe sends it (TASK-1984). */
function validationResponse(
  fieldErrors: { field: string; constraint: string }[],
) {
  return HttpResponse.json(
    { statusCode: 400, message: ["refused"], fieldErrors },
    { status: 400 },
  );
}

/**
 * TASK-1984 (forms Rules 5–6): one rule per field on both ends, and a server
 * refusal under the field it is about — not the generic banner.
 */
describe("ContactForm — field standard (TASK-1984)", () => {
  it("puts a server 400 under the field it names, with no banner", async () => {
    server.use(
      http.post("*/api/contact", () =>
        validationResponse([{ field: "email", constraint: "isEmail" }]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    const email = screen.getByRole("textbox", { name: d.fieldEmail });
    expect(
      await screen.findByText(d.errors.emailInvalid, { selector: "p" }),
    ).toHaveAttribute("id", "contact-email-error");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(d.errors.emailInvalid);
    expect(screen.queryByText(d.errors.submitFailed)).not.toBeInTheDocument();
  });

  it("names the limit on a server maxLength, not the «required» text", async () => {
    server.use(
      http.post("*/api/contact", () =>
        validationResponse([{ field: "name", constraint: "maxLength" }]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(
      await screen.findByText(d.errors.nameMax, { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.errors.nameRequired)).not.toBeInTheDocument();
  });

  it("renders the order-reference error that used to block submit silently", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    const orderRef = screen.getByRole("textbox", { name: /Номер замовлення/ });
    expect(orderRef).toHaveAttribute("maxLength", "120");
    // Past the attribute (a paste or autofill can be): the rule still speaks.
    fireEvent.change(orderRef, { target: { value: "x".repeat(121) } });
    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.orderRefMax)).toHaveAttribute(
      "id",
      "contact-order-ref-error",
    );
    expect(orderRef).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the banner for a refusal no field takes (the honeypot)", async () => {
    server.use(
      http.post("*/api/contact", () =>
        validationResponse([{ field: "website", constraint: "maxLength" }]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContactForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText(d.errors.submitFailed)).toBeInTheDocument();
  });

  it("caps every input at its DTO limit", () => {
    renderWithProviders(<ContactForm />);

    expect(screen.getByRole("textbox", { name: d.fieldName })).toHaveAttribute(
      "maxLength",
      "120",
    );
    expect(screen.getByRole("textbox", { name: d.fieldEmail })).toHaveAttribute(
      "maxLength",
      "254",
    );
    expect(
      screen.getByRole("textbox", { name: d.fieldMessage }),
    ).toHaveAttribute("maxLength", "5000");
  });
});
