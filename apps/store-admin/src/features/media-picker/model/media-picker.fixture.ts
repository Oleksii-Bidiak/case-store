import { http, HttpResponse } from "msw";
import { server } from "@/shared/test/msw-server";
import { screen, userEvent } from "@/shared/test/render";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";

/**
 * Test fixture for the media picker (TASK-441, step e).
 *
 * Lives beside the feature rather than in `shared/test` for the same reason the
 * session fixture lives beside the session entity: it has to know this slice's
 * API shape and its copy, and `shared` may not import upward. Not a
 * `*.test.tsx` file, so Jest's `testMatch` ignores it.
 *
 * It exists because the picker is wired into SIX forms, and each of those form
 * tests needs the same three lines of MSW plus the same two clicks. Six copies
 * is six places to fix when the endpoint moves — and, worse, six chances for a
 * test to assert against a stub that no longer resembles the server.
 */

/** Both media keys — what an operator needs for the full picker. */
export const MEDIA_PERMISSIONS = [PERM.mediaRead, PERM.mediaWrite];

export interface MediaAssetStub {
  id: string;
  url: string;
  blurDataUrl: string | null;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  alt: string | null;
  tags: string[];
  uploadedById: string | null;
  usedInCount: number;
  createdAt: string;
  updatedAt: string;
}

export function makeMediaAsset(
  id: string,
  overrides: Partial<MediaAssetStub> = {},
): MediaAssetStub {
  return {
    id,
    url: `http://localhost:3001/uploads/media/${id}.webp`,
    blurDataUrl: null,
    width: 2000,
    height: 1333,
    bytes: 184320,
    mime: "image/webp",
    alt: null,
    tags: [],
    uploadedById: null,
    usedInCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/** The default library: one asset, named, so a test can click it by name. */
export const LIBRARY_ASSET_ALT = "Осінній банер";

/**
 * Stand in for `GET`/`POST /api/admin/media`.
 *
 * The list honours `?search=` because "the box filters nothing" and "the library
 * is empty" look identical on screen, and the picker's search is local state
 * rather than a URL param — so nothing else would catch it going missing.
 */
export function stubMediaLibrary(
  initial: MediaAssetStub[] = [
    makeMediaAsset("m1", { alt: LIBRARY_ASSET_ALT }),
  ],
) {
  const state = { assets: [...initial] };
  const listRequests: URL[] = [];
  const uploadedNames: string[] = [];

  server.use(
    http.get("*/api/admin/media", ({ request }) => {
      const url = new URL(request.url);
      listRequests.push(url);
      const search = url.searchParams.get("search")?.toLocaleLowerCase();
      const matching = search
        ? state.assets.filter(
            (asset) =>
              asset.alt?.toLocaleLowerCase().includes(search) ||
              asset.tags.some((tag) => tag.toLocaleLowerCase() === search),
          )
        : state.assets;

      return HttpResponse.json({
        data: matching,
        meta: {
          total: matching.length,
          page: 1,
          limit: 20,
          totalPages: Math.max(1, Math.ceil(matching.length / 20)),
        },
      });
    }),
    http.post("*/api/admin/media", async ({ request }) => {
      const form = await request.formData();
      const file = form.get("file");
      const name = file instanceof File ? file.name : String(file);
      uploadedNames.push(name);
      const created = makeMediaAsset(`up-${uploadedNames.length}`, {
        alt: null,
      });
      state.assets = [created, ...state.assets];
      return HttpResponse.json({ data: { ...created, usedIn: [] } });
    }),
  );

  return { state, listRequests, uploadedNames };
}

/** Open the picker from its default trigger and choose the tile called `name`. */
export async function pickFromLibrary(name = LIBRARY_ASSET_ALT) {
  await userEvent.click(
    await screen.findByRole("button", { name: dict.mediaPicker.trigger }),
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: dict.mediaPicker.pickCardAria(name),
    }),
  );
}
