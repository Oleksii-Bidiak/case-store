import { formatDateTime } from "./formatDate";
import { fromKyivDateTimeLocal, toKyivDateTimeLocal } from "./datetime-local";

/**
 * HOW THIS SUITE PINS A TIMEZONE, AND WHY NOT THE OBVIOUS WAY.
 *
 * The bug these helpers fix — `datetime-local` values built and parsed in the
 * BROWSER's zone while every rendered date is pinned to Kyiv — is invisible on a
 * machine that is already in Kyiv: the buggy conversion and the correct one then
 * agree on every value. This project's development machine resolves to
 * `Europe/Kiev`, and so does CI unless someone sets `TZ`. A suite that merely
 * asserted "18:40" would have passed against the code being replaced. The
 * project has been bitten by exactly this before, so the mechanism is worth
 * spelling out.
 *
 * The obvious fix — `process.env.TZ = "America/New_York"` in `beforeAll` — was
 * tried and does NOT work here, quietly. It works under a bare `node -e` (V8
 * re-reads the zone), but inside this Jest/jsdom harness the variable is written
 * and nothing re-reads it: `new Date("2026-10-01T21:00Z").getHours()` still
 * answers with Kyiv's 0, and `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * still reports `Europe/Kiev`. A suite pinned that way looks pinned and proves
 * nothing — the worst of both.
 *
 * So the zone is pinned from the other end: {@link withAmbientZonePoisoned}
 * makes every Date API that CONSULTS the runtime's zone throw. Code that is
 * correctly zone-explicit runs untouched; code that reaches for the ambient zone
 * fails loudly, on any machine, in any zone. `theOldHelpersTripIt` below calls
 * the exact implementation this module replaces and asserts that it does trip,
 * so the harness cannot rot into a no-op.
 */

/**
 * Date instance methods whose answer depends on the RUNTIME's timezone. The UTC
 * variants (`getUTCHours` …) and `getTime`/`toISOString` are deliberately absent
 * — they are zone-independent, and `datetime-local.ts` uses them.
 *
 * `toString` is also deliberately absent: Jest stringifies values while
 * formatting a failed assertion, and poisoning it turns a readable diff into an
 * unrelated stack trace.
 */
const LOCAL_ZONE_METHODS = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getTimezoneOffset",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
  "toDateString",
  "toTimeString",
] as const;

/**
 * `YYYY-MM-DDTHH:mm` with NO zone designator — the `datetime-local` shape. Per
 * the ECMAScript date-time-string grammar, a date-TIME form without an offset is
 * interpreted in the runtime's local zone (a date-ONLY form is UTC), which is
 * precisely the submit-path bug: `new Date(values.scheduledAt).toISOString()`.
 */
const NAIVE_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/**
 * Run `body` with every ambient-zone Date API rigged to throw, then restore.
 *
 * The Date constructor is wrapped in a Proxy rather than subclassed so that
 * `Date.UTC`, `Date.now`, `instanceof Date` and the prototype chain all stay
 * exactly what they were — the helpers under test rely on every one of them.
 */
function withAmbientZonePoisoned<T>(body: () => T): T {
  const RealDate = globalThis.Date;
  const saved = new Map<string, unknown>();
  const prototype = RealDate.prototype as unknown as Record<string, unknown>;

  for (const name of LOCAL_ZONE_METHODS) {
    saved.set(name, prototype[name]);
    prototype[name] = () => {
      throw new Error(
        `Date.prototype.${name}() reads the runtime's timezone; a datetime-local value must be resolved in Europe/Kyiv explicitly.`,
      );
    };
  }

  const poisoned = new Proxy(RealDate, {
    construct(target, args) {
      const [first] = args;
      if (typeof first === "string" && NAIVE_DATE_TIME.test(first.trim())) {
        throw new Error(
          `new Date("${first}") parses a zone-less datetime in the runtime's timezone; use fromKyivDateTimeLocal.`,
        );
      }
      return Reflect.construct(target, args);
    },
    get(target, property, receiver) {
      if (property === "parse") {
        return (value: string) => {
          if (typeof value === "string" && NAIVE_DATE_TIME.test(value.trim())) {
            throw new Error(
              `Date.parse("${value}") parses a zone-less datetime in the runtime's timezone; use fromKyivDateTimeLocal.`,
            );
          }
          return RealDate.parse(value);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  globalThis.Date = poisoned as DateConstructor;
  try {
    return body();
  } finally {
    globalThis.Date = RealDate;
    for (const name of LOCAL_ZONE_METHODS) {
      prototype[name] = saved.get(name);
    }
  }
}

// The same pair of instants `formatDate.test.ts` uses, for the same reason.
// 15:40 UTC is 18:40 in Kyiv in September (EEST, UTC+3)…
const SUMMER_UTC = "2026-09-09T15:40:00.000Z";
const SUMMER_KYIV_INPUT = "2026-09-09T18:40";
// …and 17:40 in January (EET, UTC+2). A hard-coded "+03:00" fails this one.
const WINTER_UTC = "2026-01-15T15:40:00.000Z";
const WINTER_KYIV_INPUT = "2026-01-15T17:40";

// The failure from the review, verbatim: a banner scheduled for 21:00 UTC on the
// 1st is already the 2nd in Kyiv. This is the instant where the list and the
// form used to disagree about the DAY, not merely about the hour.
const EVENING_UTC = "2026-10-01T21:00:00.000Z";
const EVENING_KYIV_INPUT = "2026-10-02T00:00";

describe("the harness itself", () => {
  it("theOldHelpersTripIt — the poison catches the code being replaced", () => {
    // Verbatim copy of the `toDateTimeLocal` that lived in all four
    // `edit-*-view.tsx` widgets.
    const oldToDateTimeLocal = (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    };

    expect(() =>
      withAmbientZonePoisoned(() => oldToDateTimeLocal(EVENING_UTC)),
    ).toThrow(/runtime's timezone/);

    // And the submit path the four form schemas used.
    expect(() =>
      withAmbientZonePoisoned(() => new Date(EVENING_KYIV_INPUT).toISOString()),
    ).toThrow(/zone-less datetime/);
  });

  it("restores the real Date afterwards", () => {
    expect(new Date(EVENING_UTC).getTime()).toBe(Date.parse(EVENING_UTC));
  });
});

describe("toKyivDateTimeLocal", () => {
  it("renders a summer instant in Kyiv time (UTC+3)", () => {
    expect(withAmbientZonePoisoned(() => toKyivDateTimeLocal(SUMMER_UTC))).toBe(
      SUMMER_KYIV_INPUT,
    );
  });

  it("follows Kyiv across DST — a winter instant is UTC+2", () => {
    expect(withAmbientZonePoisoned(() => toKyivDateTimeLocal(WINTER_UTC))).toBe(
      WINTER_KYIV_INPUT,
    );
  });

  it("agrees with the LIST about the calendar day, which is the actual bug", () => {
    // The form value and the list cell must name the same day. Before this
    // helper the list said 02.10 (Kyiv) and the form said 01.10 (browser).
    expect(
      withAmbientZonePoisoned(() => toKyivDateTimeLocal(EVENING_UTC)),
    ).toBe(EVENING_KYIV_INPUT);
    expect(formatDateTime(EVENING_UTC)).toContain("02.10.2026");
  });

  it("uses a 24-hour clock and pads every field to two digits", () => {
    expect(
      withAmbientZonePoisoned(() =>
        toKyivDateTimeLocal("2026-03-05T05:07:00.000Z"),
      ),
    ).toBe("2026-03-05T07:07");
  });

  it("renders midnight as 00:00, never 24:00 — no input accepts 24:00", () => {
    expect(toKyivDateTimeLocal(EVENING_UTC).endsWith("T00:00")).toBe(true);
  });

  it("accepts a Date and epoch milliseconds as well as an ISO string", () => {
    expect(toKyivDateTimeLocal(new Date(SUMMER_UTC))).toBe(SUMMER_KYIV_INPUT);
    expect(toKyivDateTimeLocal(new Date(SUMMER_UTC).getTime())).toBe(
      SUMMER_KYIV_INPUT,
    );
  });

  it("returns an empty string for anything no input field could show", () => {
    expect(toKyivDateTimeLocal("")).toBe("");
    expect(toKyivDateTimeLocal("not-a-date")).toBe("");
    expect(toKyivDateTimeLocal(Number.NaN)).toBe("");
  });
});

describe("fromKyivDateTimeLocal", () => {
  it("reads a summer wall clock as Kyiv (UTC+3), not as browser time", () => {
    expect(
      withAmbientZonePoisoned(() =>
        fromKyivDateTimeLocal(SUMMER_KYIV_INPUT)?.toISOString(),
      ),
    ).toBe(SUMMER_UTC);
  });

  it("reads a winter wall clock as Kyiv (UTC+2) — the offset is no constant", () => {
    expect(
      withAmbientZonePoisoned(() =>
        fromKyivDateTimeLocal(WINTER_KYIV_INPUT)?.toISOString(),
      ),
    ).toBe(WINTER_UTC);
  });

  it("stores the instant an operator who trusted the LIST meant", () => {
    // «Заплановано на 02.10» in the list → the operator types 02.10 00:00.
    // Browser-zone parsing on a CET laptop stored 2026-10-01T22:00Z — two hours
    // early, and the banner went live a day before the list claimed.
    expect(
      withAmbientZonePoisoned(() =>
        fromKyivDateTimeLocal(EVENING_KYIV_INPUT)?.toISOString(),
      ),
    ).toBe(EVENING_UTC);
  });

  it("does not apply one hard-coded offset to both seasons", () => {
    const { summer, winter } = withAmbientZonePoisoned(() => ({
      summer: fromKyivDateTimeLocal("2026-07-01T12:00") as Date,
      winter: fromKyivDateTimeLocal("2026-12-01T12:00") as Date,
    }));

    expect(summer.toISOString()).toBe("2026-07-01T09:00:00.000Z"); // UTC+3
    expect(winter.toISOString()).toBe("2026-12-01T10:00:00.000Z"); // UTC+2
  });

  it("returns null instead of letting a bad value throw at .toISOString()", () => {
    // The form mappers call `.toISOString()` on the result; `new Date("nope")`
    // would reach that call and throw a RangeError inside a submit handler.
    expect(fromKyivDateTimeLocal("")).toBeNull();
    expect(fromKyivDateTimeLocal("nope")).toBeNull();
    expect(fromKyivDateTimeLocal("2026-02-30T10:00")).toBeNull(); // rolls over
    expect(fromKyivDateTimeLocal("2026-08-01T25:00")).toBeNull(); // rolls over
  });
});

describe("round trip", () => {
  it.each([SUMMER_KYIV_INPUT, WINTER_KYIV_INPUT, EVENING_KYIV_INPUT])(
    "%s survives from → to unchanged",
    (typed) => {
      const shown = withAmbientZonePoisoned(() => {
        const instant = fromKyivDateTimeLocal(typed) as Date;
        return toKyivDateTimeLocal(instant);
      });
      expect(shown).toBe(typed);
    },
  );

  it.each([SUMMER_UTC, WINTER_UTC, EVENING_UTC])(
    "%s survives the edit form untouched",
    (iso) => {
      // Open the edit form, change nothing, save: the API must get back the
      // instant it sent. That held before this change too (browser-zone in,
      // browser-zone out) and must keep holding now that both ends are Kyiv.
      const stored = withAmbientZonePoisoned(() => {
        const shown = toKyivDateTimeLocal(iso);
        return fromKyivDateTimeLocal(shown)?.toISOString();
      });
      expect(stored).toBe(iso);
    },
  );

  it("survives both DST switches", () => {
    // Kyiv 2026: clocks go forward 29 March 03:00 → 04:00 and back 25 October
    // 04:00 → 03:00. A minute either side of each switch must round-trip.
    for (const typed of [
      "2026-03-29T02:59",
      "2026-03-29T04:00",
      "2026-10-25T02:59",
      "2026-10-25T04:01",
    ]) {
      const shown = withAmbientZonePoisoned(() => {
        const instant = fromKyivDateTimeLocal(typed) as Date;
        return toKyivDateTimeLocal(instant);
      });
      expect(shown).toBe(typed);
    }
  });

  it("pushes a wall clock that does not exist forward into one that does", () => {
    // 03:30 on 29 March 2026 never happens in Kyiv. Rather than inventing an
    // answer an hour BEHIND what the operator asked for, it lands on 04:30.
    const instant = withAmbientZonePoisoned(
      () => fromKyivDateTimeLocal("2026-03-29T03:30") as Date,
    );
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(toKyivDateTimeLocal(instant)).toBe("2026-03-29T04:30");
  });
});
