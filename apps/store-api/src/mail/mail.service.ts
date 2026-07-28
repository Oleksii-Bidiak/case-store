import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';
import type { OrderEntity } from '../order/entities';
import {
  buildOrderConfirmationEmail,
  type OrderConfirmationParams,
  type OrderConfirmationMailPayload,
} from './templates/order-confirmation.template';
import {
  buildPasswordResetEmail,
  type PasswordResetMailPayload,
} from './templates/password-reset.template';
import {
  buildAccountLockedEmail,
  type AccountLockedMailPayload,
} from './templates/account-locked.template';
import {
  buildEmailVerificationEmail,
  type EmailVerificationMailPayload,
} from './templates/email-verification.template';

/** Parameters accepted by {@link MailService.sendOrderConfirmation}. */
export interface SendOrderConfirmationParams {
  to: string;
  order: OrderEntity;
  customerName?: string;
}

/**
 * MailService — sends transactional email via nodemailer.
 *
 * Mail is **opt-in**: unless `MAIL_ENABLED` is exactly `"true"`, every send is a
 * logged no-op and no SMTP transport is ever created. This keeps CI and local
 * dev unblocked when SMTP credentials are absent. The heavy lifting (rendering
 * the message body) lives in the pure {@link buildOrderConfirmationEmail}
 * template builder; this service is just config + transport glue.
 */
@Injectable()
export class MailService {
  private readonly enabled: boolean;
  private readonly from: string | undefined;
  private transporter?: Transporter;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MailService.name);
    this.enabled = this.config.get<string>('MAIL_ENABLED') === 'true';
    this.from = this.config.get<string>('MAIL_FROM');
  }

  /** Whether SMTP sending is enabled (`MAIL_ENABLED === "true"`). The outbox
   * worker reads this to decide between a real send and a logged no-op drain. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send an order-confirmation email from a live {@link OrderEntity}. Kept for
   * direct callers and unit coverage; delegates to {@link sendOrderConfirmationPayload}
   * after flattening the entity into the JSON-safe stored payload shape.
   */
  async sendOrderConfirmation(params: SendOrderConfirmationParams): Promise<void> {
    await this.sendOrderConfirmationPayload(MailService.toOrderConfirmationPayload(params));
  }

  /**
   * Render and send an order-confirmation email from the JSON-safe payload
   * stored in a `MailOutbox` row (TASK-103). Resolves without throwing when mail
   * is disabled (logged no-op). When enabled, builds the message and dispatches
   * it through the SMTP transport — throwing on transport failure so the outbox
   * worker can apply its retry/backoff policy.
   */
  async sendOrderConfirmationPayload(payload: OrderConfirmationMailPayload): Promise<void> {
    if (!this.enabled) {
      // Promoted from debug → info so the skip is visible at the default Pino
      // `info` log level (manual QA needs to confirm the no-op happened).
      // NOTE: the injected logger is nestjs-pino's `PinoLogger`, whose
      // info-level method is `info()` — it has no `log()` method.
      this.logger.info(`Mail disabled — skipping order confirmation to ${payload.to}`);
      return;
    }

    const template = buildOrderConfirmationEmail({
      customerName: payload.customerName,
      // `createdAt` is stored as an ISO string in the outbox payload; the pure
      // template builder expects a `Date`, so rehydrate it here.
      order: { ...payload.order, createdAt: new Date(payload.order.createdAt) },
    });

    await this.getTransporter().sendMail({
      from: this.from,
      to: payload.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Render and send a password-reset email from the JSON-safe payload stored in
   * a `MailOutbox` row (TASK-169). Resolves without throwing when mail is
   * disabled (logged no-op) — same contract as {@link sendOrderConfirmationPayload}.
   * When enabled, builds the message and dispatches it through the SMTP
   * transport, throwing on transport failure so the outbox worker can apply its
   * retry/backoff policy.
   */
  async sendPasswordResetPayload(payload: PasswordResetMailPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.info(`Mail disabled — skipping password reset to ${payload.to}`);
      return;
    }

    const template = buildPasswordResetEmail(payload);

    await this.getTransporter().sendMail({
      from: this.from,
      to: payload.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Render and send an account-locked notice from the JSON-safe payload stored
   * in a `MailOutbox` row (TASK-287). Same contract as the other payload senders:
   * a logged no-op when mail is disabled, throwing on transport failure so the
   * outbox worker applies its retry/backoff policy.
   */
  async sendAccountLockedPayload(payload: AccountLockedMailPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.info(`Mail disabled — skipping account-locked notice to ${payload.to}`);
      return;
    }

    const template = buildAccountLockedEmail(payload);

    await this.getTransporter().sendMail({
      from: this.from,
      to: payload.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Render and send an email-verification link from the JSON-safe payload stored
   * in a `MailOutbox` row (TASK-342). Same contract as the other payload
   * senders: a logged no-op when mail is disabled, throwing on transport failure
   * so the outbox worker applies its retry/backoff policy.
   */
  async sendEmailVerificationPayload(payload: EmailVerificationMailPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.info(`Mail disabled — skipping email verification to ${payload.to}`);
      return;
    }

    const template = buildEmailVerificationEmail(payload);

    await this.getTransporter().sendMail({
      from: this.from,
      to: payload.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Flatten a live {@link OrderEntity} send request into the JSON-safe
   * {@link OrderConfirmationMailPayload} persisted in a `MailOutbox` row. Pure
   * mapping (no DI) so both the direct send path and the outbox enqueue path
   * share one serialization, and `Date`/`Decimal` values are normalized to
   * strings before they hit the JSON column.
   */
  static toOrderConfirmationPayload(
    params: SendOrderConfirmationParams,
  ): OrderConfirmationMailPayload {
    const order = params.order;
    return {
      to: params.to,
      ...(params.customerName !== undefined ? { customerName: params.customerName } : {}),
      order: {
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.lineTotal,
        })),
        subtotal: order.subtotal,
        discount: order.discount,
        shippingCost: order.shippingCost,
        tax: order.tax,
        total: order.total,
        shippingAddress:
          order.shippingAddress as OrderConfirmationParams['order']['shippingAddress'],
      },
    };
  }

  /** Lazily create and cache the nodemailer transport from SMTP_* config. */
  private getTransporter(): Transporter {
    if (!this.transporter) {
      const user = this.config.get<string>('SMTP_USER');
      const pass = this.config.get<string>('SMTP_PASS');
      this.transporter = createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: this.config.get<number>('SMTP_PORT'),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: user ? { user, pass } : undefined,
      });
    }
    return this.transporter;
  }
}
