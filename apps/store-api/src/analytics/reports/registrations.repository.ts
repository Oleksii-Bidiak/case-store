import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kyivDaySql } from '../../common/time/kyiv-day';
import { PrismaService } from '../../prisma';
import { ReportRange } from './report-period';

/** Registrations of one range. */
export interface RegistrationTotals {
  /** New customer accounts created in the range. */
  registrations: number;
  /** Of those, how many had ordered as a guest with the same email before. */
  fromGuest: number;
}

/** One Kyiv day of the registrations series. */
export interface RegistrationDay {
  date: string;
  registrations: number;
}

/**
 * «Реєстрації» in raw SQL (TASK-690, plan 188).
 *
 * A registration is a `users` row with role CUSTOMER created in the range.
 * Staff accounts are not registrations — the owner creates them, customers do
 * not — so a busy week of onboarding the team does not read as growth.
 *
 * Tombstoned accounts (`deleted_at`) still count: the person did register in
 * that period, and a report whose past shrinks every time someone deletes an
 * account is a report nobody can compare month to month.
 *
 * "From guest" answers the one question the owner could not answer before:
 * did people who bought as guests come back for an account? It is the account
 * whose email (case-insensitive) matches the guest email of an order placed
 * BEFORE the account existed. Guest orders placed after registering (logged
 * out) are not a conversion and are not counted.
 *
 * Range bounds and day buckets follow the same Kyiv day as the sales report —
 * see `sales.repository.ts` for why the parameters are not cast to timestamptz.
 */
@Injectable()
export class RegistrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTotals(range: ReportRange): Promise<RegistrationTotals> {
    const rows = await this.prisma.$queryRaw<RegistrationTotals[]>`
      SELECT COUNT(*)::int AS registrations,
             COUNT(*) FILTER (
               WHERE EXISTS (
                 SELECT 1
                 FROM orders o
                 WHERE o.user_id IS NULL
                   AND o.guest_email IS NOT NULL
                   AND LOWER(o.guest_email) = LOWER(u.email)
                   AND o.created_at < u.created_at
               )
             )::int AS "fromGuest"
      FROM users u
      WHERE u.role = 'CUSTOMER'
        AND u.created_at >= ${range.start}
        AND u.created_at < ${range.end}
    `;
    return rows[0];
  }

  /** One point per Kyiv day of `range`, empty days as zeros — never `[]`. */
  async getDaily(range: ReportRange): Promise<RegistrationDay[]> {
    const day = kyivDaySql(Prisma.raw('u.created_at'));

    return this.prisma.$queryRaw<RegistrationDay[]>`
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series(
          ${range.fromDay}::date::timestamp,
          ${range.toDay}::date::timestamp,
          INTERVAL '1 day'
        ) AS d
      ),
      counted AS (
        SELECT ${day} AS day, COUNT(*) AS n
        FROM users u
        WHERE u.role = 'CUSTOMER'
          AND u.created_at >= ${range.start}
          AND u.created_at < ${range.end}
        GROUP BY 1
      )
      SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
             COALESCE(c.n, 0)::int AS registrations
      FROM days
      LEFT JOIN counted c ON c.day = days.day
      ORDER BY days.day
    `;
  }
}
