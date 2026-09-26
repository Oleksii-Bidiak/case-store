import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { InfoContactForm } from "./info-contact-form";

const d = dict.info;

/** Capture what the form puts on the wire. */
function captureSubmit(): { current: unknown } {
  const captured: { current: unknown } = { current: null };
  server.use(
    http.post("*/api/contact", async ({ request }) => {
      captured.current = await request.json();
      return HttpResponse.json({ data: { id: "contact-1" } }, { status: 201 });
    }),
  );
  return captured;
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { phone = "501112233" }: { phone?: string } = {},
) {
  await user.type(
    screen.getByRole("textbox", { name: d.formName }),
    "Олександр",
  );
  await user.type(screen.getByRole("textbox", { name: d.formPhone }), phone);
  await user.type(
    screen.getByRole("textbox", { name: d.formEmail }),
    "shopper@example.com",
  );
  await user.type(
    screen.getByRole("textbox", { name: d.formMessage }),
    "Питання про доставку",
  );
}

const submitButton = () => screen.getByRole("button", { name: d.formSubmit });

/**
 * TASK-744 — the compact form on `/info` validated the phone as a 5–32
 * character string while the API applies `@IsUaPhone()`, so `12345` passed the
 * client and came back as a 400 under the generic «Не вдалося надіслати».
 */
describe("InfoContactForm — phone (TASK-744)", () => {
  it("masks the phone as it is typed, like the /contact form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InfoContactForm />);

    await user.type(
      screen.getByRole("textbox", { name: d.formPhone }),
      "501112233",
    );

    expect(screen.getByRole("textbox", { name: d.formPhone })).toHaveValue(
      "+380 50 111 2233",
    );
  });

  it("refuses 12345 on the client, with the phone error, and sends nothing", async () => {
    let called = false;
    server.use(
      http.post("*/api/contact", () => {
        called = true;
        return HttpResponse.json({ data: { id: "x" } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InfoContactForm />);

    await fill(user, { phone: "12345" });
    await user.click(submitButton());

    expect(
      await screen.findByText(dict.contact.errors.phoneRequired),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: d.formPhone })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(called).toBe(false);
  });

  it("sends a valid number in the same shape /contact does", async () => {
    const captured = captureSubmit();
    const user = userEvent.setup();
    renderWithProviders(<InfoContactForm />);

    await fill(user);
    await user.click(submitButton());

    expect(await screen.findByText(d.formSent)).toBeInTheDocument();
    expect(captured.current).toMatchObject({ phone: "+380 50 111 2233" });
  });
});

describe("InfoContactForm — cooldown wait (TASK-762)", () => {
  it("names the REAL remaining minutes from the API", async () => {
    server.use(
      http.post("*/api/contact", () =>
        HttpResponse.json(
          {
            statusCode: 429,
            error: "CONTACT_COOLDOWN",
            message: "recent",
            retryAfterSeconds: 30,
          },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<InfoContactForm />);

    await fill(user);
    await user.click(submitButton());

    expect(
      await screen.findByText(dict.contact.errors.cooldownIn(1)),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.formError)).not.toBeInTheDocument();
  });
});
