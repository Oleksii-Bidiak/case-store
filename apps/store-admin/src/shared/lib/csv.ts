/**
 * CSV writing for files the ADMIN builds itself (TASK-691) — the /analytics
 * reports export exactly what is on screen, so they are assembled here rather
 * than asked of the API.
 *
 * A client mirror of `apps/store-api/src/common/utils/csv.util.ts`. Read that
 * file's comments before changing anything below: the two must neutralise the
 * same formula triggers, or a file built in the browser becomes the hole the
 * server closed (CSV injection, CWE-1236). The one deliberate difference is
 * listed at {@link escapeCsvText}.
 *
 * Pure, but imported by path (`@/shared/lib/csv`), like `download-csv` — the
 * two are used together and only by client widgets.
 *
 * No BOM here: `downloadCsv` adds it, once, when it saves the file.
 */

/**
 * A spreadsheet formula trigger, leading whitespace included — the server's
 * `SPREADSHEET_FORMULA`, byte for byte. TAB and CR are on OWASP's list because
 * a parser that trims them exposes the `=` behind; `\s*` catches those and
 * plain spaces alike.
 */
const SPREADSHEET_FORMULA = /^\s*[=+\-@]/;

/** A plain decimal: optional minus, digits, optional fraction. Nothing else. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Escape a TEXT field: neutralise a formula with a leading apostrophe (which
 * spreadsheets read as "literal text" and do not display), then quote per
 * RFC 4180 — wrap in double quotes, doubling embedded ones — when the value
 * holds a quote, a comma or a line break.
 *
 * The deliberate difference from the server's `escapeCsvField`: a `;` is
 * quoted too. Ukrainian Excel lists with `;`, and a file opened through
 * "Data → From text" with that separator would split «Чохли; кабелі» in two.
 * Quoting never changes the value, so this is strictly safer, not different.
 *
 * Like the server's: a negative number passed here becomes the text `'-4200`.
 * That is correct for text — `-1+1` is both a number and a formula — and is
 * why numbers have their own door, {@link csvNumber}.
 */
export function escapeCsvText(value: string): string {
  const safe = SPREADSHEET_FORMULA.test(value) ? `'${value}` : value;
  if (/[",;\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Write a NUMERIC field (the server's `csvNumberField`): a finite number, or a
 * string that is exactly a plain decimal, passes unescaped so `-4200` reaches
 * Excel as a number it can sum. Anything else — `1e3`, `-1+1`, `Infinity`,
 * `''` — throws: a text value wired to the numeric door is a programming
 * error, and failing the export beats writing a live formula.
 *
 * `String(number)` is used as is; a value whose String() is exponent notation
 * (|x| ≥ 1e21 or < 1e-6) throws too — no report figure is either.
 */
export function csvNumber(value: number | string): string {
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : value;
  if (!PLAIN_NUMBER.test(text)) {
    throw new Error(`csvNumber: not a plain decimal: ${JSON.stringify(value)}`);
  }
  return text;
}

/** One cell: text (escaped), a number (strict), or empty. */
export type CsvCell = { text: string } | { number: number | string } | null;

/** Shorthands for building rows: `t("Чохли")`, `n(-4200)`. */
export const t = (text: string): CsvCell => ({ text });
export const n = (number: number | string): CsvCell => ({ number });

function cellToCsv(cell: CsvCell): string {
  if (cell === null) return "";
  return "number" in cell ? csvNumber(cell.number) : escapeCsvText(cell.text);
}

/** One line from cells. */
export function csvLine(cells: readonly CsvCell[]): string {
  return cells.map(cellToCsv).join(",");
}

/**
 * A table: the header (always text) and its rows, comma-separated, CRLF line
 * endings (RFC 4180). Throws when a numeric cell is not a plain decimal.
 */
export function buildCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): string {
  return [csvLine(header.map(t)), ...rows.map(csvLine)].join("\r\n");
}

/**
 * Several tables in one file, separated by an empty line — a report with a
 * summary and a daily run. Each section is a {@link buildCsv} result.
 */
export function joinCsvSections(sections: readonly string[]): string {
  return sections.join("\r\n\r\n");
}
