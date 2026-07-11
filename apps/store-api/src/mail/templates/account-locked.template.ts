/**
 * Pure account-locked (deactivated / soft-deleted) notice template builder
 * (TASK-287).
 *
 * Sent to the ACCOUNT OWNER when someone signs in with the correct password to
 * an account that is deactivated or tombstoned. The login response itself stays
 * generic ("Invalid credentials") — telling the client the account is banned
 * would confirm to a credential-stuffer that the stolen password is valid. The
 * owner learns the truth out of band instead, at the address that owns the
 * account.
 *
 * Like the other templates in this folder this module has **no NestJS or
 * nodemailer imports** — it maps a small payload to `{ subject, html, text }`.
 */

import type { MailTemplate } from './order-confirmation.template';

/**
 * JSON-safe payload for an account-locked notice, as stored in a `MailOutbox`
 * row. Deliberately carries nothing about *why* the account was locked — the
 * mail says "contact support", it is not an audit trail.
 */
export interface AccountLockedMailPayload {
  /** Recipient address (the account owner). */
  to: string;
  /** Link to the storefront support/contact page. */
  supportUrl: string;
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

function renderHtml(payload: AccountLockedMailPayload): string {
  const url = escapeHtml(payload.supportUrl);

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Вхід до облікового запису недоступний</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Щойно було виконано спробу входу до вашого облікового запису з правильним паролем,
      але зараз доступ до нього закрито. Тому вхід не відбувся.
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Щоб зʼясувати причину та відновити доступ, звертайтеся до нашої підтримки — ми
      допоможемо.
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">
        Звʼязатися з підтримкою
      </a>
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Або скопіюйте це посилання у браузер:<br />
      <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Якщо цю спробу входу робили не ви — ваш пароль може бути відомий стороннім особам.
      Не використовуйте його на інших сайтах і повідомте підтримку.
    </p>
  </div>
</body>
</html>`;
}

function renderText(payload: AccountLockedMailPayload): string {
  return [
    'Вхід до облікового запису недоступний',
    '',
    'Щойно було виконано спробу входу до вашого облікового запису з правильним',
    'паролем, але зараз доступ до нього закрито. Тому вхід не відбувся.',
    '',
    'Щоб зʼясувати причину та відновити доступ, звертайтеся до нашої підтримки:',
    '',
    payload.supportUrl,
    '',
    'Якщо цю спробу входу робили не ви — ваш пароль може бути відомий стороннім',
    'особам. Не використовуйте його на інших сайтах і повідомте підтримку.',
  ].join('\n');
}

/**
 * Build the account-locked notice email parts (subject, HTML, plain text) from a
 * plain payload object.
 */
export function buildAccountLockedEmail(payload: AccountLockedMailPayload): MailTemplate {
  return {
    subject: 'Вхід до облікового запису недоступний',
    html: renderHtml(payload),
    text: renderText(payload),
  };
}
