/**
 * Cyrillic → Latin transliteration for slug generation.
 *
 * Follows the Ukrainian national standard (Cabinet of Ministers resolution
 * №55 of 2010) — the same romanisation used in Ukrainian passports and road
 * signs, so a slug derived here reads the way a Ukrainian reader expects
 * ("Чохли" → "chokhly", not "chohli" or a machine-transliterated mangle).
 *
 * Why this exists: `generateSlug` strips everything outside `[A-Za-z0-9_\s-]`,
 * so a purely Ukrainian name used to slugify to the EMPTY STRING. That is fine
 * while every entity is named in Latin, and fatal the moment it is not — the
 * supplier catalogue import (TASK-360) creates categories called "Чохли",
 * "Захисне скло" and "Кабелі / перехідники", and `Category.slug` is UNIQUE, so
 * all fifteen would have collided on "".
 *
 * Russian-only letters (ы, э, ъ, ё) are mapped too: the source catalogue is
 * mixed-language in places, and dropping them silently would fuse distinct
 * names into one slug.
 */

/** Default (non word-initial) mapping. */
const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  // Russian-only letters, for mixed-language source data.
  ы: 'y',
  э: 'e',
  ё: 'e',
  ъ: '',
};

/**
 * Word-initial overrides. The standard romanises these differently at the start
 * of a word: "Яблуко" → "Yabluko" but "Мяч" → "Miach".
 */
const CYRILLIC_INITIAL: Record<string, string> = {
  є: 'ye',
  ї: 'yi',
  й: 'y',
  ю: 'yu',
  я: 'ya',
};

/** A character that continues a word (so the next letter is not word-initial). */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Carry the source letter's case onto its (possibly multi-character) Latin
 * replacement: "Щ" → "Shch", not "shch" or "SHCH". Slug callers lowercase
 * afterwards anyway, but a transliterator that silently destroyed case would be
 * wrong for every other use.
 */
function matchCase(mapped: string, source: string): string {
  if (!mapped || source === source.toLowerCase()) {
    return mapped;
  }
  return mapped[0].toUpperCase() + mapped.slice(1);
}

/**
 * Transliterate Cyrillic characters in `text` to Latin, leaving every other
 * character (Latin letters, digits, punctuation, whitespace) untouched so the
 * caller's own slug rules still apply.
 *
 * Pure and side-effect free.
 */
export function transliterate(text: string): string {
  let out = '';
  let atWordStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lower = char.toLowerCase();

    // The one digraph the standard calls out explicitly: "зг" → "zgh", so that
    // "Згурівка" → "Zghurivka" stays distinguishable from "ж" → "zh".
    if (lower === 'з' && text[i + 1]?.toLowerCase() === 'г') {
      out += matchCase('zgh', char);
      i++;
      atWordStart = false;
      continue;
    }

    const mapped = atWordStart ? (CYRILLIC_INITIAL[lower] ?? CYRILLIC[lower]) : CYRILLIC[lower];

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
