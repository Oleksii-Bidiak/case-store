import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { NewsletterSubscribeForm } from "./newsletter-subscribe-form";

const SUBSCRIBE_URL = "*/api/newsletter/subscribe";

describe("NewsletterSubscribeForm", () => {
  it("subscribes a valid email and shows the success message (with source)", async () => {
    const user = userEvent.setup();
    let sentBody: { email: string; source?: string } | null = null;
    server.use(
      http.post(SUBSCRIBE_URL, async ({ request }) => {
        sentBody = (await request.json()) as { email: string; source?: string };
        return HttpResponse.json({ data: { subscribed: true } });
      }),
    );

    renderWithProviders(<NewsletterSubscribeForm source="home" />);

    await user.type(
      screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
      "Shopper@Example.com",
    );
    await user.click(
      screen.getByRole("button", { name: dict.newsletterForm.submit }),
    );

    expect(
      await screen.findByText(dict.newsletterForm.success),
    ).toBeInTheDocument();
    // Email normalized (lowercased) and the source tag forwarded to the API.
    await waitFor(() => expect(sentBody).not.toBeNull());
    expect(sentBody).toEqual({ email: "shopper@example.com", source: "home" });
  });

  it("still shows success on a repeat subscribe (idempotent backend)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post(SUBSCRIBE_URL, () => {
        calls += 1;
        return HttpResponse.json({ data: { subscribed: true } });
      }),
    );

    renderWithProviders(<NewsletterSubscribeForm source="home" />);
    const input = screen.getByRole("textbox", {
      name: dict.newsletterForm.emailLabel,
    });
    const submit = screen.getByRole("button", {
      name: dict.newsletterForm.submit,
    });

    await user.type(input, "again@example.com");
    await user.click(submit);
    expect(
      await screen.findByText(dict.newsletterForm.success),
    ).toBeInTheDocument();

    await user.type(input, "again@example.com");
    await user.click(submit);

    await waitFor(() => expect(calls).toBe(2));
    expect(screen.getByText(dict.newsletterForm.success)).toBeInTheDocument();
  });

  it("validates the email client-side before hitting the API", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(SUBSCRIBE_URL, () => {
        called = true;
        return HttpResponse.json({ data: { subscribed: true } });
      }),
    );

    renderWithProviders(<NewsletterSubscribeForm />);

    await user.type(
      screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
      "not-an-email",
    );
    await user.click(
      screen.getByRole("button", { name: dict.newsletterForm.submit }),
    );

    expect(
      await screen.findByText(dict.newsletterForm.invalidEmail),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("surfaces the rate-limit message on a 429", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(SUBSCRIBE_URL, () =>
        HttpResponse.json(
          { message: "Too many requests", statusCode: 429 },
          { status: 429 },
        ),
      ),
    );

    renderWithProviders(<NewsletterSubscribeForm />);

    await user.type(
      screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
      "shopper@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: dict.newsletterForm.submit }),
    );

    expect(
      await screen.findByText(dict.newsletterForm.rateLimited),
    ).toBeInTheDocument();
  });

  // ── TASK-261: newsletter_subscribe analytics ───────────────────────────────
  describe("newsletter_subscribe analytics", () => {
    afterEach(() => {
      delete window.umami;
    });

    it("reports newsletter_subscribe with the source after a successful subscribe", async () => {
      const track = jest.fn();
      window.umami = { track };
      const user = userEvent.setup();
      server.use(
        http.post(SUBSCRIBE_URL, () =>
          HttpResponse.json({ data: { subscribed: true } }),
        ),
      );

      renderWithProviders(<NewsletterSubscribeForm source="home" />);

      await user.type(
        screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
        "shopper@example.com",
      );
      await user.click(
        screen.getByRole("button", { name: dict.newsletterForm.submit }),
      );

      await screen.findByText(dict.newsletterForm.success);
      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("newsletter_subscribe", {
          source: "home",
        }),
      );
      expect(
        track.mock.calls.filter(([name]) => name === "newsletter_subscribe"),
      ).toHaveLength(1);
    });

    it("does not report newsletter_subscribe when client-side validation fails", async () => {
      const track = jest.fn();
      window.umami = { track };
      const user = userEvent.setup();

      renderWithProviders(<NewsletterSubscribeForm source="home" />);

      await user.type(
        screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
        "not-an-email",
      );
      await user.click(
        screen.getByRole("button", { name: dict.newsletterForm.submit }),
      );

      await screen.findByText(dict.newsletterForm.invalidEmail);
      expect(track).not.toHaveBeenCalled();
    });
  });
});
