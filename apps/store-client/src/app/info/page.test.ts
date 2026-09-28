import type { ReactElement } from "react";
import type { PageEntity } from "@/shared/api/generated/models";

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn() }));
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn(),
  fetchPublishedPages: jest.fn(),
}));
jest.mock("@/shared/api/addon-services-server", () => ({
  fetchActiveAddonServices: jest.fn(),
}));
jest.mock("@/shared/api/faq-server", () => ({
  fetchFaqItems: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/shared/api/site-contact-server", () => ({
  fetchSiteContactSettings: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/lib/seo/server", () => ({
  buildHubMetadata: jest.fn(),
}));
// `sanitize-html` pulls isomorphic-dompurify (bundled jsdom), which cannot
// initialize in the node project; the route's own logic is what is under test.
jest.mock("@/shared/lib/sanitize-html", () => ({
  sanitizeHtml: (html: string) => `clean:${html}`,
}));
// The view is a client component — the route's contract with it is its props.
jest.mock("@/widgets/info-support", () => ({
  InfoView: function InfoView() {
    return null;
  },
  INFO_FAQS: [],
}));

import * as Sentry from "@sentry/nextjs";
import InfoPage from "./page";
import {
  fetchPublishedPage,
  fetchPublishedPages,
} from "@/shared/api/pages-server";
import { fetchActiveAddonServices } from "@/shared/api/addon-services-server";
import {
  INFO_HUB_SECTION_SLUGS,
  INFO_SLUG_INLINED_ON_HUB,
} from "@/shared/config";

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchPages = fetchPublishedPages as jest.MockedFunction<
  typeof fetchPublishedPages
>;
const fetchAddons = fetchActiveAddonServices as jest.MockedFunction<
  typeof fetchActiveAddonServices
>;
const captureMessage = Sentry.captureMessage as jest.Mock;

function makePage(
  slug: string,
  overrides: Partial<PageEntity> = {},
): PageEntity {
  return {
    id: `p-${slug}`,
    slug,
    kind: "INFO",
    title: `Title ${slug}`,
    content: `<p>${slug}</p>`,
    excerpt: `Lede ${slug}`,
    metaTitle: null,
    metaDescription: null,
    status: "PUBLISHED",
    publishedAt: null,
    scheduledAt: null,
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as PageEntity;
}

/** The props the route hands `InfoView` — its whole contract with the view. */
async function viewProps(): Promise<Record<string, unknown>> {
  const tree = (await InfoPage()) as ReactElement<{
    children: ReactElement<Record<string, unknown>>[];
  }>;
  const view = tree.props.children.find(
    (child) => (child.type as { name?: string }).name === "InfoView",
  );
  if (!view) throw new Error("InfoView not rendered");
  return view.props;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchPage.mockImplementation(async (slug) => makePage(slug));
  fetchPages.mockResolvedValue([]);
  fetchAddons.mockResolvedValue([]);
});

describe("/info — blocks from CMS pages (TASK-560)", () => {
  it("renders every block from its INFO page, sanitized", async () => {
    const { sections } = await viewProps();

    expect(sections).toEqual({
      delivery: {
        heading: "Title info-delivery",
        intro: "Lede info-delivery",
        html: "clean:<p>info-delivery</p>",
      },
      payment: expect.objectContaining({ heading: "Title info-payment" }),
      warranty: expect.objectContaining({ heading: "Title info-warranty" }),
      aboutStats: expect.objectContaining({
        heading: "Title info-about-stats",
      }),
    });
    for (const slug of Object.values(INFO_HUB_SECTION_SLUGS)) {
      expect(fetchPage).toHaveBeenCalledWith(slug, "INFO");
    }
  });

  it("hides a block whose page the owner unpublished (404) — no resurrected text", async () => {
    fetchPage.mockImplementation(async (slug) =>
      slug === INFO_HUB_SECTION_SLUGS.payment ? null : makePage(slug),
    );

    const { sections } = await viewProps();

    expect((sections as Record<string, unknown>).payment).toBe("missing");
  });

  it("falls back to the static copy when the API does not answer", async () => {
    fetchPage.mockImplementation(async (slug) => {
      if (slug === INFO_HUB_SECTION_SLUGS.warranty) {
        throw new Error("Page read failed: 502");
      }
      return makePage(slug);
    });

    const { sections } = await viewProps();

    expect((sections as Record<string, unknown>).warranty).toBe("unavailable");
  });

  it("lists the other published help pages, without the inlined ones", async () => {
    fetchPages.mockResolvedValue([
      makePage(INFO_SLUG_INLINED_ON_HUB, { title: "Про нас" }),
      makePage(INFO_HUB_SECTION_SLUGS.delivery),
      makePage("returns-howto", { title: "Як повернути товар" }),
    ]);

    const { pages } = await viewProps();

    expect(fetchPages).toHaveBeenCalledWith("INFO");
    expect(pages).toEqual([
      { title: "Як повернути товар", href: "/info/returns-howto" },
    ]);
  });
});

describe("/info — services from the real add-ons (TASK-561)", () => {
  it("passes the active add-ons with their catalog prices", async () => {
    fetchAddons.mockResolvedValue([
      { id: "svc-1", name: "Гарантія +12", description: null, price: "499.00" },
    ]);

    const { services } = await viewProps();

    expect(services).toEqual([
      { id: "svc-1", name: "Гарантія +12", description: null, price: "499.00" },
    ]);
  });
});

describe("/info — the «Про нас» page found by a fixed slug (TASK-565)", () => {
  it("warns Sentry when the page is missing, and falls back", async () => {
    fetchPage.mockImplementation(async (slug) =>
      slug === INFO_SLUG_INLINED_ON_HUB ? null : makePage(slug),
    );

    const { about } = await viewProps();

    expect(about).toBeNull();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining(`"${INFO_SLUG_INLINED_ON_HUB}"`),
      "warning",
    );
  });

  it("does not warn on an outage — that is not a content problem", async () => {
    fetchPage.mockRejectedValue(new Error("Page read failed: 503"));

    const { about } = await viewProps();

    expect(about).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("does not warn when the page is there", async () => {
    const { about } = await viewProps();

    expect(about).toEqual({
      heading: `Title ${INFO_SLUG_INLINED_ON_HUB}`,
      intro: `Lede ${INFO_SLUG_INLINED_ON_HUB}`,
      html: `clean:<p>${INFO_SLUG_INLINED_ON_HUB}</p>`,
      href: `/info/${INFO_SLUG_INLINED_ON_HUB}`,
    });
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
