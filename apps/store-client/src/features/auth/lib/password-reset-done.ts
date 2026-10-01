/**
 * The flag the reset-password form puts on its redirect to /login (TASK-871),
 * so the login page can confirm that the new password was saved.
 *
 * One constant on both ends: the writer (reset-password-form) and the reader
 * (login-form) cannot drift apart. The flag carries no secret — it only picks
 * a fixed, static message — so a hand-typed `/login?passwordReset=1` shows the
 * same harmless line and nothing else.
 */
export const PASSWORD_RESET_DONE_PARAM = "passwordReset";
