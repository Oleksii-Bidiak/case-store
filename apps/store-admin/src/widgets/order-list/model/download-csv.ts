/**
 * Trigger a client-side download of a CSV string as a file. Wraps the text in a
 * Blob, creates a temporary object URL, and clicks a synthetic anchor.
 *
 * A twin of `widgets/subscriber-list/model/download-csv.ts`. The duplication is
 * deliberate and temporary: this is DOM plumbing with no domain in it, so its
 * home is `shared/lib` — but a widget importing from another widget is a
 * sideways dependency the FSD boundaries exist to prevent, and that is the worse
 * of the two. Whoever next touches either copy should move it to `shared/lib`
 * and delete both.
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
