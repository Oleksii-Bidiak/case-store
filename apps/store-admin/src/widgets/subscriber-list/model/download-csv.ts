/**
 * Trigger a client-side download of a CSV string as a file. Wraps the text in a
 * Blob, creates a temporary object URL, and clicks a synthetic anchor. Extracted
 * from the table component so the download plumbing is unit-testable in isolation.
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
