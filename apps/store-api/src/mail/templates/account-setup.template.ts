/**
 * Pure «Задайте пароль» template builder (TASK-2010).
 *
 * The letter an account created at checkout receives. It does two things at
 * once, and says so: it lets the buyer set a password, and — because only the
 * owner of the mailbox can open it — it confirms the address, which is what
 * moves the address's earlier guest orders onto the account.
 *
 * No NestJS or nodemailer imports — a plain function mapping a small payload to
 * `{ subject, html, text }`, exactly like `email-verification.template.ts`.
 */

import type { MailTemplate } from './order-confirmation.template';

/**
 * JSON-safe payload for the setup letter, as stored in a `NotificationOutbox` row.
 *
 * `to` is the address the account was created on — carried in the payload, not
 * re-read from the user row at send time, for the same reason as the
 * verification letter: the proof must go to the address it proves.
 */
export interface AccountSetupMailPayload {
  to: string;
  /** Fully-built `/account-setup?token=…` link. */
  setupUrl: string;
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

function renderHtml(payload: AccountSetupMailPayload): string {
  const url = escapeHtml(payload.setupUrl);
  const expires = escapeHtml(payload.expiresInHuman);

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Задайте пароль до акаунта</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Під час оформлення замовлення ми створили для вас акаунт на цю пошту.
      Задайте пароль, щоб надалі входити з будь-якого пристрою.
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">
        Задати пароль
      </a>
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Перехід за посиланням заодно підтвердить, що ця пошта ваша, — і ми додамо
      до акаунта ваші попередні замовлення без реєстрації.
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Або скопіюйте це посилання у браузер:<br />
      <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Посилання дійсне ${expires}. Якщо ви не оформлювали замовлення в нашому
      магазині, просто проігноруйте цей лист.
    </p>
  </div>
</body>
</html>`;
}

function renderText(payload: AccountSetupMailPayload): string {
  return [
    'Задайте пароль до акаунта',
    '',
    'Під час оформлення замовлення ми створили для вас акаунт на цю пошту.',
    'Задайте пароль, щоб надалі входити з будь-якого пристрою:',
    '',
    payload.setupUrl,
    '',
    'Перехід за посиланням заодно підтвердить, що ця пошта ваша, — і ми додамо',
    'до акаунта ваші попередні замовлення без реєстрації.',
    '',
    `Посилання дійсне ${payload.expiresInHuman}. Якщо ви не оформлювали замовлення`,
    'в нашому магазині, просто проігноруйте цей лист.',
  ].join('\n');
}

/** Build the account-setup email parts (subject, HTML, plain text). */
export function buildAccountSetupEmail(payload: AccountSetupMailPayload): MailTemplate {
  return {
    subject: 'Задайте пароль до акаунта',
    html: renderHtml(payload),
    text: renderText(payload),
  };
}
