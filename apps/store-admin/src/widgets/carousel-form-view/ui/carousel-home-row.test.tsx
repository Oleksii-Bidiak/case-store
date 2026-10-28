/**
 * «На головній» on the carousel form (TASK-664, ДН-4.13): a read-only row in
 * place of the gone «Місце на головній» field, linking to /home.
 */

import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CarouselHomeRow } from "./carousel-home-row";

const f = dict.carouselForm;
const h = dict.homeBlocks;

const base = {
  title: null,
  status: "PUBLISHED",
  carousel: null,
  tabs: [],
  isSystem: false,
  isOrphaned: false,
  isEmpty: false,
  createdAt: "",
  updatedAt: "",
};

let homeRequests = 0;

function stubBlocks() {
  homeRequests = 0;
  server.use(
    http.get("*/api/admin/home-blocks", () => {
      homeRequests += 1;
      return HttpResponse.json({
        data: [
          { ...base, id: "hero", type: "HERO", sortOrder: 0, isSystem: true },
          {
            ...base,
            id: "rail",
            type: "CAROUSEL",
            sortOrder: 1,
            carousel: {
              id: "cases",
              title: "Чохли для смартфонів",
              source: "CATEGORY",
              status: "PUBLISHED",
            },
          },
        ],
      });
    }),
  );
}

const READER = { auth: { permissions: ["home:read"] } };

describe("CarouselHomeRow", () => {
  it("says where the carousel stands and links to «Головна»", async () => {
    stubBlocks();
    renderWithProviders(<CarouselHomeRow carouselId="cases" />, READER);

    expect(
      await screen.findByText(
        `${h.asBlock("Чохли для смартфонів")} (${h.blockPosition(2)})`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: f.homeManage })).toHaveAttribute(
      "href",
      "/home",
    );
    expect(screen.getByText(f.homeFieldGone)).toBeInTheDocument();
  });

  it("says «ні» for a carousel that stands nowhere", async () => {
    stubBlocks();
    renderWithProviders(<CarouselHomeRow carouselId="other" />, READER);

    expect(
      await screen.findByText(`${f.homeNone}. ${f.homeNoneHint}`),
    ).toBeInTheDocument();
  });

  it("a new carousel stands nowhere — nothing is asked", () => {
    stubBlocks();
    renderWithProviders(<CarouselHomeRow />, READER);

    expect(
      screen.getByText(`${f.homeNone}. ${f.homeNoneHint}`),
    ).toBeInTheDocument();
    expect(homeRequests).toBe(0);
  });

  it("without a home key: no state, no link — only where it is decided", () => {
    stubBlocks();
    renderWithProviders(<CarouselHomeRow carouselId="cases" />);

    expect(screen.getByText(f.homeFieldGone)).toBeInTheDocument();
    expect(screen.queryByText(f.homeLabel)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: f.homeManage }),
    ).not.toBeInTheDocument();
    expect(homeRequests).toBe(0);
  });
});
