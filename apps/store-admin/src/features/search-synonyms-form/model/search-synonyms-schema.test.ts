import { dict } from "@/shared/config";
import {
  SYNONYM_TERMS_MAX,
  mapSynonymsToFormValues,
  parseSynonymTerms,
  searchSynonymsSchema,
} from "./search-synonyms-schema";

const e = dict.searchSynonyms.errors;

function firstError(groups: string[]) {
  const result = searchSynonymsSchema.safeParse({
    groups: groups.map((terms) => ({ terms })),
  });
  return result.success ? undefined : result.error.issues[0];
}

describe("parseSynonymTerms (TASK-559)", () => {
  it("splits on commas, trims, lowercases and folds duplicates", () => {
    expect(parseSynonymTerms(" Чохол, CASE ,, чохол , cases")).toEqual([
      "чохол",
      "case",
      "cases",
    ]);
  });

  it("returns nothing for a blank line", () => {
    expect(parseSynonymTerms("  , ,")).toEqual([]);
    expect(parseSynonymTerms(undefined)).toEqual([]);
  });
});

describe("searchSynonymsSchema (TASK-559)", () => {
  it("outputs the PUT body, dropping blank rows", () => {
    const result = searchSynonymsSchema.parse({
      groups: [{ terms: "Айфон, iPhone" }, { terms: "  " }, { terms: "a, b" }],
    });

    expect(result).toEqual({
      groups: [{ terms: ["айфон", "iphone"] }, { terms: ["a", "b"] }],
    });
  });

  it("accepts an empty list", () => {
    expect(searchSynonymsSchema.parse({ groups: [] })).toEqual({ groups: [] });
  });

  it("rejects a group that is one word once duplicates fold, on its row", () => {
    const issue = firstError(["чохол, case", "Чохол, чохол"]);
    expect(issue?.message).toBe(e.tooFew);
    expect(issue?.path).toEqual(["groups", 1, "terms"]);
  });

  it.each(["type-c, typec", "usb c, usbc", "пам'ять, memory"])(
    "names the word that is not one word in %j",
    (line) => {
      const bad = parseSynonymTerms(line)[0];
      expect(firstError([line])?.message).toBe(e.notOneWord(bad));
    },
  );

  it("rejects too many words in a group", () => {
    const line = Array.from(
      { length: SYNONYM_TERMS_MAX + 1 },
      (_, i) => `слово${i}`,
    ).join(", ");
    expect(firstError([line])?.message).toBe(e.tooMany(SYNONYM_TERMS_MAX));
  });

  it("rejects an over-long word", () => {
    expect(firstError([`${"а".repeat(41)}, b`])?.message).toBe(e.tooLong(40));
  });
});

describe("mapSynonymsToFormValues", () => {
  it("renders each group as one comma-separated line", () => {
    expect(
      mapSynonymsToFormValues({
        groups: [{ terms: ["чохол", "case"] }, { terms: ["a", "b", "c"] }],
      }),
    ).toEqual({ groups: [{ terms: "чохол, case" }, { terms: "a, b, c" }] });
  });
});
