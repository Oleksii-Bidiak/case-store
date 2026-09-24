/**
 * Address-change email templates (TASK-396).
 *
 * Two letters for one request, and they go to DIFFERENT inboxes on purpose:
 *
 *   - the CONFIRM letter goes to the NEW address. Clicking it is what proves the
 *     requester reads that inbox; until then the login does not change.
 *   - the NOTICE goes to the OLD address, with a revert link. It is the account
 *     holder's defence against a stolen session: whoever holds only a session
 *     and the password can ask for the change, but cannot stop this letter from
 *     reaching the inbox the account still belongs to.
 *
 * Pure functions — no NestJS, no nodemailer — like the other templates here.
 */

import type { MailTemplate } from './order-confirmation.template';

/** JSON-safe payload of the letter to the NEW address. */
export interface EmailChangeConfirmMailPayload {
  /** The NEW address — the one being proven. Never re-read from the user row. */
  to: string;
  /** `/confirm-email-change?token=…` */
  confirmUrl: string;
  /** Human expiry copy, e.g. "24 години". */
  expiresInHuman: string;
}

/** JSON-safe payload of the warning to the OLD address. */
export interface EmailChangeNoticeMailPayload {
  /** The OLD address — the account's login at the time of the request. */
  to: string;
  /** The address the change was requested to, shown so the holder recognises it. */
  newEmail: string;
  /** `/revert-email-change?token=…` */
  revertUrl: string;
  /** Human copy for how long the revert link works, e.g. "7 днів". */
  revertExpiresInHuman: string;
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

function layout(inner: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
${inner}
  </div>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">
        ${label}
      </a>
    </p>
    <p style="margin:0 0 16px;color:#475569;">
      Або скопіюйте це посилання у браузер:<br />
      <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
    </p>`;
}

const CONFIRM_SUBJECT = 'Підтвердьте нову адресу для входу';

/** The letter to the NEW address: "confirm this is yours". */
export function buildEmailChangeConfirmEmail(payload: EmailChangeConfirmMailPayload): MailTemplate {
  const url = escapeHtml(payload.confirmUrl);
  const expires = escapeHtml(payload.expiresInHuman);

  const html = layout(`    <h1 style="margin:0 0 8px;font-size:22px;">${CONFIRM_SUBJECT}</h1>
    <p style="margin:0 0 16px;color:#475569;">
      У нашому магазині попросили зробити цю адресу адресою для входу в обліковий
      запис. Вона почне діяти лише після того, як ви натиснете кнопку нижче.
    </p>
${button(url, 'Підтвердити адресу')}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Посилання дійсне ${expires}. Після підтвердження ми завершимо всі сеанси — увійдіть
      знову з новою адресою. Якщо ви нічого не змінювали, просто проігноруйте цей лист:
      без підтвердження адреса не зміниться.
    </p>`);

  const text = [
    CONFIRM_SUBJECT,
    '',
    'У нашому магазині попросили зробити цю адресу адресою для входу в обліковий',
    'запис. Вона почне діяти лише після підтвердження:',
    '',
    payload.confirmUrl,
    '',
    `Посилання дійсне ${payload.expiresInHuman}. Після підтвердження ми завершимо всі`,
    'сеанси — увійдіть знову з новою адресою. Якщо ви нічого не змінювали, просто',
    'проігноруйте цей лист: без підтвердження адреса не зміниться.',
  ].join('\n');

  return { subject: CONFIRM_SUBJECT, html, text };
}

const NOTICE_SUBJECT = 'Запит на зміну адреси для входу';

/** The warning to the OLD address, with the way back. */
export function buildEmailChangeNoticeEmail(payload: EmailChangeNoticeMailPayload): MailTemplate {
  const url = escapeHtml(payload.revertUrl);
  const newEmail = escapeHtml(payload.newEmail);
  const expires = escapeHtml(payload.revertExpiresInHuman);

  const html = layout(`    <h1 style="margin:0 0 8px;font-size:22px;">${NOTICE_SUBJECT}</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Для вашого облікового запису попросили змінити адресу для входу на
      <strong>${newEmail}</strong>. Якщо це були ви — нічого робити не треба.
    </p>
    <p style="margin:0 0 16px;color:#0f172a;font-weight:bold;">
      Якщо це були не ви, натисніть кнопку нижче: ми скасуємо зміну (або повернемо
      цю адресу, якщо зміну вже підтвердили) і завершимо всі сеанси.
    </p>
${button(url, 'Це був не я — скасувати зміну')}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      Посилання дійсне ${expires}. Після скасування радимо змінити пароль.
    </p>`);

  const text = [
    NOTICE_SUBJECT,
    '',
    `Для вашого облікового запису попросили змінити адресу для входу на ${payload.newEmail}.`,
    'Якщо це були ви — нічого робити не треба.',
    '',
    'Якщо це були не ви, відкрийте посилання нижче: ми скасуємо зміну (або повернемо',
    'цю адресу, якщо зміну вже підтвердили) і завершимо всі сеанси:',
    '',
    payload.revertUrl,
    '',
    `Посилання дійсне ${payload.revertExpiresInHuman}. Після скасування радимо змінити пароль.`,
  ].join('\n');

  return { subject: NOTICE_SUBJECT, html, text };
}
