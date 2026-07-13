import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { StoreLogoUpload } from "./store-logo-upload";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const LOGO_URL = "http://localhost:3001/uploads/branding/logo.webp";

const pickFile = () =>
  new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", {
    type: "image/svg+xml",
  });

const fileInput = () => screen.getByTestId("single-image-upload-input");

/** Stub the upload route with a status; collects the uploaded filenames. */
function stubUpload(status = 201) {
  const uploaded: string[] = [];
  server.use(
    http.post("*/api/admin/seo-settings/logo", async ({ request }) => {
      if (status !== 201) {
        return new HttpResponse(null, { status });
      }
      const form = await request.formData();
      const file = form.get("file");
      uploaded.push(file instanceof File ? file.name : String(file));
      return HttpResponse.json({ data: { id: "s1", logoUrl: LOGO_URL } });
    }),
  );
  return uploaded;
}

describe("StoreLogoUpload (TASK-299)", () => {
  it("shows the empty state and an upload button when no logo is set", () => {
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    expect(screen.getByText(dict.storeLogo.empty)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.storeLogo.upload }),
    ).toBeInTheDocument();
    // Nothing to delete yet.
    expect(
      screen.queryByRole("button", { name: dict.storeLogo.delete }),
    ).not.toBeInTheDocument();
  });

  it("previews the current logo and offers replace + delete", () => {
    renderWithProviders(<StoreLogoUpload logoUrl={LOGO_URL} />);

    expect(screen.getByAltText(dict.storeLogo.alt)).toHaveAttribute(
      "src",
      LOGO_URL,
    );
    expect(
      screen.getByRole("button", { name: dict.storeLogo.replace }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.storeLogo.delete }),
    ).toBeInTheDocument();
  });

  it("restricts the picker to the API's allowed logo formats", () => {
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    expect(fileInput()).toHaveAttribute("accept", ".svg,.png,.webp,.jpg,.jpeg");
  });

  it("uploads the picked file as multipart and invalidates the settings query", async () => {
    const uploaded = stubUpload();
    const { queryClient } = renderWithProviders(
      <StoreLogoUpload logoUrl={null} />,
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await userEvent.upload(fileInput(), pickFile());

    await waitFor(() => expect(uploaded).toEqual(["logo.svg"]));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("maps a 413 to the size error", async () => {
    stubUpload(413);
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    await userEvent.upload(fileInput(), pickFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.storeLogo.errorTooLarge,
    );
  });

  it("maps a 415 to the unsupported-format error", async () => {
    stubUpload(415);
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    await userEvent.upload(fileInput(), pickFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.storeLogo.errorUnsupportedType,
    );
  });

  it("maps a 400 to the rejected-file error", async () => {
    stubUpload(400);
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    await userEvent.upload(fileInput(), pickFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.storeLogo.errorRejected,
    );
  });

  it("clears a previous error when a new file is picked", async () => {
    stubUpload(413);
    renderWithProviders(<StoreLogoUpload logoUrl={null} />);

    await userEvent.upload(fileInput(), pickFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.storeLogo.errorTooLarge,
    );

    const uploaded = stubUpload();
    await userEvent.upload(fileInput(), pickFile());

    await waitFor(() => expect(uploaded).toEqual(["logo.svg"]));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  describe("delete", () => {
    it("only deletes after the admin confirms the dialog", async () => {
      let deleted = false;
      server.use(
        http.delete("*/api/admin/seo-settings/logo", () => {
          deleted = true;
          return HttpResponse.json({ data: { id: "s1", logoUrl: null } });
        }),
      );

      renderWithProviders(<StoreLogoUpload logoUrl={LOGO_URL} />);

      await userEvent.click(
        screen.getByRole("button", { name: dict.storeLogo.delete }),
      );

      // The dialog is up — nothing sent yet.
      expect(
        await screen.findByText(dict.storeLogo.deleteTitle),
      ).toBeInTheDocument();
      expect(deleted).toBe(false);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.delete }),
      );

      await waitFor(() => expect(deleted).toBe(true));
    });

    it("sends nothing when the admin cancels the dialog", async () => {
      let deleted = false;
      server.use(
        http.delete("*/api/admin/seo-settings/logo", () => {
          deleted = true;
          return HttpResponse.json({ data: { id: "s1", logoUrl: null } });
        }),
      );

      renderWithProviders(<StoreLogoUpload logoUrl={LOGO_URL} />);

      await userEvent.click(
        screen.getByRole("button", { name: dict.storeLogo.delete }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: dict.common.cancel }),
      );

      await waitFor(() =>
        expect(
          screen.queryByText(dict.storeLogo.deleteTitle),
        ).not.toBeInTheDocument(),
      );
      expect(deleted).toBe(false);
    });
  });
});
