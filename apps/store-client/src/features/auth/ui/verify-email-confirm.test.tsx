import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { VerifyEmailConfirm } from "./verify-email-confirm";

// next/navigation is unavailable under jsdom. `mockToken` is mutable so each
// test controls the `?token=` value.
let mockToken: string | null = "valid-token-123";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? mockToken : null),
  }),
}));

const d = dict.auth.verifyEmail;

/**
 * The API answers EVERY confirm failure with this one 400 — unknown token,
 * expired, already used, or issued for an address the account no longer uses.
 * The frontend cannot tell them apart, which is the point of these tests.
 */
function genericRejection() {
  return HttpResponse.json(
    {
      statusCode: 400,
      error: "BadRequestException",
      message: "Invalid or expired verification link",
      path: "/api/auth/email/verify/confirm",
    },
    { status: 400 },
  );
}

describe("VerifyEmailConfirm", () => {
  beforeEach(() => {
    mockToken = "valid-token-123";
  });

  it("renders an error and never calls the API when the link has no token", () => {
    mockToken = null;
    const calls: unknown[] = [];
    server.use(
      http.post("*/api/auth/email/verify/confirm", async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ data: { message: "ok" } });
      }),
    );

    renderWithProviders(<VerifyEmailConfirm />);

    expect(screen.getByText(d.errorMissingToken)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("confirms the token from the link and shows the success state", async () => {
    const calls: unknown[] = [];
    server.use(
      http.post("*/api/auth/email/verify/confirm", async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({
          data: { message: "Email address verified." },
        });
      }),
    );

    renderWithProviders(<VerifyEmailConfirm />);

    expect(await screen.findByText(d.successHeading)).toBeInTheDocument();
    expect(screen.getByText(d.successBody)).toBeInTheDocument();
    expect(calls).toEqual([{ token: "valid-token-123" }]);
  });

  // The refusal the task cares about: a link issued for an address the account
  // has since changed. It arrives as the same generic 400 as everything else,
  // so the UI must explain the possibilities and the fix rather than either
  // shrugging ("щось пішло не так") or inventing a diagnosis.
  it("renders an explanatory refusal — not the generic error — on a 400", async () => {
    server.use(
      http.post("*/api/auth/email/verify/confirm", () => genericRejection()),
    );

    renderWithProviders(<VerifyEmailConfirm />);

    expect(await screen.findByText(d.errorHeading)).toBeInTheDocument();
    expect(screen.getByText(d.errorBody)).toBeInTheDocument();
    // Names the address-change case explicitly, and tells the user what to do.
    expect(screen.getByText(d.errorNextStep)).toBeInTheDocument();
    expect(
      screen.queryByText(dict.common.genericError),
    ).not.toBeInTheDocument();
  });

  it("shows a checking state while the request is in flight", () => {
    server.use(
      http.post(
        "*/api/auth/email/verify/confirm",
        () => new Promise(() => {}) as never,
      ),
    );

    renderWithProviders(<VerifyEmailConfirm />);

    expect(screen.getByText(d.checking)).toBeInTheDocument();
  });
});
