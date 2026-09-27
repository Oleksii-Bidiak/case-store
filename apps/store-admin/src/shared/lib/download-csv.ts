/** UTF-8 byte-order mark — what tells Excel the file is UTF-8. */
const CSV_BOM = "﻿";

/**
 * Trigger a client-side download of a CSV string as a file. Wraps the text in a
 * Blob, creates a temporary object URL, and clicks a synthetic anchor.
 *
 * DOM plumbing with no domain in it, so it lives in `shared/lib` (TASK-812) —
 * the order and subscriber tables used to carry a byte-identical copy each,
 * because one widget importing from another is the sideways dependency FSD
 * forbids. Imported by path, not through the barrel: it touches `document`.
 *
 * Writes the UTF-8 BOM first (TASK-691). The server sends one, but the browser
 * strips a leading BOM while decoding the response text, so without this line
 * the saved file had none and Excel on Windows opened every Cyrillic word as
 * mojibake. Added only when missing, so it never doubles.
 */
export function downloadCsv(csv: string, filename: string): void {
  const body = csv.startsWith(CSV_BOM) ? csv : `${CSV_BOM}${csv}`;
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
