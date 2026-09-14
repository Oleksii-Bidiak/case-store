/**
 * `MediaPicker` — «Обрати з медіатеки / Завантажити» (TASK-441, step e).
 *
 * The cases here are the ones where the picker can quietly do the wrong thing:
 * hand back the wrong asset, upload into the field instead of into the library,
 * show a tab the operator has no permission for — or, the one that matters most,
 * break a form for an operator who has no media permissions at all. That last
 * one is not a nicety: every content manager on the system starts without the
 * two new keys, and the forms must keep working exactly as they did.
 */

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";
import {
  LIBRARY_ASSET_ALT,
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  pickFromLibrary,
  stubMediaLibrary,
} from "../model/media-picker.fixture";
import { MediaPicker } from "./media-picker";

const t = dict.mediaPicker;

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

function renderPicker(
  permissions: string[] = MEDIA_PERMISSIONS,
  onPick = jest.fn(),
) {
  renderWithProviders(<MediaPicker onPick={onPick} />, {
    auth: { permissions },
  });
  return onPick;
}

const makeFile = (name: string) =>
  new File(["png-bytes"], name, { type: "image/png" });

describe("MediaPicker — choosing an existing asset", () => {
  it("hands back the asset the operator clicked", async () => {
    stubMediaLibrary([
      makeMediaAsset("m1", { alt: LIBRARY_ASSET_ALT }),
      makeMediaAsset("m2", { alt: "Чохол MagSafe" }),
    ]);
    const onPick = renderPicker();

    await pickFromLibrary("Чохол MagSafe");

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0]).toMatchObject({
      id: "m2",
      url: "http://localhost:3001/uploads/media/m2.webp",
      alt: "Чохол MagSafe",
    });
  });

  it("closes once the choice is made — the picker has done its job", async () => {
    stubMediaLibrary();
    renderPicker();

    await pickFromLibrary();

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("is reachable from the keyboard alone", async () => {
    stubMediaLibrary();
    const onPick = renderPicker();

    // No mouse anywhere: tab to the trigger, Enter to open, then find the tile
    // — one tab stop per asset, so Enter on it is the whole interaction.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: t.trigger })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const tile = await screen.findByRole("button", {
      name: t.pickCardAria(LIBRARY_ASSET_ALT),
    });
    // `act` because moving focus inside the dialog re-renders Radix's roving
    // focus group; tabbing from the trigger to the tile would work too, but the
    // number of stops in between is furniture, not behaviour worth asserting.
    await act(async () => {
      tile.focus();
    });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  });

  it("filters the library by what was typed, without touching the URL", async () => {
    const { listRequests } = stubMediaLibrary([
      makeMediaAsset("m1", { alt: LIBRARY_ASSET_ALT }),
      makeMediaAsset("m2", { alt: "Чохол MagSafe" }),
    ]);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: t.trigger }));
    await screen.findByRole("button", {
      name: t.pickCardAria(LIBRARY_ASSET_ALT),
    });

    await userEvent.type(
      screen.getByRole("searchbox", { name: t.searchLabel }),
      "MagSafe",
    );

    await waitFor(() =>
      expect(
        listRequests.some(
          (url) => url.searchParams.get("search") === "MagSafe",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: t.pickCardAria(LIBRARY_ASSET_ALT),
        }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("MediaPicker — uploading a new file", () => {
  it("uploads into the LIBRARY and hands back the asset the server made", async () => {
    const { uploadedNames } = stubMediaLibrary();
    const onPick = renderPicker();

    await userEvent.click(screen.getByRole("button", { name: t.trigger }));
    await userEvent.click(screen.getByRole("tab", { name: t.tabUpload }));

    fireEvent.drop(screen.getByTestId("media-drop-zone"), {
      dataTransfer: {
        files: [makeFile("new.png")],
        items: [],
        types: ["Files"],
      },
    });

    // `POST /api/admin/media`, not the field's own upload route: the file
    // becomes a real asset with an id, so it is available to every other form
    // tomorrow and the library can refuse to delete it while this form uses it.
    await waitFor(() => expect(uploadedNames).toEqual(["new.png"]));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: "up-1" });
  });

  it("reports every file of a batch, so a gallery gets all of them", async () => {
    stubMediaLibrary();
    const onPick = renderPicker();

    await userEvent.click(screen.getByRole("button", { name: t.trigger }));
    await userEvent.click(screen.getByRole("tab", { name: t.tabUpload }));

    fireEvent.drop(screen.getByTestId("media-drop-zone"), {
      dataTransfer: {
        files: [makeFile("a.png"), makeFile("b.png")],
        items: [],
        types: ["Files"],
      },
    });

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2));
  });
});

describe("MediaPicker — permissions", () => {
  it("renders nothing at all without either media key", async () => {
    stubMediaLibrary();
    renderPicker([]);

    // THE important case: a content manager who has not been granted the new
    // keys must find their form exactly as it was, not a control that 403s.
    expect(
      screen.queryByRole("button", { name: t.trigger }),
    ).not.toBeInTheDocument();
  });

  it("offers browsing but no upload with media:read alone", async () => {
    stubMediaLibrary();
    renderPicker([PERM.mediaRead]);

    await userEvent.click(screen.getByRole("button", { name: t.trigger }));
    await screen.findByRole("button", {
      name: t.pickCardAria(LIBRARY_ASSET_ALT),
    });

    expect(screen.queryByTestId("media-drop-zone")).not.toBeInTheDocument();
    // One tab is not a choice, so the strip is not rendered either.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("offers upload but no browsing with media:write alone", async () => {
    const { listRequests } = stubMediaLibrary();
    renderPicker([PERM.mediaWrite]);

    await userEvent.click(screen.getByRole("button", { name: t.trigger }));

    expect(await screen.findByTestId("media-drop-zone")).toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: t.searchLabel }),
    ).not.toBeInTheDocument();
    // And the library is never even read — the grid is what would have read it.
    expect(listRequests).toHaveLength(0);
  });
});
