import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ConfirmEmailChange, RevertEmailChange } from "./email-change-landing";

let mockToken: string | null = "link-token";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? mockToken : null),
  }),
}));

function reply(status: number) {
  return status === 200
    ? HttpResponse.json({ data: { message: "ok" } })
    : HttpResponse.json(
        { statusCode: status, error: "x", message: "x" },
        { status },
      );
}

describe.each([
  {
    name: "ConfirmEmailChange",
    Component: ConfirmEmailChange,
    path: "*/api/auth/email-change/confirm",
    d: dict.auth.confirmEmailChange,
  },
  {
    name: "RevertEmailChange",
    Component: RevertEmailChange,
    path: "*/api/auth/email-change/revert",
    d: dict.auth.revertEmailChange,
  },
])("$name (TASK-396)", ({ Component, path, d }) => {
  beforeEach(() => {
    mockToken = "link-token";
  });

  it("posts the link token exactly once and, on success, drops this browser's session too", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(path, async ({ request }) => {
        bodies.push(await request.json());
        return reply(200);
      }),
    );
    const clearTokens = jest.fn();

    renderWithProviders(<Component />, { auth: { clearTokens } });

    expect(await screen.findByText(d.successHeading)).toBeInTheDocument();
    expect(bodies).toEqual([{ token: "link-token" }]);
    // Every session ended server-side — the in-memory one must not linger.
    await waitFor(() => expect(clearTokens).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: d.toLogin })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("explains a 409 (address taken) differently from a dead link", async () => {
    server.use(http.post(path, () => reply(409)));

    renderWithProviders(<Component />);

    expect(await screen.findByText(d.errorTaken)).toBeInTheDocument();
    expect(screen.queryByText(d.errorBody)).not.toBeInTheDocument();
  });

  it("shows the generic dead-link copy on 400 and keeps the session", async () => {
    server.use(http.post(path, () => reply(400)));
    const clearTokens = jest.fn();

    renderWithProviders(<Component />, { auth: { clearTokens } });

    expect(await screen.findByText(d.errorBody)).toBeInTheDocument();
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("never calls the API without a token", () => {
    mockToken = null;
    const bodies: unknown[] = [];
    server.use(
      http.post(path, async ({ request }) => {
        bodies.push(await request.json());
        return reply(200);
      }),
    );

    renderWithProviders(<Component />);

    expect(screen.getByText(d.errorMissingToken)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
});
