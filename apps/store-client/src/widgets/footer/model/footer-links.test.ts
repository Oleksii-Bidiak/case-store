import { dict } from "@/shared/config";
import { RETURN_POLICY } from "@/shared/config/return-policy";
import {
  FOOTER_BOTTOM_LEGAL_LIMIT,
  isTollFreePhone,
  splitLegalPages,
  telHref,
} from "./footer-links";

describe("splitLegalPages (TASK-2078)", () => {
  it("puts delivery / returns / warranty in the buyer column, the rest in the legal row", () => {
    const pages = [
      "delivery",
      "offer",
      "returns",
      "privacy-policy",
      "warranty",
      "terms",
    ].map((slug) => ({ slug }));

    const { buyer, legal } = splitLegalPages(pages);

    expect(buyer.map((p) => p.slug)).toEqual([
      "delivery",
      "returns",
      "warranty",
    ]);
    expect(legal.map((p) => p.slug)).toEqual([
      "offer",
      "privacy-policy",
      "terms",
    ]);
  });

  it("sends an unknown slug to the legal row, capped", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ slug: `doc-${i}` }));

    const { buyer, legal } = splitLegalPages(pages);

    expect(buyer).toEqual([]);
    expect(legal).toHaveLength(FOOTER_BOTTOM_LEGAL_LIMIT);
  });
});

describe("isTollFreePhone", () => {
  it.each(["0 800 00 00 00", "0-800-123-456", "+380 800 123 456"])(
    "%s is a free line",
    (phone) => expect(isTollFreePhone(phone)).toBe(true),
  );

  it.each(["+380 44 000 0000", "067 123 45 67", ""])("%s is not", (phone) =>
    expect(isTollFreePhone(phone)).toBe(false),
  );
});

describe("telHref", () => {
  it("strips spaces, dashes and brackets but keeps the plus", () => {
    expect(telHref("+380 (44) 000-00-00")).toBe("tel:+380440000000");
  });
});

describe("footer trust strip copy (TASK-2078)", () => {
  const titles = dict.footer.trust.map((item) => item.title);
  const all = dict.footer.trust.flatMap((item) => [item.title, item.subtitle]);

  it("has four items", () => {
    expect(dict.footer.trust).toHaveLength(4);
  });

  it("never says «безкоштовно» (B-12, TASK-2053 / 2054)", () => {
    expect(all.filter((text) => /безкоштовн/i.test(text))).toEqual([]);
  });

  it("names the same return window as the homepage and RETURN_POLICY", () => {
    const footerReturn = titles.find((title) => /Повернення/.test(title));
    const homeReturn = dict.home.trust.find((item) =>
      /Повернення/.test(item.title),
    )?.title;

    expect(footerReturn).toBe(homeReturn);
    expect(footerReturn).toContain(String(RETURN_POLICY.days));
  });
});
