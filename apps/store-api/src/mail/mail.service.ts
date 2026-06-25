import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';
import type { OrderEntity } from '../order/entities';
import {
  buildOrderConfirmationEmail,
  type OrderConfirmationParams,
} from './templates/order-confirmation.template';

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

  /**
   * Send an order-confirmation email. Resolves without throwing when mail is
   * disabled (logged no-op). When enabled, builds the message and dispatches it
   * through the SMTP transport.
   */
  async sendOrderConfirmation(params: SendOrderConfirmationParams): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`Mail disabled — skipping order confirmation to ${params.to}`);
      return;
    }

    const template = buildOrderConfirmationEmail({
      customerName: params.customerName,
      order: this.toTemplateOrder(params.order),
    });

    await this.getTransporter().sendMail({
      from: this.from,
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
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

  /** Map the domain {@link OrderEntity} onto the pure template's plain shape. */
  private toTemplateOrder(order: OrderEntity): OrderConfirmationParams['order'] {
    return {
      id: order.id,
      createdAt: order.createdAt,
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
      shippingAddress: order.shippingAddress,
    };
  }
}
