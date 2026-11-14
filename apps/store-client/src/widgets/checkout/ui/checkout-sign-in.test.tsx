import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CheckoutSignIn } from "./checkout-sign-in";

// next/navigation is unavailable under jsdom — the embedded LoginForm reads it.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock("sonner", () => ({ toast: jest.fn() }));

const g = dict.checkout.guest;

function captureResetRequests() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/auth/password-reset/request", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: { message: "ok" } });
    }),
  );
  return bodies;
}

/**
 * TASK-1984 (forms Rule 5c): «Немає пароля?» sends a reset link to the checkout
 * address — judged by the same email rule as `RequestPasswordResetDto` first.
 */
describe("CheckoutSignIn — reset link", () => {
  it("sends the trimmed checkout address", async () => {
    const bodies = captureResetRequests();
    const user = userEvent.setup();
    renderWithProviders(
      <CheckoutSignIn email=" shopper@test.ua " onAuthenticated={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: g.noPasswordCta }));

    await waitFor(() => expect(bodies).toEqual([{ email: "shopper@test.ua" }]));
    expect(await screen.findByText(g.noPasswordSent)).toBeInTheDocument();
  });

  it("sends nothing for an invalid address and says what is wrong", async () => {
    const bodies = captureResetRequests();
    const user = userEvent.setup();
    renderWithProviders(
      <CheckoutSignIn email="not-an-email" onAuthenticated={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: g.noPasswordCta }));

    expect(
      await screen.findByText(dict.forms.emailInvalid),
    ).toBeInTheDocument();
    expect(screen.queryByText(g.noPasswordError)).not.toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
});
