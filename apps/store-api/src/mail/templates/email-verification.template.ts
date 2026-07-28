/**
 * Pure email-verification template builder (TASK-342).
 *
 * No NestJS or nodemailer imports — a plain function mapping a small payload to
 * `{ subject, html, text }`, exactly like `password-reset.template.ts`.
 */

import type { MailTemplate } from './order-confirmation.template';

/**
 * JSON-safe payload for a verification email, as stored in a `MailOutbox` row.
 *
 * `to` is the address BEING VERIFIED, which is not necessarily the account's
 * current address by the time the mail is opened — see
 * `EmailVerificationService.confirm`. The link must therefore be sent to this
 * address and no other; re-deriving the recipient from the user row at send
 * time would mail the proof to whoever the address was changed to.
 */
export interface EmailVerificationMailPayload {
  to: string;
  /** Fully-built `/verify-email?token=…` link the user clicks. */
  verifyUrl: string;
  /** Human copy for the expiry note, e.g. "24 години". */
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

function renderHtml(payload: EmailVerificationMailPayload): string {
  const url = escapeHtml(payload.verifyUrl);
  const expires = escapeHtml(payload.expiresInHuman);

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Підтвердьте вашу пошту</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Щоб ми могли надсилати вам статуси замовлень і відновлення пароля,
      підтвердьте, будь ласка, що ця адреса ваша.
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">
        Підтвердити пошту
      </a>
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Або скопіюйте це посилання у браузер:<br />
      <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Посилання дійсне ${expires}. Якщо ви не створювали обліковий запис у нашому
      магазині, просто проігноруйте цей лист.
    </p>
  </div>
</body>
</html>`;
}

function renderText(payload: EmailVerificationMailPayload): string {
  return [
    'Підтвердьте вашу пошту',
    '',
    'Щоб ми могли надсилати вам статуси замовлень і відновлення пароля,',
    'підтвердьте, будь ласка, що ця адреса ваша:',
    '',
    payload.verifyUrl,
    '',
    `Посилання дійсне ${payload.expiresInHuman}. Якщо ви не створювали обліковий`,
    'запис у нашому магазині, просто проігноруйте цей лист.',
  ].join('\n');
}

/** Build the verification email parts (subject, HTML, plain text). */
export function buildEmailVerificationEmail(payload: EmailVerificationMailPayload): MailTemplate {
  return {
    subject: 'Підтвердьте вашу пошту',
    html: renderHtml(payload),
    text: renderText(payload),
  };
}
