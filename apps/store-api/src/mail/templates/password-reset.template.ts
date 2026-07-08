/**
 * Pure password-reset email template builder.
 *
 * This module has **no NestJS or nodemailer imports** — it is a plain function
 * that maps a small payload to `{ subject, html, text }`. Keeping it pure makes
 * it trivially unit-testable (no DI container) and free of any transport
 * concern. Mirrors `order-confirmation.template.ts`.
 */

import type { MailTemplate } from './order-confirmation.template';

/**
 * JSON-safe payload for a password-reset email, as stored in a `MailOutbox` row.
 * No `Date` — the pre-built link and a human-readable expiry string are all the
 * renderer needs, so nothing has to be re-derived at send time.
 */
export interface PasswordResetMailPayload {
  /** Recipient address (travels with the payload so the worker needs no lookup). */
  to: string;
  /** Fully-built `/reset-password?token=…` link the user clicks. */
  resetUrl: string;
  /** Human copy for the expiry note, e.g. "1 годину" / "30 хвилин". */
  expiresInHuman: string;
}

/** Escape the few characters that are unsafe in interpolated HTML text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(payload: PasswordResetMailPayload): string {
  const url = escapeHtml(payload.resetUrl);
  const expires = escapeHtml(payload.expiresInHuman);

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Скидання пароля</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Ми отримали запит на скидання пароля для вашого облікового запису. Натисніть
      кнопку нижче, щоб установити новий пароль.
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">
        Скинути пароль
      </a>
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Або скопіюйте це посилання у браузер:<br />
      <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Посилання дійсне ${expires}. Якщо ви не надсилали цей запит, просто
      проігноруйте цей лист — ваш пароль залишиться незмінним.
    </p>
  </div>
</body>
</html>`;
}

function renderText(payload: PasswordResetMailPayload): string {
  return [
    'Скидання пароля',
    '',
    'Ми отримали запит на скидання пароля для вашого облікового запису.',
    'Перейдіть за посиланням нижче, щоб установити новий пароль:',
    '',
    payload.resetUrl,
    '',
    `Посилання дійсне ${payload.expiresInHuman}. Якщо ви не надсилали цей запит,`,
    'просто проігноруйте цей лист — ваш пароль залишиться незмінним.',
  ].join('\n');
}

/**
 * Build the password-reset email parts (subject, HTML, plain text) from a plain
 * payload object.
 */
export function buildPasswordResetEmail(payload: PasswordResetMailPayload): MailTemplate {
  return {
    subject: 'Скидання пароля',
    html: renderHtml(payload),
    text: renderText(payload),
  };
}
