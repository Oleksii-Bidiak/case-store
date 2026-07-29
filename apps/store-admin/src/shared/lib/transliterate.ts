/**
 * Cyrillic → Latin transliteration, following the Ukrainian national standard
 * (Cabinet of Ministers resolution №55 of 2010).
 *
 * Direct port of the backend's `transliterate`
 * (`apps/store-api/src/common/utils/transliterate.util.ts`). It exists here for
 * the same reason `slugify` does: the admin shows a LIVE preview of the slug the
 * server will derive, and a preview that disagrees with the server is worse than
 * no preview. FSD forbids importing across apps, so the two are kept in step by
 * hand — change one, change the other.
 *
 * Pure function (no side effects, no browser API) — safe to barrel-export from
 * `shared/lib`.
 */

/** Default (non word-initial) mapping. */
const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  // Russian-only letters, for mixed-language source data.
  ы: "y",
  э: "e",
  ё: "e",
  ъ: "",
};

/** Word-initial overrides: "Яблуко" → "Yabluko" but "Мяч" → "Miach". */
const CYRILLIC_INITIAL: Record<string, string> = {
  є: "ye",
  ї: "yi",
  й: "y",
  ю: "yu",
  я: "ya",
};

/** A character that continues a word (so the next letter is not word-initial). */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Carry the source letter's case onto its Latin replacement: "Щ" → "Shch". */
function matchCase(mapped: string, source: string): string {
  if (!mapped || source === source.toLowerCase()) {
    return mapped;
  }
  return mapped[0].toUpperCase() + mapped.slice(1);
}

/**
 * Transliterate Cyrillic characters in `text` to Latin, leaving everything else
 * untouched so the caller's own slug rules still apply.
 */
export function transliterate(text: string): string {
  let out = "";
  let atWordStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lower = char.toLowerCase();

    // "зг" → "zgh", so "Згурівка" stays distinguishable from "ж" → "zh".
    if (lower === "з" && text[i + 1]?.toLowerCase() === "г") {
      out += matchCase("zgh", char);
      i++;
      atWordStart = false;
      continue;
    }

    const mapped = atWordStart
      ? (CYRILLIC_INITIAL[lower] ?? CYRILLIC[lower])
      : CYRILLIC[lower];

    if (mapped !== undefined) {
      out += matchCase(mapped, char);
      atWordStart = false;
      continue;
    }

    out += char;
    atWordStart = !WORD_CHAR.test(char);
  }

  return out;
}
