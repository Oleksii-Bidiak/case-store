import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CategoryAddonTemplatePicker } from "./category-addon-template-picker";
import { useCategoryAddonTemplate } from "../model/use-category-addon-template";

const d = dict.categories.addonTemplate;

const services = [
  {
    id: "svc-warranty",
    name: "Гарантія",
    description: null,
    price: "499.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "svc-insurance",
    name: "Страхування",
    description: null,
    price: "899.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

/**
 * Arrange the three reads the picker makes: the active catalog, the category's
 * OWN template (the checkbox state), and the RESOLVED template (the inheritance
 * note).
 */
function arrange(options: {
  ownIds?: string[];
  source?: "own" | "inherited" | "none";
  sourceCategoryName?: string | null;
}) {
  const { ownIds = [], source = "none", sourceCategoryName = null } = options;

  server.use(
    http.get("*/api/addon-services/admin/active", () =>
      HttpResponse.json({ data: services }),
    ),
    http.get("*/api/addon-services/templates/category/:categoryId", () =>
      HttpResponse.json({ data: { addonServiceIds: ownIds } }),
    ),
    http.get(
      "*/api/addon-services/templates/category/:categoryId/resolved",
      () =>
        HttpResponse.json({
          data: {
            source,
            sourceCategoryId: sourceCategoryName ? "cat-root" : null,
            sourceCategoryName,
            addons: [],
          },
        }),
    ),
  );
}

/**
 * Wave 198 (КТ5): the picker is a SECTION of the category form now — it has
 * no button of its own; the form's one «Зберегти» calls `template.save()`.
 * The harness stands in for that bar.
 */
function Harness({ onSaved }: { onSaved?: (ok: boolean) => void }) {
  const template = useCategoryAddonTemplate("cat-1");
  return (
    <>
      <CategoryAddonTemplatePicker template={template} id="addons" />
      <span data-testid="dirty">{String(template.isDirty)}</span>
      <button
        type="button"
        onClick={() =>
          void template.save().then(
            () => onSaved?.(true),
            () => onSaved?.(false),
          )
        }
      >
        save-all
      </button>
      <button type="button" onClick={template.discard}>
        discard-all
      </button>
    </>
  );
}

describe("CategoryAddonTemplatePicker (TASK-174)", () => {
  it("lists the active catalog services with their prices in hryvnia", async () => {
    arrange({});

    renderWithProviders(<Harness />);

    expect(await screen.findByLabelText("Гарантія")).toBeInTheDocument();
    expect(screen.getByLabelText("Страхування")).toBeInTheDocument();
    // Money through the admin formatter (TASK-801), not the raw decimal.
    expect(screen.getByText("499 ₴")).toBeInTheDocument();
  });

  it("is a titled section the form index can jump to, with no save button of its own", async () => {
    arrange({});

    renderWithProviders(<Harness />);

    const section = await screen.findByRole("region", {
      name: dict.categoryForm.sectionAddons,
    });
    expect(section).toHaveAttribute("id", "addons");
    expect(
      screen.queryByRole("button", { name: /Зберегти/ }),
    ).not.toBeInTheDocument();
  });

  it("seeds the checkboxes from the category's OWN template", async () => {
    arrange({ ownIds: ["svc-insurance"], source: "own" });

    renderWithProviders(<Harness />);

    await waitFor(() =>
      expect(screen.getByLabelText("Страхування")).toBeChecked(),
    );
    expect(screen.getByLabelText("Гарантія")).not.toBeChecked();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("shows the inheritance note when the category has no own template", async () => {
    arrange({ source: "inherited", sourceCategoryName: "Смартфони" });

    renderWithProviders(<Harness />);

    expect(
      await screen.findByText(d.inheritedFrom("Смартфони")),
    ).toBeInTheDocument();
  });

  it("shows the 'nobody in the chain offers anything' note", async () => {
    arrange({ source: "none" });

    renderWithProviders(<Harness />);

    expect(await screen.findByText(d.noneAnywhere)).toBeInTheDocument();
  });

  it("is dirty after a tick, clean again after «Скасувати зміни»", async () => {
    arrange({ ownIds: ["svc-warranty"], source: "own" });

    renderWithProviders(<Harness />);

    await waitFor(() =>
      expect(screen.getByLabelText("Гарантія")).toBeChecked(),
    );
    await userEvent.click(screen.getByLabelText("Страхування"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");

    await userEvent.click(screen.getByRole("button", { name: "discard-all" }));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(screen.getByLabelText("Страхування")).not.toBeChecked();
  });

  it("PATCHes the full replacement set when the form saves, and is clean after", async () => {
    arrange({ ownIds: ["svc-warranty"], source: "own" });
    let body: { addonServiceIds?: string[] } | null = null;
    server.use(
      http.patch(
        "*/api/addon-services/templates/category/:categoryId",
        async ({ request }) => {
          body = (await request.json()) as { addonServiceIds?: string[] };
          return HttpResponse.json({ data: { addonServiceIds: [] } });
        },
      ),
    );
    const onSaved = jest.fn();

    renderWithProviders(<Harness onSaved={onSaved} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Гарантія")).toBeChecked(),
    );
    await userEvent.click(screen.getByLabelText("Страхування"));
    await userEvent.click(screen.getByRole("button", { name: "save-all" }));

    await waitFor(() =>
      expect(body).toEqual({
        addonServiceIds: ["svc-warranty", "svc-insurance"],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(true));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("saving with nothing checked clears the own template (empty array is a real payload)", async () => {
    arrange({ ownIds: ["svc-warranty"], source: "own" });
    let body: { addonServiceIds?: string[] } | null = null;
    server.use(
      http.patch(
        "*/api/addon-services/templates/category/:categoryId",
        async ({ request }) => {
          body = (await request.json()) as { addonServiceIds?: string[] };
          return HttpResponse.json({ data: { addonServiceIds: [] } });
        },
      ),
    );

    renderWithProviders(<Harness />);

    await waitFor(() =>
      expect(screen.getByLabelText("Гарантія")).toBeChecked(),
    );
    await userEvent.click(screen.getByLabelText("Гарантія"));

    expect(await screen.findByText(d.clearedNote)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "save-all" }));

    await waitFor(() => expect(body).toEqual({ addonServiceIds: [] }));
  });

  it("a failed save REJECTS (so the form can stop and say so) and stays dirty", async () => {
    arrange({ ownIds: [], source: "none" });
    server.use(
      http.patch("*/api/addon-services/templates/category/:categoryId", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const onSaved = jest.fn();

    renderWithProviders(<Harness onSaved={onSaved} />);

    await userEvent.click(await screen.findByLabelText("Гарантія"));
    await userEvent.click(screen.getByRole("button", { name: "save-all" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });
});
