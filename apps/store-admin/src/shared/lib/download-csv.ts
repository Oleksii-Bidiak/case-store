/**
 * Trigger a client-side download of a CSV string as a file. Wraps the text in a
 * Blob, creates a temporary object URL, and clicks a synthetic anchor.
 *
 * DOM plumbing with no domain in it, so it lives in `shared/lib` (TASK-812) —
 * the order and subscriber tables used to carry a byte-identical copy each,
 * because one widget importing from another is the sideways dependency FSD
 * forbids. Imported by path, not through the barrel: it touches `document`.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
