import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { UserNotesPanel } from "./user-notes-panel";

// The panel gates its form on `customers:write`. A mutable holder so one suite can
// render both a writer and a read-only manager.
const permissions = { current: ["customers:read", "customers:write"] };
jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "manager-1",
    role: "MANAGER",
    email: "manager@example.com",
    accessToken: null,
    isAuthenticated: true,
    isStaff: true,
    isOwner: false,
    isInitializing: false,
    arePermissionsLoading: false,
    get permissions() {
      return permissions.current;
    },
    can: (permission: string) => permissions.current.includes(permission),
    canAll: (required: readonly string[]) =>
      required.every((permission) => permissions.current.includes(permission)),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
}));

const USER_ID = "user-1";
const d = dict.users;

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    userId: USER_ID,
    authorId: "manager-1",
    authorEmail: "manager@example.com",
    body: "Просив передзвонити після 18:00.",
    createdAt: "2026-09-13T07:24:00.000Z",
    ...overrides,
  };
}

function stubNotes(notes: unknown[] = [], total = notes.length) {
  server.use(
    http.get("*/api/admin/users/:userId/notes", () =>
      HttpResponse.json({ data: notes, meta: { total, limit: 50 } }),
    ),
  );
}

beforeEach(() => {
  permissions.current = ["customers:read", "customers:write"];
});

describe("UserNotesPanel (TASK-430)", () => {
  it("renders the journal in the order the API returned it", async () => {
    // Newest-first is the SERVER's ordering (`orderBy: createdAt desc`). The panel
    // must not re-sort: a second opinion about order is how two screens end up
    // disagreeing about which note is the latest.
    stubNotes([
      makeNote({ id: "n2", body: "Друга нотатка" }),
      makeNote({ id: "n1", body: "Перша нотатка" }),
    ]);

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Друга нотатка");
    expect(items[1]).toHaveTextContent("Перша нотатка");
  });

  it("preserves the operator's line breaks", async () => {
    stubNotes([makeNote({ body: "Подзвонити\nПеревірити адресу" })]);

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    const body = await screen.findByText(/Подзвонити/);
    expect(body).toHaveClass("whitespace-pre-wrap");
  });

  it("offers no form at all without customers:write", async () => {
    // The POST would answer 403, and a textarea that always fails is worse than no
    // textarea. Reading stays available — that is what customers:read buys.
    permissions.current = ["customers:read"];
    stubNotes([makeNote()]);

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    expect(
      await screen.findByText("Просив передзвонити після 18:00."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(d.notesAddLabel)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.notesAddSubmit }),
    ).not.toBeInTheDocument();
  });

  it("counts down the remaining characters", async () => {
    stubNotes();

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    const box = await screen.findByLabelText(d.notesAddLabel);
    await userEvent.type(box, "12345");

    expect(screen.getByText(d.notesCharsLeft(1995))).toBeInTheDocument();
  });

  it("blocks an over-long note before the server has to refuse it", async () => {
    stubNotes();
    const posted: unknown[] = [];
    server.use(
      http.post("*/api/admin/users/:userId/notes", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ data: makeNote() }, { status: 201 });
      }),
    );

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    const box = await screen.findByLabelText(d.notesAddLabel);
    // `paste` rather than `type`: 2001 keystrokes is a minute of test time.
    await userEvent.click(box);
    await userEvent.paste("я".repeat(2001));

    expect(screen.getByText(d.notesTooLong(2000))).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: d.notesAddSubmit }),
    ).toBeDisabled();
    expect(posted).toEqual([]);
  });

  it("reports a failed read instead of showing an empty journal", async () => {
    // «Нотаток ще немає» on a failed request is the worst outcome here: it says the
    // team never wrote anything about this customer, which may be false.
    server.use(
      http.get("*/api/admin/users/:userId/notes", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      d.notesLoadError,
    );
    expect(screen.queryByText(d.notesEmpty)).not.toBeInTheDocument();
  });

  it("refetches the journal after a successful append", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/admin/users/:userId/notes", () => {
        reads += 1;
        return HttpResponse.json({
          // NOT «Нова нотатка» — that is the form's own label, and the assertion
          // below would match the label instead of the entry.
          data: reads === 1 ? [] : [makeNote({ body: "Щойно додана" })],
          meta: { total: reads === 1 ? 0 : 1, limit: 50 },
        });
      }),
      http.post("*/api/admin/users/:userId/notes", () =>
        HttpResponse.json({ data: makeNote() }, { status: 201 }),
      ),
    );

    renderWithProviders(<UserNotesPanel userId={USER_ID} />);

    const box = await screen.findByLabelText(d.notesAddLabel);
    await userEvent.type(box, "Щойно додана");
    await userEvent.click(
      screen.getByRole("button", { name: d.notesAddSubmit }),
    );

    // The new entry appears without a page reload — the query key was invalidated.
    await waitFor(() =>
      expect(screen.getByText("Щойно додана")).toBeInTheDocument(),
    );
    expect(reads).toBeGreaterThan(1);
  });
});
