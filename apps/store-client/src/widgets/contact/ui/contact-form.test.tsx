import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
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
