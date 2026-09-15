import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { PermissionTemplateDialog } from "./PermissionTemplateDialog";

function stubCatalogue() {
  server.use(
    http.get("*/api/admin/staff/:id/permissions", () =>
      HttpResponse.json({
        data: {
          userId: "admin-1",
          email: "owner@example.com",
          role: "ADMIN",
          level: 3,
          holdsEverythingByLevel: true,
          permissions: [],
          catalogue: [
            {
              key: "orders:read",
              zone: "orders",
              label: "Переглядати замовлення",
            },
          ],
          zones: [{ zone: "orders", label: "Замовлення" }],
        },
      }),
    ),
  );
}

const TEMPLATE = {
  id: "t1",
  name: "Оператор замовлень",
  description: "Приймає й веде замовлення",
  permissions: ["orders:read"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

/**
 * «Редагування шаблону НЕ змінює прав тих, хто вже працює» is the single most
 * likely misunderstanding of the whole access model, and this dialog is where it
 * bites: an owner who believes a template is a live link will edit «Оператор
 * замовлень» and think three people just lost the order queue. The sentence has
 * to be where the mistaken action happens, not in a help page.
 */
describe("PermissionTemplateDialog", () => {
  it("states the copy rule while editing an existing template", async () => {
    stubCatalogue();
    renderWithProviders(
      <WithAuth isOwner>
        <PermissionTemplateDialog
          template={TEMPLATE}
          open
          onOpenChange={() => {}}
        />
      </WithAuth>,
    );

    expect(
      await screen.findByText(dict.staff.templatesCopyRule),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.staff.templateEditHeading),
    ).toBeInTheDocument();
  });

  it("seeds the form from the template it was opened on", async () => {
    stubCatalogue();
    renderWithProviders(
      <WithAuth isOwner>
        <PermissionTemplateDialog
          template={TEMPLATE}
          open
          onOpenChange={() => {}}
        />
      </WithAuth>,
    );

    expect(await screen.findByLabelText(dict.staff.templateName)).toHaveValue(
      "Оператор замовлень",
    );
    expect(
      screen.getByText(dict.staff.permissionsCount(1)),
    ).toBeInTheDocument();
  });

  it("opens empty when creating", async () => {
    stubCatalogue();
    renderWithProviders(
      <WithAuth isOwner>
        <PermissionTemplateDialog
          template={null}
          open
          onOpenChange={() => {}}
        />
      </WithAuth>,
    );

    expect(
      await screen.findByText(dict.staff.templateCreateHeading),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(dict.staff.templateName)).toHaveValue("");
  });
});
