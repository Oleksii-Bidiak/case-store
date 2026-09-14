/**
 * Render a byte count the way an operator reads it: «184 КБ», «2,4 МБ».
 *
 * Binary steps (1024), because that is what every file manager and every hosting
 * dashboard the owner will compare this against reports, and a library that says
 * 1,8 МБ where the server says 1,9 МБ invites a bug report about neither.
 *
 * Returns `null` for a size we do not know. The media library stores 0 for every
 * asset the TASK-441 backfill created out of an existing product photo — those
 * numbers live inside the files and a migration cannot read them — so "0 байт"
 * would be a confident lie about a picture that plainly exists.
 */
export function formatFileSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  const units = ["байт", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Whole bytes and whole kilobytes; one decimal once the number is small
  // enough for it to carry information.
  const digits = unit === 0 ? 0 : value < 100 ? 1 : 0;
  return `${new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)} ${units[unit]}`;
}
