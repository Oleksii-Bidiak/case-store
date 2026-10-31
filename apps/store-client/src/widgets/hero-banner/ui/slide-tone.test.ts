import { SLIDE_TONES, slideToneFor } from "./slide-tone";

describe("slideToneFor (TASK-2013)", () => {
  it.each([
    ["iphone", "iphone"],
    ["Galaxy", "galaxy"],
    [" redmi ", "redmi"],
    ["watch", "watch"],
    ["ipad", "ipad"],
    ["sale", "sale"],
  ] as const)("maps the banner theme %o to the %s tone", (theme, tone) => {
    expect(slideToneFor(theme)).toBe(tone);
  });

  it.each([null, undefined, "", "primary", "success", "#ff00aa", "violet"])(
    "gives %o the ink panel — no decorative hue",
    (theme) => {
      expect(slideToneFor(theme)).toBe("ink");
    },
  );
});

describe("SLIDE_TONES", () => {
  it("puts foreground text on every family tone, never the family hue", () => {
    for (const key of ["iphone", "galaxy", "redmi", "watch", "ipad"] as const) {
      expect(SLIDE_TONES[key].surface).toBe(`bg-family-${key} text-foreground`);
      expect(SLIDE_TONES[key].focus).toContain(
        "focus-visible:outline-foreground",
      );
    }
  });

  it("keeps the ink slide graphite in both themes — the footer ink, not primary", () => {
    expect(SLIDE_TONES.ink.surface).toBe("bg-footer text-footer-foreground");
    expect(SLIDE_TONES.ink.surface).not.toMatch(/primary/);
  });

  it("uses no raw colour or colour maths in any tone", () => {
    for (const tone of Object.values(SLIDE_TONES)) {
      const classes = `${tone.surface} ${tone.cta} ${tone.focus}`;
      expect(classes).not.toMatch(/#|color-mix\(|oklch\(|\b(?:white|black)\b/);
    }
  });
});
