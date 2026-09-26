import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

/**
 * Database access for the application-level health probe (TASK-822).
 *
 * `AppService` used to run `SELECT 1` on PrismaService itself — the one service
 * in the codebase that touched the client directly. That single exception was
 * what kept the rule "services never import PrismaClient" from being enforced
 * by a linter: it could only be a sentence in AGENTS.md. With the query here,
 * `eslint.config.js` now refuses PrismaService/PrismaClient in every
 * `*.service.ts`.
 */
@Injectable()
export class AppRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Round-trip the cheapest possible query. Rejects if the database does not answer. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
